from __future__ import annotations

import pytest
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from app.agent.types import Evidence, ResearchMode, ResearchPlan, SearchDocument
from app.agent.workflow import build_research_graph

pytestmark = pytest.mark.filterwarnings("error:Pydantic serializer warnings")


class FakeModelProvider:
    def __init__(self) -> None:
        self.gap_calls = 0
        self.verify_calls = 0

    async def plan(self, topic: str, mode: ResearchMode, query_count: int) -> ResearchPlan:
        return ResearchPlan(
            focus=f"聚焦 {topic}",
            subqueries=[f"{topic} 子问题 {index + 1}" for index in range(query_count)],
        )

    async def extract(
        self, topic: str, sources: list[SearchDocument]
    ) -> list[Evidence]:
        return [
            Evidence(source_id=index + 1, claim=f"证据 {index + 1}", excerpt=source.content[:80])
            for index, source in enumerate(sources)
        ]

    async def find_gaps(self, topic: str, evidence: list[Evidence]) -> list[str]:
        self.gap_calls += 1
        return [f"{topic} 最新补充资料"]

    async def write(
        self,
        topic: str,
        focus: str,
        evidence: list[Evidence],
        sources: list[SearchDocument],
    ) -> str:
        citations = " ".join(f"[{item.source_id}]" for item in evidence)
        return f"# {topic}\n\n{focus}\n\n{citations}"

    async def verify(self, report: str, sources: list[SearchDocument]) -> str:
        self.verify_calls += 1
        return f"{report}\n\n> 引用已经过一致性检查。"


class FakeSearchProvider:
    def __init__(self) -> None:
        self.queries: list[str] = []

    async def search(self, query: str, max_results: int) -> list[SearchDocument]:
        self.queries.append(query)
        suffix = len(self.queries)
        return [
            SearchDocument(
                url=f"https://example.com/article?utm_source={suffix}",
                title="重复来源",
                content=f"{query} 的正文内容",
                score=0.95,
            ),
            SearchDocument(
                url=f"https://source{suffix}.example.org/report",
                title=f"来源 {suffix}",
                content=f"{query} 的独立证据",
                score=0.8,
            ),
        ][:max_results]


async def _pause_and_resume(mode: ResearchMode):
    model = FakeModelProvider()
    search = FakeSearchProvider()
    graph = build_research_graph(model, search, checkpointer=InMemorySaver())
    config = {"configurable": {"thread_id": f"test-{mode.value}"}}

    paused = await graph.ainvoke(
        {"topic": "国产大模型发展", "mode": mode.value},
        config=config,
        version="v2",
    )
    assert paused.interrupts[0].value["plan"]["focus"] == "聚焦 国产大模型发展"

    completed = await graph.ainvoke(
        Command(
            resume={
                "focus": "聚焦国产大模型的工程应用",
                "subqueries": paused.interrupts[0].value["plan"]["subqueries"],
            }
        ),
        config=config,
        version="v2",
    )
    return completed.value, model, search


async def test_quick_mode_pauses_for_review_and_deduplicates_sources() -> None:
    state, model, search = await _pause_and_resume(ResearchMode.QUICK)

    assert len(search.queries) == 2
    assert len(state["sources"]) == 3
    assert state["plan"]["focus"] == "聚焦国产大模型的工程应用"
    assert state["status"] == "completed"
    assert model.gap_calls == 0
    assert model.verify_calls == 0


async def test_deep_mode_runs_one_gap_search_and_verifies_report() -> None:
    state, model, search = await _pause_and_resume(ResearchMode.DEEP)

    assert len(search.queries) == 5
    assert model.gap_calls == 1
    assert model.verify_calls == 1
    assert "一致性检查" in state["report"]
    assert state["metrics"]["search_calls"] == 5
