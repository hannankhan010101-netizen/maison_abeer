"""SQLAlchemy implementation of `ChecklistRepository`."""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING

from app.domain.quantities import primary_quantity, render
from app.models.catalog import ChecklistTemplateItem
from app.models.enums import ChecklistPhase
from app.models.session import ChecklistItem, Session
from app.services.checklist import ChecklistItemDraft, ChecklistItemSnapshot

if TYPE_CHECKING:
    from collections.abc import Sequence
    from datetime import datetime
    from uuid import UUID

    from app.core.db import TenantSession


class SqlChecklistRepository:
    def __init__(self, db: TenantSession) -> None:
        self._db = db

    def _snapshot(self, item: ChecklistItem) -> ChecklistItemSnapshot:
        return ChecklistItemSnapshot(
            id=item.id,
            session_id=item.session_id,
            text=item.rendered_text,
            quantity=item.last_quantity,
            hours_before=item.hours_before,
            deadline_at=item.deadline_at,
            phase=item.phase.value,
            is_high_priority=item.is_high_priority,
            is_one_off=item.is_one_off,
            completed_at=item.completed_at,
            needs_attention_since=item.needs_attention_since,
        )

    def session_exists(self, session_id: UUID) -> bool:
        return self._db.get(Session, session_id) is not None

    def session_start(self, session_id: UUID) -> datetime | None:
        session = self._db.get(Session, session_id)
        return None if session is None else session.starts_at

    def items_for_session(self, session_id: UUID) -> Sequence[ChecklistItemSnapshot]:
        statement = (
            self._db.query(ChecklistItem)
            .where(ChecklistItem.session_id == session_id)
            .order_by(ChecklistItem.deadline_at, ChecklistItem.position)
        )

        return [self._snapshot(item) for item in self._db.scalars(statement)]

    def instantiate_template(self, session_id: UUID) -> int:
        """Copy the class type's template onto a session that has no steps yet.

        Templates hold a relative offset and may carry a quantity expression;
        a session stores the resolved deadline and the rendered text. That
        split is the whole design (PRD §2.5) — but nothing performed the copy,
        so every class showed "no steps yet" while six template rows sat in
        the database unused, and the Prep module produced nothing at all.

        Done lazily on first read rather than at session-create, matching how
        chat rooms are made here: a class nobody ever opens should not leave
        rows behind, and it needs no backfill for the sessions that already
        exist.

        Returns how many were created. Zero is normal and means either the
        session already has steps or its class type has no template.
        """
        session = self._db.get(Session, session_id)
        if session is None or session.class_type_id is None:
            return 0

        # Only ever populates an empty checklist. A host who deleted every
        # step must not have them reappear on the next page load.
        existing = self._db.scalars(
            self._db.query(ChecklistItem).where(ChecklistItem.session_id == session_id).limit(1)
        )
        if list(existing):
            return 0

        template = self._db.scalars(
            self._db.query(ChecklistTemplateItem)
            .where(ChecklistTemplateItem.class_type_id == session.class_type_id)
            .order_by(ChecklistTemplateItem.position)
        )

        seats = session.seats
        created = 0

        for entry in template:
            self._db.add(
                ChecklistItem(
                    session_id=session_id,
                    text_template=entry.text,
                    rendered_text=render(entry.text, seats),
                    # Stored so a later capacity change can detect drift by
                    # comparing numbers rather than diffing rendered strings.
                    last_quantity=primary_quantity(entry.text, seats),
                    hours_before=entry.hours_before,
                    deadline_at=session.starts_at - timedelta(hours=entry.hours_before),
                    phase=entry.phase,
                    is_high_priority=entry.is_high_priority,
                    is_one_off=False,
                    position=entry.position,
                )
            )
            created += 1

        if created:
            self._db.flush()

        return created

    def get_item(self, item_id: UUID) -> ChecklistItemSnapshot | None:
        item = self._db.get(ChecklistItem, item_id)
        return None if item is None else self._snapshot(item)

    def set_completed(self, item_id: UUID, completed_at: datetime | None) -> ChecklistItemSnapshot:
        item = self._db.get_or_404(ChecklistItem, item_id)
        item.completed_at = completed_at

        # Ticking resolves the drift prompt: the host has now seen the new
        # quantity and acted on it.
        if completed_at is not None:
            item.needs_attention_since = None

        self._db.flush()
        return self._snapshot(item)

    def add_one_off(
        self, session_id: UUID, draft: ChecklistItemDraft, deadline_at: datetime
    ) -> ChecklistItemSnapshot:
        item = ChecklistItem(
            session_id=session_id,
            text_template=draft.text,
            # A one-off is authored for this date, so it carries no quantity
            # expression to rescale.
            rendered_text=draft.text,
            last_quantity=None,
            hours_before=draft.hours_before,
            deadline_at=deadline_at,
            phase=ChecklistPhase(draft.phase),
            is_one_off=True,
        )

        self._db.add(item)
        self._db.flush()

        return self._snapshot(item)
