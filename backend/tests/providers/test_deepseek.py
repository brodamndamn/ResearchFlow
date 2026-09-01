import json

import pytest
from langchain_core.messages import AIMessage

from app.agent.types import ResearchMode, SearchDocument
from app.providers.deepseek import DeepSeekModelProvider


def test_deepseek_v4_flash_switches_thinking_by_research_mode() -> None:
    provider = DeepSeekModelProvider(
        api_key="test-key",
        base_url="https://api.deepseek.com",
        model="deepseek-v4-flash",
    )

    quick = provider.chat_model_options(ResearchMode.QUICK)
    deep = provider.chat_model_options(ResearchMode.DEEP)

    assert quick["model"] == "deepseek-v4-flash"
    assert quick["extra_body"] == {"thinking": {"type": "disabled"}}
    assert deep["extra_body"] == {"thinking": {"type": "enabled"}}


class FakeJsonChat:
    def __init__(self, payload: dict | str) -> None:
        self.payload = payload
        self.bound: dict | None = None

    def bind(self, **kwargs):
        self.bound = kwargs
        return self

    async def ainvoke(self, messages):
        content = (
            self.payload
            if isinstance(self.payload, str)
            else json.dumps(self.payload, ensure_ascii=False)
        )
        return AIMessage(content=content)


class SequenceJsonChat(FakeJsonChat):
    def __init__(self, payloads: list[dict | str]) -> None:
        self.payloads = payloads
        self.bound: dict | None = None

    async def ainvoke(self, messages):
        self.payload = self.payloads.pop(0)
        return await super().ainvoke(messages)


async def test_plan_parses_deepseek_json_without_strict_tool_schema(monkeypatch) -> None:
    provider = DeepSeekModelProvider("test-key", "https://api.deepseek.com", "model")
    chat = FakeJsonChat(
        {
            "sub_questions": [
                {"id": 1, "question": "比较框架能力"},
                {"id": 2, "question": "分析选型成本"},
            ],
            "report_focus": "关注工程选型",
        }
    )
    monkeypatch.setattr(provider, "_chat", lambda mode: chat)

    plan = await provider.plan("Agent 框架选型", ResearchMode.QUICK, 2)

    assert plan.subqueries == ["比较框架能力", "分析选型成本"]
    assert chat.bound == {"response_format": {"type": "json_object"}}


async def test_extract_normalizes_deepseek_evidence_field_names(monkeypatch) -> None:
    provider = DeepSeekModelProvider("test-key", "https://api.deepseek.com", "model")
    chat = FakeJsonChat(
        {
            "claims": [
                {
                    "source_index": 1,
                    "fact": "框架支持工具调用",
                    "quote": "提供工具接口",
                }
            ]
        }
    )
    monkeypatch.setattr(provider, "_chat", lambda mode: chat)
    source = SearchDocument(
        url="https://example.com",
        title="来源",
        content="提供工具接口",
        score=1,
    )

    evidence = await provider.extract("Agent 框架", [source])

    assert evidence[0].source_id == 1
    assert evidence[0].claim == "框架支持工具调用"


async def test_extract_normalizes_string_source_id_and_common_field_names(monkeypatch) -> None:
    provider = DeepSeekModelProvider("test-key", "https://api.deepseek.com", "model")
    monkeypatch.setattr(
        provider,
        "_chat",
        lambda mode: FakeJsonChat(
            {
                "evidence": [
                    {
                        "source": "来源 [1]",
                        "statement": "框架支持工具调用",
                        "supporting_text": "提供工具接口",
                    }
                ]
            }
        ),
    )
    source = SearchDocument(
        url="https://example.com", title="来源", content="提供工具接口", score=1
    )

    evidence = await provider.extract("Agent 框架", [source])

    assert evidence[0].source_id == 1
    assert evidence[0].claim == "框架支持工具调用"
    assert evidence[0].excerpt == "提供工具接口"


async def test_extract_retries_once_after_validation_error(monkeypatch) -> None:
    provider = DeepSeekModelProvider("test-key", "https://api.deepseek.com", "model")
    chat = SequenceJsonChat(
        [
            {"evidence": [{"source_id": 1, "claim": "缺少原文"}]},
            {"evidence": [{"source_id": 1, "claim": "修正后的事实", "excerpt": "原文"}]},
        ]
    )
    monkeypatch.setattr(provider, "_chat", lambda mode: chat)
    source = SearchDocument(
        url="https://example.com", title="来源", content="原文", score=1
    )

    evidence = await provider.extract("Agent 框架", [source])

    assert evidence[0].claim == "修正后的事实"
    assert chat.payloads == []


async def test_extract_rejects_malformed_evidence_container(monkeypatch) -> None:
    provider = DeepSeekModelProvider("test-key", "https://api.deepseek.com", "model")
    monkeypatch.setattr(
        provider,
        "_chat",
        lambda mode: FakeJsonChat({"evidence": {"claim": "错误容器"}}),
    )
    source = SearchDocument(
        url="https://example.com", title="来源", content="正文", score=1
    )

    with pytest.raises(ValueError, match="evidence 必须是数组"):
        await provider.extract("Agent 框架", [source])


async def test_extract_respects_explicit_empty_canonical_field(monkeypatch) -> None:
    provider = DeepSeekModelProvider("test-key", "https://api.deepseek.com", "model")
    monkeypatch.setattr(
        provider,
        "_chat",
        lambda mode: FakeJsonChat(
            {
                "evidence": [],
                "claims": [
                    {"source_index": 1, "fact": "不应采用", "quote": "不应采用"}
                ],
            }
        ),
    )
    source = SearchDocument(
        url="https://example.com", title="来源", content="正文", score=1
    )

    assert await provider.extract("Agent 框架", [source]) == []


async def test_plan_accepts_uppercase_json_fence(monkeypatch) -> None:
    provider = DeepSeekModelProvider("test-key", "https://api.deepseek.com", "model")
    content = '``` JSON\n{"focus":"工程选型","subqueries":["比较能力"]}\n```'
    monkeypatch.setattr(provider, "_chat", lambda mode: FakeJsonChat(content))

    plan = await provider.plan("Agent 框架选型", ResearchMode.QUICK, 1)

    assert plan.focus == "工程选型"


async def test_find_gaps_truncates_extra_model_queries_before_validation(monkeypatch) -> None:
    provider = DeepSeekModelProvider("test-key", "https://api.deepseek.com", "model")
    monkeypatch.setattr(
        provider,
        "_chat",
        lambda mode: FakeJsonChat(
            {"queries": ["补充政策", "补充数据", "补充案例", "补充成本", "补充风险"]}
        ),
    )

    queries = await provider.find_gaps("低空经济", [])

    assert queries == ["补充政策"]
