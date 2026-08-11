"""What the guest portal is allowed to expose.

Guests can now see each other, which is new and is the part of this feature
most likely to cause real harm. These are weighted almost entirely towards
what must *not* appear: a phone number, an allergy, a memory note, or anyone
else's booking.

The response schemas are the boundary — `PortalWorkshop` and `AttendeePeek`
have no field for contact details, so there is nothing to populate by mistake.
These assert that the boundary holds and that the display-name rule does what
it claims.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.api.v1.portal import display_name_for, status_for
from app.models.enums import SessionStatus
from app.models.guest import Guest
from app.models.session import Session
from app.schemas.guest_portal import AttendeePeek, PortalWorkshop, PortalWorkshopDetail

NOW = datetime(2026, 8, 11, 12, 0, tzinfo=UTC)


def guest(full_name: str, display_name: str | None = None) -> Guest:
    row = Guest(full_name=full_name, display_name=display_name)
    row.id = uuid4()
    return row


def session(*, starts: datetime, ends: datetime, status: SessionStatus) -> Session:
    row = Session(starts_at=starts, ends_at=ends, status=status, seats=10)
    row.id = uuid4()
    return row


# ---------------------------------------------------------------------------
# What other guests are shown
# ---------------------------------------------------------------------------


def test_a_full_name_becomes_first_name_and_initial() -> None:
    """A roster of full names is the host's data, not the room's."""
    assert display_name_for(guest("Sana Riaz")) == "Sana R."


def test_a_middle_name_does_not_leak_the_surname() -> None:
    assert display_name_for(guest("Ayesha Noor Khan")) == "Ayesha K."


def test_a_single_name_is_left_alone() -> None:
    assert display_name_for(guest("Meerab")) == "Meerab"


def test_a_guest_can_choose_their_own_name() -> None:
    assert display_name_for(guest("Sana Riaz", display_name="sana ✨")) == "sana ✨"


def test_a_blank_name_does_not_crash_the_room() -> None:
    assert display_name_for(guest("   ")) == "Someone"


def test_an_attendee_carries_no_contact_details() -> None:
    """There is no field here to populate — that is the point of the schema."""
    fields = set(AttendeePeek.model_fields)

    assert fields == {"guest_id", "display_name", "is_you"}
    assert "phone" not in fields
    assert "email" not in fields
    assert "allergies" not in fields
    assert "memory_note" not in fields


def test_a_workshop_carries_no_host_only_data() -> None:
    for model in (PortalWorkshop, PortalWorkshopDetail):
        fields = set(model.model_fields)

        # Capacity, revenue and the roster's private annotations are the
        # host's business, not a guest's.
        assert "seats" not in fields
        assert "unassigned_guest_count" not in fields
        assert "capacity" not in fields


def test_the_serialised_detail_leaks_nothing() -> None:
    """Belt and braces: check the JSON, not just the field list."""
    detail = PortalWorkshopDetail(
        session_id=uuid4(),
        booking_id=uuid4(),
        name="Bento cake decorating",
        starts_at=NOW,
        ends_at=NOW + timedelta(hours=2),
        location="Studio A",
        color_token="pink",  # noqa: S106 - a palette token, not a secret
        status="upcoming",
        attendee_count=2,
        attendees=[AttendeePeek(guest_id=uuid4(), display_name="Sana R.")],
        others_count=1,
    )

    body = detail.model_dump_json().lower()

    for forbidden in ("phone", "allerg", "memory", "0300", "@"):
        assert forbidden not in body, f"{forbidden!r} reached a guest response"


# ---------------------------------------------------------------------------
# Status, decided server-side
# ---------------------------------------------------------------------------


def test_a_future_class_is_upcoming() -> None:
    item = session(
        starts=NOW + timedelta(days=2),
        ends=NOW + timedelta(days=2, hours=2),
        status=SessionStatus.SCHEDULED,
    )
    assert status_for(item, NOW) == "upcoming"


def test_a_class_in_progress_is_live() -> None:
    """The window is inclusive of the start and exclusive of the end."""
    item = session(
        starts=NOW - timedelta(minutes=30),
        ends=NOW + timedelta(hours=1),
        status=SessionStatus.SCHEDULED,
    )
    assert status_for(item, NOW) == "live"


def test_a_class_becomes_live_exactly_at_its_start() -> None:
    item = session(starts=NOW, ends=NOW + timedelta(hours=2), status=SessionStatus.SCHEDULED)
    assert status_for(item, NOW) == "live"


def test_a_finished_class_is_completed() -> None:
    item = session(
        starts=NOW - timedelta(hours=3),
        ends=NOW - timedelta(hours=1),
        status=SessionStatus.SCHEDULED,
    )
    assert status_for(item, NOW) == "completed"


def test_a_class_completes_the_moment_it_ends() -> None:
    item = session(starts=NOW - timedelta(hours=2), ends=NOW, status=SessionStatus.SCHEDULED)
    assert status_for(item, NOW) == "completed"


def test_a_cancelled_class_says_so_whatever_the_clock_says() -> None:
    """Otherwise a cancelled class still shows a countdown, which is a lie."""
    item = session(
        starts=NOW + timedelta(days=1),
        ends=NOW + timedelta(days=1, hours=2),
        status=SessionStatus.CANCELLED,
    )
    assert status_for(item, NOW) == "cancelled"


def test_a_locked_class_is_still_upcoming() -> None:
    """Locked closes bookings; it does not change what the guest sees."""
    item = session(
        starts=NOW + timedelta(days=1),
        ends=NOW + timedelta(days=1, hours=2),
        status=SessionStatus.LOCKED,
    )
    assert status_for(item, NOW) == "upcoming"
