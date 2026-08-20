import importlib.util
import shutil
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings


def test_settings_load_backend_env_when_process_cwd_is_elsewhere(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    backend_copy = tmp_path / "backend"
    app_copy = backend_copy / "app"
    app_copy.mkdir(parents=True)
    (app_copy / "__init__.py").touch()
    shutil.copy2(Path(__file__).parents[1] / "app" / "config.py", app_copy / "config.py")
    (backend_copy / ".env").write_text(
        "RESEARCHFLOW_MODEL_NAME=loaded-from-backend-env\n",
        encoding="utf-8",
    )
    unrelated_cwd = tmp_path / "elsewhere"
    unrelated_cwd.mkdir()
    monkeypatch.chdir(unrelated_cwd)
    monkeypatch.delenv("RESEARCHFLOW_MODEL_NAME", raising=False)

    module_name = "isolated_researchflow_config"
    spec = importlib.util.spec_from_file_location(module_name, app_copy / "config.py")
    assert spec is not None and spec.loader is not None
    config_module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, module_name, config_module)
    spec.loader.exec_module(config_module)

    assert config_module.Settings().model_name == "loaded-from-backend-env"


def test_settings_expose_safe_mvp_defaults() -> None:
    settings = Settings(_env_file=None)

    assert settings.model_name == "deepseek-v4-flash"
    assert settings.database_path == Path("data/researchflow.sqlite3")
    assert settings.checkpoint_database_path == Path("data/checkpoints.sqlite3")
    assert settings.quick_daily_limit == 3
    assert settings.deep_daily_limit == 1
    assert settings.queue_active_limit == 1
    assert settings.queue_waiting_limit == 3
    assert settings.quick_timeout_seconds == 90
    assert settings.deep_timeout_seconds == 180
    assert settings.model_base_url == "https://api.deepseek.com"
    assert settings.retention_days == 7


def test_settings_build_async_sqlite_urls_from_paths(tmp_path: Path) -> None:
    settings = Settings(
        _env_file=None,
        database_path=tmp_path / "main.sqlite3",
        checkpoint_database_path=tmp_path / "checkpoints.sqlite3",
    )

    assert settings.database_url.startswith("sqlite+aiosqlite:///")
    assert settings.database_url.endswith("main.sqlite3")
    assert settings.checkpoint_database_url.endswith("checkpoints.sqlite3")


def test_production_rejects_placeholder_keys_and_development_secret() -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            environment="production",
            model_api_key="请替换为你的模型密钥",
            tavily_api_key="请替换为你的Tavily密钥",
        )
