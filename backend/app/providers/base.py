from __future__ import annotations

from typing import Protocol

from app.agent.types import Evidence, ResearchMode, ResearchPlan, SearchDocument


class SearchProvider(Protocol):
    async def search(self, query: str, max_results: int) -> list[SearchDocument]: ...


class ModelProvider(Protocol):
    async def plan(
        self, topic: str, mode: ResearchMode, query_count: int
    ) -> ResearchPlan: ...

    async def extract(
        self, topic: str, sources: list[SearchDocument]
    ) -> list[Evidence]: ...

    async def find_gaps(self, topic: str, evidence: list[Evidence]) -> list[str]: ...

    async def write(
        self,
        topic: str,
        focus: str,
        evidence: list[Evidence],
        sources: list[SearchDocument],
    ) -> str: ...

    async def verify(self, report: str, sources: list[SearchDocument]) -> str: ...

