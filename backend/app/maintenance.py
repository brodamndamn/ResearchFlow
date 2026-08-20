from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RateUsage, ResearchRun
from app.schemas import ResearchStatus


@dataclass(frozen=True, slots=True)
class CleanupResult:
    runs_deleted: int
    usage_rows_deleted: int


async def cleanup_expired_data(
    session: AsyncSession,
    *,
    now: datetime,
    retention_days: int = 7,
) -> CleanupResult:
    cutoff = now - timedelta(days=retention_days)
    runs_result = await session.execute(delete(ResearchRun).where(ResearchRun.created_at < cutoff))
    usage_result = await session.execute(
        delete(RateUsage).where(RateUsage.usage_date < cutoff.date())
    )
    return CleanupResult(
        runs_deleted=runs_result.rowcount,
        usage_rows_deleted=usage_result.rowcount,
    )


async def recover_interrupted_runs(session: AsyncSession, *, now: datetime) -> int:
    result = await session.execute(
        update(ResearchRun)
        .where(ResearchRun.status == ResearchStatus.EXECUTING)
        .values(
            status=ResearchStatus.FAILED,
            error="服务重启，研究任务执行中断",
            updated_at=now,
        )
    )
    return result.rowcount
