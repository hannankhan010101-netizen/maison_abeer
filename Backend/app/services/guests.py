"""Guest, booking and waitlist orchestration.

Rules live in `app.domain.guests` and `app.domain.waitlist`; this layer loads
what they need and applies the result. Persistence sits behind a Protocol so
the orchestration is testable without a database.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

from app.core.errors import ConflictError, DuplicateGuestError, NotFoundError, ValidationError
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
from app.domain.waitlist import WaitlistStatus as DomainWaitlistStatus
from app.domain.waitlist import accept as accept_offer
from app.domain.waitlist import invite_next
from app.domain.waitlist import withdraw as withdraw_offer
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
class AllergyDraft:
    """An allergy as the host records it.

    Its own dataclass rather than the request model: this layer imports
    nothing from `app.schemas`, and the router maps across.
    """

    label: str
    severity: AllergySeverity = AllergySeverity.ALLERGY
    notes: str | None = None


@dataclass(frozen=True, slots=True)
class GuestDraft:
    full_name: str
    phone: str | None = None
    email: str | None = None
    preferred_channel: MessageChannel = MessageChannel.WHATSAPP
    birthday: date | None = None
    memory_note: str | None = None
    allergies: tuple[AllergyDraft, ...] = ()


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
    def list_guests(
        self, *, search: str | None = None, regulars_only: bool = False
    ) -> Sequence[GuestSnapshot]:
        """Every guest, or a filtered subset.

        The filters are optional and default to "everyone" because callers
        like duplicate-detection and the birthday radar need the whole
        studio, not a search result. The guest-list endpoint is the only
        caller that passes them, so the filtering — and the sort, which used
        to happen in Python after this returned — is pushed to SQL there
        rather than materialising every guest row to filter a handful out in
        the application layer.
        """
        ...

    def get_guest(self, guest_id: UUID) -> GuestSnapshot | None: ...

    def create_guest(self, draft: GuestDraft) -> GuestSnapshot: ...

    def update_guest(self, guest_id: UUID, changes: dict[str, object]) -> GuestSnapshot: ...

    # Allergies are safety-critical, so the write path is explicit rather
    # than folded into the guest PATCH allowlist.
    def add_allergies(
        self, guest_id: UUID, drafts: Sequence[AllergyDraft]
    ) -> Sequence[AllergySnapshot]: ...

    def update_allergy(
        self, guest_id: UUID, allergy_id: UUID, changes: dict[str, object]
    ) -> AllergySnapshot: ...

    def remove_allergy(self, guest_id: UUID, allergy_id: UUID) -> None: ...

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

    def schedule_waitlist_invite(self, session_id: UUID, guest_id: UUID, send_at: datetime) -> None:
        """Queue the message that makes an invite real.

        Flipping a waitlist entry to `invited` is bookkeeping; without a
        message actually queued, "their seat is held until they reply" is a
        claim nothing backs up and the guest never finds out.
        """
        ...

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
        # Filtered and sorted in SQL, not by materialising every guest row and
        # thinning it out here — a studio's guest list only grows, and it's
        # the one list in this app not bounded by a date window.
        needle = search.strip() if search else None
        return list(self._repo.list_guests(search=needle or None, regulars_only=regulars_only))

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

            merged_id = _UUID(duplicate.guest_id)

            # "Add to their history instead" has to include the allergies the
            # host just typed, or merging quietly drops safety-critical data
            # that the prompt promised to keep.
            if draft.allergies:
                self._repo.add_allergies(merged_id, draft.allergies)

            return self.get(merged_id)

        return self._repo.create_guest(draft)

    def update(self, guest_id: UUID, changes: dict[str, object]) -> GuestSnapshot:
        """Edit a guest, with the same duplicate guard `create` applies.

        Editing a phone number *into* another guest's is the same collision
        `create` refuses, and now that both entry points store normalised
        contact details the partial unique indexes would catch it — as a bare
        IntegrityError and a 500, since nothing maps that exception. Checked
        here instead, so the host gets the merge prompt rather than a crash.
        """
        current = self.get(guest_id)

        # No `if v is not None` filter. The route already uses
        # `exclude_unset`, which is what distinguishes "left alone" from
        # "deliberately cleared" — dropping the Nones on top of that made
        # clearing a wrong email, a wrong birthday or a stale memory note
        # return 200 with the old value still stored.
        applied = dict(changes)

        phone = applied.get("phone", current.phone)
        email = applied.get("email", current.email)
        channel = applied.get("preferred_channel", current.preferred_channel)

        # The merged state, not the patch. `GuestCreate` validates this pair
        # and `GuestUpdate` cannot, because either half may be absent — so a
        # PATCH could set the channel to email on a guest with no email and
        # produce someone the send pipeline silently skips forever.
        if channel is MessageChannel.EMAIL and not email and phone:
            raise ValidationError("You picked email, but there's only a phone number on file.")

        if channel is MessageChannel.WHATSAPP and not phone and email:
            raise ValidationError("You picked WhatsApp, but there's only an email on file.")

        if "phone" in applied or "email" in applied:
            candidate = GuestIdentity(
                guest_id=str(guest_id),
                full_name=current.full_name,
                phone=phone if isinstance(phone, str) else None,
                email=email if isinstance(email, str) else None,
            )

            # `find_duplicate` skips the candidate's own id, so re-saving a
            # guest's existing number is not a duplicate of themselves.
            duplicate = find_duplicate(candidate, [g.identity() for g in self._repo.list_guests()])

            if duplicate is not None:
                raise DuplicateGuestError(
                    f"{duplicate.full_name} already has those details. "
                    f"Merge the two records instead of pointing both at the same person?"
                )

        return self._repo.update_guest(guest_id, applied)

    # -- allergies ----------------------------------------------------------

    def add_allergy(self, guest_id: UUID, draft: AllergyDraft) -> AllergySnapshot:
        """Record one allergy against a guest.

        The read side of this — the red chip on the roster, the critical count,
        the day-of alert — was fully built and had nothing to read: the only
        allergy that could exist was one a guest typed into the public booking
        form, so a host told about a severe nut allergy on the phone had
        nowhere to put it.
        """
        self.get(guest_id)

        added = self._repo.add_allergies(guest_id, [draft])

        if added:
            return added[0]

        # Nothing inserted means the label was already on file — answer with
        # the record that stands, so re-adding is idempotent rather than an
        # error the host has to interpret.
        wanted = draft.label.strip().lower()
        existing = [a for a in self.get(guest_id).allergies if a.label.strip().lower() == wanted]

        if not existing:
            # Neither inserted nor present: the label was blank, which the
            # schema rejects before it reaches here.
            raise ValidationError("An allergy needs a label.")

        return existing[0]

    def edit_allergy(
        self, guest_id: UUID, allergy_id: UUID, changes: dict[str, object]
    ) -> AllergySnapshot:
        """Correct a severity or a note. A wrong severity is a safety problem."""
        self.get(guest_id)
        return self._repo.update_allergy(guest_id, allergy_id, changes)

    def delete_allergy(self, guest_id: UUID, allergy_id: UUID) -> None:
        self.get(guest_id)
        self._repo.remove_allergy(guest_id, allergy_id)

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

        if decision.invited is not None:
            assert decision.send_at is not None  # someone was invited, so a send time exists

            from uuid import UUID as _UUID

            self._repo.schedule_waitlist_invite(
                session_id, _UUID(decision.invited.guest_id), decision.send_at
            )

        return decision

    def _live_invite(self, session_id: UUID, guest_id: UUID) -> WaitlistEntry:
        """This guest's open offer, or a refusal.

        Shared by accept and decline so both give the same answer to "there
        is nothing to act on" — no invite at all, or one somebody already
        answered, or one whose 12-hour hold has quietly lapsed.
        """
        entries = self._repo.waitlist_for_session(session_id)
        entry = next((e for e in entries if e.guest_id == str(guest_id)), None)

        if entry is None or entry.status is not DomainWaitlistStatus.INVITED:
            raise NotFoundError("We couldn't find an open invite for you on that class.")

        if entry.has_expired(self._now):
            raise ConflictError("That invite has expired — ask your studio for another one.")

        return entry

    def accept_waitlist_offer(self, session_id: UUID, guest_id: UUID) -> BookingSnapshot:
        """Turn a held offer into a real seat."""
        entry = self._live_invite(session_id, guest_id)

        entries = list(self._repo.waitlist_for_session(session_id))
        self._repo.save_waitlist(session_id, accept_offer(entries, entry.entry_id))

        return self._repo.create_booking(session_id, guest_id, answers=None)

    def decline_waitlist_offer(self, session_id: UUID, guest_id: UUID) -> None:
        """Free the held seat and pass it to the next person in line."""
        entry = self._live_invite(session_id, guest_id)

        entries = list(self._repo.waitlist_for_session(session_id))
        self._repo.save_waitlist(session_id, withdraw_offer(entries, entry.entry_id))

        # A declined seat does not sit empty until a host next opens the
        # dashboard — the next person in line is offered it immediately.
        self.invite_next_guest(session_id)

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
