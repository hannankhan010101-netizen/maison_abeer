"""In-memory doubles.

Implements `SessionRepository` over dicts so the service and router can be
exercised end to end without Postgres. The behaviours modelled here are the
ones the service actually depends on — seat updates, deadline re-anchoring,
quantity storage — not a general-purpose database.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime
from uuid import UUID, uuid4

from app.domain.quantities import QuantityChange, QuantityLinkedItem, primary_quantity, render
from app.domain.scheduling import ChecklistDeadline
from app.services.sessions import SessionDraft, SessionSnapshot, StudioContext


class FakeSessionRepository:
    def __init__(
        self,
        *,
        context: StudioContext | None = None,
        class_type_ids: set[UUID] | None = None,
    ) -> None:
        self.context = context or StudioContext(
            timezone="UTC", rest_days=frozenset(), weekly_class_cap=None
        )
        self.class_type_ids = class_type_ids or set()
        self.sessions: dict[UUID, SessionSnapshot] = {}
        self.quantities: dict[UUID, list[QuantityLinkedItem]] = {}
        self.deadlines: dict[UUID, list[ChecklistDeadline]] = {}
        self.guests: dict[UUID, tuple[int, int]] = {}
        self.sold_out_marks: dict[UUID, datetime] = {}
        self.reanchored: list[tuple[UUID, datetime]] = []
        self.applied_quantity_changes: list[tuple[UUID, list[QuantityChange], int]] = []

    # -- helpers used by tests ---------------------------------------------

    def seed(self, **overrides: object) -> SessionSnapshot:
        class_type_id = overrides.pop("class_type_id", None) or uuid4()
        self.class_type_ids.add(class_type_id)  # type: ignore[arg-type]

        defaults: dict[str, object] = {
            "id": uuid4(),
            "class_type_id": class_type_id,
            "class_type_name": "Bento Cake Decorating",
            "color_token": "pink",
            "title": None,
            "starts_at": datetime.fromisoformat("2026-08-08T14:00:00+00:00"),
            "ends_at": datetime.fromisoformat("2026-08-08T16:30:00+00:00"),
            "status": "scheduled",
            "seats": 10,
            "booked": 8,
            "locked": False,
            "location": "Studio A",
            "notes": None,
            "unassigned_guest_count": 0,
            "roster_changed_since_export": False,
        }
        defaults.update(overrides)

        snapshot = SessionSnapshot(**defaults)  # type: ignore[arg-type]
        self.sessions[snapshot.id] = snapshot
        self.guests.setdefault(snapshot.id, (snapshot.booked, snapshot.booked))

        return snapshot

    # -- SessionRepository --------------------------------------------------

    def studio_context(self) -> StudioContext:
        return self.context

    def class_type_exists(self, class_type_id: UUID) -> bool:
        return class_type_id in self.class_type_ids

    def get_snapshot(self, session_id: UUID) -> SessionSnapshot | None:
        return self.sessions.get(session_id)

    def list_snapshots(self, start: datetime, end: datetime) -> list[SessionSnapshot]:
        return sorted(
            (s for s in self.sessions.values() if start <= s.starts_at <= end),
            key=lambda s: s.starts_at,
        )

    def existing_starts(self) -> list[datetime]:
        return [s.starts_at for s in self.sessions.values()]

    def create(self, draft: SessionDraft, recurrence_group_id: UUID | None) -> SessionSnapshot:
        _ = recurrence_group_id
        return self.seed(
            class_type_id=draft.class_type_id,
            starts_at=draft.starts_at,
            ends_at=draft.ends_at,
            seats=draft.seats,
            booked=0,
            title=draft.title,
            location=draft.location,
            notes=draft.notes,
        )

    def update_seats(self, session_id: UUID, seats: int) -> SessionSnapshot:
        updated = replace(self.sessions[session_id], seats=seats)
        self.sessions[session_id] = updated
        return updated

    def update_start(
        self, session_id: UUID, starts_at: datetime, ends_at: datetime
    ) -> SessionSnapshot:
        updated = replace(self.sessions[session_id], starts_at=starts_at, ends_at=ends_at)
        self.sessions[session_id] = updated
        return updated

    def set_status(self, session_id: UUID, status: str) -> SessionSnapshot:
        updated = replace(self.sessions[session_id], status=status, locked=status == "locked")
        self.sessions[session_id] = updated
        return updated

    def mark_sold_out(self, session_id: UUID, at: datetime) -> None:
        self.sold_out_marks[session_id] = at

    def quantity_items(self, session_id: UUID) -> list[QuantityLinkedItem]:
        return self.quantities.get(session_id, [])

    def apply_quantity_changes(
        self, session_id: UUID, changes: list[QuantityChange], seats: int
    ) -> None:
        self.applied_quantity_changes.append((session_id, list(changes), seats))

        updated: list[QuantityLinkedItem] = []
        for item in self.quantities.get(session_id, []):
            new_quantity = primary_quantity(item.template, seats)
            updated.append(
                QuantityLinkedItem(
                    item_id=item.item_id,
                    label=render(item.template, seats),
                    template=item.template,
                    last_quantity=new_quantity,
                    completed=item.completed,
                )
            )
        self.quantities[session_id] = updated

    def checklist_deadlines(self, session_id: UUID) -> list[ChecklistDeadline]:
        return self.deadlines.get(session_id, [])

    def reanchor_deadlines(self, session_id: UUID, new_start: datetime) -> None:
        self.reanchored.append((session_id, new_start))
        self.deadlines[session_id] = [
            replace(item, deadline=item.offset.resolve(new_start))
            for item in self.deadlines.get(session_id, [])
        ]

    def guest_counts(self, session_id: UUID) -> tuple[int, int]:
        return self.guests.get(session_id, (0, 0))
