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
        plan=ResearchPlan(
            focus="聚焦工程落地",
            subqueries=["检索现状", "归纳案例"],
        ),
        sources=[source],
        report=ResearchReport(title="研究报告", markdown="结论", source_ids=["source-1"]),
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        updated_at=datetime(2026, 1, 1, tzinfo=UTC),
    )

    payload = snapshot.model_dump(mode="json")

    assert payload["mode"] == "quick"
    assert payload["status"] == "completed"
    assert payload["plan"]["focus"] == "聚焦工程落地"
    assert payload["plan"]["subqueries"] == ["检索现状", "归纳案例"]
    assert payload["report"]["source_ids"] == ["source-1"]


def test_source_schema_rejects_non_http_urls() -> None:
    with pytest.raises(ValidationError):
        SourceRead(id="source-1", url="javascript:alert(1)", title="危险来源")


def test_research_status_contains_the_public_workflow_states() -> None:
    assert [status.value for status in ResearchStatus] == [
        "queued",
        "planning",
        "waiting_for_review",
        "researching",
        "writing",
        "verifying",
        "completed",
        "failed",
        "cancelled",
        "expired",
    ]


def test_research_plan_accepts_deepseek_semantic_field_names() -> None:
    plan = ResearchPlan.model_validate(
        {
            "sub_questions": [
                {"id": 1, "question": "比较框架能力", "focus": "核心能力"},
                {"id": 2, "question": "分析选型因素", "focus": "选型因素"},
            ],
            "report_focus": ["对比核心能力", "总结适用场景"],
        }
    )

    assert plan.subqueries == ["比较框架能力", "分析选型因素"]
    assert plan.focus == "对比核心能力；总结适用场景"
