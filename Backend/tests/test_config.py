"""Settings parsing.

These exist because a config bug does not fail in tests — it fails at
container start, in production, at the least convenient moment. The
comma-separated CORS list in particular was written one way in `.env.example`
and parsed another, so following our own documentation crashed the app.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import Settings

REQUIRED = {
    "supabase_url": "https://example.supabase.co",
    "supabase_service_role_key": "service-role",
    "database_url": "postgresql+psycopg://u:p@localhost:5432/db",
}


def build(**overrides: object) -> Settings:
    # _env_file=None so a developer's real .env cannot influence the result.
    return Settings(_env_file=None, **{**REQUIRED, **overrides})  # type: ignore[arg-type]


class TestCorsOrigins:
    def test_defaults_to_local_dev(self) -> None:
        assert build().cors_origins == ["http://localhost:3000"]

    def test_accepts_a_bare_url_as_documented(self) -> None:
        # Exactly what .env.example tells the reader to write. This is not
        # valid JSON, and pydantic-settings decodes complex types as JSON
        # unless told otherwise.
        assert build(cors_origins="http://localhost:3000").cors_origins == ["http://localhost:3000"]

    def test_splits_a_comma_separated_list(self) -> None:
        settings = build(cors_origins="https://a.example, https://b.example")

        assert settings.cors_origins == ["https://a.example", "https://b.example"]

    def test_ignores_empty_entries_and_padding(self) -> None:
        assert build(cors_origins=" https://a.example , , ").cors_origins == ["https://a.example"]

    def test_accepts_a_real_list(self) -> None:
        assert build(cors_origins=["https://a.example"]).cors_origins == ["https://a.example"]


class TestDerivedValues:
    def test_builds_the_jwks_url(self) -> None:
        settings = build(supabase_url="https://proj.supabase.co")

        assert settings.jwks_url == "https://proj.supabase.co/auth/v1/.well-known/jwks.json"

    def test_builds_the_issuer(self) -> None:
        assert build(supabase_url="https://proj.supabase.co").jwt_issuer == (
            "https://proj.supabase.co/auth/v1"
        )

    def test_strips_a_trailing_slash(self) -> None:
        # Otherwise the JWKS URL gets a double slash and the issuer never
        # matches the token's `iss` claim.
        settings = build(supabase_url="https://proj.supabase.co/")

        assert settings.jwks_url == "https://proj.supabase.co/auth/v1/.well-known/jwks.json"

    def test_knows_when_it_is_production(self) -> None:
        assert build(environment="production").is_production is True
        assert build(environment="development").is_production is False


class TestRequiredValues:
    @pytest.mark.parametrize("field", sorted(REQUIRED))
    def test_refuses_to_start_without(self, field: str) -> None:
        incomplete = {k: v for k, v in REQUIRED.items() if k != field}

        # A misconfigured deployment must not boot and silently serve broken
        # auth against no database.
        with pytest.raises(Exception, match=field):
            Settings(_env_file=None, **incomplete)  # type: ignore[arg-type]


class TestExampleFileMatchesReality:
    def test_env_example_parses(self) -> None:
        """Every key documented in .env.example must actually load.

        This is the test that would have caught the CORS bug: the example
        file was the thing that did not work.
        """
        example = Path("app").parent / ".env.example"
        values: dict[str, str] = {}

        for line in example.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue

            key, _, value = stripped.partition("=")
            values[key.strip().lower()] = value.strip()

        settings = Settings(_env_file=None, **values)  # type: ignore[arg-type]

        assert settings.cors_origins
        assert settings.jwks_url.endswith("/.well-known/jwks.json")
