"""Prep checklist endpoints."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.schemas.checklist import (
    ChecklistItemCreate,
    ChecklistItemRead,
    ChecklistItemUpdate,
    ChecklistRead,
)
from app.services.checklist import ChecklistItemDraft, ChecklistItemSnapshot, ChecklistService

router = APIRouter(tags=["checklist"])


def get_checklist_service() -> ChecklistService:  # pragma: no cover - overridden in wiring
    raise NotImplementedError("Checklist service provider is not configured.")


Service = Annotated[ChecklistService, Depends(get_checklist_service)]


def _to_read(item: ChecklistItemSnapshot, service: ChecklistService) -> ChecklistItemRead:
    return ChecklistItemRead(
        id=item.id,
        text=item.text,
        quantity=item.quantity,
        hours_before=item.hours_before,
        t_minus_label=item.t_minus_label,
        deadline_at=item.deadline_at,
        status=item.status(service.now),
        phase=item.phase,
        is_high_priority=item.is_high_priority,
        is_one_off=item.is_one_off,
        completed_at=item.completed_at,
        needs_attention=item.needs_attention,
    )


@router.get("/sessions/{session_id}/checklist", response_model=ChecklistRead)
def get_checklist(session_id: UUID, service: Service) -> ChecklistRead:
    """Prep for one class, with each deadline already classified."""
    summary = service.for_session(session_id)

    return ChecklistRead(
        session_id=session_id,
        items=[_to_read(item, service) for item in summary.items],
        completed_count=summary.completed_count,
        total_count=summary.total_count,
        overdue_count=summary.overdue_count,
    )


@router.patch("/checklist/{item_id}", response_model=ChecklistItemRead)
def update_item(item_id: UUID, payload: ChecklistItemUpdate, service: Service) -> ChecklistItemRead:
    """Tick or untick a step."""
    return _to_read(service.set_completed(item_id, payload.completed), service)


@router.post(
    "/sessions/{session_id}/checklist",
    response_model=ChecklistItemRead,
    status_code=status.HTTP_201_CREATED,
)
def add_one_off(
    session_id: UUID, payload: ChecklistItemCreate, service: Service
) -> ChecklistItemRead:
    """Add an ad-hoc step for this date only."""
    item = service.add_one_off(
        session_id,
        ChecklistItemDraft(
            text=payload.text,
            hours_before=payload.hours_before,
            phase=payload.phase.value,
        ),
    )

    return _to_read(item, service)
