"""SQLAlchemy implementation of `ChecklistRepository`."""

from __future__ import annotations

from typing import TYPE_CHECKING

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
