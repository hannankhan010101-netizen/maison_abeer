"""Minting one-time portal logins.

Every request Supabase would receive is faked here, but the shapes are not
invented: they were captured from live `generate_link` and `verify` calls
against the real project, including the 422 that a duplicate signup returns.
A fake that guessed those would prove nothing.

The behaviour that matters most is the failure behaviour. A booking succeeded
before this module ran and must survive anything it does, so the tests weigh
towards "Supabase misbehaves" rather than the happy path.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

import httpx
import pytest

from app.core.config import Settings
from app.models.enums import MessageChannel
from app.models.guest import Guest
from app.services.portal_tokens import (
    AUTH_EMAIL_DOMAIN,
    NullIssuer,
    SupabaseIssuer,
    auth_email_for,
    build_issuer,
)

BASE = "https://test-project.supabase.co"


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "database_url": "postgresql+psycopg://u:p@localhost:5432/db",
        "supabase_url": BASE,
        "supabase_service_role_key": "service-role-key",
        **overrides,
    }
    return Settings(**values)


def make_guest(auth_user_id: uuid.UUID | None = None) -> Guest:
    guest = Guest(
        studio_id=uuid.uuid4(),
        full_name="Sana R.",
        preferred_channel=MessageChannel.EMAIL,
        visit_count=0,
    )
    guest.id = uuid.uuid4()
    guest.auth_user_id = auth_user_id
    return guest


def responder(routes: dict[str, httpx.Response], seen: list[httpx.Request]) -> httpx.MockTransport:
    """Answer by path, recording every request for later assertions."""

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request)

        for path, response in routes.items():
            if request.url.path == path:
                return response

        return httpx.Response(404, json={"msg": "unrouted"})

    return httpx.MockTransport(handle)


def link_response(user_id: uuid.UUID, token: str = "hashed-abc") -> httpx.Response:
    """The real shape: the User object with the link fields merged in."""
    return httpx.Response(
        200,
        json={
            "id": str(user_id),
            "email": "guest@maison-abeer.invalid",
            "action_link": f"{BASE}/auth/v1/verify?token=...",
            "email_otp": "123456",
            "hashed_token": token,
            "verification_type": "signup",
        },
    )


# ---------------------------------------------------------------------------
# The identity is the guest row, not their email
# ---------------------------------------------------------------------------


def test_auth_email_is_derived_from_the_guest_id_not_their_email() -> None:
    """Booking with someone else's address must not hand you their portal.

    The login identity comes from a primary key the guest does not choose, so
    the email they typed plays no part in who they are signed in as. This is
    what keeps the "no verification" decision from being an impersonation hole.
    """
    guest_id = uuid.uuid4()

    assert auth_email_for(guest_id) == f"guest-{guest_id}@{AUTH_EMAIL_DOMAIN}"


def test_the_auth_domain_can_never_receive_mail() -> None:
    """`.invalid` is reserved by RFC 2606 and cannot resolve.

    So a future feature that decides to email every auth user cannot reach a
    real person through one of these synthetic addresses.
    """
    assert AUTH_EMAIL_DOMAIN.endswith(".invalid")


# ---------------------------------------------------------------------------
# Minting
# ---------------------------------------------------------------------------


def test_new_guest_gets_a_signup_token_and_is_linked() -> None:
    user_id = uuid.uuid4()
    seen: list[httpx.Request] = []
    guest = make_guest()

    issuer = SupabaseIssuer(
        make_settings(),
        transport=responder({"/auth/v1/admin/generate_link": link_response(user_id)}, seen),
    )

    token = issuer.issue(guest)

    assert token is not None
    assert token.token_hash == "hashed-abc"
    assert token.otp_type == "signup"

    # The guest row now carries the identity, so the next booking recognises
    # them instead of minting a second account.
    assert guest.auth_user_id == user_id

    body = json.loads(seen[0].content)
    assert body["type"] == "signup"
    assert body["email"] == auth_email_for(guest.id)
    # GoTrue requires a password on a signup link. Nothing ever signs in with
    # it, but it must not be predictable.
    assert len(body["password"]) >= 32


def test_returning_guest_gets_a_magiclink_for_their_existing_identity() -> None:
    """An existing auth user may carry an address that predates this module.

    A seeded account logs in as its real email, so the token has to be minted
    against whatever that user actually is — not against the synthetic address
    this module would have chosen.
    """
    existing = uuid.uuid4()
    seen: list[httpx.Request] = []
    guest = make_guest(auth_user_id=existing)

    issuer = SupabaseIssuer(
        make_settings(),
        transport=responder(
            {
                f"/auth/v1/admin/users/{existing}": httpx.Response(
                    200, json={"id": str(existing), "email": "real@example.com"}
                ),
                "/auth/v1/admin/generate_link": link_response(existing, token="hashed-return"),
            },
            seen,
        ),
    )

    token = issuer.issue(guest)

    assert token is not None
    assert token.otp_type == "magiclink"
    assert guest.auth_user_id == existing

    body = json.loads(seen[-1].content)
    assert body["email"] == "real@example.com"


def test_duplicate_signup_falls_back_to_a_magic_link() -> None:
    """A guest row that lost its `auth_user_id`, or a retry after a half-failure.

    Live Supabase answers a duplicate signup with 422 `email_exists`; without
    the fallback that guest could never be issued a token again.
    """
    user_id = uuid.uuid4()
    guest = make_guest()
    calls: list[httpx.Request] = []

    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(request)

        if json.loads(request.content)["type"] == "signup":
            return httpx.Response(
                422,
                json={
                    "code": 422,
                    "error_code": "email_exists",
                    "msg": "A user with this email address has already been registered",
                },
            )

        return link_response(user_id, token="hashed-fallback")

    issuer = SupabaseIssuer(make_settings(), transport=httpx.MockTransport(handle))
    token = issuer.issue(guest)

    assert token is not None
    assert token.otp_type == "magiclink"
    assert token.token_hash == "hashed-fallback"
    assert guest.auth_user_id == user_id
    assert len(calls) == 2


def test_user_id_is_looked_up_when_the_link_response_omits_it() -> None:
    user_id = uuid.uuid4()
    guest = make_guest()

    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/auth/v1/admin/generate_link":
            # Same token, no `id` field.
            return httpx.Response(200, json={"hashed_token": "hashed-noid"})

        return httpx.Response(
            200,
            json={"users": [{"id": str(user_id), "email": auth_email_for(guest.id)}]},
        )

    issuer = SupabaseIssuer(make_settings(), transport=httpx.MockTransport(handle))
    token = issuer.issue(guest)

    assert token is not None
    assert guest.auth_user_id == user_id


# ---------------------------------------------------------------------------
# Failure never costs the guest their booking
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "failure",
    [
        pytest.param(httpx.Response(500, json={"msg": "boom"}), id="server-error"),
        pytest.param(httpx.Response(200, json={"id": "x"}), id="no-token-in-response"),
        pytest.param(httpx.Response(401, json={"msg": "bad key"}), id="rejected-key"),
    ],
)
def test_a_bad_response_yields_no_token_rather_than_raising(failure: httpx.Response) -> None:
    """The booking already succeeded. Nothing here may turn that into an error."""
    guest = make_guest()
    issuer = SupabaseIssuer(
        make_settings(),
        transport=httpx.MockTransport(lambda _request: failure),
    )

    assert issuer.issue(guest) is None
    assert guest.auth_user_id is None


def test_a_network_failure_yields_no_token_rather_than_raising() -> None:
    def explode(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route to host")

    guest = make_guest()
    issuer = SupabaseIssuer(make_settings(), transport=httpx.MockTransport(explode))

    assert issuer.issue(guest) is None


def test_failure_is_logged_without_the_exception_detail(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """The log records that minting failed, and nothing about what came back.

    A failed auth response can echo the very token this module exists to keep
    out of shared logs, so the handler records the exception *type* and not its
    message. This asserts the omission, because "we log less than you think" is
    exactly the kind of intention a later refactor helpfully undoes.
    """

    def explode(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("hashed_token=super-secret-value")

    guest = make_guest()
    issuer = SupabaseIssuer(make_settings(), transport=httpx.MockTransport(explode))

    with caplog.at_level("WARNING"):
        assert issuer.issue(guest) is None

    logged = caplog.text
    assert "could not mint a portal token" in logged
    assert "ConnectError" in logged
    assert "super-secret-value" not in logged


# ---------------------------------------------------------------------------
# Choosing an issuer
# ---------------------------------------------------------------------------


def test_a_configured_project_gets_a_real_issuer() -> None:
    assert isinstance(build_issuer(make_settings()), SupabaseIssuer)


def test_the_null_issuer_contacts_nobody_and_blocks_nothing() -> None:
    """The safe default, matching `build_transport`'s instinct.

    A booking against it still succeeds; it simply offers no button.
    """
    assert NullIssuer().issue(make_guest()) is None
