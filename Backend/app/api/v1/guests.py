"""Guest, booking and waitlist endpoints."""

from __future__ import annotations

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.schemas.guest import (
    AllergyRead,
    BirthdayRead,
    BookingCreate,
    BookingRead,
    CancelBooking,
    GuestCreate,
    GuestRead,
    GuestUpdate,
    InviteResult,
    RosterRead,
    TableAssignment,
)
from app.services.guests import GuestDraft, GuestService, GuestSnapshot

router = APIRouter(tags=["guests"])


def get_guest_service() -> GuestService:  # pragma: no cover - overridden in wiring
    raise NotImplementedError("Guest service provider is not configured.")


Service = Annotated[GuestService, Depends(get_guest_service)]


def _to_read(guest: GuestSnapshot, *, today: date) -> GuestRead:
    """Serialise a guest.

    `today` is passed in rather than read from the clock here: the service
    already holds the request's reference time, and deriving it twice invites
    the two answers to disagree across a midnight boundary.
    """
    return GuestRead(
        id=guest.id,
        full_name=guest.full_name,
        phone=guest.phone,
        email=guest.email,
        preferred_channel=guest.preferred_channel,
        opted_out=guest.opted_out,
        is_contactable=guest.is_contactable,
        visit_count=guest.visit_count,
        visit_badge=guest.visit_badge,
        is_regular=guest.is_regular,
        birthday=guest.birthday,
        days_until_birthday=guest.days_until_birthday(today),
        memory_note=guest.memory_note,
        allergies=[
            AllergyRead(
                id=allergy.id,
                label=allergy.label,
                severity=allergy.severity,
                notes=allergy.notes,
                is_critical=allergy.is_critical,
            )
            for allergy in guest.allergies
        ],
        available_credits=guest.available_credits,
    )


# ---------------------------------------------------------------------------
# Guests
# ---------------------------------------------------------------------------


@router.get("/guests", response_model=list[GuestRead])
def list_guests(
    service: Service,
    search: Annotated[str | None, Query(max_length=120)] = None,
    regulars_only: bool = False,
) -> list[GuestRead]:
    """The roster's guest list, searchable and filterable (PRD §2.4)."""
    return [
        _to_read(guest, today=service.today)
        for guest in service.list_guests(regulars_only=regulars_only, search=search)
    ]


@router.get("/guests/birthdays", response_model=list[BirthdayRead])
def birthday_radar(service: Service) -> list[BirthdayRead]:
    """Thirty-day birthday lookahead, soonest first."""
    return [
        BirthdayRead(
            guest_id=entry.guest.id,
            full_name=entry.guest.full_name,
            birthday=entry.guest.birthday,
            days_away=entry.days_away,
            has_upcoming_booking=entry.has_upcoming_booking,
        )
        for entry in service.birthday_radar()
    ]


@router.get("/guests/{guest_id}", response_model=GuestRead)
def get_guest(guest_id: UUID, service: Service) -> GuestRead:
    return _to_read(service.get(guest_id), today=service.today)


@router.post("/guests", response_model=GuestRead, status_code=status.HTTP_201_CREATED)
def create_guest(
    payload: GuestCreate,
    service: Service,
    merge_duplicates: Annotated[
        bool, Query(description="Add to an existing guest's history instead of failing")
    ] = False,
) -> GuestRead:
    """Add a guest.

    A duplicate returns 409 by default rather than merging silently — merging
    blends allergy records, so the host decides.
    """
    guest = service.create(
        GuestDraft(
            full_name=payload.full_name,
            phone=payload.phone,
            email=payload.email,
            preferred_channel=payload.preferred_channel,
            birthday=payload.birthday,
            memory_note=payload.memory_note,
        ),
        merge_duplicates=merge_duplicates,
    )

    return _to_read(guest, today=service.today)


@router.patch("/guests/{guest_id}", response_model=GuestRead)
def update_guest(guest_id: UUID, payload: GuestUpdate, service: Service) -> GuestRead:
    updated = service.update(guest_id, payload.model_dump(exclude_unset=True))
    return _to_read(updated, today=service.today)


# ---------------------------------------------------------------------------
# Roster and bookings
# ---------------------------------------------------------------------------


@router.get("/sessions/{session_id}/roster", response_model=RosterRead)
def get_roster(session_id: UUID, service: Service) -> RosterRead:
    bookings = service.roster(session_id)
    guests = {g.id: g for g in service.list_guests()}

    # Counted over the people actually in the room, not the whole guest book:
    # this drives the day-of allergy banner for *this* class.
    seated = [
        guests[booking.guest_id]
        for booking in bookings
        if booking.guest_id in guests and booking.status != "cancelled"
    ]

    return RosterRead(
        session_id=session_id,
        bookings=[
            BookingRead(
                id=booking.id,
                guest=_to_read(guests[booking.guest_id], today=service.today),
                status=booking.status,
                table_number=booking.table_number,
                sit_with_note=booking.sit_with_note,
                booking_answers=booking.booking_answers,
            )
            for booking in bookings
            if booking.guest_id in guests
        ],
        unassigned_count=service.unassigned_count(session_id),
        critical_allergy_count=sum(1 for guest in seated if guest.has_critical_allergy),
    )


@router.post(
    "/sessions/{session_id}/bookings",
    response_model=BookingRead,
    status_code=status.HTTP_201_CREATED,
)
def create_booking(session_id: UUID, payload: BookingCreate, service: Service) -> BookingRead:
    booking = service.book(session_id, payload.guest_id, payload.booking_answers)
    guest = service.get(payload.guest_id)

    return BookingRead(
        id=booking.id,
        guest=_to_read(guest, today=service.today),
        status=booking.status,
        table_number=booking.table_number,
        sit_with_note=booking.sit_with_note,
        booking_answers=booking.booking_answers,
    )


@router.patch("/bookings/{booking_id}/table", response_model=BookingRead)
def assign_table(booking_id: UUID, payload: TableAssignment, service: Service) -> BookingRead:
    """Seat a guest. Null unassigns, which feeds the unassigned counter."""
    booking = service.assign_table(booking_id, payload.table_number, payload.sit_with_note)
    guest = service.get(booking.guest_id)

    return BookingRead(
        id=booking.id,
        guest=_to_read(guest, today=service.today),
        status=booking.status,
        table_number=booking.table_number,
        sit_with_note=booking.sit_with_note,
        booking_answers=booking.booking_answers,
    )


@router.post("/bookings/{booking_id}/cancel", response_model=BookingRead)
def cancel_booking(booking_id: UUID, payload: CancelBooking, service: Service) -> BookingRead:
    """Cancel, optionally issuing a rain-check credit (PRD §2.4)."""
    booking = service.cancel(booking_id, payload.resolution, payload.note)
    guest = service.get(booking.guest_id)

    return BookingRead(
        id=booking.id,
        guest=_to_read(guest, today=service.today),
        status=booking.status,
        table_number=booking.table_number,
        sit_with_note=booking.sit_with_note,
        booking_answers=booking.booking_answers,
    )


# ---------------------------------------------------------------------------
# Waitlist
# ---------------------------------------------------------------------------


@router.post("/sessions/{session_id}/waitlist/invite", response_model=InviteResult)
def invite_next(session_id: UUID, service: Service) -> InviteResult:
    """Offer a freed seat to the next person in line.

    Respects quiet hours: the returned `send_at` may be later than now.
    """
    decision = service.invite_next_guest(session_id)

    if decision.invited is None:
        return InviteResult(
            invited_guest_id=None,
            send_at=None,
            expired_count=len(decision.expired),
            message=decision.reason or "Nobody could be invited right now.",
        )

    return InviteResult(
        invited_guest_id=UUID(decision.invited.guest_id),
        send_at=decision.send_at,
        expired_count=len(decision.expired),
        message="Invite sent — their seat is held until they reply.",
    )
