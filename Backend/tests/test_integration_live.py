"""The seam nothing else covers: browser → JWT → FastAPI → Postgres → back.

Every other suite stops at a boundary. The frontend tests mock `fetch`; the
backend tests substitute in-memory repositories. Both can be green while the
parts between them disagree — a JWT claim in the wrong shape, `studio_id`
resolving to nothing, a response field the UI does not expect. This module is
the only place those can fail.

It needs a live database and a real Supabase project, so it is marked
`integration` and skipped unless `MAISON_LIVE_TESTS=1`. Run it with:

    MAISON_LIVE_TESTS=1 python -m pytest tests/test_integration_live.py -m integration

The seed (`python -m app.cli.seed`) must have run first.
"""

from __future__ import annotations

import base64
import json
import os
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import delete, select

from app.core.config import get_settings
from app.core.db import get_session_factory
from app.models import Guest, HostUser, Studio

pytestmark = pytest.mark.integration

LIVE = os.environ.get("MAISON_LIVE_TESTS") == "1"
API = os.environ.get("MAISON_API_URL", "http://127.0.0.1:8000")
EMAIL = os.environ.get("MAISON_TEST_EMAIL", "")
PASSWORD = os.environ.get("MAISON_TEST_PASSWORD", "")

if not LIVE:
    pytest.skip("set MAISON_LIVE_TESTS=1 to run against a live project", allow_module_level=True)


def _claims(token: str) -> dict[str, Any]:
    payload = token.split(".")[1]
    padded = payload + "=" * (-len(payload) % 4)
    decoded: dict[str, Any] = json.loads(base64.urlsafe_b64decode(padded))
    return decoded


@pytest.fixture(scope="module")
def token() -> str:
    """A genuine Supabase access token, obtained the way the browser gets one."""
    settings = get_settings()
    base = str(settings.supabase_url).rstrip("/")
    publishable = os.environ.get("MAISON_PUBLISHABLE_KEY", "")

    response = httpx.post(
        f"{base}/auth/v1/token",
        params={"grant_type": "password"},
        headers={"apikey": publishable, "Content-Type": "application/json"},
        json={"email": EMAIL, "password": PASSWORD},
        timeout=40,
    )
    response.raise_for_status()
    access_token: str = response.json()["access_token"]
    return access_token


@pytest.fixture(scope="module")
def client(token: str) -> httpx.Client:
    return httpx.Client(
        base_url=API,
        headers={"Authorization": f"Bearer {token}"},
        timeout=40,
    )


# ---------------------------------------------------------------------------
# The token itself
# ---------------------------------------------------------------------------


def test_supabase_issues_an_asymmetric_token(token: str) -> None:
    """HS256 would mean the anon key doubles as a signing key."""
    header_segment = token.split(".")[0]
    padded = header_segment + "=" * (-len(header_segment) % 4)
    header = json.loads(base64.urlsafe_b64decode(padded))

    assert header["alg"] in {"RS256", "RS512", "ES256"}
    assert _claims(token)["role"] == "authenticated"


def test_the_subject_maps_to_exactly_one_studio(token: str) -> None:
    """`sub` → `host_user` → `studio_id` is the whole tenancy guarantee."""
    subject = uuid.UUID(_claims(token)["sub"])

    with get_session_factory()() as db:
        hosts = db.execute(select(HostUser).where(HostUser.auth_user_id == subject)).scalars().all()

    assert len(hosts) == 1, "a subject resolving to 0 or 2 studios breaks isolation"


# ---------------------------------------------------------------------------
# Reads the UI actually performs
# ---------------------------------------------------------------------------


def test_settings_round_trip(client: httpx.Client) -> None:
    response = client.get("/api/v1/settings")
    assert response.status_code == 200

    body = response.json()
    assert body["timezone"] == "Asia/Karachi"
    # Enum values must be the wire format, not the Python member names.
    assert body["default_voice"] == "soft_sweet"
    assert body["emoji_density"] == "full"


def test_guest_list_returns_seeded_people(client: httpx.Client) -> None:
    response = client.get("/api/v1/guests")
    assert response.status_code == 200

    names = {guest["full_name"] for guest in response.json()}
    assert "Ayesha K." in names
    assert "Sana R." in names


def test_a_critical_allergy_reaches_the_client(client: httpx.Client) -> None:
    """The allergy chip is the one piece of data that must never be dropped."""
    guests = client.get("/api/v1/guests").json()
    ayesha = next(guest for guest in guests if guest["full_name"] == "Ayesha K.")

    assert any(allergy["is_critical"] for allergy in ayesha["allergies"])


def test_calendar_window_query(client: httpx.Client) -> None:
    """The calendar's only read — and it requires an explicit window."""
    now = datetime.now(UTC)
    response = client.get(
        "/api/v1/sessions",
        params={
            "start": (now - timedelta(days=7)).isoformat(),
            "end": (now + timedelta(days=14)).isoformat(),
        },
    )
    assert response.status_code == 200

    sessions = response.json()
    assert sessions, "the seed creates four sessions in this window"
    assert {"id", "starts_at", "ends_at", "capacity", "status"} <= set(sessions[0])


def test_a_window_is_mandatory(client: httpx.Client) -> None:
    """Without one this would table-scan every session the studio ever ran."""
    assert client.get("/api/v1/sessions").status_code == 422


def test_capacity_is_computed_not_stored(client: httpx.Client) -> None:
    now = datetime.now(UTC)
    sessions = client.get(
        "/api/v1/sessions",
        params={
            "start": (now - timedelta(days=7)).isoformat(),
            "end": (now + timedelta(days=14)).isoformat(),
        },
    ).json()

    for session in sessions:
        capacity = session["capacity"]
        assert capacity["booked"] + capacity["available"] == capacity["seats"]
        assert capacity["state"] in {"open", "filling", "nearly_full", "sold_out"}


def test_roster_and_checklist_hang_off_a_session(client: httpx.Client) -> None:
    now = datetime.now(UTC)
    sessions = client.get(
        "/api/v1/sessions",
        params={"start": now.isoformat(), "end": (now + timedelta(days=14)).isoformat()},
    ).json()

    booked = next(session for session in sessions if session["capacity"]["booked"] > 0)

    roster = client.get(f"/api/v1/sessions/{booked['id']}/roster")
    assert roster.status_code == 200
    assert roster.json()["bookings"]

    checklist = client.get(f"/api/v1/sessions/{booked['id']}/checklist")
    assert checklist.status_code == 200


# ---------------------------------------------------------------------------
# Tenant isolation
# ---------------------------------------------------------------------------


@pytest.fixture
def other_studio() -> Any:
    """A second tenant with one guest, torn down afterwards.

    Created directly rather than through a second Supabase user: the point is
    to prove studio A's *token* cannot reach studio B's rows, and that does
    not require B to be able to sign in.
    """
    factory = get_session_factory()
    marker = f"zzz-isolation-{uuid.uuid4().hex[:8]}"

    with factory() as db:
        studio = Studio(name="Someone Else's Studio", slug=marker)
        db.add(studio)
        db.flush()

        guest = Guest(studio_id=studio.id, full_name=f"Do Not Leak {marker}")
        db.add(guest)
        db.commit()

        studio_id = studio.id
        guest_id = guest.id

    yield {"studio_id": studio_id, "guest_id": guest_id, "marker": marker}

    with factory() as db:
        db.execute(delete(Guest).where(Guest.studio_id == studio_id))
        db.execute(delete(Studio).where(Studio.id == studio_id))
        db.commit()


def test_another_studios_guests_are_invisible(client: httpx.Client, other_studio: Any) -> None:
    response = client.get("/api/v1/guests")
    assert response.status_code == 200

    names = {guest["full_name"] for guest in response.json()}
    assert other_studio["marker"] not in " ".join(names)


def test_another_studios_guest_cannot_be_fetched_by_id(
    client: httpx.Client, other_studio: Any
) -> None:
    """Guessing an id must not be a way around the list filter."""
    response = client.get(f"/api/v1/guests/{other_studio['guest_id']}")
    assert response.status_code == 404


def test_another_studios_guest_cannot_be_patched(client: httpx.Client, other_studio: Any) -> None:
    """A write path that skipped the scope check would be worse than a read."""
    response = client.patch(
        f"/api/v1/guests/{other_studio['guest_id']}",
        json={"memory_note": "should never land"},
    )
    assert response.status_code == 404

    with get_session_factory()() as db:
        guest = db.get(Guest, other_studio["guest_id"])
        assert guest is not None
        assert guest.memory_note is None


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------


def test_creating_a_guest_persists_and_is_scoped(client: httpx.Client) -> None:
    name = f"Integration Test {uuid.uuid4().hex[:6]}"

    created = client.post("/api/v1/guests", json={"full_name": name})
    assert created.status_code == 201

    guest_id = created.json()["id"]

    try:
        assert client.get(f"/api/v1/guests/{guest_id}").status_code == 200

        with get_session_factory()() as db:
            row = db.get(Guest, uuid.UUID(guest_id))
            assert row is not None
            # Written from the token, never from the request body.
            subject = uuid.UUID(_claims(client.headers["Authorization"].split()[1])["sub"])
            host = db.execute(select(HostUser).where(HostUser.auth_user_id == subject)).scalar_one()
            assert row.studio_id == host.studio_id
    finally:
        with get_session_factory()() as db:
            db.execute(delete(Guest).where(Guest.id == uuid.UUID(guest_id)))
            db.commit()


def test_studio_id_in_the_body_is_ignored(client: httpx.Client) -> None:
    """The classic tenancy hole: trusting a client-supplied tenant id."""
    name = f"Injection Test {uuid.uuid4().hex[:6]}"
    forged = str(uuid.uuid4())

    created = client.post(
        "/api/v1/guests",
        json={"full_name": name, "studio_id": forged},
    )
    assert created.status_code in (201, 422)

    if created.status_code == 201:
        guest_id = uuid.UUID(created.json()["id"])
        try:
            with get_session_factory()() as db:
                row = db.get(Guest, guest_id)
                assert row is not None
                assert str(row.studio_id) != forged
        finally:
            with get_session_factory()() as db:
                db.execute(delete(Guest).where(Guest.id == guest_id))
                db.commit()


# ---------------------------------------------------------------------------
# Messages and name tags
# ---------------------------------------------------------------------------


def _upcoming_booked_session(client: httpx.Client) -> dict[str, Any]:
    now = datetime.now(UTC)
    sessions = client.get(
        "/api/v1/sessions",
        params={"start": now.isoformat(), "end": (now + timedelta(days=21)).isoformat()},
    ).json()
    return next(s for s in sessions if s["capacity"]["booked"] > 0)


def test_previewing_reminders_queues_nothing(client: httpx.Client) -> None:
    session = _upcoming_booked_session(client)

    before = len(client.get(f"/api/v1/sessions/{session['id']}/messages").json())
    response = client.post(f"/api/v1/sessions/{session['id']}/messages/preview", json={})
    after = len(client.get(f"/api/v1/sessions/{session['id']}/messages").json())

    assert response.status_code == 200
    assert after == before, "preview must not write anything"


def test_a_preview_never_ships_an_unresolved_placeholder(client: httpx.Client) -> None:
    """A literal `{guest_name}` reaching a guest is the defect this catches."""
    session = _upcoming_booked_session(client)
    previews = client.post(f"/api/v1/sessions/{session['id']}/messages/preview", json={}).json()

    assert previews
    for preview in previews:
        assert preview["unresolved_placeholders"] == [], preview["body"]


def test_scheduling_is_idempotent(client: httpx.Client) -> None:
    """Pressing the button twice must not double-message anyone."""
    session = _upcoming_booked_session(client)

    client.post(f"/api/v1/sessions/{session['id']}/messages", json={})
    second = client.post(f"/api/v1/sessions/{session['id']}/messages", json={})

    assert second.status_code == 201
    assert second.json()["queued"] == 0


def test_skips_are_reported_with_a_reason(client: httpx.Client) -> None:
    """Silence the host cannot explain is the failure mode to avoid (§3.2)."""
    session = _upcoming_booked_session(client)
    result = client.post(f"/api/v1/sessions/{session['id']}/messages", json={}).json()

    assert set(result["skips"]) <= {"opted_out", "no_contact", "in_the_past"}
    assert sum(result["skips"].values()) == result["skipped"]


def test_the_tag_sheet_matches_the_roster(client: httpx.Client) -> None:
    session = _upcoming_booked_session(client)

    sheet = client.get(f"/api/v1/sessions/{session['id']}/tags").json()
    roster = client.get(f"/api/v1/sessions/{session['id']}/roster").json()

    active = [b for b in roster["bookings"] if b["status"] != "cancelled"]
    assert len(sheet["subjects"]) == len(active)
    assert len(sheet["roster_hash"]) == 64


def test_exporting_clears_the_staleness_banner(client: httpx.Client) -> None:
    session = _upcoming_booked_session(client)

    created = client.post(
        f"/api/v1/sessions/{session['id']}/exports",
        json={"theme": "clay", "layout": "a4-8"},
    )
    assert created.status_code == 201

    sheet = client.get(f"/api/v1/sessions/{session['id']}/tags").json()
    assert sheet["roster_changed_since_export"] is False
    assert created.json()["roster_hash"] == sheet["roster_hash"]


def test_moving_a_table_reopens_the_banner_and_reverting_closes_it(client: httpx.Client) -> None:
    """A fingerprint, not a timestamp: an edit that is undone is not a change."""
    session = _upcoming_booked_session(client)
    client.post(
        f"/api/v1/sessions/{session['id']}/exports",
        json={"theme": "clay", "layout": "a4-8"},
    )

    roster = client.get(f"/api/v1/sessions/{session['id']}/roster").json()
    booking = roster["bookings"][0]
    original = booking["table_number"]

    try:
        client.patch(f"/api/v1/bookings/{booking['id']}/table", json={"table_number": 99})
        moved = client.get(f"/api/v1/sessions/{session['id']}/tags").json()
        assert moved["roster_changed_since_export"] is True
    finally:
        client.patch(f"/api/v1/bookings/{booking['id']}/table", json={"table_number": original})

    reverted = client.get(f"/api/v1/sessions/{session['id']}/tags").json()
    assert reverted["roster_changed_since_export"] is False
