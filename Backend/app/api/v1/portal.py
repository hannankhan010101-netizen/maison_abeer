"""The guest portal: what a signed-in guest can see about their own bookings.

Every route resolves `guest_id` from the verified token via `GuestDb` and
filters on it. A guest cannot name another guest, and there is no request field
through which they could try — the same discipline that makes `studio_id` a
real boundary, applied one level down.

A host token is rejected here rather than quietly accepted. The two audiences
read different data under different rules, and an endpoint that served either
would be one refactor away from returning host data on a guest route.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import CurrentPrincipal, GuestDb
from app.core.db import TenantSession, get_session_factory
from app.core.errors import NotFoundError
from app.models.enums import BookingStatus, SessionStatus, WaitlistStatus
from app.models.guest import Guest
from app.models.session import Booking, Session, WaitlistEntry
from app.models.studio import HostUser
from app.repositories.guests import SqlGuestRepository
from app.schemas.guest_portal import (
    AttendeePeek,
    ClaimResult,
    DeclineResult,
    PortalProfile,
    PortalWorkshop,
    PortalWorkshopDetail,
    WhoAmI,
    WorkshopStatus,
)
from app.services.guests import GuestService

router = APIRouter(prefix="/portal", tags=["portal"])

SEAT_HOLDING = (BookingStatus.CONFIRMED, BookingStatus.ATTENDED, BookingStatus.NO_SHOW)


def display_name_for(guest: Guest) -> str:
    """What other guests see.

    The guest's own choice if they set one, otherwise first name plus last
    initial. A roster of full names is the host's data, not the room's — and
    "Sana R." is how you would introduce someone at the door anyway.
    """
    if guest.display_name:
        return guest.display_name

    parts = guest.full_name.strip().split()

    if len(parts) < 2:
        return parts[0] if parts else "Someone"

    return f"{parts[0]} {parts[-1][0]}."


def status_for(session: Session, now: datetime) -> WorkshopStatus:
    """Decided here, not in the browser.

    The chip and the countdown are rendered from the same answer, so they
    cannot disagree across a midnight boundary or a slow tab.
    """
    if session.status is SessionStatus.CANCELLED:
        return "cancelled"

    if session.ends_at <= now:
        return "completed"

    if session.starts_at <= now:
        return "live"

    return "upcoming"


def _seat_count(caller: GuestDb, session_id: UUID) -> int:
    return int(
        caller.db.raw.execute(
            select(func.count(Booking.id)).where(
                Booking.studio_id == caller.studio_id,
                Booking.session_id == session_id,
                Booking.status.in_(SEAT_HOLDING),
            )
        ).scalar_one()
    )


@router.get("/me", response_model=PortalProfile)
def get_profile(caller: GuestDb) -> PortalProfile:
    guest = caller.db.get_or_404(Guest, caller.guest_id)
    now = datetime.now(UTC)

    rows = (
        caller.db.raw.execute(
            select(Session)
            .join(Booking, Booking.session_id == Session.id)
            .where(
                Booking.studio_id == caller.studio_id,
                Booking.guest_id == caller.guest_id,
                Booking.status.in_(SEAT_HOLDING),
            )
        )
        .scalars()
        .all()
    )

    return PortalProfile(
        guest_id=guest.id,
        full_name=guest.full_name,
        display_name=display_name_for(guest),
        email=guest.email,
        upcoming_count=sum(1 for s in rows if s.starts_at > now),
        attended_count=sum(1 for s in rows if s.ends_at <= now),
    )


@router.get("/workshops", response_model=list[PortalWorkshop])
def list_my_workshops(caller: GuestDb) -> list[PortalWorkshop]:
    """Only this guest's enrollments. There is no parameter to widen it."""
    now = datetime.now(UTC)

    rows = caller.db.raw.execute(
        select(Booking, Session)
        .join(Session, Session.id == Booking.session_id)
        .where(
            Booking.studio_id == caller.studio_id,
            Booking.guest_id == caller.guest_id,
            Booking.status.in_(SEAT_HOLDING),
            Session.archived_at.is_(None),
        )
        .order_by(Session.starts_at)
    ).all()

    booked = [
        PortalWorkshop(
            session_id=session.id,
            booking_id=booking.id,
            name=session.title or (session.class_type.name if session.class_type else "Workshop"),
            starts_at=session.starts_at,
            ends_at=session.ends_at,
            location=session.location,
            color_token=session.class_type.color_token if session.class_type else "pink",
            status=status_for(session, now),
            attendee_count=_seat_count(caller, session.id),
        )
        for booking, session in rows
    ]

    # Classes they are queued for, not seated on.
    #
    # Without these a guest who joined a waitlist opened their portal to
    # "Nothing here yet — ask your studio for the booking link", moments after
    # being told they were on the list. Waiting is a state worth showing: it is
    # the whole reason they would come back and look.
    waiting = caller.db.raw.execute(
        select(WaitlistEntry, Session)
        .join(Session, Session.id == WaitlistEntry.session_id)
        .where(
            WaitlistEntry.studio_id == caller.studio_id,
            WaitlistEntry.guest_id == caller.guest_id,
            WaitlistEntry.status.in_((WaitlistStatus.WAITING, WaitlistStatus.INVITED)),
            Session.archived_at.is_(None),
            Session.starts_at > now,
        )
        .order_by(Session.starts_at)
    ).all()

    seated = {w.session_id for w in booked}

    queued = [
        PortalWorkshop(
            session_id=session.id,
            # A waitlist entry is not a booking, but the client keys rows on
            # this; the entry's own id is stable and unique for the purpose.
            booking_id=entry.id,
            name=session.title or (session.class_type.name if session.class_type else "Workshop"),
            starts_at=session.starts_at,
            ends_at=session.ends_at,
            location=session.location,
            color_token=session.class_type.color_token if session.class_type else "pink",
            status="invited" if entry.status is WaitlistStatus.INVITED else "waitlisted",
            attendee_count=_seat_count(caller, session.id),
            waitlist_position=entry.position,
            invite_expires_at=entry.invite_expires_at,
        )
        for entry, session in waiting
        # A seat granted from the waitlist can leave the old entry behind;
        # showing both would list one class twice.
        if session.id not in seated
    ]

    return sorted([*booked, *queued], key=lambda w: w.starts_at)


@router.get("/workshops/{session_id}", response_model=PortalWorkshopDetail)
def get_my_workshop(session_id: UUID, caller: GuestDb) -> PortalWorkshopDetail:
    """One workshop, and who else is coming.

    404s when the guest has no booking on it — the same answer as a workshop
    that does not exist, because confirming existence would let someone probe
    the studio's schedule one id at a time.
    """
    now = datetime.now(UTC)

    row = caller.db.raw.execute(
        select(Booking, Session)
        .join(Session, Session.id == Booking.session_id)
        .where(
            Booking.studio_id == caller.studio_id,
            Booking.guest_id == caller.guest_id,
            Booking.session_id == session_id,
            Booking.status.in_(SEAT_HOLDING),
        )
    ).one_or_none()

    # A waitlisted guest holds no booking, but the list now shows them the
    # class — so the detail page has to open, or every card in that state is a
    # link straight to a 404.
    waiting = None
    if row is None:
        waiting = caller.db.raw.execute(
            select(WaitlistEntry, Session)
            .join(Session, Session.id == WaitlistEntry.session_id)
            .where(
                WaitlistEntry.studio_id == caller.studio_id,
                WaitlistEntry.guest_id == caller.guest_id,
                WaitlistEntry.session_id == session_id,
                WaitlistEntry.status.in_((WaitlistStatus.WAITING, WaitlistStatus.INVITED)),
                Session.archived_at.is_(None),
            )
        ).one_or_none()

    if row is None and waiting is None:
        # Still the same answer for "not yours" as for "does not exist":
        # confirming a session id would let someone map the schedule.
        raise NotFoundError("We couldn't find that workshop on your list.")

    # Resolved in the branch that knows which one exists, so the row id and
    # the status are settled facts by the time the response is built rather
    # than a pair of maybe-None values narrowed at the far end.
    invite_expires_at: datetime | None = None
    if row is not None:
        booking, session = row
        row_id = booking.id
        position: int | None = None
        workshop_status: WorkshopStatus = status_for(session, now)
    else:
        assert waiting is not None
        entry, session = waiting
        row_id = entry.id
        position = entry.position
        workshop_status = "invited" if entry.status is WaitlistStatus.INVITED else "waitlisted"
        invite_expires_at = entry.invite_expires_at

    attendee_rows = (
        caller.db.raw.execute(
            select(Guest)
            .join(Booking, Booking.guest_id == Guest.id)
            .where(
                Booking.studio_id == caller.studio_id,
                Booking.session_id == session_id,
                Booking.status.in_(SEAT_HOLDING),
            )
            .order_by(Guest.full_name)
        )
        .scalars()
        .all()
    )

    attendees = [
        AttendeePeek(
            guest_id=guest.id,
            display_name=display_name_for(guest),
            is_you=guest.id == caller.guest_id,
        )
        for guest in attendee_rows
    ]

    return PortalWorkshopDetail(
        session_id=session.id,
        booking_id=row_id,
        name=session.title or (session.class_type.name if session.class_type else "Workshop"),
        starts_at=session.starts_at,
        ends_at=session.ends_at,
        location=session.location,
        color_token=session.class_type.color_token if session.class_type else "pink",
        status=workshop_status,
        attendee_count=len(attendees),
        waitlist_position=position,
        invite_expires_at=invite_expires_at,
        notes=session.notes,
        attendees=attendees,
        others_count=sum(1 for a in attendees if not a.is_you),
    )


def _guest_service(caller: GuestDb) -> GuestService:
    """Scoped to `caller.db`, deliberately not the `Db`/`GuestService`
    dependency wiring used elsewhere.

    That wiring opens its *own* session via `get_tenant_session` — a second,
    independent transaction alongside `GuestDb`'s. Writing through it here and
    reading back through `caller.db` in the same request would race an
    uncommitted transaction against itself.
    """
    return GuestService(SqlGuestRepository(caller.db), now=datetime.now(UTC))


@router.post("/workshops/{session_id}/accept", response_model=PortalWorkshopDetail)
def accept_invite(session_id: UUID, caller: GuestDb) -> PortalWorkshopDetail:
    """Claim a held seat, turning the offer into a real booking."""
    _guest_service(caller).accept_waitlist_offer(session_id, caller.guest_id)
    return get_my_workshop(session_id, caller)


@router.post("/workshops/{session_id}/decline", response_model=DeclineResult)
def decline_invite(session_id: UUID, caller: GuestDb) -> DeclineResult:
    """Turn down a held seat — it passes to the next person in line."""
    _guest_service(caller).decline_waitlist_offer(session_id, caller.guest_id)
    return DeclineResult(declined=True, message="No problem — we'll offer it to the next person.")


# ---------------------------------------------------------------------------
# Claiming an account
# ---------------------------------------------------------------------------


@router.post("/claim", response_model=ClaimResult)
def claim_account(principal: CurrentPrincipal) -> ClaimResult:
    """Match a freshly authenticated Supabase identity to a guest record.

    Called once, right after the magic link lands. Everything that matters
    here is a refusal:

    * **The email comes from the verified token**, never the request body.
      Accepting a body field would let anyone claim any guest by typing their
      address.
    * **No guest is created on a miss.** If it created one, a stranger could
      self-enroll into a studio and would then appear in chat rooms as a
      legitimate attendee. A miss is a dead end by design.
    * **An already-claimed record is not re-pointed.** Two people sharing an
      inbox must not be able to take over each other's bookings.

    Runs on a plain session rather than `GuestDb`: the caller is authenticated
    but is, by definition, not yet a guest.
    """
    if not principal.email:
        return ClaimResult(
            claimed=False,
            message="We need an email address to find your booking.",
        )

    factory = get_session_factory()
    session = factory()

    try:
        # The subject claim is enough for `guest`'s policy to expose a row
        # matched on email; nothing else is reachable with it.
        TenantSession.announce_subject(session, principal.auth_user_id)

        email = principal.email.strip().lower()

        already = session.execute(
            select(Guest).where(Guest.auth_user_id == principal.auth_user_id)
        ).scalar_one_or_none()

        if already is not None:
            return ClaimResult(
                claimed=True,
                display_name=display_name_for(already),
                message="Welcome back.",
            )

        guest = (
            session.execute(
                select(Guest).where(
                    func.lower(Guest.email) == email,
                    Guest.auth_user_id.is_(None),
                    Guest.archived_at.is_(None),
                )
            )
            .scalars()
            .first()
        )

        if guest is None:
            # Deliberately the same answer whether the email is unknown or
            # already taken: distinguishing them would confirm which addresses
            # have booked with this studio.
            return ClaimResult(
                claimed=False,
                message="We couldn't find a booking for that email. Ask your host to add it.",
            )

        guest.auth_user_id = principal.auth_user_id
        session.commit()

        return ClaimResult(
            claimed=True,
            display_name=display_name_for(guest),
            message="You're in.",
        )
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@router.get("/whoami", response_model=WhoAmI)
def whoami(principal: CurrentPrincipal) -> WhoAmI:
    """Which side of the app this token belongs to.

    Exists so the landing page can route a signed-in caller in one round trip
    instead of probing a host endpoint and a guest endpoint and reading the
    401s. Middleware cannot answer this — the role lives in the database, and
    a query on every request through the edge is the wrong trade.

    Returns `unknown` rather than erroring: an authenticated identity with no
    record yet is exactly the state the claim flow exists to resolve, not a
    failure.
    """
    factory = get_session_factory()
    session = factory()

    try:
        TenantSession.announce_subject(session, principal.auth_user_id)

        is_host = session.execute(
            select(HostUser.id).where(HostUser.auth_user_id == principal.auth_user_id)
        ).scalar_one_or_none()

        if is_host is not None:
            return WhoAmI(role="host")

        is_guest = session.execute(
            select(Guest.id).where(
                Guest.auth_user_id == principal.auth_user_id,
                Guest.archived_at.is_(None),
            )
        ).scalar_one_or_none()

        return WhoAmI(role="guest" if is_guest is not None else "unknown")
    finally:
        session.close()
