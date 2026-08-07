"""Public booking: the link a studio puts in an ad.

This is the only unauthenticated write path in the application, so it is
written defensively rather than conveniently.

**The studio comes from the URL slug, never from the body.** Same rule as the
authenticated API, for the same reason: a tenant id a caller can choose is not
a tenant boundary. The slug only selects *which* studio's public page you are
looking at — it grants nothing beyond what that page already shows.

**The last seat is claimed under a row lock.** Two people tapping "book" on
the final seat at the same moment is not hypothetical for a class advertised
on Instagram; without `SELECT … FOR UPDATE` on the session row, both reads see
one seat free and both inserts succeed. The class is then oversold and the
host finds out in the room.

**Responses never confirm whether someone is already a customer.** Returning
"welcome back" would turn this form into a lookup oracle: anyone could test a
phone number against it. A returning guest is silently matched and reused;
the response is identical either way.

**Rate limited per IP**, because an open POST endpoint that writes rows is a
spam target, and because the guest table is the studio's asset.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session as SASession

from app.core.db import get_session_factory
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.rate_limit import limiter
from app.models.enums import (
    AllergySeverity,
    BookingStatus,
    MessageChannel,
    SessionStatus,
    WaitlistStatus,
)
from app.models.guest import Guest, GuestAllergy
from app.models.session import Booking, Session, WaitlistEntry
from app.models.studio import BrandKit, Studio
from app.schemas.public import (
    PublicBookingRequest,
    PublicBookingResult,
    PublicClass,
    PublicClassList,
    PublicStudio,
)

if TYPE_CHECKING:
    from collections.abc import Iterator

router = APIRouter(prefix="/public", tags=["public"])

LOOKAHEAD_DAYS = 60
"""How far ahead the page advertises. Beyond this is not yet real to a guest."""

SEAT_OCCUPYING = (BookingStatus.CONFIRMED, BookingStatus.ATTENDED, BookingStatus.NO_SHOW)


def public_session() -> Iterator[SASession]:
    """A plain session. There is no principal here, so nothing to scope from.

    Every query below therefore names `studio_id` explicitly. That is the
    trade: without a `TenantSession` doing it structurally, each statement
    carries the filter itself, and the tests treat that as the invariant.
    """
    factory = get_session_factory()
    session = factory()

    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


Db = Annotated[SASession, Depends(public_session)]


def _studio_or_404(db: SASession, slug: str) -> Studio:
    studio = db.execute(select(Studio).where(Studio.slug == slug)).scalar_one_or_none()

    if studio is None:
        raise NotFoundError("We couldn't find that studio.")

    return studio


def _booked_count(db: SASession, studio_id: UUID, session_id: UUID) -> int:
    return int(
        db.execute(
            select(func.count(Booking.id)).where(
                Booking.studio_id == studio_id,
                Booking.session_id == session_id,
                Booking.status.in_(SEAT_OCCUPYING),
            )
        ).scalar_one()
    )


# ---------------------------------------------------------------------------
# Browse
# ---------------------------------------------------------------------------


@router.get("/{slug}/classes", response_model=PublicClassList)
@limiter.limit("60/minute")
def list_public_classes(request: Request, slug: str, db: Db) -> PublicClassList:  # noqa: ARG001
    """Upcoming, bookable classes for one studio.

    Filtered to future and `scheduled` only: a locked, cancelled or completed
    class must not be advertised, and a past one is noise.
    """
    studio = _studio_or_404(db, slug)
    now = datetime.now(UTC)

    sessions = list(
        db.execute(
            select(Session)
            .where(
                Session.studio_id == studio.id,
                Session.archived_at.is_(None),
                Session.status == SessionStatus.SCHEDULED,
                Session.starts_at > now,
                Session.starts_at < now + timedelta(days=LOOKAHEAD_DAYS),
            )
            .order_by(Session.starts_at)
        ).scalars()
    )

    brand = db.execute(select(BrandKit).where(BrandKit.studio_id == studio.id)).scalar_one_or_none()

    classes: list[PublicClass] = []
    for session in sessions:
        booked = _booked_count(db, studio.id, session.id)
        seats_left = max(0, session.seats - booked)

        classes.append(
            PublicClass(
                id=session.id,
                name=session.title or (session.class_type.name if session.class_type else "Class"),
                starts_at=session.starts_at,
                ends_at=session.ends_at,
                location=session.location,
                color_token=session.class_type.color_token if session.class_type else "pink",
                seats_left=seats_left,
                is_full=seats_left == 0,
                # A full class still collects interest rather than turning
                # someone away — that queue is how the seat gets refilled.
                waitlist_is_open=seats_left == 0,
            )
        )

    return PublicClassList(
        studio=PublicStudio(
            name=studio.name,
            instagram_handle=brand.instagram_handle if brand else None,
        ),
        classes=classes,
    )


# ---------------------------------------------------------------------------
# Book
# ---------------------------------------------------------------------------


def _match_or_create_guest(db: SASession, studio_id: UUID, payload: PublicBookingRequest) -> Guest:
    """Reuse an existing guest rather than creating a near-duplicate.

    Matched on phone first, then email — the same keys the partial unique
    indexes use, so this cannot create a row the database would reject.
    """
    existing: Guest | None = None

    if payload.phone:
        existing = db.execute(
            select(Guest).where(
                Guest.studio_id == studio_id,
                Guest.phone == payload.phone,
                Guest.archived_at.is_(None),
            )
        ).scalar_one_or_none()

    if existing is None and payload.email:
        existing = db.execute(
            select(Guest).where(
                Guest.studio_id == studio_id,
                Guest.email == payload.email,
                Guest.archived_at.is_(None),
            )
        ).scalar_one_or_none()

    if existing is not None:
        # Fill blanks only. A public form must never overwrite a detail the
        # host curated — least of all the memory note.
        if payload.email and not existing.email:
            existing.email = payload.email
        if payload.phone and not existing.phone:
            existing.phone = payload.phone
        return existing

    guest = Guest(
        studio_id=studio_id,
        full_name=payload.full_name,
        phone=payload.phone,
        email=payload.email,
        preferred_channel=(MessageChannel.WHATSAPP if payload.phone else MessageChannel.EMAIL),
        visit_count=0,
    )
    db.add(guest)
    db.flush()
    return guest


def _record_allergy(db: SASession, studio_id: UUID, guest: Guest, text: str) -> None:
    """Store self-reported allergies at the severity that gets a red chip.

    A guest typing anything into that box is telling the host it matters. The
    host can downgrade it later; the app must not guess it is a preference.
    """
    already = db.execute(
        select(GuestAllergy).where(
            GuestAllergy.studio_id == studio_id,
            GuestAllergy.guest_id == guest.id,
            GuestAllergy.label == text[:80],
        )
    ).scalar_one_or_none()

    if already is not None:
        return

    db.add(
        GuestAllergy(
            studio_id=studio_id,
            guest_id=guest.id,
            label=text[:80],
            severity=AllergySeverity.ALLERGY,
            notes="Self-reported at booking",
        )
    )


@router.post(
    "/{slug}/classes/{session_id}/book",
    response_model=PublicBookingResult,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("10/hour")
def book_public_class(
    request: Request,  # noqa: ARG001 - slowapi reads the client address off it
    slug: str,
    session_id: UUID,
    payload: PublicBookingRequest,
    db: Db,
) -> PublicBookingResult:
    """Take a seat, or join the waitlist when the class is full."""
    studio = _studio_or_404(db, slug)

    # Honeypot: a hidden field a human never sees. Answer as if it worked, so
    # a bot gets no signal to iterate against.
    if payload.website:
        raise ConflictError("Thanks! We'll be in touch.")

    # FOR UPDATE: serialises concurrent bookings on this class, so the seat
    # count read below cannot be stale by the time the insert lands.
    session = db.execute(
        select(Session)
        .where(Session.studio_id == studio.id, Session.id == session_id)
        .with_for_update()
    ).scalar_one_or_none()

    if session is None or session.archived_at is not None:
        raise NotFoundError("We couldn't find that class.")

    if session.status is not SessionStatus.SCHEDULED:
        raise ConflictError("That class isn't taking bookings right now.")

    if session.starts_at <= datetime.now(UTC):
        raise ValidationError("That class has already started.")

    if not payload.phone and not payload.email:
        raise ValidationError("Please leave a phone number or an email so we can reach you.")

    guest = _match_or_create_guest(db, studio.id, payload)

    if payload.allergies:
        _record_allergy(db, studio.id, guest, payload.allergies)

    class_name = session.title or (session.class_type.name if session.class_type else "Class")

    existing_booking = db.execute(
        select(Booking).where(
            Booking.studio_id == studio.id,
            Booking.session_id == session.id,
            Booking.guest_id == guest.id,
            Booking.status.in_(SEAT_OCCUPYING),
        )
    ).scalar_one_or_none()

    if existing_booking is not None:
        # Double submit, or a guest who forgot. Idempotent rather than an
        # error: they wanted a seat and they have one.
        return PublicBookingResult(
            outcome="booked",
            class_name=class_name,
            starts_at=session.starts_at,
            location=session.location,
        )

    seats_left = session.seats - _booked_count(db, studio.id, session.id)

    if seats_left > 0:
        db.add(
            Booking(
                studio_id=studio.id,
                session_id=session.id,
                guest_id=guest.id,
                status=BookingStatus.CONFIRMED,
                booking_answers={"note": payload.note} if payload.note else None,
            )
        )
        guest.visit_count += 1
        db.flush()

        return PublicBookingResult(
            outcome="booked",
            class_name=class_name,
            starts_at=session.starts_at,
            location=session.location,
        )

    # Full: join the queue instead of turning them away.
    already_waiting = db.execute(
        select(WaitlistEntry).where(
            WaitlistEntry.studio_id == studio.id,
            WaitlistEntry.session_id == session.id,
            WaitlistEntry.guest_id == guest.id,
            WaitlistEntry.status == WaitlistStatus.WAITING,
        )
    ).scalar_one_or_none()

    if already_waiting is not None:
        return PublicBookingResult(
            outcome="waitlisted",
            class_name=class_name,
            starts_at=session.starts_at,
            location=session.location,
            waitlist_position=already_waiting.position,
        )

    highest = db.execute(
        select(func.max(WaitlistEntry.position)).where(
            WaitlistEntry.studio_id == studio.id,
            WaitlistEntry.session_id == session.id,
        )
    ).scalar()

    entry = WaitlistEntry(
        studio_id=studio.id,
        session_id=session.id,
        guest_id=guest.id,
        position=(highest or 0) + 1,
        status=WaitlistStatus.WAITING,
    )
    db.add(entry)
    db.flush()

    return PublicBookingResult(
        outcome="waitlisted",
        class_name=class_name,
        starts_at=session.starts_at,
        location=session.location,
        waitlist_position=entry.position,
    )
