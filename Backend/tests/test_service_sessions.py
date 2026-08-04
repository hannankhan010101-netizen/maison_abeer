"""Session orchestration.

Covers the cross-module contracts of PRD §2.7 — the places where changing one
thing must change another. These are the behaviours most likely to rot as the
codebase grows, because nothing about a seat-count endpoint obviously implies
a checklist rewrite.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.core.errors import NotFoundError, PastSlotError, SeatsBelowBookingsError
from app.domain.quantities import QuantityLinkedItem
from app.domain.scheduling import ChecklistDeadline, EnergyWarning, TMinusOffset
from app.services.sessions import (
    MAX_RECURRENCE_OCCURRENCES,
    SessionDraft,
    SessionService,
    StudioContext,
)
from tests.fakes import FakeSessionRepository

NOW = datetime(2026, 8, 4, 9, 0, tzinfo=UTC)
SATURDAY = datetime(2026, 8, 8, 14, 0, tzinfo=UTC)


@pytest.fixture
def repo() -> FakeSessionRepository:
    return FakeSessionRepository()


@pytest.fixture
def service(repo: FakeSessionRepository) -> SessionService:
    return SessionService(repo, now=NOW)


class TestCreate:
    def test_creates_a_single_session(
        self, service: SessionService, repo: FakeSessionRepository
    ) -> None:
        class_type_id = uuid4()
        repo.class_type_ids.add(class_type_id)

        result = service.create(
            SessionDraft(
                class_type_id=class_type_id,
                starts_at=SATURDAY,
                ends_at=SATURDAY + timedelta(hours=2, minutes=30),
                seats=10,
            ),
            repeat_weekly_until=None,
        )

        assert len(result.sessions) == 1
        assert result.sessions[0].seats == 10
        assert result.energy.warning is EnergyWarning.NONE

    def test_expands_weekly_recurrence(
        self, service: SessionService, repo: FakeSessionRepository
    ) -> None:
        class_type_id = uuid4()
        repo.class_type_ids.add(class_type_id)

        result = service.create(
            SessionDraft(
                class_type_id=class_type_id,
                starts_at=SATURDAY,
                ends_at=SATURDAY + timedelta(hours=2),
                seats=8,
            ),
            repeat_weekly_until=SATURDAY + timedelta(weeks=3),
        )

        assert len(result.sessions) == 4
        starts = [s.starts_at for s in result.sessions]
        assert starts == [SATURDAY + timedelta(weeks=i) for i in range(4)]
        # Duration is preserved across the series.
        assert all(s.ends_at - s.starts_at == timedelta(hours=2) for s in result.sessions)

    def test_caps_runaway_recurrence(
        self, service: SessionService, repo: FakeSessionRepository
    ) -> None:
        class_type_id = uuid4()
        repo.class_type_ids.add(class_type_id)

        # A mistyped end date ten years out must not create thousands of rows.
        result = service.create(
            SessionDraft(
                class_type_id=class_type_id,
                starts_at=SATURDAY,
                ends_at=SATURDAY + timedelta(hours=2),
                seats=8,
            ),
            repeat_weekly_until=SATURDAY + timedelta(weeks=520),
        )

        assert len(result.sessions) == MAX_RECURRENCE_OCCURRENCES

    def test_rejects_a_slot_in_the_past(
        self, service: SessionService, repo: FakeSessionRepository
    ) -> None:
        class_type_id = uuid4()
        repo.class_type_ids.add(class_type_id)

        with pytest.raises(PastSlotError):
            service.create(
                SessionDraft(
                    class_type_id=class_type_id,
                    starts_at=NOW - timedelta(days=1),
                    ends_at=NOW,
                    seats=10,
                ),
                repeat_weekly_until=None,
            )

    def test_rejects_an_unknown_class_type(self, service: SessionService) -> None:
        with pytest.raises(NotFoundError):
            service.create(
                SessionDraft(
                    class_type_id=uuid4(),
                    starts_at=SATURDAY,
                    ends_at=SATURDAY + timedelta(hours=2),
                    seats=10,
                ),
                repeat_weekly_until=None,
            )

    def test_surfaces_a_rest_day_warning_without_blocking(
        self, repo: FakeSessionRepository
    ) -> None:
        repo.context = StudioContext(
            timezone="UTC", rest_days=frozenset({7}), weekly_class_cap=None
        )
        class_type_id = uuid4()
        repo.class_type_ids.add(class_type_id)
        service = SessionService(repo, now=NOW)

        sunday = datetime(2026, 8, 9, 14, 0, tzinfo=UTC)
        result = service.create(
            SessionDraft(
                class_type_id=class_type_id,
                starts_at=sunday,
                ends_at=sunday + timedelta(hours=2),
                seats=10,
            ),
            repeat_weekly_until=None,
        )

        # The system cares, it does not control: warned *and* saved.
        assert result.energy.warning is EnergyWarning.REST_DAY
        assert len(result.sessions) == 1


class TestSeatChanges:
    def test_refuses_to_drop_below_bookings(
        self, service: SessionService, repo: FakeSessionRepository
    ) -> None:
        session = repo.seed(seats=10, booked=8)

        with pytest.raises(SeatsBelowBookingsError, match="8 guests booked"):
            service.change_seat_count(session.id, 6)

        # Nothing was written.
        assert repo.sessions[session.id].seats == 10

    def test_rescales_quantity_linked_prep(
        self, service: SessionService, repo: FakeSessionRepository
    ) -> None:
        session = repo.seed(seats=10, booked=8)
        repo.quantities[session.id] = [
            QuantityLinkedItem(
                item_id="i1",
                label="bake cake bases",
                template="Bake {seats + 2} cake bases",
                last_quantity=12,
                completed=True,
            )
        ]

        result = service.change_seat_count(session.id, 12)

        assert result.session.seats == 12
        assert len(result.quantity_changes) == 1

        change = result.quantity_changes[0]
        assert change.previous_quantity == 12
        assert change.new_quantity == 14
        # Already ticked and now needs more — the host is told, not overruled.
        assert change.needs_attention is True

    def test_leaves_unlinked_prep_alone(
        self, service: SessionService, repo: FakeSessionRepository
    ) -> None:
        session = repo.seed(seats=10, booked=4)
        repo.quantities[session.id] = [
            QuantityLinkedItem(
                item_id="i1",
                label="wedge the clay",
                template="Wedge the clay",
                last_quantity=None,
            )
        ]

        result = service.change_seat_count(session.id, 12)

        assert result.quantity_changes == []
        assert repo.applied_quantity_changes == []

    def test_marks_the_sell_out_moment_once(
        self, service: SessionService, repo: FakeSessionRepository
    ) -> None:
        session = repo.seed(seats=12, booked=10)

        service.change_seat_count(session.id, 10)
        assert repo.sold_out_marks[session.id] == NOW

        # Already sold out — reducing again is not a new moment, no confetti.
        repo.sold_out_marks.clear()
        service.change_seat_count(session.id, 10)
        assert repo.sold_out_marks == {}


class TestReschedule:
    def _seed_with_deadlines(self, repo: FakeSessionRepository) -> object:
        session = repo.seed(starts_at=SATURDAY, ends_at=SATURDAY + timedelta(hours=2, minutes=30))
        repo.deadlines[session.id] = [
            ChecklistDeadline(
                "i1", "bake cake bases", TMinusOffset(24), TMinusOffset(24).resolve(SATURDAY)
            ),
            ChecklistDeadline(
                "i2", "set out sprinkles", TMinusOffset(1), TMinusOffset(1).resolve(SATURDAY)
            ),
        ]
        repo.guests[session.id] = (8, 8)
        return session

    def test_preview_writes_nothing(
        self, service: SessionService, repo: FakeSessionRepository
    ) -> None:
        session = self._seed_with_deadlines(repo)
        new_start = SATURDAY + timedelta(days=1)

        impact = service.preview_reschedule(session.id, new_start)  # type: ignore[attr-defined]

        assert impact.affected_guest_count == 8
        assert len(impact.deadline_shifts) == 2
        # The host sees the impact before anything commits.
        assert repo.sessions[session.id].starts_at == SATURDAY  # type: ignore[attr-defined]
        assert repo.reanchored == []

    def test_reschedule_moves_the_class_and_its_deadlines(
        self, service: SessionService, repo: FakeSessionRepository
    ) -> None:
        session = self._seed_with_deadlines(repo)
        new_start = SATURDAY + timedelta(days=1)

        updated, impact = service.reschedule(session.id, new_start)  # type: ignore[attr-defined]

        assert updated.starts_at == new_start
        # Duration is preserved.
        assert updated.ends_at - updated.starts_at == timedelta(hours=2, minutes=30)
        assert impact.affected_guest_count == 8

        # Every T-minus deadline followed the class (PRD §2.5).
        assert repo.reanchored == [(session.id, new_start)]  # type: ignore[attr-defined]
        moved = repo.deadlines[session.id]  # type: ignore[attr-defined]
        assert moved[0].deadline == new_start - timedelta(hours=24)
        assert moved[1].deadline == new_start - timedelta(hours=1)

    def test_rejects_moving_into_the_past(
        self, service: SessionService, repo: FakeSessionRepository
    ) -> None:
        session = self._seed_with_deadlines(repo)

        with pytest.raises(PastSlotError):
            service.reschedule(session.id, NOW - timedelta(days=2))  # type: ignore[attr-defined]

        assert repo.reanchored == []


class TestLookups:
    def test_unknown_session_is_not_found(self, service: SessionService) -> None:
        with pytest.raises(NotFoundError):
            service.get(uuid4())

    def test_lists_only_sessions_inside_the_window(
        self, service: SessionService, repo: FakeSessionRepository
    ) -> None:
        repo.seed(starts_at=SATURDAY)
        repo.seed(starts_at=SATURDAY + timedelta(days=30))

        found = service.list_between(SATURDAY - timedelta(days=1), SATURDAY + timedelta(days=1))

        assert len(found) == 1
