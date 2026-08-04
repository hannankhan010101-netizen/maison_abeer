"""Session endpoints.

Thin: parse, delegate to `SessionService`, serialise. Any rule that needs a
decision belongs in the service or the domain, not here.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.schemas.session import (
    CapacityRead,
    DeadlineShiftRead,
    EnergyWarningRead,
    RescheduleImpactRead,
    RescheduleRequest,
    SeatChangeRequest,
    SessionCreate,
    SessionCreateResponse,
    SessionRead,
    SessionUpdate,
)
from app.services.sessions import SessionDraft, SessionService, SessionSnapshot

router = APIRouter(prefix="/sessions", tags=["sessions"])


def get_session_service() -> SessionService:  # pragma: no cover - overridden in wiring
    """Placeholder provider.

    Replaced by the real SQLAlchemy-backed provider at app wiring time and by
    an in-memory double in tests, so the router never constructs its own
    dependencies.
    """
    raise NotImplementedError("Session service provider is not configured.")


Service = Annotated[SessionService, Depends(get_session_service)]


def _to_read(snapshot: SessionSnapshot) -> SessionRead:
    capacity = snapshot.capacity

    return SessionRead(
        id=snapshot.id,
        class_type_id=snapshot.class_type_id,
        class_type_name=snapshot.class_type_name,
        color_token=snapshot.color_token,
        title=snapshot.title,
        location=snapshot.location,
        notes=snapshot.notes,
        starts_at=snapshot.starts_at,
        ends_at=snapshot.ends_at,
        status=snapshot.status,
        capacity=CapacityRead(
            seats=capacity.seats,
            booked=capacity.booked,
            available=capacity.available,
            state=capacity.state,
            waitlist_is_open=capacity.waitlist_is_open,
            accepts_bookings=capacity.accepts_bookings,
        ),
        unassigned_guest_count=snapshot.unassigned_guest_count,
        roster_changed_since_export=snapshot.roster_changed_since_export,
    )


@router.get("", response_model=list[SessionRead])
def list_sessions(
    service: Service,
    start: Annotated[datetime, Query(description="Inclusive window start (ISO 8601, with offset)")],
    end: Annotated[datetime, Query(description="Inclusive window end")],
) -> list[SessionRead]:
    """Sessions in a date window — the calendar's only read."""
    return [_to_read(item) for item in service.list_between(start, end)]


@router.get("/{session_id}", response_model=SessionRead)
def get_session(session_id: UUID, service: Service) -> SessionRead:
    return _to_read(service.get(session_id))


@router.post("", response_model=SessionCreateResponse, status_code=status.HTTP_201_CREATED)
def create_session(payload: SessionCreate, service: Service) -> SessionCreateResponse:
    """Quick-add, optionally repeating weekly."""
    result = service.create(
        SessionDraft(
            class_type_id=payload.class_type_id,
            starts_at=payload.starts_at,
            ends_at=payload.ends_at,
            seats=payload.seats,
            title=payload.title,
            location=payload.location,
            notes=payload.notes,
        ),
        payload.repeat_weekly_until,
    )

    return SessionCreateResponse(
        sessions=[_to_read(item) for item in result.sessions],
        energy=EnergyWarningRead(
            warning=result.energy.warning.value,
            message=result.energy.message,
        ),
    )


@router.patch("/{session_id}/seats", response_model=SessionRead)
def change_seats(session_id: UUID, payload: SeatChangeRequest, service: Service) -> SessionRead:
    """Adjust capacity.

    Refuses to drop below the current booking count, and rescales any
    quantity-linked prep steps (PRD §2.2, §2.5).
    """
    return _to_read(service.change_seat_count(session_id, payload.seats).session)


@router.post("/{session_id}/reschedule")
def reschedule_session(
    session_id: UUID, payload: RescheduleRequest, service: Service
) -> dict[str, object]:
    """Move a class.

    Two-step by design: without `confirm`, this previews the impact and writes
    nothing, so the host always sees who is affected before committing.
    """
    if not payload.confirm:
        impact = service.preview_reschedule(session_id, payload.starts_at)
        return {"preview": True, "impact": _impact_to_read(impact).model_dump(mode="json")}

    session, impact = service.reschedule(session_id, payload.starts_at)

    return {
        "preview": False,
        "session": _to_read(session).model_dump(mode="json"),
        "impact": _impact_to_read(impact).model_dump(mode="json"),
    }


@router.patch("/{session_id}/lock", response_model=SessionRead)
def set_lock(session_id: UUID, locked: bool, service: Service) -> SessionRead:
    return _to_read(service.set_locked(session_id, locked))


@router.patch("/{session_id}", response_model=SessionRead)
def update_session(session_id: UUID, payload: SessionUpdate, service: Service) -> SessionRead:
    """Quick-edit panel.

    Seat and time changes route through their dedicated operations so their
    side effects — rescaling, re-anchoring — can never be bypassed.
    """
    if payload.seats is not None:
        service.change_seat_count(session_id, payload.seats)

    if payload.starts_at is not None:
        service.reschedule(session_id, payload.starts_at)

    return _to_read(service.get(session_id))


def _impact_to_read(impact: object) -> RescheduleImpactRead:
    from app.domain.scheduling import RescheduleImpact

    assert isinstance(impact, RescheduleImpact)

    return RescheduleImpactRead(
        previous_start=impact.previous_start,
        new_start=impact.new_start,
        moves_earlier=impact.moves_earlier,
        affected_guest_count=impact.affected_guest_count,
        contactable_guest_count=impact.contactable_guest_count,
        requires_guest_notification=impact.requires_guest_notification,
        deadline_shifts=[
            DeadlineShiftRead(
                item_id=shift.item_id,
                label=shift.label,
                previous_deadline=shift.previous_deadline,
                new_deadline=shift.new_deadline,
                becomes_overdue_immediately=shift.becomes_overdue_immediately,
            )
            for shift in impact.deadline_shifts
        ],
        newly_overdue_count=len(impact.newly_overdue),
    )


def utcnow() -> datetime:
    return datetime.now(UTC)
