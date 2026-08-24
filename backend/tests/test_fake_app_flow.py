import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


def wait_for_status(client: TestClient, run_id: str, expected: str) -> dict:
    for _ in range(150):
        response = client.get(f"/api/research/{run_id}")
        assert response.status_code == 200
        payload = response.json()
        if payload["status"] == expected:
            return payload
        if payload["status"] == "failed":
            raise AssertionError(payload["error"])
        time.sleep(0.02)
    raise AssertionError(f"任务未进入状态：{expected}")


@pytest.mark.parametrize("mode,query_count", [("quick", 2), ("deep", 4)])
def test_fake_app_runs_the_complete_reviewable_research_flow(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    query_count: int,
) -> None:
    monkeypatch.setenv("RESEARCHFLOW_ENVIRONMENT", "test")
    monkeypatch.setenv("RESEARCHFLOW_PROVIDER_MODE", "fake")
    monkeypatch.setenv("RESEARCHFLOW_DATABASE_PATH", str(tmp_path / f"{mode}-app.sqlite3"))
    monkeypatch.setenv(
        "RESEARCHFLOW_CHECKPOINT_DATABASE_PATH",
        str(tmp_path / f"{mode}-checkpoints.sqlite3"),
    )

    with TestClient(create_app(), client=("127.0.0.1", 50000)) as client:
        assert client.get("/api/health/ready").status_code == 200
        showcases = client.get("/api/showcases").json()
        assert len(showcases) == 3

        created = client.post(
            "/api/research",
            json={"topic": "国产大模型在企业中的工程应用现状", "mode": mode},
        )
        assert created.status_code == 202
        run_id = created.json()["run_id"]

        waiting = wait_for_status(client, run_id, "waiting_for_review")
        assert len(waiting["plan"]["subqueries"]) == query_count

        resumed = client.put(
            f"/api/research/{run_id}/plan",
            json={
                "focus": "重点关注真实生产案例",
                "subqueries": waiting["plan"]["subqueries"],
            },
        )
        assert resumed.status_code == 200

        completed = wait_for_status(client, run_id, "completed")
        assert completed["report"]["markdown"].startswith("# ")
        assert "[1]" in completed["report"]["markdown"]
        assert completed["sources"]
        assert completed["metrics"]["search_calls"] >= query_count
