from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.schemas import (
    ResearchMode,
    ResearchPlan,
    ResearchReport,
    ResearchSnapshot,
    ResearchStatus,
    SourceRead,
)


def test_domain_schemas_form_a_serializable_research_snapshot() -> None:
    source = SourceRead(
        id="source-1",
        url="https://example.com/paper",
        title="示例论文",
        snippet="摘要",
    )
    snapshot = ResearchSnapshot(
        run_id="run-1",
        mode=ResearchMode.QUICK,
        status=ResearchStatus.COMPLETED,
        query="测试问题",
        plan=ResearchPlan(steps=["检索", "归纳"]),
        sources=[source],
        report=ResearchReport(title="研究报告", markdown="结论", source_ids=["source-1"]),
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        updated_at=datetime(2026, 1, 1, tzinfo=UTC),
    )

    payload = snapshot.model_dump(mode="json")

    assert payload["mode"] == "quick"
    assert payload["status"] == "completed"
    assert payload["plan"]["steps"] == ["检索", "归纳"]
    assert payload["report"]["source_ids"] == ["source-1"]


def test_source_schema_rejects_non_http_urls() -> None:
    with pytest.raises(ValidationError):
        SourceRead(id="source-1", url="javascript:alert(1)", title="危险来源")
