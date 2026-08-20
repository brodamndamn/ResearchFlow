from datetime import UTC, date, datetime
from pathlib import Path

from sqlalchemy import inspect, select

from app.database import create_engine, create_session_factory, initialize_database
from app.models import RateUsage, ResearchRun, Showcase, Source
from app.schemas import ResearchMode, ResearchStatus


async def test_initialize_database_creates_all_domain_tables(tmp_path: Path) -> None:
    engine = create_engine(tmp_path / "nested" / "research.sqlite3")

    await initialize_database(engine)

    async with engine.connect() as connection:
        table_names = await connection.run_sync(
            lambda sync_connection: inspect(sync_connection).get_table_names()
        )
    assert set(table_names) == {"rate_usage", "research_runs", "showcases", "sources"}
    await engine.dispose()


async def test_models_persist_a_run_with_sources_usage_and_showcase(tmp_path: Path) -> None:
    engine = create_engine(tmp_path / "research.sqlite3")
    await initialize_database(engine)
    session_factory = create_session_factory(engine)
    now = datetime(2026, 1, 1, tzinfo=UTC)

    async with session_factory() as session:
        run = ResearchRun(
            client_hash="client-1",
            mode=ResearchMode.QUICK,
            query="量子计算进展",
            status=ResearchStatus.QUEUED,
            plan={"steps": ["检索"]},
            created_at=now,
            updated_at=now,
        )
        source = Source(
            run=run,
            url="https://example.com/article",
            title="来源",
            snippet="摘要",
        )
        usage = RateUsage(
            client_hash="client-1",
            usage_date=date(2026, 1, 1),
            mode=ResearchMode.QUICK,
            count=1,
        )
        showcase = Showcase(run=run, title="公开案例", summary="案例摘要")
        session.add_all([run, source, usage, showcase])
        await session.commit()

    async with session_factory() as session:
        stored_run = await session.scalar(select(ResearchRun))
        stored_source = await session.scalar(select(Source))
        stored_usage = await session.scalar(select(RateUsage))
        stored_showcase = await session.scalar(select(Showcase))

    assert stored_run is not None and stored_run.mode is ResearchMode.QUICK
    assert stored_source is not None and stored_source.run_id == stored_run.id
    assert stored_usage is not None and stored_usage.count == 1
    assert stored_showcase is not None and stored_showcase.run_id == stored_run.id
    await engine.dispose()
