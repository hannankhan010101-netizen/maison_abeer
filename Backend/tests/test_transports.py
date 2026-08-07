"""Message delivery.

The failure this module exists to prevent is silent: a transport that appears
configured, reports success, and reaches nobody. Most of these assert on that
rather than on the happy path.
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from app.core.config import Settings
from app.services.transports import (
    LoggingTransport,
    Recipient,
    TransportError,
    TwilioTransport,
    build_transport,
)

REQUIRED = {
    "supabase_url": "https://example.supabase.co",
    "supabase_service_role_key": "service-role",
    "database_url": "postgresql+psycopg://u:p@localhost:5432/db",
}


def settings(**overrides: object) -> Settings:
    return Settings(**{**REQUIRED, **overrides})  # type: ignore[arg-type]


def recipient(address: str = "03001234567") -> Recipient:
    return Recipient(address=address, guest_id="guest-1")


# ---------------------------------------------------------------------------
# Choosing a transport
# ---------------------------------------------------------------------------


def test_the_default_contacts_nobody() -> None:
    """Running the worker against real data must not message real guests."""
    transport = build_transport(settings())
    assert isinstance(transport, LoggingTransport)


def test_partial_credentials_refuse_rather_than_half_configure() -> None:
    """A provider that fails every send is worse than one that did not try."""
    with pytest.raises(TransportError, match="incomplete"):
        build_transport(
            settings(
                message_provider="twilio",
                twilio_account_sid="AC123",
                twilio_auth_token="secret",  # noqa: S106 - a fixture
                # from numbers missing
            )
        )


def test_the_refusal_says_how_to_fix_it() -> None:
    with pytest.raises(TransportError) as caught:
        build_transport(settings(message_provider="twilio"))

    message = str(caught.value)
    assert "TWILIO_ACCOUNT_SID" in message
    assert "MESSAGE_PROVIDER=log" in message


def test_full_credentials_select_twilio() -> None:
    transport = build_transport(
        settings(
            message_provider="twilio",
            twilio_account_sid="AC123",
            twilio_auth_token="secret",  # noqa: S106 - a fixture
            twilio_from_sms="+15550001111",
            twilio_from_whatsapp="+15550002222",
        )
    )
    assert isinstance(transport, TwilioTransport)


# ---------------------------------------------------------------------------
# The dry run
# ---------------------------------------------------------------------------


def test_the_dry_run_records_the_address_it_would_have_used() -> None:
    """Without this it cannot show that addressing works at all."""
    transport = LoggingTransport()
    transport.send(channel="whatsapp", body="See you tomorrow", recipient=recipient())

    assert transport.sent == [("whatsapp", "03001234567", "See you tomorrow")]


# ---------------------------------------------------------------------------
# Twilio
# ---------------------------------------------------------------------------


def twilio() -> TwilioTransport:
    return TwilioTransport(
        account_sid="AC123",
        auth_token="secret",  # noqa: S106 - a fixture
        from_sms="+15550001111",
        from_whatsapp="+15550002222",
    )


def test_whatsapp_addresses_carry_the_prefix(monkeypatch: pytest.MonkeyPatch) -> None:
    """Without `whatsapp:` Twilio sends an SMS instead.

    That is the worst kind of bug here: the send succeeds, the provider
    reports delivery, and the message arrives in the wrong app.
    """
    captured: dict[str, object] = {}

    def fake_post(url: str, **kwargs: Any) -> httpx.Response:
        captured.update(kwargs["data"])
        return httpx.Response(201, json={"sid": "SM1"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", fake_post)

    twilio().send(channel="whatsapp", body="hi", recipient=recipient())

    assert captured["To"] == "whatsapp:03001234567"
    assert captured["From"] == "whatsapp:+15550002222"


def test_sms_addresses_do_not(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def fake_post(url: str, **kwargs: Any) -> httpx.Response:
        captured.update(kwargs["data"])
        return httpx.Response(201, json={"sid": "SM2"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", fake_post)

    twilio().send(channel="sms", body="hi", recipient=recipient())

    assert captured["To"] == "03001234567"
    assert captured["From"] == "+15550001111"


def test_email_is_refused_rather_than_silently_dropped() -> None:
    """A studio whose guests prefer email must find out at the first send."""
    with pytest.raises(TransportError, match="email"):
        twilio().send(channel="email", body="hi", recipient=recipient("a@b.com"))


def test_a_provider_error_surfaces_its_reason(monkeypatch: pytest.MonkeyPatch) -> None:
    """That string is what the host reads on the dashboard."""

    def fake_post(url: str, **kwargs: object) -> httpx.Response:
        return httpx.Response(
            400,
            json={"message": "The 'To' number is not a valid phone number.", "code": 21211},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", fake_post)

    with pytest.raises(TransportError, match="not a valid phone number"):
        twilio().send(channel="sms", body="hi", recipient=recipient("nope"))


def test_a_provider_error_without_json_still_explains(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_post(url: str, **kwargs: object) -> httpx.Response:
        return httpx.Response(
            502, text="<html>bad gateway</html>", request=httpx.Request("POST", url)
        )

    monkeypatch.setattr(httpx, "post", fake_post)

    with pytest.raises(TransportError, match="502"):
        twilio().send(channel="sms", body="hi", recipient=recipient())


def test_an_unreachable_provider_is_a_transport_error(monkeypatch: pytest.MonkeyPatch) -> None:
    """Not an httpx error: the worker catches TransportError and records it."""

    def fake_post(url: str, **kwargs: object) -> httpx.Response:
        raise httpx.ConnectTimeout("no route")

    monkeypatch.setattr(httpx, "post", fake_post)

    with pytest.raises(TransportError, match="Could not reach"):
        twilio().send(channel="sms", body="hi", recipient=recipient())


def test_the_auth_token_never_appears_in_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    """Errors land in `last_error`, which is rendered in the UI."""

    def fake_post(url: str, **kwargs: object) -> httpx.Response:
        raise httpx.ConnectTimeout("no route")

    monkeypatch.setattr(httpx, "post", fake_post)

    with pytest.raises(TransportError) as caught:
        twilio().send(channel="sms", body="hi", recipient=recipient())

    assert "secret" not in str(caught.value)
