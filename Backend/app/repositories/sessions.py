"""SQLAlchemy implementation of `SessionRepository`.

Every read goes through `TenantSession.query`, which injects the `studio_id`
filter. No statement in this file builds its own unscoped `select()` — that is
the property `test_repository_sql.py` asserts by compiling the emitted SQL.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.domain.capacity import Capacity
from app.domain.quantities import (
    QuantityChange,
    QuantityLinkedItem,
    primary_quantity,
    render,
)
from app.domain.scheduling import ChecklistDeadline, TMinusOffset
from app.models.catalog import ClassType
from app.models.enums import BookingStatus, SessionStatus
from app.models.guest import Guest
from app.models.session import Booking, ChecklistItem, ExportRecord, Session
from app.models.studio import StudioSettings
from app.services.sessions import SessionDraft, SessionSnapshot, StudioContext

if TYPE_CHECKING:
    from collections.abc import Sequence
    from datetime import datetime
    from uuid import UUID

    from app.core.db import TenantSession

# Statuses that occupy a seat. Cancelled bookings free their seat immediately.
SEAT_OCCUPYING = (
    BookingStatus.CONFIRMED,
    BookingStatus.ATTENDED,
    BookingStatus.NO_SHOW,
)


class SqlSessionRepository:
    def __init__(self, db: TenantSession) -> None:
        self._db = db

    # -- context ------------------------------------------------------------

    def studio_context(self) -> StudioContext:
        settings = self._db.scalars(self._db.query(StudioSettings))

        if not settings:
            # A studio without saved settings still schedules; defaults keep
            # the energy rules inert rather than blocking the host.
            return StudioContext(timezone="UTC", rest_days=frozenset(), weekly_class_cap=None)

        row = settings[0]
        return StudioContext(
            timezone=row.timezone,
            rest_days=frozenset(row.rest_days or ()),
            weekly_class_cap=row.weekly_class_cap,
        )

    def class_type_exists(self, class_type_id: UUID) -> bool:
        statement = self._db.query(ClassType).where(
            ClassType.id == class_type_id, ClassType.archived_at.is_(None)
        )
        return self._db.scalars(statement) != []

    # -- reads --------------------------------------------------------------

    def _snapshot(self, session: Session) -> SessionSnapshot:
        booked = self._booked_count(session.id)
        unassigned = self._unassigned_count(session.id)

        return SessionSnapshot(
            id=session.id,
            class_type_id=session.class_type_id,
            class_type_name=session.class_type.name,
            color_token=session.class_type.color_token,
            title=session.title,
            starts_at=session.starts_at,
            ends_at=session.ends_at,
            status=session.status.value,
            seats=session.seats,
            booked=booked,
            locked=session.status is SessionStatus.LOCKED,
            location=session.location,
            notes=session.notes,
            unassigned_guest_count=unassigned,
            roster_changed_since_export=self._roster_drifted(session.id),
        )

    def _booked_count(self, session_id: UUID) -> int:
        statement = (
            select(func.count())
            .select_from(Booking)
            .where(
                Booking.studio_id == self._db.studio_id,
                Booking.session_id == session_id,
                Booking.status.in_(SEAT_OCCUPYING),
            )
        )
        return int(self._db.raw.execute(statement).scalar_one())

    def _unassigned_count(self, session_id: UUID) -> int:
        statement = (
            select(func.count())
            .select_from(Booking)
            .where(
                Booking.studio_id == self._db.studio_id,
                Booking.session_id == session_id,
                Booking.status.in_(SEAT_OCCUPYING),
                Booking.table_number.is_(None),
            )
        )
        return int(self._db.raw.execute(statement).scalar_one())

    def _roster_drifted(self, session_id: UUID) -> bool:
        """Whether the roster changed since the last name-tag export.

        Compares the stored fingerprint rather than timestamps, so re-saving a
        booking without changing who is coming does not nag the host.
        """
        exports = self._db.scalars(
            self._db.query(ExportRecord)
            .where(ExportRecord.session_id == session_id)
            .order_by(ExportRecord.created_at.desc())
            .limit(1)
        )

        if not exports:
            return False

        return exports[0].roster_hash != self.roster_hash(session_id)

    def roster_hash(self, session_id: UUID) -> str:
        """Fingerprint of who is coming and where they sit."""
        import hashlib

        rows = self._db.raw.execute(
            select(Booking.guest_id, Booking.table_number)
            .where(
                Booking.studio_id == self._db.studio_id,
                Booking.session_id == session_id,
                Booking.status.in_(SEAT_OCCUPYING),
            )
            .order_by(Booking.guest_id)
        ).all()

        payload = "|".join(f"{guest_id}:{table}" for guest_id, table in rows)
        return hashlib.sha256(payload.encode()).hexdigest()

    def get_snapshot(self, session_id: UUID) -> SessionSnapshot | None:
        session = self._db.get(Session, session_id)
        return None if session is None else self._snapshot(session)

    def list_snapshots(self, start: datetime, end: datetime) -> Sequence[SessionSnapshot]:
        statement = (
            self._db.query(Session)
            .where(
                Session.starts_at >= start,
                Session.starts_at <= end,
                Session.archived_at.is_(None),
            )
            .order_by(Session.starts_at)
        )

        return [self._snapshot(session) for session in self._db.scalars(statement)]

    def existing_starts(self) -> Sequence[datetime]:
        statement = self._db.query(Session).where(Session.archived_at.is_(None))
        return [session.starts_at for session in self._db.scalars(statement)]

    # -- writes -------------------------------------------------------------

    def create(self, draft: SessionDraft, recurrence_group_id: UUID | None) -> SessionSnapshot:
        session = Session(
            class_type_id=draft.class_type_id,
            title=draft.title,
            starts_at=draft.starts_at,
            ends_at=draft.ends_at,
            seats=draft.seats,
            location=draft.location,
            notes=draft.notes,
            recurrence_group_id=recurrence_group_id,
            status=SessionStatus.SCHEDULED,
        )

        self._db.add(session)
        self._db.flush()

        self._instantiate_checklist(session)
        self._db.flush()

        return self._snapshot(session)

    def _instantiate_checklist(self, session: Session) -> None:
        """Materialise the class type's template onto this session.

        Instantiated rather than referenced, so editing the template later
        never rewrites the checklist a past class actually ran (PRD §2.5).
        """
        template_items = self._db.scalars(
            self._db.query(ClassType).where(ClassType.id == session.class_type_id)
        )

        if not template_items:
            return

        for position, item in enumerate(template_items[0].checklist_items):
            offset = TMinusOffset(hours_before=item.hours_before)
            quantity = primary_quantity(item.text, session.seats)

            self._db.add(
                ChecklistItem(
                    session_id=session.id,
                    text_template=item.text,
                    rendered_text=render(item.text, session.seats),
                    last_quantity=quantity,
                    hours_before=item.hours_before,
                    deadline_at=offset.resolve(session.starts_at),
                    phase=item.phase,
                    is_high_priority=item.is_high_priority,
                    position=position,
                )
            )

    def update_seats(self, session_id: UUID, seats: int) -> SessionSnapshot:
        session = self._db.get_or_404(Session, session_id)
        session.seats = seats
        self._db.flush()
        return self._snapshot(session)

    def update_start(
        self, session_id: UUID, starts_at: datetime, ends_at: datetime
    ) -> SessionSnapshot:
        session = self._db.get_or_404(Session, session_id)
        session.starts_at = starts_at
        session.ends_at = ends_at
        self._db.flush()
        return self._snapshot(session)

    def set_status(self, session_id: UUID, status: str) -> SessionSnapshot:
        session = self._db.get_or_404(Session, session_id)
        session.status = SessionStatus(status)
        self._db.flush()
        return self._snapshot(session)

    def mark_sold_out(self, session_id: UUID, at: datetime) -> None:
        session = self._db.get_or_404(Session, session_id)

        # Stamped once only, so the celebration cannot fire twice.
        if session.sold_out_at is None:
            session.sold_out_at = at
            self._db.flush()

    # -- checklist ----------------------------------------------------------

    def quantity_items(self, session_id: UUID) -> Sequence[QuantityLinkedItem]:
        items = self._db.scalars(
            self._db.query(ChecklistItem).where(ChecklistItem.session_id == session_id)
        )

        return [
            QuantityLinkedItem(
                item_id=str(item.id),
                label=item.rendered_text,
                template=item.text_template,
                last_quantity=item.last_quantity,
                completed=item.completed_at is not None,
            )
            for item in items
        ]

    def apply_quantity_changes(
        self, session_id: UUID, changes: Sequence[QuantityChange], seats: int
    ) -> None:
        from datetime import UTC
        from datetime import datetime as _dt

        changed_ids = {change.item_id for change in changes}
        needs_attention = {change.item_id for change in changes if change.needs_attention}

        items = self._db.scalars(
            self._db.query(ChecklistItem).where(ChecklistItem.session_id == session_id)
        )

        for item in items:
            if str(item.id) not in changed_ids:
                continue

            item.rendered_text = render(item.text_template, seats)
            item.last_quantity = primary_quantity(item.text_template, seats)

            if str(item.id) in needs_attention:
                # Already ticked but now needs more — re-open the conversation
                # rather than silently changing what the host already did.
                item.needs_attention_since = _dt.now(UTC)

        self._db.flush()

    def checklist_deadlines(self, session_id: UUID) -> Sequence[ChecklistDeadline]:
        items = self._db.scalars(
            self._db.query(ChecklistItem)
            .where(ChecklistItem.session_id == session_id)
            .order_by(ChecklistItem.deadline_at)
        )

        return [
            ChecklistDeadline(
                item_id=str(item.id),
                label=item.rendered_text,
                offset=TMinusOffset(hours_before=item.hours_before),
                deadline=item.deadline_at,
                completed=item.completed_at is not None,
            )
            for item in items
        ]

    def reanchor_deadlines(self, session_id: UUID, new_start: datetime) -> None:
        items = self._db.scalars(
            self._db.query(ChecklistItem).where(ChecklistItem.session_id == session_id)
        )

        for item in items:
            item.deadline_at = TMinusOffset(hours_before=item.hours_before).resolve(new_start)

        self._db.flush()

    # -- guests -------------------------------------------------------------

    def guest_counts(self, session_id: UUID) -> tuple[int, int]:
        """(affected, contactable) for reschedule notifications."""
        rows = self._db.raw.execute(
            select(Guest.opted_out, Guest.preferred_channel, Guest.phone, Guest.email)
            .join(Booking, Booking.guest_id == Guest.id)
            .where(
                Booking.studio_id == self._db.studio_id,
                Booking.session_id == session_id,
                Booking.status.in_(SEAT_OCCUPYING),
            )
        ).all()

        from app.domain.guests import is_contactable

        affected = len(rows)
        contactable = sum(
            1
            for opted_out, channel, phone, email in rows
            if is_contactable(channel=channel, phone=phone, email=email, opted_out=opted_out)
        )

        return affected, contactable

    def capacity(self, session_id: UUID) -> Capacity | None:
        session = self._db.get(Session, session_id)

        if session is None:
            return None

        return Capacity(
            seats=session.seats,
            booked=self._booked_count(session.id),
            locked=session.status is SessionStatus.LOCKED,
        )
