"""The public booking endpoint.

This is the only place a stranger can write to the database, so these tests
are weighted towards what must *not* happen: no oversell, no data leak, no
cross-studio reach, no confirmation that a phone number is already a customer.

Marked `integration` because the oversell test needs real row locking —
`SELECT … FOR UPDATE` is a no-op against anything but a real database, and a
suite that mocked it would assert the guarantee it is meant to prove.
"""

from __future__ import annotations

import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import delete, select

from app.models import Booking, ClassType, Guest, MessageFeedback, Studio, WaitlistEntry
from app.models import Session as SessionModel
from app.models.enums import CraftKind, SessionStatus
from tests.admin_db import admin_factory

pytestmark = pytest.mark.integration

LIVE = os.environ.get("MAISON_LIVE_TESTS") == "1"
API = os.environ.get("MAISON_API_URL", "http://127.0.0.1:8000")

if not LIVE:
    pytest.skip("set MAISON_LIVE_TESTS=1 to run against a live project", allow_module_level=True)


@pytest.fixture
def studio_with_class() -> Any:
    """A throwaway studio with one class holding exactly two seats."""
    factory = admin_factory
    slug = f"zzz-public-{uuid.uuid4().hex[:8]}"

    with factory() as db:
        studio = Studio(name="Test Studio", slug=slug)
        db.add(studio)
        db.flush()

        class_type = ClassType(
            studio_id=studio.id,
            name="Bento cake decorating",
            craft=CraftKind.BENTO_CAKE,
            color_token="pink",  # noqa: S106 - a palette token, not a secret
        )
        db.add(class_type)
        db.flush()

        starts = datetime.now(UTC) + timedelta(days=3)
        session = SessionModel(
            studio_id=studio.id,
            class_type_id=class_type.id,
            starts_at=starts,
            ends_at=starts + timedelta(hours=2),
            seats=2,
            status=SessionStatus.SCHEDULED,
            location="Studio A",
        )
        db.add(session)
        db.commit()

        ids = {"studio_id": studio.id, "session_id": session.id, "slug": slug}

    yield ids

    with factory() as db:
        db.execute(delete(WaitlistEntry).where(WaitlistEntry.studio_id == ids["studio_id"]))
        db.execute(delete(Booking).where(Booking.studio_id == ids["studio_id"]))
        db.execute(delete(Guest).where(Guest.studio_id == ids["studio_id"]))
        db.execute(delete(SessionModel).where(SessionModel.studio_id == ids["studio_id"]))
        db.execute(delete(ClassType).where(ClassType.studio_id == ids["studio_id"]))
        db.execute(delete(Studio).where(Studio.id == ids["studio_id"]))
        db.commit()


def book(slug: str, session_id: Any, name: str, **extra: Any) -> httpx.Response:
    return httpx.post(
        f"{API}/api/v1/public/{slug}/classes/{session_id}/book",
        json={"full_name": name, "phone": f"0300{abs(hash(name)) % 10_000_000:07d}", **extra},
        timeout=40,
    )


# ---------------------------------------------------------------------------
# No authentication required
# ---------------------------------------------------------------------------


def test_listing_classes_needs_no_token(studio_with_class: Any) -> None:
    response = httpx.get(f"{API}/api/v1/public/{studio_with_class['slug']}/classes", timeout=40)

    assert response.status_code == 200
    assert len(response.json()["classes"]) == 1


def test_an_unknown_studio_is_a_404_not_a_500(studio_with_class: Any) -> None:
    assert httpx.get(f"{API}/api/v1/public/not-a-studio/classes", timeout=40).status_code == 404


# ---------------------------------------------------------------------------
# What the page must not leak
# ---------------------------------------------------------------------------


def test_the_class_list_exposes_no_guest_data(studio_with_class: Any) -> None:
    """Anyone can read this. It must carry nothing about who is attending."""
    book(studio_with_class["slug"], studio_with_class["session_id"], "Leaky Test")

    body = httpx.get(
        f"{API}/api/v1/public/{studio_with_class['slug']}/classes", timeout=40
    ).text.lower()

    assert "leaky test" not in body
    assert "phone" not in body
    assert "allerg" not in body
    assert "memory_note" not in body


def test_the_class_list_exposes_no_studio_internals(studio_with_class: Any) -> None:
    payload = httpx.get(
        f"{API}/api/v1/public/{studio_with_class['slug']}/classes", timeout=40
    ).json()

    assert set(payload["studio"]) == {
        "name",
        "instagram_handle",
        "logo_url",
        "primary_color",
        "accent_color",
    }
    assert "quiet_hours_start" not in payload["studio"]
    assert set(payload["classes"][0]) == {
        "id",
        "name",
        "starts_at",
        "ends_at",
        "location",
        "color_token",
        "seats_left",
        "is_full",
        "waitlist_is_open",
    }


def test_a_returning_guest_is_not_announced(studio_with_class: Any) -> None:
    """Otherwise the form becomes a lookup oracle for any phone number."""
    slug, session_id = studio_with_class["slug"], studio_with_class["session_id"]

    first = httpx.post(
        f"{API}/api/v1/public/{slug}/classes/{session_id}/book",
        json={"full_name": "Repeat Guest", "phone": "03009998887"},
        timeout=40,
    )
    second = httpx.post(
        f"{API}/api/v1/public/{slug}/classes/{session_id}/book",
        json={"full_name": "Repeat Guest", "phone": "03009998887"},
        timeout=40,
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json() == second.json(), "a repeat submit must be indistinguishable"


# ---------------------------------------------------------------------------
# Capacity
# ---------------------------------------------------------------------------


def test_booking_takes_a_seat(studio_with_class: Any) -> None:
    response = book(studio_with_class["slug"], studio_with_class["session_id"], "First Guest")

    assert response.status_code == 201
    assert response.json()["outcome"] == "booked"


def test_a_full_class_waitlists_rather_than_refusing(studio_with_class: Any) -> None:
    slug, session_id = studio_with_class["slug"], studio_with_class["session_id"]

    book(slug, session_id, "Seat One")
    book(slug, session_id, "Seat Two")
    third = book(slug, session_id, "Too Late")

    assert third.status_code == 201
    assert third.json()["outcome"] == "waitlisted"
    assert third.json()["waitlist_position"] == 1


def test_concurrent_bookings_cannot_oversell_the_last_seat(studio_with_class: Any) -> None:
    """The reason the session row is locked.

    Two seats, six simultaneous submissions. Without `FOR UPDATE` every
    request reads the same stale count and every insert succeeds, and the
    host discovers the oversell in the room.
    """
    slug, session_id = studio_with_class["slug"], studio_with_class["session_id"]

    with ThreadPoolExecutor(max_workers=6) as pool:
        responses = list(pool.map(lambda i: book(slug, session_id, f"Racer {i}"), range(6)))

    outcomes = [r.json()["outcome"] for r in responses if r.status_code == 201]

    assert outcomes.count("booked") == 2, f"oversold: {outcomes}"
    assert outcomes.count("waitlisted") == 4

    with admin_factory() as db:
        seated = (
            db.execute(select(Booking).where(Booking.session_id == studio_with_class["session_id"]))
            .scalars()
            .all()
        )
        assert len(seated) == 2


# ---------------------------------------------------------------------------
# Validation and abuse
# ---------------------------------------------------------------------------


def test_a_booking_needs_some_way_to_reach_the_guest(studio_with_class: Any) -> None:
    response = httpx.post(
        f"{API}/api/v1/public/{studio_with_class['slug']}/classes/{studio_with_class['session_id']}/book",
        json={"full_name": "No Contact"},
        timeout=40,
    )
    assert response.status_code == 422


def test_a_blank_name_is_rejected(studio_with_class: Any) -> None:
    response = httpx.post(
        f"{API}/api/v1/public/{studio_with_class['slug']}/classes/{studio_with_class['session_id']}/book",
        json={"full_name": "   ", "phone": "03001112223"},
        timeout=40,
    )
    assert response.status_code == 422


def test_the_honeypot_writes_nothing(studio_with_class: Any) -> None:
    """A bot filling every field gets a plausible response and no row."""
    slug, session_id = studio_with_class["slug"], studio_with_class["session_id"]

    httpx.post(
        f"{API}/api/v1/public/{slug}/classes/{session_id}/book",
        json={"full_name": "Spam Bot", "phone": "03005556667", "website": "http://spam"},
        timeout=40,
    )

    with admin_factory() as db:
        found = db.execute(
            select(Guest).where(
                Guest.studio_id == studio_with_class["studio_id"],
                Guest.full_name == "Spam Bot",
            )
        ).scalar_one_or_none()

    assert found is None


def test_a_class_belonging_to_another_studio_is_invisible(studio_with_class: Any) -> None:
    """The slug selects the studio; a session id from elsewhere must not resolve."""
    factory = admin_factory

    with factory() as db:
        other = (
            db.execute(
                select(SessionModel).where(SessionModel.studio_id != studio_with_class["studio_id"])
            )
            .scalars()
            .first()
        )

    if other is None:
        pytest.skip("no second studio in this database")

    response = httpx.post(
        f"{API}/api/v1/public/{studio_with_class['slug']}/classes/{other.id}/book",
        json={"full_name": "Cross Tenant", "phone": "03007778889"},
        timeout=40,
    )
    assert response.status_code == 404


def test_an_allergy_is_recorded_as_critical(studio_with_class: Any) -> None:
    """A guest typing in that box is telling the host it matters."""
    slug, session_id = studio_with_class["slug"], studio_with_class["session_id"]

    httpx.post(
        f"{API}/api/v1/public/{slug}/classes/{session_id}/book",
        json={"full_name": "Allergy Guest", "phone": "03004445556", "allergies": "Peanuts"},
        timeout=40,
    )

    with admin_factory() as db:
        guest = db.execute(
            select(Guest).where(
                Guest.studio_id == studio_with_class["studio_id"],
                Guest.full_name == "Allergy Guest",
            )
        ).scalar_one()
        db.refresh(guest)

        assert guest.allergies
        assert guest.allergies[0].is_critical


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------


@pytest.fixture
def past_booking(studio_with_class: Any) -> Any:
    """A booking on a class that has already happened."""
    factory = admin_factory

    with factory() as db:
        session = db.get(SessionModel, studio_with_class["session_id"])
        assert session is not None
        session.starts_at = datetime.now(UTC) - timedelta(days=2)
        session.ends_at = session.starts_at + timedelta(hours=2)

        guest = Guest(studio_id=studio_with_class["studio_id"], full_name="Feedback Guest")
        db.add(guest)
        db.flush()

        booking = Booking(
            studio_id=studio_with_class["studio_id"],
            session_id=session.id,
            guest_id=guest.id,
        )
        db.add(booking)
        db.commit()

        yield {"booking_id": booking.id, "studio_id": studio_with_class["studio_id"]}

    with factory() as db:
        db.execute(
            delete(MessageFeedback).where(
                MessageFeedback.studio_id == studio_with_class["studio_id"]
            )
        )
        db.commit()


def test_the_prompt_names_the_class_and_nothing_else(past_booking: Any) -> None:
    """The link may be intercepted; it must not identify the guest."""
    response = httpx.get(f"{API}/api/v1/public/feedback/{past_booking['booking_id']}", timeout=40)

    assert response.status_code == 200
    assert set(response.json()) == {"class_name", "starts_at", "already_answered"}
    assert "Feedback Guest" not in response.text


def test_an_unknown_link_is_a_404(past_booking: Any) -> None:
    response = httpx.get(
        f"{API}/api/v1/public/feedback/00000000-0000-0000-0000-000000000000", timeout=40
    )
    assert response.status_code == 404


def test_one_tap_is_recorded(past_booking: Any) -> None:
    response = httpx.put(
        f"{API}/api/v1/public/feedback/{past_booking['booking_id']}",
        json={"rating": 3, "one_word": "calm"},
        timeout=40,
    )
    assert response.status_code == 200
    assert response.json()["already_answered"] is True

    with admin_factory() as db:
        stored = db.execute(
            select(MessageFeedback).where(MessageFeedback.booking_id == past_booking["booking_id"])
        ).scalar_one()

        assert stored.rating == 3
        assert stored.one_word == "calm"
        # Taken from the booking, never from the request.
        assert stored.studio_id == past_booking["studio_id"]


def test_tapping_again_corrects_rather_than_conflicts(past_booking: Any) -> None:
    url = f"{API}/api/v1/public/feedback/{past_booking['booking_id']}"

    httpx.put(url, json={"rating": 3, "one_word": "calm"}, timeout=40)
    second = httpx.put(url, json={"rating": 1, "one_word": "messy"}, timeout=40)

    assert second.status_code == 200

    with admin_factory() as db:
        rows = (
            db.execute(
                select(MessageFeedback).where(
                    MessageFeedback.booking_id == past_booking["booking_id"]
                )
            )
            .scalars()
            .all()
        )

        assert len(rows) == 1, "a second tap must not create a second row"
        assert rows[0].rating == 1


def test_a_rating_outside_the_scale_is_rejected(past_booking: Any) -> None:
    response = httpx.put(
        f"{API}/api/v1/public/feedback/{past_booking['booking_id']}",
        json={"rating": 9},
        timeout=40,
    )
    assert response.status_code == 422


def test_feedback_before_the_class_is_refused(studio_with_class: Any) -> None:
    """The seeded class is three days out, so this asks about a future class."""
    factory = admin_factory

    with factory() as db:
        guest = Guest(studio_id=studio_with_class["studio_id"], full_name="Too Early")
        db.add(guest)
        db.flush()
        booking = Booking(
            studio_id=studio_with_class["studio_id"],
            session_id=studio_with_class["session_id"],
            guest_id=guest.id,
        )
        db.add(booking)
        db.commit()
        booking_id = booking.id

    response = httpx.put(
        f"{API}/api/v1/public/feedback/{booking_id}", json={"rating": 3}, timeout=40
    )

    assert response.status_code == 409
    assert "hasn't happened yet" in response.json()["message"]
