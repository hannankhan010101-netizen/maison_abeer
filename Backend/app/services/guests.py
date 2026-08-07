"""Guest, booking and waitlist orchestration.

Rules live in `app.domain.guests` and `app.domain.waitlist`; this layer loads
what they need and applies the result. Persistence sits behind a Protocol so
the orchestration is testable without a database.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

from app.core.errors import ConflictError, DuplicateGuestError, NotFoundError
from app.domain.guests import (
    GuestIdentity,
    MessageChannel,
    days_until_birthday,
    find_duplicate,
    is_contactable,
    is_regular,
    upcoming_birthdays,
    visit_badge,
)
from app.domain.waitlist import invite_next
from app.models.enums import AllergySeverity

if TYPE_CHECKING:
    from collections.abc import Sequence
    from datetime import date, datetime
    from uuid import UUID

    from app.domain.capacity import Capacity
    from app.domain.scheduling import QuietHours
    from app.domain.waitlist import InviteDecision, WaitlistEntry


@dataclass(frozen=True, slots=True)
class AllergySnapshot:
    """An allergy as the UI needs it.

    `is_critical` is derived here rather than stored, so the rule that decides
    what gets a red chip and a day-of alert lives in exactly one place.
    """

    id: UUID
    label: str
    severity: AllergySeverity
    notes: str | None = None

    @property
    def is_critical(self) -> bool:
        return self.severity in {AllergySeverity.ALLERGY, AllergySeverity.SEVERE}


@dataclass(frozen=True, slots=True)
class GuestSnapshot:
    id: UUID
    full_name: str
    phone: str | None
    email: str | None
    preferred_channel: MessageChannel
    opted_out: bool
    visit_count: int
    birthday: date | None
    memory_note: str | None
    available_credits: int = 0
    allergies: tuple[AllergySnapshot, ...] = ()

    @property
    def has_critical_allergy(self) -> bool:
        return any(allergy.is_critical for allergy in self.allergies)

    @property
    def is_contactable(self) -> bool:
        return is_contactable(
            channel=self.preferred_channel,
            phone=self.phone,
            email=self.email,
            opted_out=self.opted_out,
        )

    @property
    def visit_badge(self) -> str | None:
        return visit_badge(self.visit_count)

    @property
    def is_regular(self) -> bool:
        return is_regular(self.visit_count)

    def days_until_birthday(self, today: date) -> int | None:
        if self.birthday is None:
            return None
        return days_until_birthday(self.birthday, today)

    def identity(self) -> GuestIdentity:
        return GuestIdentity(
            guest_id=str(self.id), full_name=self.full_name, phone=self.phone, email=self.email
        )


@dataclass(frozen=True, slots=True)
class GuestDraft:
    full_name: str
    phone: str | None = None
    email: str | None = None
    preferred_channel: MessageChannel = MessageChannel.WHATSAPP
    birthday: date | None = None
    memory_note: str | None = None


@dataclass(frozen=True, slots=True)
class BookingSnapshot:
    id: UUID
    guest_id: UUID
    session_id: UUID
    status: str
    table_number: int | None
    sit_with_note: str | None
    booking_answers: dict[str, str] | None


class GuestRepository(Protocol):
    def list_guests(self) -> Sequence[GuestSnapshot]: ...

    def get_guest(self, guest_id: UUID) -> GuestSnapshot | None: ...

    def create_guest(self, draft: GuestDraft) -> GuestSnapshot: ...

    def update_guest(self, guest_id: UUID, changes: dict[str, object]) -> GuestSnapshot: ...

    def bookings_for_session(self, session_id: UUID) -> Sequence[BookingSnapshot]: ...

    def get_booking(self, booking_id: UUID) -> BookingSnapshot | None: ...

    def create_booking(
        self, session_id: UUID, guest_id: UUID, answers: dict[str, str] | None
    ) -> BookingSnapshot: ...

    def update_booking(self, booking_id: UUID, changes: dict[str, object]) -> BookingSnapshot: ...

    def session_capacity(self, session_id: UUID) -> Capacity | None: ...

    def issue_credit(self, guest_id: UUID, session_id: UUID, note: str | None) -> None: ...

    def waitlist_for_session(self, session_id: UUID) -> Sequence[WaitlistEntry]: ...

    def save_waitlist(self, session_id: UUID, entries: Sequence[WaitlistEntry]) -> None: ...

    def quiet_hours(self) -> QuietHours: ...

    def sessions_with_bookings(self, guest_ids: Sequence[UUID], after: date) -> set[UUID]: ...


@dataclass(frozen=True, slots=True)
class BirthdayEntry:
    guest: GuestSnapshot
    days_away: int
    has_upcoming_booking: bool


class GuestService:
    def __init__(self, repository: GuestRepository, *, now: datetime) -> None:
        self._repo = repository
        self._now = now

    @property
    def today(self) -> date:
        return self._now.date()

    # -- guests -------------------------------------------------------------

    def get(self, guest_id: UUID) -> GuestSnapshot:
        guest = self._repo.get_guest(guest_id)

        if guest is None:
            raise NotFoundError("We couldn't find that guest.")

        return guest

    def list_guests(
        self, *, regulars_only: bool = False, search: str | None = None
    ) -> list[GuestSnapshot]:
        guests = list(self._repo.list_guests())

        if regulars_only:
            guests = [g for g in guests if g.is_regular]

        if search:
            needle = search.strip().lower()
            guests = [g for g in guests if needle in g.full_name.lower()]

        return sorted(guests, key=lambda g: g.full_name.lower())

    def create(self, draft: GuestDraft, *, merge_duplicates: bool = False) -> GuestSnapshot:
        """Add a guest, refusing to fragment an existing person's history.

        A duplicate is a 409 by default rather than a silent merge: the host
        should decide, because merging blends allergy records.
        """
        candidate = GuestIdentity(
            guest_id="new", full_name=draft.full_name, phone=draft.phone, email=draft.email
        )
        existing = [g.identity() for g in self._repo.list_guests()]

        duplicate = find_duplicate(candidate, existing)

        if duplicate is not None:
            if not merge_duplicates:
                raise DuplicateGuestError(
                    f"{duplicate.full_name} is already in your guests with those details. "
                    f"Add to their history instead of starting a new record?"
                )
            from uuid import UUID as _UUID

            return self.get(_UUID(duplicate.guest_id))

        return self._repo.create_guest(draft)

    def update(self, guest_id: UUID, changes: dict[str, object]) -> GuestSnapshot:
        self.get(guest_id)
        return self._repo.update_guest(
            guest_id, {k: v for k, v in changes.items() if v is not None}
        )

    # -- bookings -----------------------------------------------------------

    def roster(self, session_id: UUID) -> list[BookingSnapshot]:
        return list(self._repo.bookings_for_session(session_id))

    def book(
        self, session_id: UUID, guest_id: UUID, answers: dict[str, str] | None
    ) -> BookingSnapshot:
        self.get(guest_id)

        capacity = self._repo.session_capacity(session_id)
        if capacity is None:
            raise NotFoundError("We couldn't find that class.")

        if not capacity.accepts_bookings:
            # Locked or full — the waitlist is the path forward, not an error
            # the host can fix by retrying.
            raise ConflictError("That class is fully booked. Add them to the waitlist instead?")

        already = [
            b
            for b in self._repo.bookings_for_session(session_id)
            if b.guest_id == guest_id and b.status != "cancelled"
        ]
        if already:
            raise ConflictError("They're already booked into this class.")

        return self._repo.create_booking(session_id, guest_id, answers)

    def assign_table(
        self, booking_id: UUID, table_number: int | None, sit_with_note: str | None
    ) -> BookingSnapshot:
        booking = self._repo.get_booking(booking_id)

        if booking is None:
            raise NotFoundError("We couldn't find that booking.")

        return self._repo.update_booking(
            booking_id, {"table_number": table_number, "sit_with_note": sit_with_note}
        )

    def cancel(self, booking_id: UUID, resolution: str, note: str | None) -> BookingSnapshot:
        """Cancel a booking, optionally turning it into a rain-check credit.

        PRD §2.4 frames this as a retention moment rather than an awkward
        refund conversation.
        """
        booking = self._repo.get_booking(booking_id)

        if booking is None:
            raise NotFoundError("We couldn't find that booking.")

        if booking.status == "cancelled":
            raise ConflictError("That booking is already cancelled.")

        updated = self._repo.update_booking(
            booking_id, {"status": "cancelled", "cancelled_at": self._now}
        )

        if resolution == "credit":
            self._repo.issue_credit(booking.guest_id, booking.session_id, note)

        return updated

    def unassigned_count(self, session_id: UUID) -> int:
        return sum(
            1
            for b in self._repo.bookings_for_session(session_id)
            if b.table_number is None and b.status != "cancelled"
        )

    # -- waitlist -----------------------------------------------------------

    def waitlist(self, session_id: UUID) -> list[WaitlistEntry]:
        return list(self._repo.waitlist_for_session(session_id))

    def invite_next_guest(self, session_id: UUID) -> InviteDecision:
        """Offer a freed seat to the next person in line."""
        capacity = self._repo.session_capacity(session_id)

        if capacity is None:
            raise NotFoundError("We couldn't find that class.")

        entries = list(self._repo.waitlist_for_session(session_id))

        updated, decision = invite_next(
            entries,
            now=self._now,
            quiet_hours=self._repo.quiet_hours(),
            seats_available=capacity.available,
        )

        # Expiries are persisted even when nobody new could be invited, so a
        # lapsed hold does not block the queue forever.
        if updated != entries:
            self._repo.save_waitlist(session_id, updated)

        return decision

    # -- birthday radar -----------------------------------------------------

    def birthday_radar(self) -> list[BirthdayEntry]:
        """Guests with a birthday inside the 30-day window, soonest first."""
        guests = {g.id: g for g in self._repo.list_guests()}
        pairs = [(str(gid), g.birthday) for gid, g in guests.items()]

        upcoming = upcoming_birthdays(pairs, self.today)

        from uuid import UUID as _UUID

        guest_ids = [_UUID(gid) for gid, _ in upcoming]
        booked = self._repo.sessions_with_bookings(guest_ids, self.today)

        return [
            BirthdayEntry(
                guest=guests[_UUID(gid)],
                days_away=days_away,
                has_upcoming_booking=_UUID(gid) in booked,
            )
            for gid, days_away in upcoming
        ]
