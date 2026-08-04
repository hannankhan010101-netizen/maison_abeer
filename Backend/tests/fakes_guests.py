"""In-memory `GuestRepository`."""

from __future__ import annotations

from dataclasses import replace
from datetime import date, datetime
from uuid import UUID, uuid4

from app.domain.capacity import Capacity
from app.domain.guests import MessageChannel
from app.domain.scheduling import QuietHours
from app.domain.waitlist import WaitlistEntry
from app.services.guests import BookingSnapshot, GuestDraft, GuestSnapshot


class FakeGuestRepository:
    def __init__(self, *, quiet_hours: QuietHours | None = None) -> None:
        self.guests: dict[UUID, GuestSnapshot] = {}
        self.bookings: dict[UUID, BookingSnapshot] = {}
        self.capacities: dict[UUID, Capacity] = {}
        self.waitlists: dict[UUID, list[WaitlistEntry]] = {}
        self.credits: list[tuple[UUID, UUID, str | None]] = []
        self.upcoming_booked: set[UUID] = set()
        self._quiet_hours = quiet_hours or QuietHours(timezone="UTC")

    # -- seeding ------------------------------------------------------------

    def add_guest(self, **overrides: object) -> GuestSnapshot:
        defaults: dict[str, object] = {
            "id": uuid4(),
            "full_name": "Sana R.",
            "phone": "03001234567",
            "email": None,
            "preferred_channel": MessageChannel.WHATSAPP,
            "opted_out": False,
            "visit_count": 1,
            "birthday": None,
            "memory_note": None,
            "available_credits": 0,
        }
        defaults.update(overrides)

        guest = GuestSnapshot(**defaults)  # type: ignore[arg-type]
        self.guests[guest.id] = guest
        return guest

    def add_booking(self, session_id: UUID, guest_id: UUID, **overrides: object) -> BookingSnapshot:
        defaults: dict[str, object] = {
            "id": uuid4(),
            "guest_id": guest_id,
            "session_id": session_id,
            "status": "confirmed",
            "table_number": None,
            "sit_with_note": None,
            "booking_answers": None,
        }
        defaults.update(overrides)

        booking = BookingSnapshot(**defaults)  # type: ignore[arg-type]
        self.bookings[booking.id] = booking
        return booking

    # -- GuestRepository ----------------------------------------------------

    def list_guests(self) -> list[GuestSnapshot]:
        return list(self.guests.values())

    def get_guest(self, guest_id: UUID) -> GuestSnapshot | None:
        return self.guests.get(guest_id)

    def create_guest(self, draft: GuestDraft) -> GuestSnapshot:
        return self.add_guest(
            full_name=draft.full_name,
            phone=draft.phone,
            email=draft.email,
            preferred_channel=draft.preferred_channel,
            birthday=draft.birthday,
            memory_note=draft.memory_note,
            visit_count=0,
        )

    def update_guest(self, guest_id: UUID, changes: dict[str, object]) -> GuestSnapshot:
        updated = replace(self.guests[guest_id], **changes)  # type: ignore[arg-type]
        self.guests[guest_id] = updated
        return updated

    def bookings_for_session(self, session_id: UUID) -> list[BookingSnapshot]:
        return [b for b in self.bookings.values() if b.session_id == session_id]

    def get_booking(self, booking_id: UUID) -> BookingSnapshot | None:
        return self.bookings.get(booking_id)

    def create_booking(
        self, session_id: UUID, guest_id: UUID, answers: dict[str, str] | None
    ) -> BookingSnapshot:
        return self.add_booking(session_id, guest_id, booking_answers=answers)

    def update_booking(self, booking_id: UUID, changes: dict[str, object]) -> BookingSnapshot:
        allowed = {
            k: v
            for k, v in changes.items()
            if k in {"status", "table_number", "sit_with_note", "booking_answers"}
        }
        updated = replace(self.bookings[booking_id], **allowed)  # type: ignore[arg-type]
        self.bookings[booking_id] = updated
        return updated

    def session_capacity(self, session_id: UUID) -> Capacity | None:
        return self.capacities.get(session_id)

    def issue_credit(self, guest_id: UUID, session_id: UUID, note: str | None) -> None:
        self.credits.append((guest_id, session_id, note))

    def waitlist_for_session(self, session_id: UUID) -> list[WaitlistEntry]:
        return self.waitlists.get(session_id, [])

    def save_waitlist(self, session_id: UUID, entries: list[WaitlistEntry]) -> None:
        self.waitlists[session_id] = list(entries)

    def quiet_hours(self) -> QuietHours:
        return self._quiet_hours

    def sessions_with_bookings(self, guest_ids: list[UUID], after: date) -> set[UUID]:
        _ = after
        return {gid for gid in guest_ids if gid in self.upcoming_booked}


def utc(year: int, month: int, day: int, hour: int = 0) -> datetime:
    from datetime import UTC

    return datetime(year, month, day, hour, tzinfo=UTC)
