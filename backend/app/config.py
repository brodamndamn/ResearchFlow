from functools import cached_property
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """ResearchFlow 单进程 MVP 的运行配置。"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="RESEARCHFLOW_",
        extra="ignore",
    )

    environment: Literal["development", "production", "test"] = "development"
    provider_mode: Literal["real", "fake"] = "real"
    model_name: str = "deepseek-v4-flash"
    model_api_key: SecretStr | None = None
    model_base_url: str = "https://api.deepseek.com"
    tavily_api_key: SecretStr | None = None
    ip_hash_secret: SecretStr = SecretStr("development-only-change-me")
    database_path: Path = Path("data/researchflow.sqlite3")
    checkpoint_database_path: Path = Path("data/checkpoints.sqlite3")

    quick_daily_limit: int = Field(default=3, ge=1)
    deep_daily_limit: int = Field(default=1, ge=1)
    quick_timeout_seconds: int = Field(default=90, ge=1)
    deep_timeout_seconds: int = Field(default=180, ge=1)
    queue_active_limit: int = Field(default=1, ge=1)
    queue_waiting_limit: int = Field(default=3, ge=0)
    retention_days: int = Field(default=7, ge=1)

    @staticmethod
    def _sqlite_url(path: Path) -> str:
        return f"sqlite+aiosqlite:///{path.resolve().as_posix()}"

    @cached_property
    def database_url(self) -> str:
        return self._sqlite_url(self.database_path)

    @cached_property
    def checkpoint_database_url(self) -> str:
        return self._sqlite_url(self.checkpoint_database_path)
