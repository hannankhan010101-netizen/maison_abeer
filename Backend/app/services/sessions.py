"""Session orchestration.

Sits between HTTP and persistence. All the *rules* live in `app.domain`; this
layer's job is to load what those rules need, apply the result, and keep the
cross-module contracts of PRD §2.7 — a capacity change rescales the checklist,
a reschedule re-anchors every deadline.

Persistence is behind `SessionRepository` so this logic is testable without a
database, which is where most of its risk lives.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Protocol

from app.core.errors import (
    ConflictError,
    NotFoundError,
    PastSlotError,
    SeatsBelowBookingsError,
    SessionLockedError,
)
from app.domain.capacity import Capacity, SeatChange, SeatChangeError, change_seats
from app.domain.quantities import QuantityChange, QuantityLinkedItem, rescale
from app.domain.scheduling import (
    ChecklistDeadline,
    EnergyAssessment,
    RescheduleError,
    RescheduleImpact,
    assess_energy,
    plan_reschedule,
)

if TYPE_CHECKING:
    from collections.abc import Sequence
    from uuid import UUID

MAX_RECURRENCE_OCCURRENCES = 52
"""A year of weekly classes. Guards against a typo creating thousands of rows."""


@dataclass(frozen=True, slots=True)
class SessionSnapshot:
    """Everything the API needs about one session, already assembled."""

    id: UUID
    class_type_id: UUID
    class_type_name: str
    color_token: str
    title: str | None
    starts_at: datetime
    ends_at: datetime
    status: str
    seats: int
    booked: int
    locked: bool
    location: str | None
    notes: str | None
    unassigned_guest_count: int
    roster_changed_since_export: bool

    @property
    def capacity(self) -> Capacity:
        return Capacity(seats=self.seats, booked=self.booked, locked=self.locked)


@dataclass(frozen=True, slots=True)
class StudioContext:
    """The host's settings, needed to evaluate scheduling rules."""

    timezone: str
    rest_days: frozenset[int]
    weekly_class_cap: int | None


@dataclass(frozen=True, slots=True)
class SessionDraft:
    class_type_id: UUID
    starts_at: datetime
    ends_at: datetime
    seats: int
    title: str | None = None
    location: str | None = None
    notes: str | None = None


class SessionRepository(Protocol):
    """Persistence operations this service needs.

    A Protocol rather than a base class so the SQLAlchemy implementation and
    the in-memory test double stay independent.
    """

    def studio_context(self) -> StudioContext: ...

    def class_type_exists(self, class_type_id: UUID) -> bool: ...

    def get_snapshot(self, session_id: UUID) -> SessionSnapshot | None: ...

    def list_snapshots(self, start: datetime, end: datetime) -> Sequence[SessionSnapshot]: ...

    def existing_starts(self) -> Sequence[datetime]: ...

    def create(self, draft: SessionDraft, recurrence_group_id: UUID | None) -> SessionSnapshot: ...

    def update_seats(self, session_id: UUID, seats: int) -> SessionSnapshot: ...

    def update_start(
        self, session_id: UUID, starts_at: datetime, ends_at: datetime
    ) -> SessionSnapshot: ...

    def set_status(self, session_id: UUID, status: str) -> SessionSnapshot: ...

    def mark_sold_out(self, session_id: UUID, at: datetime) -> None: ...

    def quantity_items(self, session_id: UUID) -> Sequence[QuantityLinkedItem]: ...

    def apply_quantity_changes(
        self, session_id: UUID, changes: Sequence[QuantityChange], seats: int
    ) -> None: ...

    def checklist_deadlines(self, session_id: UUID) -> Sequence[ChecklistDeadline]: ...

    def reanchor_deadlines(self, session_id: UUID, new_start: datetime) -> None: ...

    # Returns (affected, contactable). `contactable` excludes guests who have
    # opted out or have no contact details, so the caller never offers to
    # notify people it cannot reach.
    def guest_counts(self, session_id: UUID) -> tuple[int, int]: ...


@dataclass(frozen=True, slots=True)
class CreateResult:
    sessions: list[SessionSnapshot]
    energy: EnergyAssessment


@dataclass(frozen=True, slots=True)
class SeatChangeResult:
    session: SessionSnapshot
    change: SeatChange
    quantity_changes: list[QuantityChange]
    """Non-empty when prep quantities moved — the host is told, not overruled."""


class SessionService:
    def __init__(self, repository: SessionRepository, *, now: datetime) -> None:
        self._repo = repository
        self._now = now

    # -- reads --------------------------------------------------------------

    def get(self, session_id: UUID) -> SessionSnapshot:
        snapshot = self._repo.get_snapshot(session_id)

        if snapshot is None:
            raise NotFoundError("We couldn't find that class.")

        return snapshot

    def list_between(self, start: datetime, end: datetime) -> Sequence[SessionSnapshot]:
        if end < start:
            raise ConflictError("That date range runs backwards.")

        return self._repo.list_snapshots(start, end)

    # -- create -------------------------------------------------------------

    def create(self, draft: SessionDraft, repeat_weekly_until: datetime | None) -> CreateResult:
        if draft.starts_at < self._now:
            raise PastSlotError("That slot is in the past. Pick a time from now onwards.")

        if not self._repo.class_type_exists(draft.class_type_id):
            raise NotFoundError("We couldn't find that class type.")

        context = self._repo.studio_context()

        # Advisory only: assessed once for the first occurrence and returned
        # alongside the created sessions. It never blocks the save.
        energy = assess_energy(
            proposed_start=draft.starts_at,
            existing_starts=list(self._repo.existing_starts()),
            rest_days=context.rest_days,
            weekly_cap=context.weekly_class_cap,
            timezone=context.timezone,
        )

        drafts = self._expand_recurrence(draft, repeat_weekly_until)
        group_id = uuid4_if(len(drafts) > 1)

        created = [self._repo.create(item, group_id) for item in drafts]

        return CreateResult(sessions=created, energy=energy)

    def _expand_recurrence(
        self, draft: SessionDraft, repeat_weekly_until: datetime | None
    ) -> list[SessionDraft]:
        if repeat_weekly_until is None:
            return [draft]

        duration = draft.ends_at - draft.starts_at
        occurrences: list[SessionDraft] = []
        cursor = draft.starts_at

        while cursor <= repeat_weekly_until and len(occurrences) < MAX_RECURRENCE_OCCURRENCES:
            occurrences.append(
                SessionDraft(
                    class_type_id=draft.class_type_id,
                    starts_at=cursor,
                    ends_at=cursor + duration,
                    seats=draft.seats,
                    title=draft.title,
                    location=draft.location,
                    notes=draft.notes,
                )
            )
            cursor += timedelta(weeks=1)

        return occurrences

    # -- seats --------------------------------------------------------------

    def change_seat_count(self, session_id: UUID, seats: int) -> SeatChangeResult:
        snapshot = self.get(session_id)

        try:
            change = change_seats(snapshot.capacity, seats)
        except SeatChangeError as exc:
            # The domain refusal already explains itself in the product voice.
            raise SeatsBelowBookingsError(str(exc)) from exc

        updated = self._repo.update_seats(session_id, seats)

        # PRD §2.5: prep and capacity can never silently drift apart.
        quantity_changes = rescale(list(self._repo.quantity_items(session_id)), seats)
        if quantity_changes:
            self._repo.apply_quantity_changes(session_id, quantity_changes, seats)

        if change.triggers_sold_out:
            # Stamped once, so the confetti and milestone fire exactly one time.
            self._repo.mark_sold_out(session_id, self._now)

        return SeatChangeResult(
            session=updated,
            change=change,
            quantity_changes=quantity_changes,
        )

    # -- reschedule ---------------------------------------------------------

    def preview_reschedule(self, session_id: UUID, new_start: datetime) -> RescheduleImpact:
        snapshot = self.get(session_id)
        affected, contactable = self._repo.guest_counts(session_id)

        try:
            return plan_reschedule(
                previous_start=snapshot.starts_at,
                new_start=new_start,
                now=self._now,
                deadlines=list(self._repo.checklist_deadlines(session_id)),
                affected_guest_count=affected,
                contactable_guest_count=contactable,
            )
        except RescheduleError as exc:
            raise PastSlotError(str(exc)) from exc

    def reschedule(
        self, session_id: UUID, new_start: datetime
    ) -> tuple[SessionSnapshot, RescheduleImpact]:
        snapshot = self.get(session_id)

        # Computed before the move so the caller can report exactly what
        # changed, and so an invalid move is rejected before anything writes.
        impact = self.preview_reschedule(session_id, new_start)

        duration = snapshot.ends_at - snapshot.starts_at
        updated = self._repo.update_start(session_id, new_start, new_start + duration)

        # Every T-minus deadline follows the class (PRD §2.5).
        self._repo.reanchor_deadlines(session_id, new_start)

        return updated, impact

    # -- locking ------------------------------------------------------------

    def set_locked(self, session_id: UUID, locked: bool) -> SessionSnapshot:
        snapshot = self.get(session_id)

        if locked and snapshot.status == "cancelled":
            raise SessionLockedError("That class is cancelled, so there's nothing to lock.")

        return self._repo.set_status(session_id, "locked" if locked else "scheduled")


def uuid4_if(condition: bool) -> UUID | None:
    """A recurrence group id, only when there is actually a series."""
    from uuid import uuid4

    return uuid4() if condition else None
