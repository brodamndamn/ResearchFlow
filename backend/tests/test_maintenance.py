from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from sqlalchemy import func, select

from app.database import create_engine, create_session_factory, initialize_database
from app.maintenance import cleanup_expired_data, recover_interrupted_runs
from app.models import RateUsage, ResearchRun, Source
from app.schemas import ResearchMode, ResearchStatus


def make_run(created_at: datetime, status: ResearchStatus = ResearchStatus.COMPLETED):
    return ResearchRun(
        client_hash="client-1",
        mode=ResearchMode.QUICK,
        query="问题",
        status=status,
        created_at=created_at,
        updated_at=created_at,
    )


async def test_cleanup_deletes_data_older_than_seven_days_and_keeps_boundary(
    tmp_path: Path,
) -> None:
    engine = create_engine(tmp_path / "cleanup.sqlite3")
    await initialize_database(engine)
    factory = create_session_factory(engine)
    now = datetime(2026, 1, 10, 12, tzinfo=UTC)

    async with factory() as session:
        expired = make_run(now - timedelta(days=8))
        expired.sources.append(Source(url="https://old.example", title="旧来源"))
        retained = make_run(now - timedelta(days=7))
        session.add_all(
            [
                expired,
                retained,
                RateUsage(
                    client_hash="client-1",
                    usage_date=date(2026, 1, 2),
                    mode=ResearchMode.QUICK,
                    count=1,
                ),
                RateUsage(
                    client_hash="client-1",
                    usage_date=date(2026, 1, 3),
                    mode=ResearchMode.QUICK,
                    count=1,
                ),
            ]
        )
        await session.commit()

        result = await cleanup_expired_data(session, now=now, retention_days=7)
        await session.commit()

        run_count = await session.scalar(select(func.count()).select_from(ResearchRun))
        source_count = await session.scalar(select(func.count()).select_from(Source))
        usage_count = await session.scalar(select(func.count()).select_from(RateUsage))

    assert result.runs_deleted == 1
    assert result.usage_rows_deleted == 1
    assert run_count == 1
    assert source_count == 0
    assert usage_count == 1
    await engine.dispose()


async def test_startup_recovery_marks_only_executing_runs_failed(tmp_path: Path) -> None:
    engine = create_engine(tmp_path / "recovery.sqlite3")
    await initialize_database(engine)
    factory = create_session_factory(engine)
    before = datetime(2026, 1, 1, tzinfo=UTC)
    now = datetime(2026, 1, 2, tzinfo=UTC)

    async with factory() as session:
        executing = make_run(before, ResearchStatus.EXECUTING)
        queued = make_run(before, ResearchStatus.QUEUED)
        session.add_all([executing, queued])
        await session.commit()

        changed = await recover_interrupted_runs(session, now=now)
        await session.commit()
        await session.refresh(executing)
        await session.refresh(queued)

    assert changed == 1
    assert executing.status is ResearchStatus.FAILED
    assert executing.error == "服务重启，研究任务执行中断"
    assert executing.updated_at.replace(tzinfo=UTC) == now
    assert queued.status is ResearchStatus.QUEUED
    await engine.dispose()
