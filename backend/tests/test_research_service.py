import asyncio
from pathlib import Path
from types import SimpleNamespace

from langgraph.types import Command

from app.config import Settings
from app.database import create_engine, create_session_factory, initialize_database
from app.research_service import ResearchService
from app.schemas import ResearchMode, ResearchPlan, ResearchStatus
from app.task_queue import BoundedTaskQueue


class FakeGraph:
    async def ainvoke(self, value, *, config, version):
        assert version == "v2"
        assert config["configurable"]["thread_id"]
        if isinstance(value, Command):
            return SimpleNamespace(
                value={
                    "topic": "国产大模型工程应用",
                    "mode": "quick",
                    "status": "completed",
                    "plan": {
                        "focus": "关注生产实践",
                        "subqueries": ["检索生产案例"],
                    },
                    "sources": [
                        {
                            "url": "https://example.com/report",
                            "title": "示例来源",
                            "content": "可靠正文",
                            "score": 0.9,
                        }
                    ],
                    "report": "# 研究报告\n\n结论 [1]",
                    "metrics": {"search_calls": 1, "source_count": 1},
                }
            )
        return SimpleNamespace(
            interrupts=[
                SimpleNamespace(
                    value={
                        "plan": {
                            "focus": "关注生产实践",
                            "subqueries": ["检索生产案例"],
                        }
                    }
                )
            ]
        )


async def wait_for_status(service, run_id, expected):
    for _ in range(100):
        snapshot = await service.get(run_id)
        if snapshot and snapshot.status is expected:
            return snapshot
        await asyncio.sleep(0.01)
    raise AssertionError(f"任务未进入状态：{expected}")


async def make_service(tmp_path: Path):
    engine = create_engine(tmp_path / "service.sqlite3")
    await initialize_database(engine)
    sessions = create_session_factory(engine)
    settings = Settings(
        _env_file=None,
        environment="development",
        database_path=tmp_path / "service.sqlite3",
        checkpoint_database_path=tmp_path / "checkpoints.sqlite3",
    )
    queue = BoundedTaskQueue(active_limit=1, waiting_limit=3)
    service = ResearchService(settings, sessions, FakeGraph(), queue)
    return service, queue, engine


async def test_service_persists_plan_resume_report_sources_and_metrics(tmp_path: Path) -> None:
    service, queue, engine = await make_service(tmp_path)
    created = await service.create(
        "国产大模型工程应用",
        ResearchMode.QUICK,
        peer_ip="127.0.0.1",
        forwarded_for="203.0.113.10",
    )
    waiting = await wait_for_status(service, created.run_id, ResearchStatus.WAITING_FOR_REVIEW)

    assert waiting.plan is not None
    assert waiting.plan.focus == "关注生产实践"

    resumed = await service.update_plan(
        created.run_id,
        ResearchPlan(focus="关注生产实践", subqueries=["检索生产案例"]),
    )
    assert resumed is not None
    assert resumed.status is ResearchStatus.RESEARCHING

    completed = await wait_for_status(service, created.run_id, ResearchStatus.COMPLETED)
    assert completed.report is not None
    assert completed.report.markdown.startswith("# 研究报告")
    assert len(completed.sources) == 1
    assert completed.metrics == {"search_calls": 1, "source_count": 1}

    await queue.shutdown()
    await engine.dispose()


async def test_event_stream_starts_with_recoverable_snapshot(tmp_path: Path) -> None:
    service, queue, engine = await make_service(tmp_path)
    created = await service.create(
        "国产大模型工程应用",
        ResearchMode.QUICK,
        peer_ip="127.0.0.1",
        forwarded_for=None,
    )
    await wait_for_status(service, created.run_id, ResearchStatus.WAITING_FOR_REVIEW)

    stream = service.event_stream(created.run_id)
    first = await anext(stream)
    await stream.aclose()

    assert first["event"] == "snapshot"
    assert first["data"]["run_id"] == created.run_id
    assert first["data"]["status"] == "waiting_for_review"

    await queue.shutdown()
    await engine.dispose()
