import asyncio
from collections import deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, TypeVar, cast

T = TypeVar("T")


class QueueCapacityExceeded(Exception):
    pass


class DuplicateTaskError(Exception):
    pass


@dataclass(slots=True)
class _QueuedTask:
    task_id: str
    work: Callable[[], Awaitable[Any]]
    future: asyncio.Future[Any]


class BoundedTaskQueue:
    """单进程有界任务队列；任务工厂只有在真正执行时才创建协程。"""

    def __init__(self, active_limit: int = 1, waiting_limit: int = 3) -> None:
        if active_limit < 1 or waiting_limit < 0:
            raise ValueError("任务队列容量参数无效")
        self._active_limit = active_limit
        self._waiting_limit = waiting_limit
        self._active: dict[str, asyncio.Task[None]] = {}
        self._waiting: deque[_QueuedTask] = deque()
        self._lock = asyncio.Lock()

    @property
    def active_count(self) -> int:
        return len(self._active)

    @property
    def waiting_count(self) -> int:
        return len(self._waiting)

    async def submit(
        self,
        task_id: str,
        work: Callable[[], Awaitable[T]],
    ) -> asyncio.Future[T]:
        async with self._lock:
            if task_id in self._active or any(item.task_id == task_id for item in self._waiting):
                raise DuplicateTaskError(f"任务已存在：{task_id}")

            future: asyncio.Future[T] = asyncio.get_running_loop().create_future()
            item = _QueuedTask(task_id, work, cast("asyncio.Future[Any]", future))
            if len(self._active) < self._active_limit:
                self._start_locked(item)
            elif len(self._waiting) < self._waiting_limit:
                self._waiting.append(item)
            else:
                raise QueueCapacityExceeded("任务队列已满")
            return future

    async def cancel(self, task_id: str) -> bool:
        async with self._lock:
            active_task = self._active.get(task_id)
            if active_task is not None:
                active_task.cancel()
                return True

            for item in self._waiting:
                if item.task_id == task_id:
                    self._waiting.remove(item)
                    item.future.cancel()
                    return True
            return False

    async def shutdown(self) -> None:
        async with self._lock:
            active_tasks = list(self._active.values())
            for task in active_tasks:
                task.cancel()
            for item in self._waiting:
                item.future.cancel()
            self._waiting.clear()
        if active_tasks:
            await asyncio.gather(*active_tasks, return_exceptions=True)

    def _start_locked(self, item: _QueuedTask) -> None:
        task = asyncio.create_task(self._execute(item), name=f"researchflow:{item.task_id}")
        self._active[item.task_id] = task

    async def _execute(self, item: _QueuedTask) -> None:
        try:
            result = await item.work()
        except asyncio.CancelledError:
            item.future.cancel()
        except Exception as error:
            if not item.future.done():
                item.future.set_exception(error)
        else:
            if not item.future.done():
                item.future.set_result(result)
        finally:
            async with self._lock:
                self._active.pop(item.task_id, None)
                while self._waiting and len(self._active) < self._active_limit:
                    self._start_locked(self._waiting.popleft())
