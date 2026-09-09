"""Checklist orchestration.

Reads instantiated items off a session, classifies each deadline, and records
completion. The timing rules live in `app.domain.scheduling`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

from app.core.errors import NotFoundError
from app.domain.scheduling import DeadlineStatus, TMinusOffset, deadline_status

if TYPE_CHECKING:
    from collections.abc import Sequence
    from datetime import datetime
    from uuid import UUID


@dataclass(frozen=True, slots=True)
class ChecklistItemSnapshot:
    id: UUID
    session_id: UUID
    text: str
    quantity: int | None
    hours_before: float
    deadline_at: datetime
    phase: str
    is_high_priority: bool
    is_one_off: bool
    completed_at: datetime | None
    needs_attention_since: datetime | None

    @property
    def is_complete(self) -> bool:
        return self.completed_at is not None

    @property
    def needs_attention(self) -> bool:
        return self.needs_attention_since is not None

    @property
    def t_minus_label(self) -> str:
        return TMinusOffset(hours_before=self.hours_before).label

    def status(self, now: datetime) -> DeadlineStatus:
        return deadline_status(self.deadline_at, now, completed=self.is_complete)


@dataclass(frozen=True, slots=True)
class ChecklistItemDraft:
    text: str
    hours_before: float
    phase: str


class ChecklistRepository(Protocol):
    def session_exists(self, session_id: UUID) -> bool: ...

    def session_start(self, session_id: UUID) -> datetime | None: ...

    def items_for_session(self, session_id: UUID) -> Sequence[ChecklistItemSnapshot]: ...

    def instantiate_template(self, session_id: UUID) -> int:
        """Copy the class type's template onto a session with no steps yet.

        Returns how many were created; zero when there is nothing to do.
        """
        ...

    def get_item(self, item_id: UUID) -> ChecklistItemSnapshot | None: ...

    def set_completed(
        self, item_id: UUID, completed_at: datetime | None
    ) -> ChecklistItemSnapshot: ...

    def add_one_off(
        self, session_id: UUID, draft: ChecklistItemDraft, deadline_at: datetime
    ) -> ChecklistItemSnapshot: ...


@dataclass(frozen=True, slots=True)
class ChecklistSummary:
    items: list[ChecklistItemSnapshot]
    completed_count: int
    total_count: int
    overdue_count: int


class ChecklistService:
    def __init__(self, repository: ChecklistRepository, *, now: datetime) -> None:
        self._repo = repository
        self._now = now

    @property
    def now(self) -> datetime:
        return self._now

    def for_session(self, session_id: UUID) -> ChecklistSummary:
        if not self._repo.session_exists(session_id):
            raise NotFoundError("We couldn't find that class.")

        items = list(self._repo.items_for_session(session_id))

        # First read of a class builds its checklist from the class type's
        # template. Without this the Prep module renders "no steps yet" for
        # every session forever — the templates exist, but nothing had ever
        # turned them into steps.
        if not items and self._repo.instantiate_template(session_id):
            items = list(self._repo.items_for_session(session_id))

        return ChecklistSummary(
            items=items,
            completed_count=sum(1 for item in items if item.is_complete),
            total_count=len(items),
            overdue_count=sum(
                1 for item in items if item.status(self._now) is DeadlineStatus.OVERDUE
            ),
        )

    def set_completed(self, item_id: UUID, completed: bool) -> ChecklistItemSnapshot:
        item = self._repo.get_item(item_id)

        if item is None:
            raise NotFoundError("We couldn't find that prep step.")

        # Unticking clears the completion time entirely rather than keeping a
        # stale one, so a re-tick records when it actually happened.
        return self._repo.set_completed(item_id, self._now if completed else None)

    def add_one_off(self, session_id: UUID, draft: ChecklistItemDraft) -> ChecklistItemSnapshot:
        """Add a step that lives only on this date (PRD §2.5)."""
        start = self._repo.session_start(session_id)

        if start is None:
            raise NotFoundError("We couldn't find that class.")

        deadline = TMinusOffset(hours_before=draft.hours_before).resolve(start)

        return self._repo.add_one_off(session_id, draft, deadline)
