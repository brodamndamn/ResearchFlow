from tavily.errors import TimeoutError as TavilyTimeoutError

from app.agent.types import SearchDocument
from app.providers.tavily import TavilySearchProvider


class FakeTavilyClient:
    def __init__(self) -> None:
        self.kwargs: dict[str, object] = {}

    async def search(self, **kwargs):
        self.kwargs = kwargs
        return {
            "results": [
                {
                    "url": "https://example.com/report",
                    "title": "示例报告",
                    "content": "搜索摘要",
                    "raw_content": "清洗后的完整正文",
                    "score": 0.91,
                    "published_date": "2026-08-01",
                }
            ]
        }


async def test_search_requests_clean_text_and_maps_complete_result() -> None:
    client = FakeTavilyClient()
    provider = TavilySearchProvider(client=client)

    results = await provider.search("Agent 工程实践", max_results=6)

    assert results == [
        SearchDocument(
            url="https://example.com/report",
            title="示例报告",
            content="清洗后的完整正文",
            score=0.91,
            published_at="2026-08-01",
        )
    ]
    assert client.kwargs == {
        "query": "Agent 工程实践",
        "search_depth": "basic",
        "max_results": 6,
        "include_raw_content": "text",
        "include_answer": False,
    }


class FlakyTavilyClient:
    def __init__(self) -> None:
        self.calls = 0

    async def search(self, **kwargs):
        self.calls += 1
        if self.calls < 3:
            raise TavilyTimeoutError(1)
        return {
            "results": [
                {
                    "url": "https://example.com/recovered",
                    "title": "重试成功",
                    "raw_content": "正文",
                    "score": 0.8,
                }
            ]
        }


async def test_search_retries_timeout_at_most_twice() -> None:
    client = FlakyTavilyClient()
    provider = TavilySearchProvider(client=client, retry_wait_seconds=0)

    result = await provider.search("测试重试", 2)

    assert client.calls == 3
    assert result[0].title == "重试成功"
