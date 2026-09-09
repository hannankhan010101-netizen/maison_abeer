"""A guest's own class history (PRD §2.4, the mini-CRM).

Separate from `guests.py` because it reads across sessions and bookings
rather than through the guest service, and folding it in would mean widening
the guest repository protocol for one view.

Deliberately not paginated. A studio guest attends a handful of classes a
year; adding a cursor here would be complexity for a list that fits on a
phone screen. If that stops being true, the shape to add is a cursor, not an
offset — offsets skip rows when something is inserted mid-scroll.
"""

from __future__ import annotations

from datetime import UTC, datetime
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import Db, Issuer
from app.core.config import get_settings
from app.core.errors import ConflictError
from app.models.enums import BookingStatus, CreditStatus
from app.models.guest import Guest, GuestCredit
from app.models.session import Booking, Session
from app.schemas.guest_history import GuestCreditRead, GuestHistory, GuestVisit, PortalLink

router = APIRouter(tags=["guests"])


@router.get("/guests/{guest_id}/history", response_model=GuestHistory)
def guest_history(guest_id: UUID, db: Db) -> GuestHistory:
    """Every class this guest has booked, and what they still hold."""
    db.get_or_404(Guest, guest_id)

    rows = db.raw.execute(
        select(Booking, Session)
        .join(Session, Session.id == Booking.session_id)
        .where(
            Booking.studio_id == db.studio_id,
            Booking.guest_id == guest_id,
        )
        .order_by(Session.starts_at.desc())
    ).all()

    now = datetime.now(UTC)

    visits = [
        GuestVisit(
            booking_id=booking.id,
            session_id=session.id,
            class_name=session.title
            or (session.class_type.name if session.class_type else "Class"),
            starts_at=session.starts_at,
            location=session.location,
            status=booking.status,
            table_number=booking.table_number,
            is_upcoming=session.starts_at > now,
        )
        for booking, session in rows
    ]

    credits = [
        GuestCreditRead(
            id=credit.id,
            status=credit.status,
            note=credit.note,
            expires_at=credit.expires_at,
            created_at=credit.created_at,
        )
        for credit in db.scalars(
            db.query(GuestCredit)
            .where(GuestCredit.guest_id == guest_id)
            .order_by(GuestCredit.created_at.desc())
        )
    ]

    # Counted from bookings rather than read off `guest.visit_count`: the
    # denormalised counter drives the roster badge and is maintained on write,
    # so a view that recomputes it here would quietly hide a drift between
    # them rather than showing the host the truth.
    attended = sum(
        1 for visit in visits if not visit.is_upcoming and visit.status != BookingStatus.CANCELLED
    )

    return GuestHistory(
        guest_id=guest_id,
        visits=visits,
        credits=credits,
        attended_count=attended,
        upcoming_count=sum(1 for visit in visits if visit.is_upcoming),
        available_credit_count=sum(
            1 for credit in credits if credit.status == CreditStatus.AVAILABLE
        ),
    )


@router.post("/guests/{guest_id}/portal-link", response_model=PortalLink)
def issue_portal_link(guest_id: UUID, db: Db, issuer: Issuer) -> PortalLink:
    """Mint a fresh sign-in link for a guest who lost their session.

    Guests normally never need this — the session is set to outlive any
    realistic gap between visits. But the credential lives in their browser,
    so clearing site data or switching phone ends it, and there is nothing
    they can do about that alone: there is no password to re-enter and no
    verified email to send anything to.

    So the host does it. That is the right shape for a studio, where the host
    already knows every guest by name, and the wrong shape at scale.

    Host-only, like everything else on this router. A guest calling it gets
    403 before reaching this code.
    """
    guest = db.get_or_404(Guest, guest_id)

    token = issuer.issue(guest)

    if token is None:
        raise ConflictError("We couldn't make a link just now. Please try again in a moment.")

    base = get_settings().public_web_url.rstrip("/")

    return PortalLink(
        url=f"{base}/enter?token={quote(token.token_hash)}&type={token.otp_type}"
    )
