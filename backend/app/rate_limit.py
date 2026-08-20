from dataclasses import dataclass
from datetime import date

from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RateUsage
from app.schemas import ResearchMode


class DailyLimitExceeded(Exception):
    def __init__(self, mode: ResearchMode, limit: int) -> None:
        self.mode = mode
        self.limit = limit
        super().__init__(f"{mode.value} 模式今日限额已用完（{limit} 次）")


@dataclass(frozen=True, slots=True)
class QuotaDecision:
    limit: int
    used: int
    remaining: int


class DailyRateLimiter:
    def __init__(self, quick_limit: int = 3, deep_limit: int = 1) -> None:
        self._limits = {
            ResearchMode.QUICK: quick_limit,
            ResearchMode.DEEP: deep_limit,
        }

    async def consume(
        self,
        session: AsyncSession,
        client_hash: str,
        mode: ResearchMode,
        usage_date: date,
    ) -> QuotaDecision:
        limit = self._limits[mode]
        statement = (
            insert(RateUsage)
            .values(
                client_hash=client_hash,
                usage_date=usage_date,
                mode=mode,
                count=1,
            )
            .on_conflict_do_update(
                index_elements=["client_hash", "usage_date", "mode"],
                set_={"count": RateUsage.count + 1},
                where=RateUsage.count < limit,
            )
            .returning(RateUsage.count)
        )
        used = (await session.execute(statement)).scalar_one_or_none()
        if used is None:
            raise DailyLimitExceeded(mode, limit)
        return QuotaDecision(limit=limit, used=used, remaining=limit - used)
