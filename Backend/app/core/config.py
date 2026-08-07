"""Application configuration, loaded once from the environment.

Twelve-factor: nothing platform-specific, so the same image runs on Render,
Railway, Fly or a VPS without change.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, PostgresDsn, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

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
    migration_database_url: str = ""
    """Owner connection for Alembic only.

    The application connects as a non-owner role so RLS applies to it, but
    that role cannot ALTER TABLE. Empty falls back to `database_url`, which is
    correct for a local database where one role does both.
    """

    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_pool_recycle_seconds: int = 1800

    public_web_url: str = ""
    """Where guests land — the site hosting /book and /feedback.

    Empty means the feedback link is omitted from the thank-you message
    rather than sent as a broken URL.
    """

    # ---- messaging --------------------------------------------------------
    message_provider: str = "log"
    """'log' contacts nobody. 'twilio' sends for real — see app/services/transports.py."""

    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_sms: str = ""
    twilio_from_whatsapp: str = ""

    cron_secret: str = ""
    """Shared secret for the scheduled-task endpoint. Empty disables it."""

    db_serverless: bool = False
    """Set on Vercel. Switches to NullPool and disables prepared statements.

    Defaults to False so a mistake degrades to the safe direction: a pool on
    a long-lived host is correct, a pool on a serverless one exhausts the
    database's connection limit.
    """

    # ---- http -------------------------------------------------------------
    # NoDecode stops pydantic-settings JSON-decoding this before our validator
    # runs. Without it, the documented `CORS_ORIGINS=http://localhost:3000`
    # raises at startup because a bare URL is not valid JSON.
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )

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
    return Settings()
