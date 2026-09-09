"""Minting one-time portal logins for guests.

A guest books from an Instagram ad on their phone. Asking them to invent a
password, or to leave the page and find a confirmation email, loses most of
them — so neither happens. The confirmation screen itself carries a one-time
token, and one tap trades it for a real session.

**No email is ever sent.** Supabase's admin API can generate the token that
*would* have been mailed and hand it back over the wire instead. The browser
redeems it with `verifyOtp({ token_hash })`. Same cryptography as a magic
link, none of the round trip.

**The login identity is the guest row, not the guest's email.** Every guest
gets `guest-<their id>@maison-abeer.invalid`, derived from a primary key they
do not choose. That matters:

- Booking with someone else's email cannot hand you their portal, because the
  email plays no part in who you log in as.
- `guest.auth_user_id` is globally unique, so two guest rows sharing an email
  (the same person at two studios) would otherwise collide on one auth user.
- `.invalid` is reserved by RFC 2606 and can never resolve, so a stray send
  from some future feature cannot reach a real person by accident.

`guest.email` is left exactly as the guest typed it — or left null. It is
contact information, and the host's "no way to reach them" badge depends on it
staying honest.

**Failure here is never the guest's problem.** Every function returns None
rather than raising: the booking succeeded, and a guest must never be told
otherwise because an account could not be created.
"""

from __future__ import annotations

import logging
import secrets
import uuid
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal, Protocol

import httpx

if TYPE_CHECKING:
    from app.core.config import Settings
    from app.models.guest import Guest

__all__ = [
    "AUTH_EMAIL_DOMAIN",
    "NullIssuer",
    "PortalToken",
    "PortalTokenIssuer",
    "SupabaseIssuer",
    "auth_email_for",
    "build_issuer",
]

logger = logging.getLogger(__name__)

TIMEOUT = 10.0
"""Short on purpose. This hangs off a booking request a guest is watching."""

AUTH_EMAIL_DOMAIN = "maison-abeer.invalid"

OtpType = Literal["signup", "magiclink"]


@dataclass(frozen=True, slots=True)
class PortalToken:
    """A single-use login, and the OTP type the browser must verify it as.

    The type is not cosmetic — `verifyOtp` rejects a token presented under the
    wrong one, and which type we get depends on whether the auth user already
    existed.
    """

    token_hash: str
    otp_type: OtpType
    user_id: uuid.UUID | None = None
    """The auth user Supabase linked it to, when it told us."""


def auth_email_for(guest_id: uuid.UUID) -> str:
    """The synthetic address this guest logs in as. Deterministic, never mailed."""
    return f"guest-{guest_id}@{AUTH_EMAIL_DOMAIN}"


class PortalTokenIssuer(Protocol):
    """Anything that can mint a one-time portal login for a guest."""

    def issue(self, guest: Guest) -> PortalToken | None:
        """Mint a token, or return None if one cannot be had."""
        ...


class NullIssuer:
    """Mints nothing and contacts nobody.

    The safe default, for the same reason `LoggingTransport` is: this code
    path runs on an unauthenticated public endpoint, and a test suite or a dry
    run that quietly reaches out to a real Supabase project — or to whatever
    host happens to answer for a placeholder URL — is not a mistake that
    announces itself.

    A booking against this issuer still succeeds. It simply offers no button.
    """

    def issue(self, guest: Guest) -> PortalToken | None:  # noqa: ARG002 - protocol shape
        return None


class SupabaseIssuer:
    """Mints real logins through Supabase's admin API."""

    def __init__(self, settings: Settings, *, transport: httpx.BaseTransport | None = None) -> None:
        self._base = settings.supabase_url.rstrip("/")
        self._headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Content-Type": "application/json",
        }
        # Test seam. Left None in production, where httpx opens real sockets.
        self._transport = transport

    def issue(self, guest: Guest) -> PortalToken | None:
        """Mint a one-time login for `guest`, linking an auth user on first use.

        Mutates `guest.auth_user_id` when it creates the identity; the caller's
        transaction is what makes that stick. Returns None if anything at all
        goes wrong — see the module docstring.
        """
        try:
            return self._issue(guest)
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            # Deliberately not `exception()`: the response body of a failed
            # auth call can carry the token we are keeping out of the logs.
            logger.warning(
                "could not mint a portal token for guest %s: %s", guest.id, type(exc).__name__
            )
            return None

    def _issue(self, guest: Guest) -> PortalToken | None:
        base = self._base
        headers = self._headers

        with httpx.Client(timeout=TIMEOUT, transport=self._transport) as client:
            if guest.auth_user_id is not None:
                # Already has an identity. Log them in as whatever address
                # that user actually carries, which may predate this module —
                # a seeded account, or one made before the synthetic scheme.
                email = _existing_user_email(client, base, headers, guest.auth_user_id)
                if email is None:
                    return None

                return _generate_link(client, base, headers, "magiclink", email)

            email = auth_email_for(guest.id)

            # `signup` creates the user and returns a token in one call. The
            # alternative — create, then link — is two round trips on the
            # critical path of a booking, and needs its own "already exists"
            # handling anyway.
            #
            # The password is random and immediately forgotten. Nothing signs
            # in with it; it exists because GoTrue requires the field.
            token = _generate_link(
                client,
                base,
                headers,
                "signup",
                email,
                password=secrets.token_urlsafe(32),
            )

            if token is None:
                # Already registered — a guest row that lost its
                # `auth_user_id`, or a retry after a half-failed booking.
                # Fall back to a plain magic link against the same address.
                token = _generate_link(client, base, headers, "magiclink", email)

            if token is None:
                return None

            # `generate_link` echoes the auth user back, so the id normally
            # costs nothing. Only fall back to a lookup if it did not.
            user_id = token.user_id or _lookup_user_id(client, base, headers, email)
            if user_id is None:
                return None

            guest.auth_user_id = user_id

            return token


def build_issuer(settings: Settings) -> PortalTokenIssuer:
    """Pick an issuer. Real only when there is a real project to talk to.

    Same shape as `build_transport`, and the same instinct behind it: a
    half-configured integration that silently reaches out to whatever answers
    is worse than one that plainly does not try.
    """
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return NullIssuer()

    return SupabaseIssuer(settings)


def _generate_link(
    client: httpx.Client,
    base: str,
    headers: dict[str, str],
    otp_type: OtpType,
    email: str,
    *,
    password: str | None = None,
) -> PortalToken | None:
    """One `generate_link` call. None when Supabase declines it."""
    body: dict[str, Any] = {"type": otp_type, "email": email}
    if password is not None:
        body["password"] = password

    response = client.post(f"{base}/auth/v1/admin/generate_link", headers=headers, json=body)

    if response.status_code not in (200, 201):
        return None

    payload = response.json()

    token_hash = payload.get("hashed_token")
    if not token_hash:
        return None

    # The response is the User object with the link fields merged in, so the
    # id sits at the top level. Older shapes nest it; tolerate both.
    raw_id = payload.get("id") or payload.get("user", {}).get("id")

    return PortalToken(
        token_hash=str(token_hash),
        otp_type=otp_type,
        user_id=uuid.UUID(str(raw_id)) if raw_id else None,
    )


def _existing_user_email(
    client: httpx.Client,
    base: str,
    headers: dict[str, str],
    auth_user_id: uuid.UUID,
) -> str | None:
    response = client.get(f"{base}/auth/v1/admin/users/{auth_user_id}", headers=headers)

    if response.status_code != 200:
        return None

    email = response.json().get("email")
    return str(email) if email else None


def _lookup_user_id(
    client: httpx.Client,
    base: str,
    headers: dict[str, str],
    email: str,
) -> uuid.UUID | None:
    """Resolve the auth user id for an address we just generated a link for.

    Filtered server-side rather than paged through. `ensure_auth_user` in the
    seed CLI walks the first 200 users looking for a match, which is fine for
    a script run once against a fresh project and quietly wrong on a public
    endpoint the moment a studio has more guests than that.
    """
    response = client.get(
        f"{base}/auth/v1/admin/users",
        headers=headers,
        params={"filter": email, "per_page": 2},
    )

    if response.status_code != 200:
        return None

    for user in response.json().get("users", []):
        if str(user.get("email", "")).lower() == email.lower():
            return uuid.UUID(str(user["id"]))

    return None
