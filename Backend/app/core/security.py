"""Supabase JWT verification.

The browser authenticates against Supabase and sends the resulting access
token to this API. Everything downstream — which studio a request may touch —
is derived from what this module returns, so it is the security boundary of
the whole system.

Verification rules, all mandatory:

* Signature checked against Supabase's published JWKS (asymmetric keys).
* Algorithm taken from the JWKS key, never from the token header — accepting
  the header's `alg` is the classic JWT confusion attack (`alg: none`, or an
  RS256 public key replayed as an HS256 secret).
* `iss` and `aud` pinned to the configured project.
* `exp` enforced with no leeway beyond a small clock-skew allowance.

The JWKS is cached with a TTL, and a cache miss on an unknown `kid` triggers
exactly one refresh so that key rotation heals automatically without allowing
an attacker to force unbounded fetches.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import httpx
import jwt
from jwt import PyJWKClient
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError

from app.core.config import Settings, get_settings
from app.core.errors import NotAuthenticatedError

# Supabase issues RS256 by default for asymmetric projects; ES256 is offered
# for newer projects. HS256 is deliberately absent: a symmetric algorithm here
# would mean the verification key equals the signing key.
ALLOWED_ALGORITHMS = frozenset({"RS256", "RS512", "ES256"})

JWKS_CACHE_TTL_SECONDS = 600
JWKS_MIN_REFRESH_INTERVAL_SECONDS = 30
CLOCK_SKEW_LEEWAY_SECONDS = 10
AUDIENCE = "authenticated"

# One message for every non-expiry failure. Distinct copy per failure mode
# tells an attacker which part of a forgery to fix next.
VERIFICATION_FAILED_MESSAGE = "We couldn't verify your session. Please sign in again."
SESSION_EXPIRED_MESSAGE = "Your session has expired. Please sign in again."


@dataclass(frozen=True, slots=True)
class Principal:
    """A verified caller.

    `auth_user_id` is the Supabase `auth.users` id from the `sub` claim. It is
    resolved to a `studio_id` by a database lookup — never read from the token,
    because a client-supplied tenant id is a client-controlled tenant id.
    """

    auth_user_id: UUID
    email: str | None
    issued_at: int
    expires_at: int


class JWKSCache:
    """Thread-safe JWKS holder with TTL and rate-limited refresh."""

    def __init__(self, jwks_url: str, *, ttl_seconds: int = JWKS_CACHE_TTL_SECONDS) -> None:
        self._jwks_url = jwks_url
        self._ttl = ttl_seconds
        self._lock = threading.Lock()
        self._client: PyJWKClient | None = None
        self._fetched_at: float = 0.0
        self._last_refresh_attempt: float = 0.0

    def _build_client(self) -> PyJWKClient:
        # PyJWKClient does its own signing-key lookup; we wrap it to control
        # cache lifetime and refresh cadence explicitly.
        return PyJWKClient(self._jwks_url, cache_keys=True, lifespan=self._ttl)

    def get(self, *, force_refresh: bool = False) -> PyJWKClient:
        now = time.monotonic()

        with self._lock:
            expired = now - self._fetched_at > self._ttl

            if force_refresh:
                # Rate-limit forced refreshes so unknown-kid tokens cannot be
                # used to hammer the JWKS endpoint.
                if now - self._last_refresh_attempt < JWKS_MIN_REFRESH_INTERVAL_SECONDS:
                    force_refresh = False
                else:
                    self._last_refresh_attempt = now

            if self._client is None or expired or force_refresh:
                self._client = self._build_client()
                self._fetched_at = now

            return self._client


_jwks_cache: JWKSCache | None = None
_jwks_cache_lock = threading.Lock()


def get_jwks_cache(settings: Settings | None = None) -> JWKSCache:
    """Process-wide JWKS cache, built lazily on first use."""
    global _jwks_cache

    resolved = settings or get_settings()

    with _jwks_cache_lock:
        if _jwks_cache is None:
            _jwks_cache = JWKSCache(resolved.jwks_url)
        return _jwks_cache


def reset_jwks_cache() -> None:
    """Drop the cached client. Used by tests and after a config reload."""
    global _jwks_cache

    with _jwks_cache_lock:
        _jwks_cache = None


def _decode(
    token: str,
    signing_key: Any,
    algorithm: str,
    settings: Settings,
) -> dict[str, Any]:
    claims: dict[str, Any] = jwt.decode(
        token,
        signing_key,
        # Pinned to the key's own algorithm, not the token header's claim.
        algorithms=[algorithm],
        audience=AUDIENCE,
        issuer=settings.jwt_issuer,
        leeway=CLOCK_SKEW_LEEWAY_SECONDS,
        options={
            "require": ["exp", "iat", "sub", "aud", "iss"],
            "verify_signature": True,
            "verify_exp": True,
            "verify_aud": True,
            "verify_iss": True,
        },
    )
    return claims


def verify_access_token(
    token: str,
    *,
    settings: Settings | None = None,
    jwks_cache: JWKSCache | None = None,
) -> Principal:
    """Verify a Supabase access token and return the caller it identifies.

    Raises:
        NotAuthenticatedError: for any invalid, expired or untrusted token.
            The message is deliberately generic — telling a caller *why*
            verification failed helps forge a better token next time.
    """
    resolved_settings = settings or get_settings()
    cache = jwks_cache or get_jwks_cache(resolved_settings)

    if not token or token.count(".") != 2:
        raise NotAuthenticatedError(VERIFICATION_FAILED_MESSAGE)

    try:
        jwk = cache.get().get_signing_key_from_jwt(token)
    except Exception:
        # Unknown `kid` most likely means keys rotated since we last fetched.
        # Refresh once (rate-limited) and retry before rejecting.
        try:
            jwk = cache.get(force_refresh=True).get_signing_key_from_jwt(token)
        except (InvalidTokenError, httpx.HTTPError, Exception) as exc:
            raise NotAuthenticatedError(VERIFICATION_FAILED_MESSAGE) from exc

    algorithm = _algorithm_for(jwk)

    try:
        claims = _decode(token, jwk.key, algorithm, resolved_settings)
    except ExpiredSignatureError as exc:
        # Expiry gets its own copy: it is the overwhelmingly common real case,
        # and it tells an attacker nothing they don't already know about a
        # token they hold. Every *other* failure shares one message so that
        # bad-signature, wrong-issuer and wrong-audience are indistinguishable.
        raise NotAuthenticatedError(SESSION_EXPIRED_MESSAGE) from exc
    except InvalidTokenError as exc:
        raise NotAuthenticatedError(VERIFICATION_FAILED_MESSAGE) from exc

    return _principal_from_claims(claims)


def _algorithm_for(jwk: Any) -> str:
    """Resolve the signing algorithm from the JWK, rejecting anything unlisted."""
    key_data = getattr(jwk, "_jwk_data", None) or {}
    algorithm = key_data.get("alg")

    if algorithm is None:
        # Infer from key type when the JWKS omits `alg`.
        key_type = key_data.get("kty")
        algorithm = {"RSA": "RS256", "EC": "ES256"}.get(key_type or "")

    if algorithm not in ALLOWED_ALGORITHMS:
        raise NotAuthenticatedError(VERIFICATION_FAILED_MESSAGE)

    return str(algorithm)


def _principal_from_claims(claims: dict[str, Any]) -> Principal:
    subject = claims.get("sub")

    try:
        auth_user_id = UUID(str(subject))
    except (ValueError, TypeError) as exc:
        raise NotAuthenticatedError(VERIFICATION_FAILED_MESSAGE) from exc

    email = claims.get("email")

    return Principal(
        auth_user_id=auth_user_id,
        email=str(email) if email else None,
        issued_at=int(claims["iat"]),
        expires_at=int(claims["exp"]),
    )


def extract_bearer_token(authorization_header: str | None) -> str:
    """Pull the token out of an `Authorization: Bearer <token>` header."""
    if not authorization_header:
        raise NotAuthenticatedError()

    scheme, _, token = authorization_header.partition(" ")

    if scheme.lower() != "bearer" or not token.strip():
        raise NotAuthenticatedError("That authorization header isn't valid.")

    return token.strip()
