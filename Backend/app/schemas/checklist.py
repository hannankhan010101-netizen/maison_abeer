"""Request and response models for prep checklists."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.domain.scheduling import DeadlineStatus
from app.models.enums import ChecklistPhase


class ChecklistItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    text: str
    """Already rendered — quantity expressions resolved for the seat count."""
    quantity: int | None
    hours_before: float
    t_minus_label: str
    """"T-24h", "at start", "T+2h"."""
    deadline_at: datetime
    status: DeadlineStatus
    phase: ChecklistPhase
    is_high_priority: bool
    is_one_off: bool
    completed_at: datetime | None
    needs_attention: bool
    """True when a capacity change moved this item's quantity after it was
    ticked — the host is told rather than the value being rewritten."""


class ChecklistRead(BaseModel):
    session_id: UUID
    items: list[ChecklistItemRead]
    completed_count: int
    total_count: int
    overdue_count: int

    @property
    def is_complete(self) -> bool:
        return self.total_count > 0 and self.completed_count == self.total_count


class ChecklistItemUpdate(BaseModel):
    completed: bool


class ChecklistItemCreate(BaseModel):
    """An ad-hoc step for one date only (PRD §2.5).

    One-off items never pollute the class type's template.
    """

    text: str
    hours_before: float = 1.0
    phase: ChecklistPhase = ChecklistPhase.PREP
