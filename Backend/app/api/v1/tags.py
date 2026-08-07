"""Name Tag Studio: tag data and export records (PRD §2.3).

The PDF itself is rendered in the browser — the frontend already owns the
themes, the layout maths and the print stylesheet, and round-tripping a
layout to the server to get the same pixels back would be a worse product.

What the server owns is the part the browser cannot: a durable record of
*what was printed*, fingerprinted, so the host can be told when the roster
has moved on since.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, status

from app.api.deps import Db
from app.domain.exports import TagSubject, roster_fingerprint
from app.models.enums import BookingStatus
from app.models.guest import Guest
from app.models.session import Booking, ExportRecord, Session
from app.schemas.tags import ExportCreate, ExportRecordRead, TagSheet, TagSubjectRead

router = APIRouter(tags=["tags"])


def _subjects(db: Db, session_id: UUID) -> list[TagSubject]:
    """The roster as tags, in the order they will print."""
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

    subjects: list[TagSubject] = []
    for booking in bookings:
        guest = guests.get(booking.guest_id)
        if guest is None:
            continue

        # The one free-text answer the host chose to print, if any.
        answers = booking.booking_answers or {}
        subtext = next(iter(answers.values()), None) if answers else None

        subjects.append(
            TagSubject(
                guest_id=str(guest.id),
                full_name=guest.full_name,
                table_number=booking.table_number,
                subtext=subtext,
            )
        )

    # Table order, then name: how the host hands them out at the door.
    subjects.sort(key=lambda s: (s.table_number is None, s.table_number or 0, s.full_name))
    return subjects


def _latest_export(db: Db, session_id: UUID) -> ExportRecord | None:
    rows = db.scalars(
        db.query(ExportRecord)
        .where(ExportRecord.session_id == session_id)
        .order_by(ExportRecord.created_at.desc())
        .limit(1)
    )
    return rows[0] if rows else None


@router.get("/sessions/{session_id}/tags", response_model=TagSheet)
def get_tag_sheet(session_id: UUID, db: Db) -> TagSheet:
    """Everything needed to render the sheet, plus whether it is stale."""
    db.get_or_404(Session, session_id)

    subjects = _subjects(db, session_id)
    fingerprint = roster_fingerprint(subjects)
    latest = _latest_export(db, session_id)

    return TagSheet(
        session_id=session_id,
        subjects=[
            TagSubjectRead(
                guest_id=UUID(subject.guest_id),
                full_name=subject.full_name,
                table_number=subject.table_number,
                subtext=subject.subtext,
            )
            for subject in subjects
        ],
        roster_hash=fingerprint,
        last_exported_at=latest.created_at if latest else None,
        last_export_theme=latest.theme if latest else None,
        # No export yet is not "stale" — there is nothing to be stale against.
        roster_changed_since_export=(latest is not None and latest.roster_hash != fingerprint),
    )


@router.post(
    "/sessions/{session_id}/exports",
    response_model=ExportRecordRead,
    status_code=status.HTTP_201_CREATED,
)
def record_export(session_id: UUID, payload: ExportCreate, db: Db) -> ExportRecordRead:
    """Log that tags were printed, fingerprinting the roster as it stood.

    Called by the client after the print dialog, not before: the hash must
    describe what actually went to paper.
    """
    db.get_or_404(Session, session_id)

    record = ExportRecord(
        session_id=session_id,
        theme=payload.theme,
        layout=payload.layout,
        roster_hash=roster_fingerprint(_subjects(db, session_id)),
        file_url=payload.file_url,
    )

    db.add(record)
    db.flush()

    return ExportRecordRead.model_validate(record)


@router.get("/sessions/{session_id}/exports", response_model=list[ExportRecordRead])
def list_exports(session_id: UUID, db: Db) -> list[ExportRecordRead]:
    db.get_or_404(Session, session_id)

    statement = (
        db.query(ExportRecord)
        .where(ExportRecord.session_id == session_id)
        .order_by(ExportRecord.created_at.desc())
    )
    return [ExportRecordRead.model_validate(row) for row in db.scalars(statement)]
