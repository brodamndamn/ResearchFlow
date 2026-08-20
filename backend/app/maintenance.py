from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RateUsage, ResearchRun, Showcase, Source
from app.schemas import ResearchMode, ResearchStatus


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
    runs_result = await session.execute(
        delete(ResearchRun).where(
            ResearchRun.created_at < cutoff,
            ~ResearchRun.showcase.has(),
        )
    )
    usage_result = await session.execute(
        delete(RateUsage).where(RateUsage.usage_date < cutoff.date())
    )
    return CleanupResult(
        runs_deleted=runs_result.rowcount,
        usage_rows_deleted=usage_result.rowcount,
    )


async def recover_interrupted_runs(session: AsyncSession, *, now: datetime) -> int:
    active_statuses = (
        ResearchStatus.PLANNING,
        ResearchStatus.RESEARCHING,
        ResearchStatus.WRITING,
        ResearchStatus.VERIFYING,
    )
    result = await session.execute(
        update(ResearchRun)
        .where(ResearchRun.status.in_(active_statuses))
        .values(
            status=ResearchStatus.FAILED,
            error="服务重启，研究任务执行中断",
            updated_at=now,
        )
    )
    return result.rowcount


async def ensure_default_showcases(session: AsyncSession, *, now: datetime) -> int:
    if await session.scalar(select(func.count()).select_from(Showcase)):
        return 0

    examples = [
        {
            "title": "DeepSeek V4 Flash 在研究 Agent 中的应用",
            "summary": "展示模型思考模式切换、结构化规划与中文报告生成。",
            "mode": ResearchMode.DEEP,
            "focus": "关注模型能力与工程接入",
            "url": "https://api-docs.deepseek.com/api/list-models/",
            "source_title": "DeepSeek API 模型列表",
            "report": (
                "# DeepSeek V4 Flash 在研究 Agent 中的应用\n\n"
                "研究工作流可以通过 OpenAI 兼容接口调用模型，并将规划、写作与校验拆成独立节点 [1]。"
            ),
        },
        {
            "title": "2 核 2G 服务器部署研究 Agent",
            "summary": "展示单进程队列、SQLite 双库与 Nginx SSE 代理的轻量部署方案。",
            "mode": ResearchMode.QUICK,
            "focus": "关注低资源部署",
            "url": "https://fastapi.tiangolo.com/deployment/server-workers/",
            "source_title": "FastAPI 部署文档",
            "report": (
                "# 2 核 2G 服务器部署研究 Agent\n\n"
                "轻量部署采用单个 Uvicorn 进程，由 Nginx 提供静态资源和反向代理 [1]。"
            ),
        },
        {
            "title": "联网研究 Agent 是否需要向量数据库",
            "summary": "对比实时 Web 检索与知识库 RAG，解释首版不引入向量数据库的原因。",
            "mode": ResearchMode.DEEP,
            "focus": "关注架构取舍",
            "url": "https://docs.tavily.com/documentation/api-reference/endpoint/search",
            "source_title": "Tavily Search API 文档",
            "report": (
                "# 联网研究 Agent 是否需要向量数据库\n\n"
                "当资料只服务于一次研究任务时，可以直接使用搜索结果正文完成证据整理 [1]。"
            ),
        },
    ]
    for example in examples:
        run = ResearchRun(
            client_hash="showcase",
            mode=example["mode"],
            query=example["title"],
            status=ResearchStatus.COMPLETED,
            plan={"focus": example["focus"], "subqueries": [example["title"]]},
            snapshot={"metrics": {"search_calls": 1, "source_count": 1}},
            created_at=now,
            updated_at=now,
        )
        source = Source(
            url=example["url"],
            title=example["source_title"],
            snippet=example["summary"],
        )
        run.sources.append(source)
        session.add(run)
        await session.flush()
        run.report = {
            "title": example["title"],
            "markdown": example["report"],
            "source_ids": [source.id],
        }
        run.showcase = Showcase(
            title=example["title"],
            summary=example["summary"],
            created_at=now,
        )
    return len(examples)
