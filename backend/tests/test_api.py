from collections.abc import AsyncIterator
from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from app.schemas import (
    ResearchMode,
    ResearchPlan,
    ResearchSnapshot,
    ResearchStatus,
)


class FakeResearchService:
    def __init__(self) -> None:
        now = datetime(2026, 8, 20, tzinfo=UTC)
        self.snapshot = ResearchSnapshot(
            run_id="run-1",
            mode=ResearchMode.QUICK,
            status=ResearchStatus.WAITING_FOR_REVIEW,
            query="国产大模型的工程应用现状",
            plan=ResearchPlan(focus="关注工程落地", subqueries=["检索应用案例"]),
            created_at=now,
            updated_at=now,
        )

    async def create(self, topic, mode, *, peer_ip, forwarded_for):
        assert topic == "国产大模型的工程应用现状"
        assert mode is ResearchMode.QUICK
        assert peer_ip == "127.0.0.1"
        return self.snapshot

    async def get(self, run_id: str):
        return self.snapshot if run_id == "run-1" else None

    async def update_plan(self, run_id: str, plan: ResearchPlan):
        self.snapshot.plan = plan
        self.snapshot.status = ResearchStatus.RESEARCHING
        return self.snapshot

    async def cancel(self, run_id: str):
        self.snapshot.status = ResearchStatus.CANCELLED
        return self.snapshot

    async def event_stream(self, run_id: str) -> AsyncIterator[dict]:
        yield {"event": "snapshot", "data": self.snapshot.model_dump(mode="json")}

    async def showcases(self):
        return []


@pytest.fixture
def app():
    return create_app(service=FakeResearchService())


async def test_create_and_fetch_research(app) -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app, client=("127.0.0.1", 1234)),
        base_url="http://test",
    ) as client:
        created = await client.post(
            "/api/research",
            json={"topic": "国产大模型的工程应用现状", "mode": "quick"},
        )
        fetched = await client.get("/api/research/run-1")

    assert created.status_code == 202
    assert created.json()["run_id"] == "run-1"
    assert fetched.status_code == 200
    assert fetched.json()["status"] == "waiting_for_review"


async def test_topic_length_and_plan_review_contract(app) -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app, client=("127.0.0.1", 1234)),
        base_url="http://test",
    ) as client:
        invalid = await client.post(
            "/api/research", json={"topic": "太短", "mode": "quick"}
        )
        reviewed = await client.put(
            "/api/research/run-1/plan",
            json={"focus": "关注生产实践", "subqueries": ["有哪些生产案例"]},
        )

    assert invalid.status_code == 422
    assert reviewed.status_code == 200
    assert reviewed.json()["status"] == "researching"
    assert reviewed.json()["plan"]["focus"] == "关注生产实践"


async def test_cancel_missing_and_health_endpoints(app) -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app, client=("127.0.0.1", 1234)),
        base_url="http://test",
    ) as client:
        cancelled = await client.post("/api/research/run-1/cancel")
        missing = await client.get("/api/research/missing")
        live = await client.get("/api/health/live")
        ready = await client.get("/api/health/ready")

    assert cancelled.json()["status"] == "cancelled"
    assert missing.status_code == 404
    assert live.status_code == 200
    assert ready.status_code == 200


async def test_sse_uses_named_events_and_json_payload(app) -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app, client=("127.0.0.1", 1234)),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/research/run-1/events")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "event: snapshot" in response.text
    assert '"run_id":"run-1"' in response.text
