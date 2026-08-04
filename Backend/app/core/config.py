"""Application configuration, loaded once from the environment.

Twelve-factor: nothing platform-specific, so the same image runs on Render,
Railway, Fly or a VPS without change.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["development", "staging", "production"]


class Settings(BaseSettings):
    """Validated application settings.

    Fails loudly at startup if anything required is missing — a misconfigured
    deployment should never boot and silently serve broken auth.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- environment ------------------------------------------------------
    environment: Environment = "development"
    log_level: str = "INFO"

    # ---- supabase ---------------------------------------------------------
    supabase_url: str = Field(description="https://<ref>.supabase.co")
    supabase_service_role_key: str = Field(
        description="Server-side only. Bypasses RLS — never expose to a browser.",
    )

    # ---- database ---------------------------------------------------------
    database_url: PostgresDsn
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_pool_recycle_seconds: int = 1800

    # ---- http -------------------------------------------------------------
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        """Accept a comma-separated string, which is how PaaS env vars arrive."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("supabase_url")
    @classmethod
    def _strip_trailing_slash(cls, value: str) -> str:
        return value.rstrip("/")

    @property
    def jwks_url(self) -> str:
        """Supabase publishes signing keys here; we cache and verify against it."""
        return f"{self.supabase_url}/auth/v1/.well-known/jwks.json"

    @property
    def jwt_issuer(self) -> str:
        return f"{self.supabase_url}/auth/v1"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached accessor so settings are parsed once per process."""
    return Settings()  # type: ignore[call-arg]
