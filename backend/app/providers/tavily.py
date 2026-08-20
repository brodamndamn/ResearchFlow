from __future__ import annotations

from typing import Any

from tavily import AsyncTavilyClient

from app.agent.types import SearchDocument


class TavilySearchProvider:
    def __init__(
        self,
        api_key: str | None = None,
        *,
        client: AsyncTavilyClient | Any | None = None,
    ) -> None:
        self._client = client or AsyncTavilyClient(api_key=api_key)

    async def search(self, query: str, max_results: int) -> list[SearchDocument]:
        payload = await self._client.search(
            query=query,
            search_depth="basic",
            max_results=max_results,
            include_raw_content="text",
            include_answer=False,
        )
        documents: list[SearchDocument] = []
        for item in payload.get("results", []):
            content = (item.get("raw_content") or item.get("content") or "").strip()
            if not content or not item.get("url"):
                continue
            documents.append(
                SearchDocument(
                    url=item["url"],
                    title=(item.get("title") or item["url"]).strip(),
                    content=content,
                    score=float(item.get("score") or 0),
                    published_at=item.get("published_date"),
                )
            )
        return documents

