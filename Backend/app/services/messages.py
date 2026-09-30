"""Shared inputs for rendering and timing a guest message.

These used to be private helpers of `app.api.v1.messages`. They moved here
because two callers need them: the router that queues reminders, and the
reschedule path that has to re-anchor and re-render the reminders already
queued when a class moves. A repository reaching into an API module for its
rendering inputs would have inverted the layering the rest of the app keeps.

Nothing here writes. Each function answers a question about the studio, the
session or one guest; the callers decide what to do with the answer.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.core.config import get_settings
from app.domain.guests import is_contactable
from app.domain.messages import MessagePlan, plan_message
from app.domain.scheduling import QuietHours
from app.models.enums import BookingStatus, VoicePreset
from app.models.guest import Guest
from app.models.session import Booking, Session
from app.models.studio import StudioSettings

if TYPE_CHECKING:
    from datetime import datetime
    from uuid import UUID

    from app.core.db import TenantSession

# The host nudge goes to the host, not a guest, so it is scheduled without a
# recipient and never checked for opt-out.
GUEST_KINDS = ("guest_reminder", "guest_thank_you")


def studio_quiet_hours(db: TenantSession) -> QuietHours:
    rows = db.scalars(db.query(StudioSettings))

    if not rows:
        return QuietHours()

    row = rows[0]
    return QuietHours(
        start=row.quiet_hours_start,
        end=row.quiet_hours_end,
        timezone=row.timezone,
    )


def studio_default_voice(db: TenantSession) -> VoicePreset:
    rows = db.scalars(db.query(StudioSettings))
    return rows[0].default_voice if rows else VoicePreset.SOFT_SWEET


def feedback_link(booking_id: UUID | None) -> str:
    """The guest's one-tap survey link, or nothing.

    Omitted rather than sent broken when no public URL is configured — a
    message ending in a dead link is worse than one that simply asks.
    """
    base = get_settings().public_web_url.rstrip("/")

    if not base or booking_id is None:
        return ""

    return f"{base}/feedback/{booking_id}"


def template_values(
    session: Session, guest: Guest | None, booking_id: UUID | None = None
) -> dict[str, str]:
    local = session.starts_at
    return {
        "class_name": session.class_type.name if session.class_type else "your class",
        "guest_name": guest.full_name.split()[0] if guest else "there",
        "time": local.strftime("%I:%M %p").lstrip("0").lower(),
        "date": local.strftime("%a %d %b"),
        "feedback_link": feedback_link(booking_id),
    }


def seated(db: TenantSession, session_id: UUID) -> list[tuple[Booking, Guest]]:
    """Everyone holding a seat, paired with their booking.

    The booking comes along because the thank-you message links to a
    per-booking feedback page; a guest alone is not enough to address it.
    """
    bookings = db.scalars(
        db.query(Booking).where(
            Booking.session_id == session_id,
            Booking.status != BookingStatus.CANCELLED,
        )
    )

    guest_ids = [booking.guest_id for booking in bookings]
    if not guest_ids:
        return []

    guests = {g.id: g for g in db.scalars(db.query(Guest).where(Guest.id.in_(guest_ids)))}

    return [(b, guests[b.guest_id]) for b in bookings if b.guest_id in guests]


def plan_for(guest: Guest, desired: datetime, now: datetime, quiet: QuietHours) -> MessagePlan:
    return plan_message(
        desired_send_at=desired,
        now=now,
        quiet_hours=quiet,
        opted_out=guest.opted_out,
        is_contactable=is_contactable(
            channel=guest.preferred_channel,
            phone=guest.phone,
            email=guest.email,
            opted_out=guest.opted_out,
        ),
    )
