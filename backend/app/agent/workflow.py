from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from app.agent.types import (
    Evidence,
    ResearchMode,
    ResearchPlan,
    ResearchState,
    SearchDocument,
)
from app.providers.base import ModelProvider, SearchProvider

TRACKING_QUERY_PREFIXES = ("utm_",)
TRACKING_QUERY_KEYS = {"fbclid", "gclid"}
LOW_QUALITY_DOMAINS = {"csdn.net"}
OFFICIAL_DOMAIN_SUFFIXES = {".gov", ".gov.cn", ".edu", ".edu.cn", ".ac.cn"}
ACADEMIC_DOMAINS = {
    "acm.org",
    "arxiv.org",
    "doi.org",
    "ieee.org",
    "nature.com",
    "pubmed.ncbi.nlm.nih.gov",
    "science.org",
}


def canonical_url(url: str) -> str:
    parsed = urlsplit(url)
    query = urlencode(
        [
            (key, value)
            for key, value in parse_qsl(parsed.query, keep_blank_values=True)
            if not key.lower().startswith(TRACKING_QUERY_PREFIXES)
            and key.lower() not in TRACKING_QUERY_KEYS
        ]
    )
    path = parsed.path.rstrip("/") or "/"
    return urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), path, query, ""))


def _emit(stage: str, message: str, progress: int) -> None:
    writer = get_stream_writer()
    writer({"stage": stage, "message": message, "progress": progress})


def _documents(value: list[dict[str, Any]]) -> list[SearchDocument]:
    return [SearchDocument.model_validate(item) for item in value]


def _evidence(value: list[dict[str, Any]]) -> list[Evidence]:
    return [Evidence.model_validate(item) for item in value]


def _matches_domain(host: str, domains: set[str]) -> bool:
    return any(host == domain or host.endswith(f".{domain}") for domain in domains)


def _source_quality(source: SearchDocument) -> int:
    host = (urlsplit(str(source.url)).hostname or "").lower().rstrip(".")
    if _matches_domain(host, LOW_QUALITY_DOMAINS):
        return -1
    if host.endswith(tuple(OFFICIAL_DOMAIN_SUFFIXES)) or _matches_domain(
        host, ACADEMIC_DOMAINS
    ):
        return 1
    return 0


def _deduplicate(items: list[SearchDocument], limit: int) -> list[SearchDocument]:
    selected: dict[str, SearchDocument] = {}
    for item in sorted(items, key=lambda source: source.score, reverse=True):
        key = canonical_url(str(item.url))
        if key not in selected:
            selected[key] = SearchDocument.model_validate(
                {**item.model_dump(), "url": key}
            )
    acceptable_sources = [
        source for source in selected.values() if _source_quality(source) >= 0
    ]
    return sorted(
        acceptable_sources,
        key=lambda source: (_source_quality(source), source.score),
        reverse=True,
    )[:limit]


def build_research_graph(
    model: ModelProvider,
    search: SearchProvider,
    *,
    checkpointer=None,
):
    async def plan_node(state: ResearchState) -> dict[str, Any]:
        _emit("planning", "正在拆分研究问题", 10)
        mode = ResearchMode(state["mode"])
        query_count = 2 if mode is ResearchMode.QUICK else 4
        plan = await model.plan(state["topic"], mode, query_count)
        return {
            "status": "waiting_for_review",
            "plan": plan.model_dump(),
            "sources": [],
            "evidence": [],
            "metrics": {"search_calls": 0, "source_count": 0},
        }

    async def review_node(state: ResearchState) -> dict[str, Any]:
        edited = interrupt({"type": "plan_review", "plan": state["plan"]})
        plan = ResearchPlan.model_validate(edited)
        _emit("researching", "研究计划已确认", 20)
        return {"plan": plan.model_dump(), "status": "researching"}

    async def search_node(state: ResearchState) -> dict[str, Any]:
        plan = ResearchPlan.model_validate(state["plan"])
        mode = ResearchMode(state["mode"])
        _emit("researching", "正在并行检索多个来源", 35)
        batches = await asyncio.gather(
            *(search.search(query, max_results=4) for query in plan.subqueries)
        )
        limit = 4 if mode is ResearchMode.QUICK else 8
        sources = _deduplicate([item for batch in batches for item in batch], limit)
        metrics = dict(state["metrics"])
        metrics.update(search_calls=len(plan.subqueries), source_count=len(sources))
        return {
            "sources": [item.model_dump(mode="json") for item in sources],
            "metrics": metrics,
        }

    async def extract_node(state: ResearchState) -> dict[str, Any]:
        _emit("researching", "正在提取和重排证据", 55)
        evidence = await model.extract(state["topic"], _documents(state["sources"]))
        return {"evidence": [item.model_dump() for item in evidence]}

    async def gap_node(state: ResearchState) -> dict[str, Any]:
        evidence = _evidence(state["evidence"])
        queries = await model.find_gaps(state["topic"], evidence)
        if not queries:
            return {}
        _emit("researching", "发现信息缺口，正在补充检索", 65)
        batches = await asyncio.gather(
            *(search.search(query, max_results=4) for query in queries[:1])
        )
        sources = _deduplicate(
            _documents(state["sources"]) + [item for batch in batches for item in batch], 8
        )
        evidence = await model.extract(state["topic"], sources)
        metrics = dict(state["metrics"])
        metrics.update(
            search_calls=int(metrics["search_calls"]) + len(queries[:1]),
            source_count=len(sources),
        )
        return {
            "sources": [item.model_dump(mode="json") for item in sources],
            "evidence": [item.model_dump() for item in evidence],
            "metrics": metrics,
        }

    async def write_node(state: ResearchState) -> dict[str, Any]:
        _emit("writing", "正在撰写中文研究报告", 78)
        report = await model.write(
            state["topic"],
            ResearchPlan.model_validate(state["plan"]).focus,
            _evidence(state["evidence"]),
            _documents(state["sources"]),
        )
        return {"status": "writing", "report": report}

    async def verify_node(state: ResearchState) -> dict[str, Any]:
        _emit("verifying", "正在校验事实与引用", 90)
        report = await model.verify(state["report"], _documents(state["sources"]))
        return {"status": "verifying", "report": report}

    async def finish_node(state: ResearchState) -> dict[str, Any]:
        _emit("completed", "研究报告已完成", 100)
        return {"status": "completed"}

    builder = StateGraph(ResearchState)
    builder.add_node("plan", plan_node)
    builder.add_node("review", review_node)
    builder.add_node("search", search_node)
    builder.add_node("extract", extract_node)
    builder.add_node("gap", gap_node)
    builder.add_node("write", write_node)
    builder.add_node("verify", verify_node)
    builder.add_node("finish", finish_node)
    builder.add_edge(START, "plan")
    builder.add_edge("plan", "review")
    builder.add_edge("review", "search")
    builder.add_edge("search", "extract")
    builder.add_conditional_edges(
        "extract",
        lambda state: "gap" if state["mode"] == ResearchMode.DEEP.value else "write",
        {"gap": "gap", "write": "write"},
    )
    builder.add_edge("gap", "write")
    builder.add_conditional_edges(
        "write",
        lambda state: "verify" if state["mode"] == ResearchMode.DEEP.value else "finish",
        {"verify": "verify", "finish": "finish"},
    )
    builder.add_edge("verify", "finish")
    builder.add_edge("finish", END)
    return builder.compile(checkpointer=checkpointer)
