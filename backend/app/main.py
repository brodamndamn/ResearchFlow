from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from app.agent.workflow import build_research_graph
from app.config import Settings
from app.database import create_engine, create_session_factory, initialize_database
from app.maintenance import (
    cleanup_expired_data,
    ensure_default_showcases,
    recover_interrupted_runs,
)
from app.providers.deepseek import DeepSeekModelProvider
from app.providers.fake import FakeModelProvider, FakeSearchProvider
from app.providers.tavily import TavilySearchProvider
from app.rate_limit import DailyLimitExceeded
from app.research_service import (
    InvalidResearchState,
    ResearchQueueFull,
    ResearchService,
)
from app.schemas import ResearchCreate, ResearchPlan, ResearchSnapshot
from app.task_queue import BoundedTaskQueue

_AUTO_SERVICE = object()
logger = logging.getLogger(__name__)


def _service(request: Request) -> Any:
    service = getattr(request.app.state, "research_service", None)
    if service is None:
        raise HTTPException(status_code=503, detail="研究服务尚未就绪")
    return service


def _require_snapshot(snapshot: ResearchSnapshot | None) -> ResearchSnapshot:
    if snapshot is None:
        raise HTTPException(status_code=404, detail="研究任务不存在")
    return snapshot


def create_app(*, service: Any = _AUTO_SERVICE) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if service is not _AUTO_SERVICE:
            app.state.research_service = service
            yield
            return

        settings = Settings()
        engine = create_engine(settings.database_path)
        sessions = create_session_factory(engine)
        queue = BoundedTaskQueue(
            active_limit=settings.queue_active_limit,
            waiting_limit=settings.queue_waiting_limit,
        )
        checkpoint_context = None
        cleanup_task = None
        try:
            settings.checkpoint_database_path.parent.mkdir(parents=True, exist_ok=True)
            checkpoint_context = AsyncSqliteSaver.from_conn_string(
                str(settings.checkpoint_database_path)
            )
            checkpointer = await checkpoint_context.__aenter__()
            await checkpointer.setup()
            await initialize_database(engine)
            async with sessions() as session:
                await recover_interrupted_runs(session, now=datetime.now(UTC))
                cleanup_result = await cleanup_expired_data(
                    session,
                    now=datetime.now(UTC),
                    retention_days=settings.retention_days,
                )
                await ensure_default_showcases(session, now=datetime.now(UTC))
                await _delete_checkpoints(checkpointer, cleanup_result.deleted_run_ids)
                await session.commit()

            missing_real_keys = (
                settings.provider_mode == "real"
                and (
                    not settings._is_configured(settings.model_api_key)
                    or not settings._is_configured(settings.tavily_api_key)
                )
            )
            if missing_real_keys:
                app.state.research_service = None
                app.state.ready_error = "缺少模型或 Tavily API Key"
            else:
                if settings.provider_mode == "fake":
                    model = FakeModelProvider()
                    search = FakeSearchProvider()
                else:
                    assert settings.model_api_key is not None
                    assert settings.tavily_api_key is not None
                    model = DeepSeekModelProvider(
                        api_key=settings.model_api_key.get_secret_value(),
                        base_url=settings.model_base_url,
                        model=settings.model_name,
                    )
                    search = TavilySearchProvider(
                        api_key=settings.tavily_api_key.get_secret_value()
                    )
                graph = build_research_graph(model, search, checkpointer=checkpointer)
                app.state.research_service = ResearchService(
                    settings, sessions, graph, queue
                )
                cleanup_task = asyncio.create_task(
                    _daily_cleanup(sessions, checkpointer, settings.retention_days),
                    name="researchflow:daily-cleanup",
                )
            yield
        finally:
            if cleanup_task is not None:
                cleanup_task.cancel()
                await asyncio.gather(cleanup_task, return_exceptions=True)
            await queue.shutdown()
            if checkpoint_context is not None:
                await checkpoint_context.__aexit__(None, None, None)
            await engine.dispose()

    app = FastAPI(title="ResearchFlow API", version="0.1.0", lifespan=lifespan)
    app.state.research_service = None if service is _AUTO_SERVICE else service
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[],
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(DailyLimitExceeded)
    async def daily_limit_handler(_: Request, error: DailyLimitExceeded):
        return _json_error(429, str(error))

    @app.exception_handler(ResearchQueueFull)
    async def queue_full_handler(_: Request, __: ResearchQueueFull):
        return _json_error(503, "任务队列已满，请稍后重试")

    @app.exception_handler(InvalidResearchState)
    async def invalid_state_handler(_: Request, error: InvalidResearchState):
        return _json_error(409, str(error))

    @app.post(
        "/api/research",
        response_model=ResearchSnapshot,
        status_code=status.HTTP_202_ACCEPTED,
    )
    async def create_research(payload: ResearchCreate, request: Request) -> ResearchSnapshot:
        peer_ip = request.client.host if request.client else "127.0.0.1"
        return await _service(request).create(
            payload.topic,
            payload.mode,
            peer_ip=peer_ip,
            forwarded_for=request.headers.get("x-forwarded-for"),
        )

    @app.get("/api/research/{run_id}", response_model=ResearchSnapshot)
    async def get_research(run_id: str, request: Request) -> ResearchSnapshot:
        return _require_snapshot(await _service(request).get(run_id))

    @app.put("/api/research/{run_id}/plan", response_model=ResearchSnapshot)
    async def review_plan(
        run_id: str, payload: ResearchPlan, request: Request
    ) -> ResearchSnapshot:
        return _require_snapshot(await _service(request).update_plan(run_id, payload))

    @app.post("/api/research/{run_id}/cancel", response_model=ResearchSnapshot)
    async def cancel_research(run_id: str, request: Request) -> ResearchSnapshot:
        return _require_snapshot(await _service(request).cancel(run_id))

    @app.get("/api/research/{run_id}/events")
    async def research_events(run_id: str, request: Request) -> StreamingResponse:
        service_instance = _service(request)
        _require_snapshot(await service_instance.get(run_id))

        async def generate():
            async for item in service_instance.event_stream(run_id):
                event = item.get("event", "message")
                data = json.dumps(item.get("data", {}), ensure_ascii=False, separators=(",", ":"))
                yield f"event: {event}\ndata: {data}\n\n"

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.get("/api/showcases")
    async def get_showcases(request: Request):
        return await _service(request).showcases()

    @app.get("/api/health/live")
    async def health_live():
        return {"status": "ok"}

    @app.get("/api/health/ready")
    async def health_ready(request: Request):
        if getattr(request.app.state, "research_service", None) is None:
            raise HTTPException(status_code=503, detail="研究服务尚未就绪")
        return {"status": "ready"}

    return app


app = create_app()


async def _daily_cleanup(sessions, checkpointer, retention_days: int) -> None:
    while True:
        await asyncio.sleep(24 * 60 * 60)
        try:
            async with sessions() as session:
                result = await cleanup_expired_data(
                    session, now=datetime.now(UTC), retention_days=retention_days
                )
                await _delete_checkpoints(checkpointer, result.deleted_run_ids)
                await session.commit()
        except Exception:
            logger.exception("每日过期数据清理失败，将在下一周期重试")


async def _delete_checkpoints(checkpointer, run_ids: tuple[str, ...]) -> None:
    for run_id in run_ids:
        await checkpointer.adelete_thread(run_id)


def _json_error(status_code: int, detail: str):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=status_code, content={"detail": detail})
