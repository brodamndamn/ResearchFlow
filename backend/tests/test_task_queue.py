import asyncio

import pytest

from app.task_queue import BoundedTaskQueue, DuplicateTaskError, QueueCapacityExceeded


async def test_queue_allows_one_active_and_three_waiting_tasks() -> None:
    queue = BoundedTaskQueue(active_limit=1, waiting_limit=3)
    started = asyncio.Event()
    release = asyncio.Event()

    async def blocking_work() -> str:
        started.set()
        await release.wait()
        return "done"

    first = await queue.submit("task-1", blocking_work)
    await started.wait()
    waiting = [
        await queue.submit(f"task-{index}", blocking_work) for index in range(2, 5)
    ]

    with pytest.raises(QueueCapacityExceeded):
        await queue.submit("task-5", blocking_work)

    assert queue.active_count == 1
    assert queue.waiting_count == 3
    release.set()
    assert await first == "done"
    assert await asyncio.gather(*waiting) == ["done", "done", "done"]
    await queue.shutdown()


async def test_queue_executes_work_in_fifo_order_without_overlap() -> None:
    queue = BoundedTaskQueue(active_limit=1, waiting_limit=3)
    execution_order: list[int] = []
    active = 0
    maximum_active = 0

    def make_work(value: int):
        async def work() -> int:
            nonlocal active, maximum_active
            active += 1
            maximum_active = max(maximum_active, active)
            execution_order.append(value)
            await asyncio.sleep(0)
            active -= 1
            return value * 10

        return work

    futures = [await queue.submit(f"task-{value}", make_work(value)) for value in range(4)]

    assert await asyncio.gather(*futures) == [0, 10, 20, 30]
    assert execution_order == [0, 1, 2, 3]
    assert maximum_active == 1
    await queue.shutdown()


async def test_cancel_removes_waiting_task_without_running_its_work() -> None:
    queue = BoundedTaskQueue(active_limit=1, waiting_limit=3)
    release = asyncio.Event()
    waiting_ran = False

    async def active_work() -> None:
        await release.wait()

    async def waiting_work() -> None:
        nonlocal waiting_ran
        waiting_ran = True

    active_future = await queue.submit("active", active_work)
    waiting_future = await queue.submit("waiting", waiting_work)

    assert await queue.cancel("waiting") is True
    assert waiting_future.cancelled()
    release.set()
    await active_future
    await asyncio.sleep(0)
    assert waiting_ran is False
    await queue.shutdown()


async def test_cancel_active_task_promotes_next_waiting_task() -> None:
    queue = BoundedTaskQueue(active_limit=1, waiting_limit=3)
    active_started = asyncio.Event()

    async def active_work() -> None:
        active_started.set()
        await asyncio.Event().wait()

    async def next_work() -> str:
        return "next"

    active_future = await queue.submit("active", active_work)
    await active_started.wait()
    next_future = await queue.submit("next", next_work)

    assert await queue.cancel("active") is True
    with pytest.raises(asyncio.CancelledError):
        await active_future
    assert await next_future == "next"
    assert await queue.cancel("missing") is False
    await queue.shutdown()


async def test_queue_rejects_duplicate_active_or_waiting_task_ids() -> None:
    queue = BoundedTaskQueue(active_limit=1, waiting_limit=3)
    release = asyncio.Event()

    async def work() -> None:
        await release.wait()

    future = await queue.submit("same", work)
    with pytest.raises(DuplicateTaskError):
        await queue.submit("same", work)

    release.set()
    await future
    await queue.shutdown()
