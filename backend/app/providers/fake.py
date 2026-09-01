from __future__ import annotations

import hashlib
from urllib.parse import quote

from app.agent.types import Evidence, ResearchMode, ResearchPlan, SearchDocument


class FakeSearchProvider:
    """不访问网络的确定性搜索器，用于测试和本机演示。"""

    async def search(self, query: str, max_results: int) -> list[SearchDocument]:
        digest = hashlib.sha256(query.encode()).hexdigest()[:10]
        return [
            SearchDocument(
                url=f"https://example.com/research/{digest}/{index}?q={quote(query)}",
                title=f"演示来源 {index}：{query}",
                content=f"这是关于“{query}”的演示资料正文，用于验证研究流程。",
                score=1 - index / 10,
            )
            for index in range(1, min(max_results, 2) + 1)
        ]


class FakeModelProvider:
    """生成结构稳定的中文结果，不消耗模型额度。"""

    async def plan(
        self, topic: str, mode: ResearchMode, query_count: int
    ) -> ResearchPlan:
        return ResearchPlan(
            focus=f"聚焦“{topic}”的事实、案例与工程影响",
            subqueries=[f"{topic} 子问题 {index + 1}" for index in range(query_count)],
        )

    async def extract(
        self, topic: str, sources: list[SearchDocument]
    ) -> list[Evidence]:
        return [
            Evidence(
                source_id=index,
                claim=f"{topic} 的演示证据 {index}",
                excerpt=source.content[:100],
            )
            for index, source in enumerate(sources, start=1)
        ]

    async def find_gaps(self, topic: str, evidence: list[Evidence]) -> list[str]:
        return [f"{topic} 最新补充信息"] if evidence else []

    async def write(
        self,
        topic: str,
        focus: str,
        evidence: list[Evidence],
        sources: list[SearchDocument],
    ) -> str:
        citations = " ".join(f"[{item.source_id}]" for item in evidence)
        return (
            f"# {topic}\n\n## 摘要\n\n{focus}。\n\n"
            f"## 主要发现\n\n演示研究流程已完成多来源证据整理 {citations}。"
        )

    async def verify(self, report: str, sources: list[SearchDocument]) -> str:
        return f"{report}\n\n> 本报告引用已通过演示校验。"
