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

