from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from sqlalchemy import func, select

from app.database import create_engine, create_session_factory, initialize_database
from app.maintenance import (
    cleanup_expired_data,
    ensure_default_showcases,
    recover_interrupted_runs,
)
from app.models import RateUsage, ResearchRun, Showcase, Source
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
        featured = make_run(now - timedelta(days=30))
        featured.sources.append(Source(url="https://featured.example", title="精选来源"))
        featured.showcase = Showcase(title="精选案例", summary="不应过期")
        retained = make_run(now - timedelta(days=7))
        session.add_all(
            [
                expired,
                featured,
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
    assert result.deleted_run_ids == (expired.id,)
    assert result.usage_rows_deleted == 1
    assert run_count == 2
    assert source_count == 1
    assert usage_count == 1
    await engine.dispose()


async def test_default_showcases_are_idempotent_and_openable(tmp_path: Path) -> None:
    engine = create_engine(tmp_path / "showcases.sqlite3")
    await initialize_database(engine)
    factory = create_session_factory(engine)
    now = datetime(2026, 1, 10, 12, tzinfo=UTC)

    async with factory() as session:
        first = await ensure_default_showcases(session, now=now)
        second = await ensure_default_showcases(session, now=now)
        await session.commit()
        showcases = (await session.scalars(select(Showcase))).all()
        runs = (await session.scalars(select(ResearchRun))).all()
        source_counts = dict(
            (
                await session.execute(
                    select(Source.run_id, func.count(Source.id)).group_by(Source.run_id)
                )
            ).all()
        )

    assert first == 3
    assert second == 0
    assert len(showcases) == 3
    assert len(runs) == 3
    assert {showcase.title for showcase in showcases} == {
        "AI 编程助手是否真正提升研发效率",
        "中国低空经济商业化进展",
        "新能源汽车动力电池回收的产业闭环",
    }
    assert all(run.status is ResearchStatus.COMPLETED for run in runs)
    assert all(run.report for run in runs)
    assert all(source_counts[run.id] >= 4 for run in runs)
    assert all("## 核心结论" in run.report["markdown"] for run in runs)
    assert all("## 局限与风险" in run.report["markdown"] for run in runs)
    await engine.dispose()


async def test_default_showcases_replace_legacy_system_examples(tmp_path: Path) -> None:
    engine = create_engine(tmp_path / "showcase-migration.sqlite3")
    await initialize_database(engine)
    factory = create_session_factory(engine)
    now = datetime(2026, 1, 10, 12, tzinfo=UTC)

    async with factory() as session:
        legacy = make_run(now)
        legacy.client_hash = "showcase"
        legacy.query = "联网研究 Agent 是否需要向量数据库"
        legacy.showcase = Showcase(title=legacy.query, summary="旧的简单案例")
        user_showcase = make_run(now)
        user_showcase.showcase = Showcase(title="用户保留案例", summary="不能被系统迁移删除")
        session.add_all([legacy, user_showcase])
        await session.commit()

        created = await ensure_default_showcases(session, now=now)
        await session.commit()
        titles = set(await session.scalars(select(Showcase.title)))
        system_count = await session.scalar(
            select(func.count()).select_from(ResearchRun).where(
                ResearchRun.client_hash == "showcase"
            )
        )

    assert created == 3
    assert "联网研究 Agent 是否需要向量数据库" not in titles
    assert "AI 编程助手是否真正提升研发效率" in titles
    assert "用户保留案例" in titles
    assert system_count == 3
    await engine.dispose()


async def test_default_showcases_repair_damaged_seed_data(tmp_path: Path) -> None:
    engine = create_engine(tmp_path / "showcase-repair.sqlite3")
    await initialize_database(engine)
    factory = create_session_factory(engine)
    now = datetime(2026, 1, 10, 12, tzinfo=UTC)

    async with factory() as session:
        await ensure_default_showcases(session, now=now)
        await session.commit()

    async with factory() as session:
        damaged = await session.scalar(
            select(ResearchRun).where(ResearchRun.client_hash == "showcase").limit(1)
        )
        assert damaged is not None
        source_ids = list(damaged.report["source_ids"])
        damaged.report = {**damaged.report, "source_ids": list(reversed(source_ids))}
        source = await session.get(Source, source_ids[0])
        assert source is not None
        source.title = "损坏的来源标题"
        await session.commit()

    async with factory() as session:
        repaired = await ensure_default_showcases(session, now=now)
        await session.commit()
        system_runs = (
            await session.scalars(
                select(ResearchRun).where(ResearchRun.client_hash == "showcase")
            )
        ).all()
        source_count = await session.scalar(select(func.count()).select_from(Source))

    assert repaired == 3
    assert len(system_runs) == 3
    assert source_count == 12
    assert all(run.snapshot["showcase_version"] == 1 for run in system_runs)
    assert all(len(run.report["source_ids"]) == 4 for run in system_runs)
    async with factory() as session:
        assert not await session.scalar(
            select(func.count()).select_from(Source).where(Source.title == "损坏的来源标题")
        )
    await engine.dispose()


async def test_startup_recovery_marks_active_runs_failed_but_keeps_reviewable_runs(
    tmp_path: Path,
) -> None:
    engine = create_engine(tmp_path / "recovery.sqlite3")
    await initialize_database(engine)
    factory = create_session_factory(engine)
    before = datetime(2026, 1, 1, tzinfo=UTC)
    now = datetime(2026, 1, 2, tzinfo=UTC)

    async with factory() as session:
        researching = make_run(before, ResearchStatus.RESEARCHING)
        waiting = make_run(before, ResearchStatus.WAITING_FOR_REVIEW)
        queued = make_run(before, ResearchStatus.QUEUED)
        session.add_all([researching, waiting, queued])
        await session.commit()

        changed = await recover_interrupted_runs(session, now=now)
        await session.commit()
        await session.refresh(researching)
        await session.refresh(waiting)
        await session.refresh(queued)

    assert changed == 2
    assert researching.status is ResearchStatus.FAILED
    assert researching.error == "服务重启，研究任务执行中断"
    assert researching.updated_at.replace(tzinfo=UTC) == now
    assert waiting.status is ResearchStatus.WAITING_FOR_REVIEW
    assert queued.status is ResearchStatus.FAILED
    await engine.dispose()
