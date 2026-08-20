from app.agent.types import ResearchMode
from app.providers.fake import FakeModelProvider, FakeSearchProvider


async def test_fake_providers_generate_a_deterministic_cited_report() -> None:
    model = FakeModelProvider()
    search = FakeSearchProvider()
    plan = await model.plan("研究 Agent", ResearchMode.QUICK, 2)
    sources = await search.search(plan.subqueries[0], 4)
    evidence = await model.extract("研究 Agent", sources)
    report = await model.write("研究 Agent", plan.focus, evidence, sources)

    assert len(plan.subqueries) == 2
    assert sources
    assert "[1]" in report
