"""Message delivery.

The worker decides *whether* and *when*; a transport decides *how*. Keeping
them apart is what lets the queue be drained in a dry run against real data
without contacting anybody.

Two implementations ship:

* `LoggingTransport` — the default. Records what it would send and contacts
  nobody. This is the safe default deliberately: the worker is most often run
  against a real database while developing, and a misconfigured provider
  messaging real guests is not a mistake you can take back.
* `TwilioTransport` — SMS and WhatsApp. Opt-in, and only selected when every
  credential it needs is present.

Email has no implementation. It raises rather than silently doing nothing, so
a studio whose guests prefer email finds out at the first send instead of
wondering why nobody replies.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

import httpx

if TYPE_CHECKING:
    from app.core.config import Settings

__all__ = [
    "LoggingTransport",
    "Recipient",
    "Transport",
    "TransportError",
    "TwilioTransport",
    "build_transport",
]


class TransportError(RuntimeError):
    """Delivery failed. The worker records the message and moves on."""


@dataclass(frozen=True, slots=True)
class Recipient:
    """Where a message is actually going.

    Carries the address, not the guest id. The first version of this passed
    `guest_id` through to the provider, which no provider can deliver to —
    the abstraction looked finished and could not have worked.
    """

    address: str
    """A phone number or an email, matching the channel."""

    guest_id: str | None = None
    """For logs and correlation only. Never sent anywhere."""


class Transport(Protocol):
    """Anything that can deliver one message."""

    def send(self, *, channel: str, body: str, recipient: Recipient) -> str:
        """Deliver, returning a provider id. Raise `TransportError` to fail."""
        ...


class LoggingTransport:
    """Records what would be sent. Contacts nobody."""

    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str]] = []

    def send(self, *, channel: str, body: str, recipient: Recipient) -> str:
        self.sent.append((channel, recipient.address, body))
        return f"dry-run-{len(self.sent)}"


class TwilioTransport:
    """SMS and WhatsApp via Twilio's REST API.

    Uses `httpx` directly rather than Twilio's SDK: the whole integration is
    one form POST, and the SDK would add a dependency and its own retry
    behaviour on top of the worker's, which already owns retries.
    """

    BASE = "https://api.twilio.com/2010-04-01"

    def __init__(
        self,
        *,
        account_sid: str,
        auth_token: str,
        from_sms: str,
        from_whatsapp: str,
        timeout: float = 20.0,
    ) -> None:
        self._account_sid = account_sid
        self._auth_token = auth_token
        self._from_sms = from_sms
        self._from_whatsapp = from_whatsapp
        self._timeout = timeout

    def _sender_and_destination(self, channel: str, address: str) -> tuple[str, str]:
        if channel == "whatsapp":
            # Twilio addresses WhatsApp with a `whatsapp:` prefix on both ends.
            # Omitting it silently sends an SMS instead — a delivery that
            # succeeds and reaches the wrong app.
            return f"whatsapp:{self._from_whatsapp}", f"whatsapp:{address}"

        if channel == "sms":
            return self._from_sms, address

        raise TransportError(f"Twilio cannot send over {channel!r}.")

    def send(self, *, channel: str, body: str, recipient: Recipient) -> str:
        sender, destination = self._sender_and_destination(channel, recipient.address)

        credentials = base64.b64encode(f"{self._account_sid}:{self._auth_token}".encode()).decode()

        try:
            response = httpx.post(
                f"{self.BASE}/Accounts/{self._account_sid}/Messages.json",
                headers={"Authorization": f"Basic {credentials}"},
                data={"From": sender, "To": destination, "Body": body},
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise TransportError(f"Could not reach the message provider: {exc}") from exc

        if response.status_code >= 400:
            # Twilio's own message is the useful one — it says *why*, and that
            # string is what the host reads on the dashboard.
            detail = _twilio_error(response)
            raise TransportError(detail)

        message_id: str = response.json().get("sid", "")
        return message_id


def _twilio_error(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return f"Provider returned {response.status_code}."

    message = payload.get("message") or f"Provider returned {response.status_code}."
    code = payload.get("code")

    return f"{message} (code {code})" if code else str(message)


def build_transport(settings: Settings) -> Transport:
    """Pick a transport from configuration.

    Falls back to the dry run whenever anything is missing, rather than
    half-configuring a provider. A partially configured Twilio would fail
    every send, and a queue of failures is worse than a queue that plainly
    did not try.
    """
    if settings.message_provider != "twilio":
        return LoggingTransport()

    required = (
        settings.twilio_account_sid,
        settings.twilio_auth_token,
        settings.twilio_from_sms,
        settings.twilio_from_whatsapp,
    )

    if not all(required):
        raise TransportError(
            "MESSAGE_PROVIDER is 'twilio' but the Twilio credentials are incomplete. "
            "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_SMS and "
            "TWILIO_FROM_WHATSAPP, or set MESSAGE_PROVIDER=log."
        )

    return TwilioTransport(
        account_sid=settings.twilio_account_sid,
        auth_token=settings.twilio_auth_token,
        from_sms=settings.twilio_from_sms,
        from_whatsapp=settings.twilio_from_whatsapp,
    )
