"""In-memory `GuestRepository`."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import replace
from datetime import date, datetime
from uuid import UUID, uuid4

from app.core.errors import NotFoundError
from app.domain.capacity import Capacity
from app.domain.guests import MessageChannel
from app.domain.scheduling import QuietHours
from app.domain.waitlist import WaitlistEntry
from app.services.guests import (
    AllergyDraft,
    AllergySnapshot,
    BookingSnapshot,
    GuestDraft,
    GuestSnapshot,
)


class FakeGuestRepository:
    def __init__(self, *, quiet_hours: QuietHours | None = None) -> None:
        self.guests: dict[UUID, GuestSnapshot] = {}
        self.bookings: dict[UUID, BookingSnapshot] = {}
        self.capacities: dict[UUID, Capacity] = {}
        self.waitlists: dict[UUID, list[WaitlistEntry]] = {}
        self.credits: list[tuple[UUID, UUID, str | None]] = []
        self.upcoming_booked: set[UUID] = set()
        self.scheduled_invites: list[tuple[UUID, UUID, datetime]] = []
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

    def list_guests(
        self, *, search: str | None = None, regulars_only: bool = False
    ) -> list[GuestSnapshot]:
        guests = list(self.guests.values())

        if search:
            needle = search.strip().lower()
            guests = [g for g in guests if needle in g.full_name.lower()]

        if regulars_only:
            guests = [g for g in guests if g.is_regular]

        return sorted(guests, key=lambda g: g.full_name.lower())

    def get_guest(self, guest_id: UUID) -> GuestSnapshot | None:
        return self.guests.get(guest_id)

    def create_guest(self, draft: GuestDraft) -> GuestSnapshot:
        guest = self.add_guest(
            full_name=draft.full_name,
            phone=draft.phone,
            email=draft.email,
            preferred_channel=draft.preferred_channel,
            birthday=draft.birthday,
            memory_note=draft.memory_note,
            visit_count=0,
        )

        if draft.allergies:
            self.add_allergies(guest.id, draft.allergies)

        return self.guests[guest.id]

    def update_guest(self, guest_id: UUID, changes: dict[str, object]) -> GuestSnapshot:
        updated = replace(self.guests[guest_id], **changes)  # type: ignore[arg-type]
        self.guests[guest_id] = updated
        return updated

    # -- allergies ----------------------------------------------------------

    def add_allergies(
        self, guest_id: UUID, drafts: Sequence[AllergyDraft]
    ) -> Sequence[AllergySnapshot]:
        """Insert allergies, skipping labels already on file (case-insensitive)."""
        guest = self.guests[guest_id]
        known = {a.label.strip().lower() for a in guest.allergies}

        added: list[AllergySnapshot] = []

        for draft in drafts:
            label = draft.label.strip()

            if not label or label.lower() in known:
                continue

            known.add(label.lower())
            added.append(
                AllergySnapshot(id=uuid4(), label=label, severity=draft.severity, notes=draft.notes)
            )

        if added:
            self.guests[guest_id] = replace(guest, allergies=(*guest.allergies, *added))

        return added

    def _allergy(self, guest_id: UUID, allergy_id: UUID) -> AllergySnapshot:
        for allergy in self.guests[guest_id].allergies:
            if allergy.id == allergy_id:
                return allergy

        raise NotFoundError("We couldn't find that.")

    def update_allergy(
        self, guest_id: UUID, allergy_id: UUID, changes: dict[str, object]
    ) -> AllergySnapshot:
        current = self._allergy(guest_id, allergy_id)
        editable = {k: v for k, v in changes.items() if k in {"label", "severity", "notes"}}
        updated = replace(current, **editable)  # type: ignore[arg-type]

        guest = self.guests[guest_id]
        self.guests[guest_id] = replace(
            guest,
            allergies=tuple(updated if a.id == allergy_id else a for a in guest.allergies),
        )

        return updated

    def remove_allergy(self, guest_id: UUID, allergy_id: UUID) -> None:
        self._allergy(guest_id, allergy_id)

        guest = self.guests[guest_id]
        self.guests[guest_id] = replace(
            guest, allergies=tuple(a for a in guest.allergies if a.id != allergy_id)
        )

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

    def save_waitlist(self, session_id: UUID, entries: Sequence[WaitlistEntry]) -> None:
        self.waitlists[session_id] = list(entries)

    def schedule_waitlist_invite(self, session_id: UUID, guest_id: UUID, send_at: datetime) -> None:
        self.scheduled_invites.append((session_id, guest_id, send_at))

    def quiet_hours(self) -> QuietHours:
        return self._quiet_hours

    def sessions_with_bookings(self, guest_ids: Sequence[UUID], after: date) -> set[UUID]:
        _ = after
        return {gid for gid in guest_ids if gid in self.upcoming_booked}


def utc(year: int, month: int, day: int, hour: int = 0) -> datetime:
    from datetime import UTC

    return datetime(year, month, day, hour, tzinfo=UTC)
