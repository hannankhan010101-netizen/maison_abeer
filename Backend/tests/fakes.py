"""In-memory doubles.

Implements `SessionRepository` over dicts so the service and router can be
exercised end to end without Postgres. The behaviours modelled here are the
ones the service actually depends on — seat updates, deadline re-anchoring,
quantity storage — not a general-purpose database.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import replace
from datetime import datetime
from typing import Any, cast
from uuid import UUID, uuid4

from app.domain.quantities import QuantityChange, QuantityLinkedItem, primary_quantity, render
from app.domain.scheduling import ChecklistDeadline
from app.services.sessions import (
    ClassTypeOption,
    SessionDraft,
    SessionSnapshot,
    StudioContext,
)


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
        self.class_types: dict[UUID, ClassTypeOption] = {
            class_type_id: ClassTypeOption(
                id=class_type_id,
                name=f"Class {index + 1}",
                # A palette token name, not a credential — the S105 heuristic
                # only sees "token".
                color_token="pink",  # noqa: S106
                default_seats=10,
                default_duration_minutes=150,
            )
            for index, class_type_id in enumerate(sorted(self.class_type_ids))
        }
        self.sessions: dict[UUID, SessionSnapshot] = {}
        self.quantities: dict[UUID, list[QuantityLinkedItem]] = {}
        self.deadlines: dict[UUID, list[ChecklistDeadline]] = {}
        self.guests: dict[UUID, tuple[int, int]] = {}
        self.sold_out_marks: dict[UUID, datetime] = {}
        self.reanchored: list[tuple[UUID, datetime]] = []
        self.change_notices: list[tuple[UUID, datetime]] = []
        self.pending_messages: dict[UUID, int] = {}
        self.message_reanchors: list[tuple[UUID, datetime, datetime]] = []
        self.applied_quantity_changes: list[tuple[UUID, Sequence[QuantityChange], int]] = []

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
        self.class_types.setdefault(
            snapshot.class_type_id,
            ClassTypeOption(
                id=snapshot.class_type_id,
                name=snapshot.class_type_name,
                color_token=snapshot.color_token,
                default_seats=snapshot.seats,
                default_duration_minutes=150,
            ),
        )
        self.sessions[snapshot.id] = snapshot
        self.guests.setdefault(snapshot.id, (snapshot.booked, snapshot.booked))

        return snapshot

    def seed_class_type(self, name: str, **overrides: object) -> ClassTypeOption:
        """A class type with no sessions — a studio that has not opened yet."""
        class_type_id = overrides.pop("id", None) or uuid4()

        defaults: dict[str, object] = {
            "id": class_type_id,
            "name": name,
            "color_token": "pink",
            "default_seats": 10,
            "default_duration_minutes": 150,
        }
        defaults.update(overrides)

        option = ClassTypeOption(**defaults)  # type: ignore[arg-type]
        self.class_types[option.id] = option
        self.class_type_ids.add(option.id)

        return option

    # -- SessionRepository --------------------------------------------------

    def studio_context(self) -> StudioContext:
        return self.context

    def class_type_exists(self, class_type_id: UUID) -> bool:
        return class_type_id in self.class_type_ids

    def list_class_types(self) -> list[ClassTypeOption]:
        return sorted(self.class_types.values(), key=lambda option: option.name)

    def get_snapshot(self, session_id: UUID) -> SessionSnapshot | None:
        return self.sessions.get(session_id)

    def update_details(self, session_id: UUID, changes: Mapping[str, object]) -> SessionSnapshot:
        # The service has already checked the keys against `DETAIL_FIELDS`, so
        # the widening here is what the Protocol's `object` values cost, not a
        # hole in the validation.
        fields = cast("dict[str, Any]", dict(changes))
        updated = replace(self.sessions[session_id], **fields)
        self.sessions[session_id] = updated
        return updated

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
        self, session_id: UUID, changes: Sequence[QuantityChange], seats: int
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

    def schedule_change_notices(self, session_id: UUID, now: datetime) -> tuple[int, int]:
        """Records the call and answers with (queued, skipped).

        Skipped counts the guests the real repository would drop — those who
        opted out or have no contact details — which is what `guest_counts`
        already models as the affected/contactable split.
        """
        self.change_notices.append((session_id, now))

        affected, contactable = self.guests.get(session_id, (0, 0))

        return contactable, affected - contactable

    def pending_message_count(self, session_id: UUID) -> int:
        return self.pending_messages.get(session_id, 0)

    def reanchor_messages(
        self, session_id: UUID, new_start: datetime, now: datetime
    ) -> tuple[int, int]:
        """Records the call and answers with (re-anchored, cancelled).

        Cancelled models the real rule: a class moved inside a reminder's
        window has no honest send time left, so the row is cancelled rather
        than sent late or blasted immediately.
        """
        self.message_reanchors.append((session_id, new_start, now))

        pending = self.pending_messages.get(session_id, 0)

        if not pending:
            return 0, 0

        cancelled = pending if new_start <= now else 0

        return pending - cancelled, cancelled

    def guest_counts(self, session_id: UUID) -> tuple[int, int]:
        return self.guests.get(session_id, (0, 0))
