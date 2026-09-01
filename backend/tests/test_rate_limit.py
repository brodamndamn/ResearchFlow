from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import select

from app.database import create_engine, create_session_factory, initialize_database
from app.models import RateUsage
from app.rate_limit import DailyLimitExceeded, DailyRateLimiter
from app.schemas import ResearchMode


@pytest.fixture
async def session(tmp_path: Path):
    engine = create_engine(tmp_path / "rate-limit.sqlite3")
    await initialize_database(engine)
    factory = create_session_factory(engine)
    async with factory() as database_session:
        yield database_session
    await engine.dispose()


async def test_quick_mode_allows_three_daily_runs_and_rejects_the_fourth(session) -> None:
    limiter = DailyRateLimiter(quick_limit=3, deep_limit=1)
    today = date(2026, 1, 2)

    assert (await limiter.consume(session, "client-1", ResearchMode.QUICK, today)).remaining == 2
    assert (await limiter.consume(session, "client-1", ResearchMode.QUICK, today)).remaining == 1
    assert (await limiter.consume(session, "client-1", ResearchMode.QUICK, today)).remaining == 0
    with pytest.raises(DailyLimitExceeded) as error:
        await limiter.consume(session, "client-1", ResearchMode.QUICK, today)

    assert error.value.limit == 3
    usage = await session.scalar(select(RateUsage))
    assert usage is not None and usage.count == 3


async def test_deep_limit_is_independent_by_client_date_and_mode(session) -> None:
    limiter = DailyRateLimiter(quick_limit=3, deep_limit=1)
    today = date(2026, 1, 2)

    decision = await limiter.consume(session, "client-1", ResearchMode.DEEP, today)
    with pytest.raises(DailyLimitExceeded):
        await limiter.consume(session, "client-1", ResearchMode.DEEP, today)
    next_day = await limiter.consume(
        session, "client-1", ResearchMode.DEEP, date(2026, 1, 3)
    )
    other_client = await limiter.consume(session, "client-2", ResearchMode.DEEP, today)

    assert decision.remaining == 0
    assert next_day.remaining == 0
    assert other_client.remaining == 0
