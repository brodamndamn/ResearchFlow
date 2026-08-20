from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime
from typing import Any

from langgraph.types import Command
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.config import Settings
from app.models import ResearchRun, Showcase, Source
from app.rate_limit import DailyRateLimiter
from app.schemas import (
    ResearchMode,
    ResearchPlan,
    ResearchReport,
    ResearchSnapshot,
    ResearchStatus,
    SourceRead,
)
from app.security import hash_ip, resolve_client_ip, should_bypass_rate_limit
from app.task_queue import BoundedTaskQueue, QueueCapacityExceeded

TERMINAL_STATUSES = {
    ResearchStatus.COMPLETED,
    ResearchStatus.FAILED,
    ResearchStatus.CANCELLED,
    ResearchStatus.EXPIRED,
}


class InvalidResearchState(Exception):
    pass


class ResearchQueueFull(Exception):
    pass


class ResearchService:
    """持久化任务、驱动 LangGraph，并向 SSE 订阅者发布可恢复快照。"""

    def __init__(
        self,
        settings: Settings,
        sessions: async_sessionmaker[AsyncSession],
        graph: Any,
        queue: BoundedTaskQueue,
    ) -> None:
        self.settings = settings
        self.sessions = sessions
        self.graph = graph
        self.queue = queue
        self.rate_limiter = DailyRateLimiter(
            settings.quick_daily_limit, settings.deep_daily_limit
        )
        self._subscribers: dict[str, set[asyncio.Queue[dict[str, Any]]]] = {}

    async def create(
        self,
        topic: str,
        mode: ResearchMode,
        *,
        peer_ip: str,
        forwarded_for: str | None,
    ) -> ResearchSnapshot:
        now = datetime.now(UTC)
        client_ip = resolve_client_ip(peer_ip, forwarded_for, self.settings.environment)
        client_hash = hash_ip(
            client_ip, self.settings.ip_hash_secret.get_secret_value()
        )
        async with self.sessions() as session:
            if not should_bypass_rate_limit(peer_ip, self.settings.environment):
                await self.rate_limiter.consume(session, client_hash, mode, date.today())
            run = ResearchRun(
                client_hash=client_hash,
                mode=mode,
                query=topic,
                status=ResearchStatus.QUEUED,
                created_at=now,
                updated_at=now,
            )
            session.add(run)
            await session.commit()
            await session.refresh(run)
            run_id = run.id

        try:
            await self._submit(run_id, lambda: self._execute_planning(run_id))
        except QueueCapacityExceeded as error:
            await self._set_failure(run_id, "任务队列已满，请稍后重试")
            raise ResearchQueueFull from error
        snapshot = await self.get(run_id)
        assert snapshot is not None
        return snapshot

    async def get(self, run_id: str) -> ResearchSnapshot | None:
        async with self.sessions() as session:
            run = await self._load_run(session, run_id)
            return self._snapshot(run) if run is not None else None

    async def update_plan(
        self, run_id: str, plan: ResearchPlan
    ) -> ResearchSnapshot | None:
        async with self.sessions() as session:
            run = await self._load_run(session, run_id)
            if run is None:
                return None
            if run.status is not ResearchStatus.WAITING_FOR_REVIEW:
                raise InvalidResearchState("当前任务不处于计划确认阶段")
            run.plan = plan.model_dump(mode="json")
            run.status = ResearchStatus.RESEARCHING
            run.updated_at = datetime.now(UTC)
            await session.commit()

        try:
            await self._submit(run_id, lambda: self._execute_research(run_id, plan))
        except QueueCapacityExceeded as error:
            await self._set_failure(run_id, "任务队列已满，请稍后重试")
            raise ResearchQueueFull from error
        await self._publish_snapshot(run_id)
        return await self.get(run_id)

    async def cancel(self, run_id: str) -> ResearchSnapshot | None:
        snapshot = await self.get(run_id)
        if snapshot is None:
            return None
        if snapshot.status in TERMINAL_STATUSES:
            return snapshot
        await self.queue.cancel(run_id)
        await self._set_status(run_id, ResearchStatus.CANCELLED)
        return await self.get(run_id)

    async def event_stream(self, run_id: str) -> AsyncIterator[dict[str, Any]]:
        channel: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=20)
        self._subscribers.setdefault(run_id, set()).add(channel)
        try:
            snapshot = await self.get(run_id)
            if snapshot is None:
                return
            yield {"event": "snapshot", "data": snapshot.model_dump(mode="json")}
            if snapshot.status in TERMINAL_STATUSES:
                return
            while True:
                try:
                    item = await asyncio.wait_for(channel.get(), timeout=15)
                except TimeoutError:
                    yield {"event": "heartbeat", "data": {"run_id": run_id}}
                    continue
                yield item
                if item.get("data", {}).get("status") in {
                    status.value for status in TERMINAL_STATUSES
                }:
                    return
        finally:
            subscribers = self._subscribers.get(run_id)
            if subscribers is not None:
                subscribers.discard(channel)
                if not subscribers:
                    self._subscribers.pop(run_id, None)

    async def showcases(self) -> list[dict[str, Any]]:
        async with self.sessions() as session:
            rows = (
                await session.execute(
                    select(Showcase, ResearchRun)
                    .join(ResearchRun, Showcase.run_id == ResearchRun.id)
                    .order_by(Showcase.created_at.desc())
                    .limit(3)
                )
            ).all()
        return [
            {
                "id": showcase.id,
                "run_id": run.id,
                "title": showcase.title,
                "summary": showcase.summary,
                "mode": run.mode.value,
            }
            for showcase, run in rows
        ]

    async def _submit(self, run_id: str, work) -> None:
        future = await self.queue.submit(run_id, work)

        def consume_result(done: asyncio.Future[Any]) -> None:
            if not done.cancelled():
                done.exception()

        future.add_done_callback(consume_result)

    async def _execute_planning(self, run_id: str) -> None:
        snapshot = await self.get(run_id)
        if snapshot is None:
            return
        await self._set_status(run_id, ResearchStatus.PLANNING)
        timeout = self._timeout_for(snapshot.mode)
        try:
            state, interrupts = await asyncio.wait_for(
                self._stream_graph(
                    run_id,
                    {"topic": snapshot.query, "mode": snapshot.mode.value},
                ),
                timeout=timeout,
            )
            plan_data = state.get("plan")
            if plan_data is None and interrupts:
                plan_data = interrupts[0].value["plan"]
            plan = ResearchPlan.model_validate(plan_data)
            async with self.sessions() as session:
                run = await self._load_run(session, run_id)
                if run is None or run.status is ResearchStatus.CANCELLED:
                    return
                run.plan = plan.model_dump(mode="json")
                run.status = ResearchStatus.WAITING_FOR_REVIEW
                run.updated_at = datetime.now(UTC)
                await session.commit()
            await self._publish_snapshot(run_id)
        except asyncio.CancelledError:
            await self._set_status(run_id, ResearchStatus.CANCELLED)
            raise
        except Exception as error:
            await self._set_failure(run_id, self._safe_error(error))

    async def _execute_research(self, run_id: str, plan: ResearchPlan) -> None:
        snapshot = await self.get(run_id)
        if snapshot is None:
            return
        timeout = self._timeout_for(snapshot.mode)
        try:
            state, _ = await asyncio.wait_for(
                self._stream_graph(
                    run_id, Command(resume=plan.model_dump(mode="json"))
                ),
                timeout=timeout,
            )
            await self._persist_completed(run_id, state)
        except asyncio.CancelledError:
            await self._set_status(run_id, ResearchStatus.CANCELLED)
            raise
        except Exception as error:
            await self._set_failure(run_id, self._safe_error(error))

    async def _persist_completed(self, run_id: str, state: dict[str, Any]) -> None:
        async with self.sessions() as session:
            run = await self._load_run(session, run_id)
            if run is None or run.status is ResearchStatus.CANCELLED:
                return
            await session.execute(delete(Source).where(Source.run_id == run_id))
            persisted_sources: list[Source] = []
            for item in state.get("sources", []):
                source = Source(
                    run_id=run_id,
                    url=str(item["url"]),
                    title=item["title"],
                    snippet=str(item.get("content", ""))[:300] or None,
                    content=item.get("content"),
                )
                session.add(source)
                persisted_sources.append(source)
            await session.flush()
            run.snapshot = {"metrics": state.get("metrics", {})}
            run.report = {
                "title": run.query,
                "markdown": state.get("report", ""),
                "source_ids": [source.id for source in persisted_sources],
            }
            run.status = ResearchStatus.COMPLETED
            run.updated_at = datetime.now(UTC)
            await session.commit()
        await self._publish_snapshot(run_id)

    async def _stream_graph(
        self, run_id: str, value: dict[str, Any] | Command
    ) -> tuple[dict[str, Any], tuple[Any, ...]]:
        config = {"configurable": {"thread_id": run_id}}
        if not hasattr(self.graph, "astream"):
            result = await self.graph.ainvoke(value, config=config, version="v2")
            state = getattr(result, "value", {})
            interrupts = tuple(getattr(result, "interrupts", ()))
            return state, interrupts

        latest_state: dict[str, Any] = {}
        interrupts: tuple[Any, ...] = ()
        async for event in self.graph.astream(
            value,
            config=config,
            stream_mode=["custom", "values"],
            version="v2",
        ):
            if event.get("type") == "custom":
                await self._handle_graph_progress(run_id, event.get("data", {}))
            elif event.get("type") == "values":
                latest_state = event.get("data", latest_state)
                interrupts = tuple(event.get("interrupts", interrupts))
        return latest_state, interrupts

    async def _handle_graph_progress(self, run_id: str, progress: dict[str, Any]) -> None:
        stage = progress.get("stage")
        status_map = {
            "planning": ResearchStatus.PLANNING,
            "researching": ResearchStatus.RESEARCHING,
            "writing": ResearchStatus.WRITING,
            "verifying": ResearchStatus.VERIFYING,
        }
        if stage in status_map:
            await self._set_status(run_id, status_map[stage])
        item = {"event": "progress", "data": {"run_id": run_id, **progress}}
        for channel in tuple(self._subscribers.get(run_id, ())):
            if not channel.full():
                channel.put_nowait(item)

    async def _set_status(self, run_id: str, status: ResearchStatus) -> None:
        async with self.sessions() as session:
            run = await session.get(ResearchRun, run_id)
            if run is None:
                return
            if run.status in TERMINAL_STATUSES and run.status is not status:
                return
            run.status = status
            run.updated_at = datetime.now(UTC)
            await session.commit()
        await self._publish_snapshot(run_id)

    async def _set_failure(self, run_id: str, message: str) -> None:
        async with self.sessions() as session:
            run = await session.get(ResearchRun, run_id)
            if run is None or run.status is ResearchStatus.CANCELLED:
                return
            run.status = ResearchStatus.FAILED
            run.error = message
            run.updated_at = datetime.now(UTC)
            await session.commit()
        await self._publish_snapshot(run_id)

    async def _publish_snapshot(self, run_id: str) -> None:
        snapshot = await self.get(run_id)
        if snapshot is None:
            return
        item = {"event": "snapshot", "data": snapshot.model_dump(mode="json")}
        for channel in tuple(self._subscribers.get(run_id, ())):
            if channel.full():
                try:
                    channel.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            channel.put_nowait(item)

    @staticmethod
    async def _load_run(session: AsyncSession, run_id: str) -> ResearchRun | None:
        return await session.scalar(
            select(ResearchRun)
            .options(selectinload(ResearchRun.sources))
            .where(ResearchRun.id == run_id)
        )

    @staticmethod
    def _snapshot(run: ResearchRun) -> ResearchSnapshot:
        return ResearchSnapshot(
            run_id=run.id,
            mode=run.mode,
            status=run.status,
            query=run.query,
            plan=ResearchPlan.model_validate(run.plan) if run.plan else None,
            sources=[
                SourceRead(id=source.id, url=source.url, title=source.title, snippet=source.snippet)
                for source in run.sources
            ],
            report=ResearchReport.model_validate(run.report) if run.report else None,
            metrics=(run.snapshot or {}).get("metrics", {}),
            error=run.error,
            created_at=run.created_at,
            updated_at=run.updated_at,
        )

    def _timeout_for(self, mode: ResearchMode) -> int:
        if mode is ResearchMode.QUICK:
            return self.settings.quick_timeout_seconds
        return self.settings.deep_timeout_seconds

    @staticmethod
    def _safe_error(error: Exception) -> str:
        if isinstance(error, TimeoutError):
            return "研究任务执行超时"
        return f"研究任务执行失败：{type(error).__name__}"
