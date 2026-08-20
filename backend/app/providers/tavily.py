from __future__ import annotations

from typing import Any

from tavily import AsyncTavilyClient
from tavily.errors import TimeoutError as TavilyTimeoutError
from tavily.errors import UsageLimitExceededError
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, wait_fixed

from app.agent.types import SearchDocument


class TavilySearchProvider:
    def __init__(
        self,
        api_key: str | None = None,
        *,
        client: AsyncTavilyClient | Any | None = None,
        retry_wait_seconds: float = 0.5,
    ) -> None:
        self._client = client or AsyncTavilyClient(api_key=api_key)
        self._retry_wait_seconds = retry_wait_seconds

    async def search(self, query: str, max_results: int) -> list[SearchDocument]:
        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_fixed(self._retry_wait_seconds),
            retry=retry_if_exception_type(
                (TavilyTimeoutError, UsageLimitExceededError)
            ),
            reraise=True,
        ):
            with attempt:
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
