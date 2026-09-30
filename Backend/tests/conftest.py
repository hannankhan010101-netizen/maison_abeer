"""Shared fixtures.

Builds a self-signed RSA keypair and a fake JWKS so token verification can be
tested exhaustively — including forgery attempts — without a Supabase project.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.utils import base64url_encode

SUPABASE_URL = "https://test-project.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"
AUDIENCE = "authenticated"
KEY_ID = "test-key-1"


def _b64_uint(value: int) -> str:
    length = (value.bit_length() + 7) // 8
    return base64url_encode(value.to_bytes(length, "big")).decode()


@dataclass
class KeyPair:
    """An RSA keypair plus the JWKS document that publishes it."""

    private_key: Any
    kid: str

    def jwks(self) -> dict[str, list[dict[str, str]]]:
        numbers = self.private_key.public_key().public_numbers()
        return {
            "keys": [
                {
                    "kty": "RSA",
                    "use": "sig",
                    "alg": "RS256",
                    "kid": self.kid,
                    "n": _b64_uint(numbers.n),
                    "e": _b64_uint(numbers.e),
                }
            ]
        }

    def sign(
        self,
        *,
        subject: UUID | str | None = None,
        email: str | None = "host@example.com",
        issuer: str = ISSUER,
        audience: str = AUDIENCE,
        expires_in: timedelta = timedelta(hours=1),
        issued_at: datetime | None = None,
        algorithm: str = "RS256",
        key: Any = None,
        extra_claims: dict[str, Any] | None = None,
        omit: set[str] | None = None,
    ) -> str:
        """Mint a token. Every parameter exists so a test can corrupt it."""
        now = issued_at or datetime.now(UTC)

        claims: dict[str, Any] = {
            "sub": str(subject if subject is not None else uuid4()),
            "aud": audience,
            "iss": issuer,
            "iat": int(now.timestamp()),
            "exp": int((now + expires_in).timestamp()),
        }

        if email is not None:
            claims["email"] = email
        if extra_claims:
            claims.update(extra_claims)
        for claim in omit or set():
            claims.pop(claim, None)

        return jwt.encode(
            claims,
            key if key is not None else self.private_key,
            algorithm=algorithm,
            headers={"kid": self.kid},
        )


@pytest.fixture(scope="session")
def keypair() -> KeyPair:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return KeyPair(private_key=private_key, kid=KEY_ID)


@pytest.fixture(scope="session")
def attacker_keypair() -> KeyPair:
    """A second keypair, used to sign tokens we must reject."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return KeyPair(private_key=private_key, kid=KEY_ID)


@pytest.fixture
def settings() -> Any:
    from app.core.config import Settings

    return Settings(
        supabase_url=SUPABASE_URL,
        supabase_service_role_key="test-service-role-key",
        database_url="postgresql+psycopg://user:pass@localhost:5432/test",
        environment="development",
    )


@pytest.fixture
def jwks_cache(keypair: KeyPair, monkeypatch: pytest.MonkeyPatch) -> Any:
    """A JWKSCache wired to an in-memory JWKS instead of the network.

    Patched at `PyJWKClient.fetch_data`, which is the library's own seam for
    "go and get the document". Patching urllib underneath it worked until
    PyJWT swapped `urlopen` for `build_opener().open()`, at which point every
    token test quietly started making a real DNS lookup for a hostname that
    does not exist.
    """
    from jwt import PyJWKClient

    from app.core import security

    document = keypair.jwks()

    def _fake_fetch_data(_self: PyJWKClient) -> dict[str, list[dict[str, str]]]:
        return document

    monkeypatch.setattr(PyJWKClient, "fetch_data", _fake_fetch_data)

    security.reset_jwks_cache()
    cache = security.JWKSCache(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json")
    yield cache
    security.reset_jwks_cache()
