"""Token verification.

This is the security boundary of the system: everything about which studio a
request may touch is derived from what `verify_access_token` returns. The
adversarial cases below are the point of the file — a token that should be
rejected but isn't is a cross-tenant compromise.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import jwt
import pytest

from app.core.errors import NotAuthenticatedError
from app.core.security import (
    ALLOWED_ALGORITHMS,
    SESSION_EXPIRED_MESSAGE,
    VERIFICATION_FAILED_MESSAGE,
    extract_bearer_token,
    verify_access_token,
)
from tests.conftest import AUDIENCE, ISSUER, KeyPair


class TestValidTokens:
    def test_accepts_a_well_formed_token(
        self, keypair: KeyPair, settings: Any, jwks_cache: Any
    ) -> None:
        user_id = uuid4()
        token = keypair.sign(subject=user_id, email="zara@studio.example")

        principal = verify_access_token(token, settings=settings, jwks_cache=jwks_cache)

        assert principal.auth_user_id == user_id
        assert principal.email == "zara@studio.example"

    def test_token_without_email_is_still_valid(
        self, keypair: KeyPair, settings: Any, jwks_cache: Any
    ) -> None:
        principal = verify_access_token(
            keypair.sign(email=None), settings=settings, jwks_cache=jwks_cache
        )

        assert principal.email is None

    def test_tolerates_small_clock_skew(
        self, keypair: KeyPair, settings: Any, jwks_cache: Any
    ) -> None:
        # Issued a few seconds in the future by a slightly fast auth server.
        token = keypair.sign(issued_at=datetime.now(UTC) + timedelta(seconds=5))

        assert verify_access_token(token, settings=settings, jwks_cache=jwks_cache)


class TestForgeryResistance:
    """Tokens that must never verify."""

    def test_rejects_a_token_signed_by_another_key(
        self, attacker_keypair: KeyPair, settings: Any, jwks_cache: Any
    ) -> None:
        # Same `kid`, different private key — the core forgery attempt.
        forged = attacker_keypair.sign(subject=uuid4())

        with pytest.raises(NotAuthenticatedError):
            verify_access_token(forged, settings=settings, jwks_cache=jwks_cache)

    def test_rejects_alg_none(self, settings: Any, jwks_cache: Any) -> None:
        # The classic JWT bypass: strip the signature and claim no algorithm.
        unsigned = jwt.encode(
            {
                "sub": str(uuid4()),
                "aud": AUDIENCE,
                "iss": ISSUER,
                "iat": int(datetime.now(UTC).timestamp()),
                "exp": int((datetime.now(UTC) + timedelta(hours=1)).timestamp()),
            },
            key="",
            algorithm="none",
        )

        with pytest.raises(NotAuthenticatedError):
            verify_access_token(unsigned, settings=settings, jwks_cache=jwks_cache)

    def test_rejects_hs256_signed_with_the_public_key(
        self, keypair: KeyPair, settings: Any, jwks_cache: Any
    ) -> None:
        """Algorithm-confusion: replay the RSA *public* key as an HMAC secret.

        This succeeds against any verifier that trusts the token header's
        `alg`. The token is assembled by hand because PyJWT's `encode` refuses
        to build it — so going through the library would test PyJWT's guard
        rather than ours.
        """
        import hashlib
        import hmac

        from cryptography.hazmat.primitives import serialization
        from jwt.utils import base64url_encode

        public_pem = keypair.private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )

        header = base64url_encode(
            json.dumps({"alg": "HS256", "typ": "JWT", "kid": keypair.kid}).encode()
        )
        now = datetime.now(UTC)
        payload = base64url_encode(
            json.dumps(
                {
                    "sub": str(uuid4()),
                    "aud": AUDIENCE,
                    "iss": ISSUER,
                    "iat": int(now.timestamp()),
                    "exp": int((now + timedelta(hours=1)).timestamp()),
                }
            ).encode()
        )
        signing_input = header + b"." + payload
        signature = base64url_encode(hmac.new(public_pem, signing_input, hashlib.sha256).digest())
        confused = (signing_input + b"." + signature).decode()

        with pytest.raises(NotAuthenticatedError):
            verify_access_token(confused, settings=settings, jwks_cache=jwks_cache)

    def test_hs256_is_not_an_allowed_algorithm(self) -> None:
        # Guards the constant itself: adding a symmetric algorithm here would
        # mean the verification key equals the signing key.
        assert "HS256" not in ALLOWED_ALGORITHMS
        assert "none" not in ALLOWED_ALGORITHMS

    def test_rejects_an_expired_token(
        self, keypair: KeyPair, settings: Any, jwks_cache: Any
    ) -> None:
        expired = keypair.sign(
            issued_at=datetime.now(UTC) - timedelta(hours=2),
            expires_in=timedelta(hours=1),
        )

        with pytest.raises(NotAuthenticatedError, match="expired"):
            verify_access_token(expired, settings=settings, jwks_cache=jwks_cache)

    def test_rejects_a_foreign_issuer(
        self, keypair: KeyPair, settings: Any, jwks_cache: Any
    ) -> None:
        # A valid token from a *different* Supabase project.
        other = keypair.sign(issuer="https://someone-else.supabase.co/auth/v1")

        with pytest.raises(NotAuthenticatedError):
            verify_access_token(other, settings=settings, jwks_cache=jwks_cache)

    def test_rejects_a_wrong_audience(
        self, keypair: KeyPair, settings: Any, jwks_cache: Any
    ) -> None:
        with pytest.raises(NotAuthenticatedError):
            verify_access_token(
                keypair.sign(audience="anon"), settings=settings, jwks_cache=jwks_cache
            )

    @pytest.mark.parametrize("claim", ["exp", "iat", "sub", "aud", "iss"])
    def test_rejects_tokens_missing_required_claims(
        self, keypair: KeyPair, settings: Any, jwks_cache: Any, claim: str
    ) -> None:
        with pytest.raises(NotAuthenticatedError):
            verify_access_token(
                keypair.sign(omit={claim}), settings=settings, jwks_cache=jwks_cache
            )

    def test_rejects_a_non_uuid_subject(
        self, keypair: KeyPair, settings: Any, jwks_cache: Any
    ) -> None:
        with pytest.raises(NotAuthenticatedError):
            verify_access_token(
                keypair.sign(subject="not-a-uuid"), settings=settings, jwks_cache=jwks_cache
            )

    @pytest.mark.parametrize(
        "token",
        ["", "   ", "garbage", "a.b", "a.b.c.d", "....", "Bearer token"],
    )
    def test_rejects_malformed_tokens(self, settings: Any, jwks_cache: Any, token: str) -> None:
        with pytest.raises(NotAuthenticatedError):
            verify_access_token(token, settings=settings, jwks_cache=jwks_cache)


class TestTenantClaimsAreIgnored:
    def test_a_studio_id_claim_in_the_token_is_not_trusted(
        self, keypair: KeyPair, settings: Any, jwks_cache: Any
    ) -> None:
        """A tenant id in the token must never reach the Principal.

        If it did, a caller could mint a token for any studio they liked. The
        studio is resolved by database lookup on `auth_user_id` instead.
        """
        token = keypair.sign(extra_claims={"studio_id": str(uuid4()), "role": "admin"})

        principal = verify_access_token(token, settings=settings, jwks_cache=jwks_cache)

        assert not hasattr(principal, "studio_id")
        assert not hasattr(principal, "role")
        # Only these fields exist, so nothing tenant-related can leak through.
        assert set(principal.__slots__) == {
            "auth_user_id",
            "email",
            "issued_at",
            "expires_at",
        }


class TestErrorMessagesDoNotLeak:
    def test_forgery_failures_share_one_message(
        self, keypair: KeyPair, attacker_keypair: KeyPair, settings: Any, jwks_cache: Any
    ) -> None:
        """Distinct forgery failures must be indistinguishable.

        A verifier that says "bad signature" for one attempt and "wrong
        issuer" for another tells an attacker exactly which part of the
        forgery to fix next.
        """
        messages = set()

        for token in (
            attacker_keypair.sign(),
            keypair.sign(issuer="https://elsewhere.supabase.co/auth/v1"),
            keypair.sign(audience="anon"),
            keypair.sign(subject="not-a-uuid"),
            keypair.sign(omit={"sub"}),
            "garbage",
        ):
            with pytest.raises(NotAuthenticatedError) as excinfo:
                verify_access_token(token, settings=settings, jwks_cache=jwks_cache)
            messages.add(str(excinfo.value))

        assert messages == {VERIFICATION_FAILED_MESSAGE}, (
            f"error copy distinguishes failure modes: {messages}"
        )

    def test_expiry_is_deliberately_distinguishable(
        self, keypair: KeyPair, settings: Any, jwks_cache: Any
    ) -> None:
        """Expiry is the one exception, and it is a considered one.

        It is the overwhelmingly common real failure, the host needs to know
        to sign in again, and it reveals nothing about a token the caller
        already holds.
        """
        expired = keypair.sign(
            issued_at=datetime.now(UTC) - timedelta(hours=2),
            expires_in=timedelta(hours=1),
        )

        with pytest.raises(NotAuthenticatedError) as excinfo:
            verify_access_token(expired, settings=settings, jwks_cache=jwks_cache)

        assert str(excinfo.value) == SESSION_EXPIRED_MESSAGE


class TestBearerHeader:
    def test_extracts_a_bearer_token(self) -> None:
        assert extract_bearer_token("Bearer abc.def.ghi") == "abc.def.ghi"

    def test_is_case_insensitive_on_the_scheme(self) -> None:
        assert extract_bearer_token("bearer abc.def.ghi") == "abc.def.ghi"

    @pytest.mark.parametrize(
        "header",
        [None, "", "abc.def.ghi", "Basic dXNlcjpwYXNz", "Bearer", "Bearer    "],
    )
    def test_rejects_anything_else(self, header: str | None) -> None:
        with pytest.raises(NotAuthenticatedError):
            extract_bearer_token(header)
