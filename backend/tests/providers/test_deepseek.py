from app.agent.types import ResearchMode
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

