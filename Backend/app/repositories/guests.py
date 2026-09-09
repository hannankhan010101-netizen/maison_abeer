"""SQLAlchemy implementation of `GuestRepository`.

Same rule as the session repository: reads go through `TenantSession.query`,
and the few hand-written statements name `studio_id` explicitly.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.errors import NotFoundError
from app.domain.capacity import Capacity
from app.domain.messages import render
from app.domain.scheduling import QuietHours
from app.domain.waitlist import WaitlistEntry as DomainWaitlistEntry
from app.domain.waitlist import WaitlistStatus as DomainWaitlistStatus
from app.models.enums import (
    BookingStatus,
    CreditStatus,
    MessageKind,
    MessageStatus,
    SessionStatus,
    WaitlistStatus,
)
from app.models.guest import Guest, GuestCredit
from app.models.session import Booking, ScheduledMessage, Session, WaitlistEntry
from app.models.studio import StudioSettings
from app.services.guests import (
    AllergySnapshot,
    BookingSnapshot,
    GuestDraft,
    GuestSnapshot,
)

if TYPE_CHECKING:
    from collections.abc import Sequence
    from datetime import date
    from uuid import UUID

    from app.core.db import TenantSession

SEAT_OCCUPYING = (
    BookingStatus.CONFIRMED,
    BookingStatus.ATTENDED,
    BookingStatus.NO_SHOW,
)


class SqlGuestRepository:
    def __init__(self, db: TenantSession) -> None:
        self._db = db

    # -- guests -------------------------------------------------------------

    def _snapshot(self, guest: Guest, credits: int | None = None) -> GuestSnapshot:
        """One guest as the service sees them.

        `credits` is passed in by the list path, which counts every guest's
        credits in a single grouped query. Left None — the single-guest path —
        it falls back to one query, which is correct when there is one guest
        to ask about.
        """
        return GuestSnapshot(
            id=guest.id,
            full_name=guest.full_name,
            phone=guest.phone,
            email=guest.email,
            preferred_channel=guest.preferred_channel,
            opted_out=guest.opted_out,
            visit_count=guest.visit_count,
            birthday=guest.birthday,
            memory_note=guest.memory_note,
            available_credits=(
                credits if credits is not None else self._available_credits(guest.id)
            ),
            allergies=tuple(
                AllergySnapshot(
                    id=allergy.id,
                    label=allergy.label,
                    severity=allergy.severity,
                    notes=allergy.notes,
                )
                # Severe first: the roster and the day-of alert both read the
                # first entry when they only have room for one.
                for allergy in sorted(
                    guest.allergies,
                    key=lambda item: (not item.is_critical, item.label),
                )
            ),
        )

    def _available_credits(self, guest_id: UUID) -> int:
        statement = self._db.query(GuestCredit).where(
            GuestCredit.guest_id == guest_id,
            GuestCredit.status == CreditStatus.AVAILABLE,
        )
        return len(self._db.scalars(statement))

    def _credits_by_guest(self) -> dict[UUID, int]:
        """Every guest's available credit count, in one grouped query.

        The per-guest version cost one round trip each. At thirty-four guests
        against a hosted database that was five to six seconds to open the
        roster — the slowest screen in the app, and the one the host opens
        most.
        """
        # `raw.execute` bypasses the tenant scoping that `self._db.query()`
        # applies, so `studio_id` has to be named here explicitly. Without it
        # this counts credits belonging to every studio — which is exactly
        # what `test_every_hand_written_select_names_studio_id` exists to
        # catch, and did.
        rows = self._db.raw.execute(
            select(GuestCredit.guest_id, func.count(GuestCredit.id))
            .where(
                GuestCredit.studio_id == self._db.studio_id,
                GuestCredit.status == CreditStatus.AVAILABLE,
            )
            .group_by(GuestCredit.guest_id)
        ).all()

        return {row[0]: int(row[1]) for row in rows}

    def list_guests(self) -> Sequence[GuestSnapshot]:
        # selectinload, not lazy loading: the roster renders every guest's
        # allergy chips, so the default would fire one query per guest.
        #
        # Credits needed the same treatment and had not had it — see
        # `_credits_by_guest`.
        statement = (
            self._db.query(Guest)
            .where(Guest.archived_at.is_(None))
            .options(selectinload(Guest.allergies))
        )

        credits = self._credits_by_guest()

        return [
            self._snapshot(guest, credits.get(guest.id, 0)) for guest in self._db.scalars(statement)
        ]

    def get_guest(self, guest_id: UUID) -> GuestSnapshot | None:
        guest = self._db.get(Guest, guest_id)
        return None if guest is None else self._snapshot(guest)

    def create_guest(self, draft: GuestDraft) -> GuestSnapshot:
        guest = Guest(
            full_name=draft.full_name,
            phone=draft.phone,
            email=draft.email,
            preferred_channel=draft.preferred_channel,
            birthday=draft.birthday,
            memory_note=draft.memory_note,
            visit_count=0,
        )

        self._db.add(guest)
        self._db.flush()

        return self._snapshot(guest)

    def update_guest(self, guest_id: UUID, changes: dict[str, object]) -> GuestSnapshot:
        guest = self._db.get_or_404(Guest, guest_id)

        # Explicit allowlist: a caller must never be able to set studio_id,
        # visit_count or archived_at through a PATCH body.
        editable = {
            "full_name",
            "phone",
            "email",
            "preferred_channel",
            "birthday",
            "memory_note",
            "opted_out",
        }

        for field, value in changes.items():
            if field in editable:
                setattr(guest, field, value)

        self._db.flush()
        return self._snapshot(guest)

    # -- bookings -----------------------------------------------------------

    def _booking_snapshot(self, booking: Booking) -> BookingSnapshot:
        return BookingSnapshot(
            id=booking.id,
            guest_id=booking.guest_id,
            session_id=booking.session_id,
            status=booking.status.value,
            table_number=booking.table_number,
            sit_with_note=booking.sit_with_note,
            booking_answers=booking.booking_answers,
        )

    def bookings_for_session(self, session_id: UUID) -> Sequence[BookingSnapshot]:
        statement = self._db.query(Booking).where(Booking.session_id == session_id)
        return [self._booking_snapshot(b) for b in self._db.scalars(statement)]

    def get_booking(self, booking_id: UUID) -> BookingSnapshot | None:
        booking = self._db.get(Booking, booking_id)
        return None if booking is None else self._booking_snapshot(booking)

    def create_booking(
        self, session_id: UUID, guest_id: UUID, answers: dict[str, str] | None
    ) -> BookingSnapshot:
        booking = Booking(
            session_id=session_id,
            guest_id=guest_id,
            booking_answers=answers,
            status=BookingStatus.CONFIRMED,
        )

        self._db.add(booking)

        # Visit count is denormalised for the roster's "3rd visit" badge, so
        # it moves with the booking rather than being recounted per render.
        guest = self._db.get_or_404(Guest, guest_id)
        guest.visit_count += 1

        self._db.flush()
        return self._booking_snapshot(booking)

    def update_booking(self, booking_id: UUID, changes: dict[str, object]) -> BookingSnapshot:
        booking = self._db.get_or_404(Booking, booking_id)

        previous_status = booking.status

        for field, value in changes.items():
            if field == "status" and isinstance(value, str):
                booking.status = BookingStatus(value)
            elif field in {"table_number", "sit_with_note", "booking_answers", "cancelled_at"}:
                setattr(booking, field, value)

        # Cancelling gives the visit back, so a cancelled class does not
        # inflate someone into a "regular" they never became.
        if (
            previous_status is not BookingStatus.CANCELLED
            and booking.status is BookingStatus.CANCELLED
        ):
            guest = self._db.get_or_404(Guest, booking.guest_id)
            guest.visit_count = max(0, guest.visit_count - 1)

        self._db.flush()
        return self._booking_snapshot(booking)

    def session_capacity(self, session_id: UUID) -> Capacity | None:
        session = self._db.get(Session, session_id)

        if session is None:
            return None

        booked = self._db.raw.execute(
            select(Booking.id).where(
                Booking.studio_id == self._db.studio_id,
                Booking.session_id == session_id,
                Booking.status.in_(SEAT_OCCUPYING),
            )
        ).all()

        return Capacity(
            seats=session.seats,
            booked=len(booked),
            locked=session.status is SessionStatus.LOCKED,
        )

    def issue_credit(self, guest_id: UUID, session_id: UUID, note: str | None) -> None:
        self._db.add(
            GuestCredit(
                guest_id=guest_id,
                issued_for_session_id=session_id,
                status=CreditStatus.AVAILABLE,
                note=note,
            )
        )
        self._db.flush()

    # -- waitlist -----------------------------------------------------------

    def waitlist_for_session(self, session_id: UUID) -> Sequence[DomainWaitlistEntry]:
        statement = (
            self._db.query(WaitlistEntry)
            .where(WaitlistEntry.session_id == session_id)
            .order_by(WaitlistEntry.position)
        )

        entries = self._db.scalars(statement)
        guests = {g.id: g for g in self._db.scalars(self._db.query(Guest))}

        return [
            DomainWaitlistEntry(
                entry_id=str(entry.id),
                guest_id=str(entry.guest_id),
                position=entry.position,
                status=DomainWaitlistStatus(entry.status.value),
                invited_at=entry.invited_at,
                invite_expires_at=entry.invite_expires_at,
                contactable=(
                    guests[entry.guest_id].is_contactable if entry.guest_id in guests else False
                ),
            )
            for entry in entries
        ]

    def save_waitlist(self, session_id: UUID, entries: Sequence[DomainWaitlistEntry]) -> None:
        from uuid import UUID as _UUID

        stored = {
            str(e.id): e
            for e in self._db.scalars(
                self._db.query(WaitlistEntry).where(WaitlistEntry.session_id == session_id)
            )
        }

        for entry in entries:
            row = stored.get(entry.entry_id)

            if row is None:
                raise NotFoundError("That waitlist entry no longer exists.")

            row.position = entry.position
            row.status = WaitlistStatus(entry.status.value)
            row.invited_at = entry.invited_at
            row.invite_expires_at = entry.invite_expires_at

            _ = _UUID  # kept explicit: ids are compared as strings above

        self._db.flush()

    def schedule_waitlist_invite(self, session_id: UUID, guest_id: UUID, send_at: datetime) -> None:
        session = self._db.get_or_404(Session, session_id)
        guest = self._db.get_or_404(Guest, guest_id)

        settings = self._db.scalars(self._db.query(StudioSettings))
        voice = settings[0].default_voice.value if settings else "soft_sweet"

        body = render(
            "waitlist_invite",
            voice,
            {
                "class_name": session.class_type.name if session.class_type else "your class",
                "date": session.starts_at.strftime("%a %d %b"),
            },
        )

        self._db.add(
            ScheduledMessage(
                session_id=session_id,
                guest_id=guest_id,
                kind=MessageKind.WAITLIST_INVITE,
                channel=guest.preferred_channel,
                status=MessageStatus.SCHEDULED,
                send_at=send_at,
                body=body,
            )
        )
        self._db.flush()

    # -- studio -------------------------------------------------------------

    def quiet_hours(self) -> QuietHours:
        settings = self._db.scalars(self._db.query(StudioSettings))

        if not settings:
            return QuietHours()

        row = settings[0]
        return QuietHours(
            start=row.quiet_hours_start,
            end=row.quiet_hours_end,
            timezone=row.timezone,
        )

    def sessions_with_bookings(self, guest_ids: Sequence[UUID], after: date) -> set[UUID]:
        """Which of these guests have a booking on an upcoming class."""
        if not guest_ids:
            return set()

        rows = self._db.raw.execute(
            select(Booking.guest_id)
            .join(Session, Session.id == Booking.session_id)
            .where(
                Booking.studio_id == self._db.studio_id,
                Booking.guest_id.in_(list(guest_ids)),
                Booking.status.in_(SEAT_OCCUPYING),
                Session.starts_at >= after,
            )
        ).all()

        return {row[0] for row in rows}
