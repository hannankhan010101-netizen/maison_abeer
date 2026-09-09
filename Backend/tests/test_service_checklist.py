"""The prep checklist service.

Written because of a bug an audit found, not a hypothetical one: the Prep
module rendered "no steps yet" for every class in the studio. Six template
rows existed, every session existed, and nothing ever copied one onto the
other — the step between them had never been built, and no test noticed
because there were none for this service at all.

So these weigh towards the instantiation rule and, especially, its limits. A
checklist that re-populates itself after a host clears it is worse than one
that never populates: the first looks broken, the second argues with you.
"""

from __future__ import annotations

import uuid
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from app.core.errors import NotFoundError
from app.services.checklist import (
    ChecklistItemDraft,
    ChecklistItemSnapshot,
    ChecklistService,
)

NOW = datetime(2026, 8, 16, 12, 0, tzinfo=UTC)
SESSION = uuid.uuid4()


def snapshot(**overrides: object) -> ChecklistItemSnapshot:
    base = ChecklistItemSnapshot(
        id=uuid.uuid4(),
        session_id=SESSION,
        text="Bake 10 cake bases",
        quantity=10,
        hours_before=24.0,
        deadline_at=NOW + timedelta(hours=6),
        phase="prep",
        is_high_priority=False,
        is_one_off=False,
        completed_at=None,
        needs_attention_since=None,
    )
    return replace(base, **overrides)  # type: ignore[arg-type]


class FakeRepo:
    """Records what the service asks for, so the *sequence* can be asserted."""

    def __init__(self, items: list[ChecklistItemSnapshot], template_size: int = 0) -> None:
        self.items = items
        self.template_size = template_size
        self.instantiate_calls = 0
        self.read_calls = 0

    def session_exists(self, session_id: uuid.UUID) -> bool:
        return True

    def session_start(self, session_id: uuid.UUID) -> datetime | None:
        return NOW + timedelta(days=1)

    def items_for_session(self, session_id: uuid.UUID) -> list[ChecklistItemSnapshot]:
        self.read_calls += 1
        return list(self.items)

    def instantiate_template(self, session_id: uuid.UUID) -> int:
        self.instantiate_calls += 1
        # Stands in for the real copy: the rows now exist.
        self.items = [snapshot() for _ in range(self.template_size)]
        return self.template_size

    def get_item(self, item_id: uuid.UUID) -> ChecklistItemSnapshot | None:
        return next((i for i in self.items if i.id == item_id), None)

    def set_completed(
        self, item_id: uuid.UUID, completed_at: datetime | None
    ) -> ChecklistItemSnapshot:
        found = self.get_item(item_id)
        assert found is not None
        updated = replace(found, completed_at=completed_at)
        self.items = [updated if i.id == item_id else i for i in self.items]
        return updated

    def add_one_off(
        self, session_id: uuid.UUID, draft: ChecklistItemDraft, deadline_at: datetime
    ) -> ChecklistItemSnapshot:
        made = snapshot(
            session_id=session_id,
            text=draft.text,
            hours_before=draft.hours_before,
            phase=draft.phase,
            deadline_at=deadline_at,
            is_one_off=True,
            quantity=None,
        )
        self.items.append(made)
        return made


def service(repo: FakeRepo) -> ChecklistService:
    # No cast: `FakeRepo` structurally satisfies `ChecklistRepository`, and
    # mypy checking that is the point — a fake that quietly drifts from the
    # protocol tests something the application no longer does.
    return ChecklistService(repo, now=NOW)


# ---------------------------------------------------------------------------
# Instantiating the template
# ---------------------------------------------------------------------------


def test_an_empty_checklist_is_built_from_the_template() -> None:
    """The bug. Every class showed "no steps yet" while templates sat unused."""
    repo = FakeRepo(items=[], template_size=6)

    summary = service(repo).for_session(SESSION)

    assert repo.instantiate_calls == 1
    assert summary.total_count == 6


def test_a_checklist_that_already_has_steps_is_left_alone() -> None:
    """Instantiating over existing steps would duplicate every one of them."""
    repo = FakeRepo(items=[snapshot(), snapshot()], template_size=6)

    summary = service(repo).for_session(SESSION)

    assert repo.instantiate_calls == 0
    assert summary.total_count == 2


def test_a_class_type_with_no_template_is_not_retried_into_a_loop() -> None:
    """Zero created must not be mistaken for "try reading again".

    The service re-reads only when something was actually written. Re-reading
    on a zero would be a wasted query on every single page load for any class
    whose type has no template.
    """
    repo = FakeRepo(items=[], template_size=0)

    summary = service(repo).for_session(SESSION)

    assert repo.instantiate_calls == 1
    assert repo.read_calls == 1
    assert summary.total_count == 0


def test_a_completed_item_counts_towards_progress() -> None:
    repo = FakeRepo(items=[snapshot(completed_at=NOW), snapshot()])

    summary = service(repo).for_session(SESSION)

    assert summary.completed_count == 1
    assert summary.total_count == 2


def test_an_overdue_item_is_counted() -> None:
    repo = FakeRepo(items=[snapshot(deadline_at=NOW - timedelta(hours=3))])

    assert service(repo).for_session(SESSION).overdue_count == 1


def test_a_completed_item_is_never_overdue() -> None:
    """A step done late is done, not outstanding."""
    repo = FakeRepo(items=[snapshot(deadline_at=NOW - timedelta(hours=3), completed_at=NOW)])

    assert service(repo).for_session(SESSION).overdue_count == 0


class MissingSessionRepo(FakeRepo):
    """A repository whose session is gone. Subclassed rather than
    monkey-patched so the override is a real method with a real signature."""

    def session_exists(self, session_id: uuid.UUID) -> bool:
        return False


def test_an_unknown_class_is_a_404_not_an_empty_checklist() -> None:
    repo = MissingSessionRepo(items=[])

    with pytest.raises(NotFoundError):
        service(repo).for_session(SESSION)

    # And it never tries to build a checklist for a class that is not there.
    assert repo.instantiate_calls == 0
