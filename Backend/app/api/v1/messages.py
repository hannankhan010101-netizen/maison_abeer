"""Reminder scheduling, message history and guest feedback (PRD §2.6).

Scheduling is deliberately explicit rather than implicit on session create:
the host previews what will go out, in which voice, and at what time, and
then queues it. A message the host did not expect is worse than one they had
to ask for.

Nothing here sends. Writing a row with `status=scheduled` is the whole job;
`app.cli.worker` is what drains the queue, so an HTTP request never blocks on
a delivery provider.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app.api.deps import Db
from app.core.errors import ConflictError
from app.domain.messages import (
    plan_message,
    reminder_schedule,
    render,
    unresolved_placeholders,
)
from app.models.enums import MessageKind, MessageStatus
from app.models.guest import Guest
from app.models.session import Booking, MessageFeedback, ScheduledMessage, Session
from app.schemas.message import (
    CancelMessage,
    FeedbackCreate,
    FeedbackRead,
    MessagePreview,
    MessageScheduleResult,
    ScheduledMessageRead,
    SchedulePreviewRequest,
)
from app.services.messages import (
    GUEST_KINDS,
    plan_for,
    seated,
    studio_default_voice,
    studio_quiet_hours,
    template_values,
)

router = APIRouter(tags=["messages"])


def _session_or_404(db: Db, session_id: UUID) -> Session:
    return db.get_or_404(Session, session_id)


# ---------------------------------------------------------------------------
# Preview
# ---------------------------------------------------------------------------


@router.post("/sessions/{session_id}/messages/preview", response_model=list[MessagePreview])
def preview_messages(
    session_id: UUID,
    payload: SchedulePreviewRequest,
    db: Db,
) -> list[MessagePreview]:
    """What would go out, to whom, and when — without queueing anything.

    One preview per kind, using the first seated guest as the sample, because
    the host is checking the copy and the timing rather than the recipient
    list.
    """
    session = _session_or_404(db, session_id)
    voice = payload.voice or studio_default_voice(db)
    quiet = studio_quiet_hours(db)
    now = datetime.now(UTC)

    roster = seated(db, session_id)
    sample_booking, sample = roster[0] if roster else (None, None)
    values = template_values(session, sample, sample_booking.id if sample_booking else None)
    schedule = reminder_schedule(session.starts_at)

    previews: list[MessagePreview] = []

    for kind in GUEST_KINDS:
        body = render(kind, voice.value, values)
        desired = schedule[kind]

        if sample is None:
            # Nobody booked yet: the copy is still worth previewing, but there
            # is no recipient to test opt-out or contactability against.
            plan = plan_message(
                desired_send_at=desired,
                now=now,
                quiet_hours=quiet,
                opted_out=False,
                is_contactable=True,
            )
        else:
            plan = plan_for(sample, desired, now, quiet)

        previews.append(
            MessagePreview(
                kind=MessageKind(kind),
                voice=voice,
                body=body,
                send_at=plan.send_at,
                will_send=plan.will_send,
                skip_reason=plan.skip_reason.value if plan.skip_reason else None,
                was_shifted=plan.was_shifted,
                unresolved_placeholders=unresolved_placeholders(body),
            )
        )

    return previews


# ---------------------------------------------------------------------------
# Scheduling
# ---------------------------------------------------------------------------


@router.post(
    "/sessions/{session_id}/messages",
    response_model=MessageScheduleResult,
    status_code=status.HTTP_201_CREATED,
)
def schedule_messages(
    session_id: UUID,
    payload: SchedulePreviewRequest,
    db: Db,
) -> MessageScheduleResult:
    """Queue the automatic reminders for everyone holding a seat.

    Re-runnable: a kind already queued for a guest is left alone rather than
    duplicated, so pressing the button twice does not double-message anyone.
    """
    session = _session_or_404(db, session_id)
    voice = payload.voice or studio_default_voice(db)
    quiet = studio_quiet_hours(db)
    now = datetime.now(UTC)

    schedule = reminder_schedule(session.starts_at)
    roster = seated(db, session_id)

    existing = {
        (row.guest_id, row.kind)
        for row in db.scalars(
            db.query(ScheduledMessage).where(
                ScheduledMessage.session_id == session_id,
                ScheduledMessage.status.in_(
                    [MessageStatus.SCHEDULED, MessageStatus.QUEUED, MessageStatus.SENT]
                ),
            )
        )
    }

    queued: list[ScheduledMessage] = []
    skips: dict[str, int] = {}

    for booking, guest in roster:
        values = template_values(session, guest, booking.id)

        for kind in GUEST_KINDS:
            if (guest.id, MessageKind(kind)) in existing:
                continue

            plan = plan_for(guest, schedule[kind], now, quiet)

            if not plan.will_send:
                reason = plan.skip_reason.value if plan.skip_reason else "unknown"
                skips[reason] = skips.get(reason, 0) + 1
                continue

            assert plan.send_at is not None
            message = ScheduledMessage(
                session_id=session_id,
                guest_id=guest.id,
                kind=MessageKind(kind),
                channel=guest.preferred_channel,
                status=MessageStatus.SCHEDULED,
                voice=voice,
                send_at=plan.send_at,
                body=render(kind, voice.value, values),
            )
            db.add(message)
            queued.append(message)

    db.flush()

    return MessageScheduleResult(
        session_id=session_id,
        queued=len(queued),
        skipped=sum(skips.values()),
        skips=skips,
        messages=[ScheduledMessageRead.model_validate(m) for m in queued],
    )


@router.get("/sessions/{session_id}/messages", response_model=list[ScheduledMessageRead])
def list_session_messages(session_id: UUID, db: Db) -> list[ScheduledMessageRead]:
    _session_or_404(db, session_id)

    statement = (
        db.query(ScheduledMessage)
        .where(ScheduledMessage.session_id == session_id)
        .order_by(ScheduledMessage.send_at)
    )
    return [ScheduledMessageRead.model_validate(m) for m in db.scalars(statement)]


@router.get("/guests/{guest_id}/messages", response_model=list[ScheduledMessageRead])
def list_guest_messages(
    guest_id: UUID,
    db: Db,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[ScheduledMessageRead]:
    """A guest's full communication history (PRD §2.6)."""
    db.get_or_404(Guest, guest_id)

    statement = (
        db.query(ScheduledMessage)
        .where(ScheduledMessage.guest_id == guest_id)
        .order_by(ScheduledMessage.created_at.desc())
        .limit(limit)
    )
    return [ScheduledMessageRead.model_validate(m) for m in db.scalars(statement)]


@router.get("/messages/failed", response_model=list[ScheduledMessageRead])
def list_failed(db: Db) -> list[ScheduledMessageRead]:
    """Feeds the dashboard alert. A failed send must never be invisible."""
    statement = (
        db.query(ScheduledMessage)
        .where(ScheduledMessage.status == MessageStatus.FAILED)
        .order_by(ScheduledMessage.send_at.desc())
    )
    return [ScheduledMessageRead.model_validate(m) for m in db.scalars(statement)]


@router.post("/messages/{message_id}/cancel", response_model=ScheduledMessageRead)
def cancel_message(message_id: UUID, payload: CancelMessage, db: Db) -> ScheduledMessageRead:
    message = db.get_or_404(ScheduledMessage, message_id)

    if message.status in (MessageStatus.SENT, MessageStatus.DELIVERED):
        raise ConflictError("That message has already gone out.")

    message.status = MessageStatus.CANCELLED
    if payload.reason:
        message.last_error = payload.reason

    db.flush()
    return ScheduledMessageRead.model_validate(message)


@router.post("/messages/{message_id}/retry", response_model=ScheduledMessageRead)
def retry_message(message_id: UUID, db: Db) -> ScheduledMessageRead:
    """Put a failed message back in the queue, clearing the error."""
    message = db.get_or_404(ScheduledMessage, message_id)

    if message.status is not MessageStatus.FAILED:
        raise ConflictError("Only a failed message can be retried.")

    message.status = MessageStatus.SCHEDULED
    message.last_error = None
    message.send_at = max(message.send_at, datetime.now(UTC))

    db.flush()
    return ScheduledMessageRead.model_validate(message)


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------


@router.put("/bookings/{booking_id}/feedback", response_model=FeedbackRead)
def upsert_feedback(booking_id: UUID, payload: FeedbackCreate, db: Db) -> FeedbackRead:
    """One tap and one word, keyed to the booking.

    PUT rather than POST: the table has a unique constraint on `booking_id`,
    so a guest tapping twice should correct their answer rather than 409.
    """
    db.get_or_404(Booking, booking_id)

    existing = db.raw.execute(
        select(MessageFeedback).where(
            MessageFeedback.studio_id == db.studio_id,
            MessageFeedback.booking_id == booking_id,
        )
    ).scalar_one_or_none()

    if existing is None:
        existing = MessageFeedback(booking_id=booking_id)
        db.add(existing)

    existing.rating = payload.rating
    existing.one_word = payload.one_word

    db.flush()
    return FeedbackRead.model_validate(existing)


@router.get("/feedback", response_model=list[FeedbackRead])
def list_studio_feedback(
    db: Db,
    start: Annotated[datetime | None, Query(description="Window start, by class date")] = None,
    end: Annotated[datetime | None, Query(description="Window end, by class date")] = None,
) -> list[FeedbackRead]:
    """Every answer in a window, for the Wrapped word cloud.

    Studio-wide rather than per session, because Wrapped reads a whole season
    — a per-session fan-out would be one request per class on page load, and
    the page held sixteen hardcoded words instead of asking for any of them.

    Filtered by the *class* date, not the answer date, so the deck reflects
    the same season the rest of the page is showing.
    """
    statement = (
        db.query(MessageFeedback)
        .join(Booking, Booking.id == MessageFeedback.booking_id)
        .join(Session, Session.id == Booking.session_id)
        .order_by(MessageFeedback.created_at.desc())
    )

    if start is not None:
        statement = statement.where(Session.starts_at >= start)

    if end is not None:
        statement = statement.where(Session.starts_at <= end)

    return [FeedbackRead.model_validate(f) for f in db.scalars(statement)]


@router.get("/sessions/{session_id}/feedback", response_model=list[FeedbackRead])
def list_feedback(session_id: UUID, db: Db) -> list[FeedbackRead]:
    """One class's answers."""
    _session_or_404(db, session_id)

    booking_ids = [
        b.id for b in db.scalars(db.query(Booking).where(Booking.session_id == session_id))
    ]

    if not booking_ids:
        return []

    statement = db.query(MessageFeedback).where(MessageFeedback.booking_id.in_(booking_ids))
    return [FeedbackRead.model_validate(f) for f in db.scalars(statement)]
