from functools import cached_property
from pathlib import Path
from typing import Literal, Self

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    """ResearchFlow 单进程 MVP 的运行配置。"""

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
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
    def _is_configured(secret: SecretStr | None) -> bool:
        if secret is None:
            return False
        value = secret.get_secret_value().strip()
        return bool(value) and "请替换" not in value

    @model_validator(mode="after")
    def validate_production_secrets(self) -> Self:
        if self.environment != "production":
            return self
        if self.provider_mode != "real":
            raise ValueError("生产环境必须使用真实 Provider")
        if not self._is_configured(self.model_api_key) or not self._is_configured(
            self.tavily_api_key
        ):
            raise ValueError("生产环境必须配置真实的模型与 Tavily API Key")
        hmac_secret = self.ip_hash_secret.get_secret_value()
        if len(hmac_secret) < 32 or hmac_secret == "development-only-change-me":
            raise ValueError("生产环境 IP HMAC 密钥必须是至少 32 位的随机字符串")
        return self

    @staticmethod
    def _sqlite_url(path: Path) -> str:
        return f"sqlite+aiosqlite:///{path.resolve().as_posix()}"

    @cached_property
    def database_url(self) -> str:
        return self._sqlite_url(self.database_path)

    @cached_property
    def checkpoint_database_url(self) -> str:
        return self._sqlite_url(self.checkpoint_database_path)
