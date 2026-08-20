from pathlib import Path

from app.config import Settings


def test_settings_expose_safe_mvp_defaults() -> None:
    settings = Settings(_env_file=None)

    assert settings.model_name == "deepseek-v4-flash"
    assert settings.database_path == Path("data/researchflow.sqlite3")
    assert settings.checkpoint_database_path == Path("data/checkpoints.sqlite3")
    assert settings.quick_daily_limit == 3
    assert settings.deep_daily_limit == 1
    assert settings.queue_active_limit == 1
    assert settings.queue_waiting_limit == 3
    assert settings.quick_timeout_seconds > 0
    assert settings.deep_timeout_seconds > settings.quick_timeout_seconds


def test_settings_build_async_sqlite_urls_from_paths(tmp_path: Path) -> None:
    settings = Settings(
        _env_file=None,
        database_path=tmp_path / "main.sqlite3",
        checkpoint_database_path=tmp_path / "checkpoints.sqlite3",
    )

    assert settings.database_url.startswith("sqlite+aiosqlite:///")
    assert settings.database_url.endswith("main.sqlite3")
    assert settings.checkpoint_database_url.endswith("checkpoints.sqlite3")
