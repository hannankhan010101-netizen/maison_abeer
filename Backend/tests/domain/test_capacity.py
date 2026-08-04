"""Seat capacity rules."""

from __future__ import annotations

import pytest

from app.domain.capacity import (
    Capacity,
    CapacityState,
    SeatChangeError,
    can_book,
    change_seats,
    ring_dash_offset,
)


class TestCapacityState:
    @pytest.mark.parametrize(
        ("booked", "seats", "expected"),
        [
            (0, 10, CapacityState.OPEN),
            (3, 10, CapacityState.OPEN),
            (4, 10, CapacityState.FILLING),
            (7, 10, CapacityState.FILLING),
            (8, 10, CapacityState.NEARLY_FULL),
            (9, 10, CapacityState.NEARLY_FULL),
            (10, 10, CapacityState.SOLD_OUT),
        ],
    )
    def test_state_by_fill_level(self, booked: int, seats: int, expected: CapacityState) -> None:
        assert Capacity(seats=seats, booked=booked).state is expected

    def test_thresholds_hold_for_small_classes(self) -> None:
        # A 6-seat class should reach the same states proportionally.
        assert Capacity(seats=6, booked=5).state is CapacityState.NEARLY_FULL
        assert Capacity(seats=6, booked=6).state is CapacityState.SOLD_OUT

    def test_overbooking_still_reads_as_sold_out(self) -> None:
        # Defensive: a manual add could exceed capacity; never report negative.
        capacity = Capacity(seats=10, booked=11)
        assert capacity.state is CapacityState.SOLD_OUT
        assert capacity.available == 0
        assert capacity.fraction == 1.0

    def test_zero_seat_session_is_full_not_empty(self) -> None:
        assert Capacity(seats=0, booked=0).state is CapacityState.SOLD_OUT

    def test_rejects_negative_inputs(self) -> None:
        with pytest.raises(ValueError, match="seats cannot be negative"):
            Capacity(seats=-1, booked=0)
        with pytest.raises(ValueError, match="booked cannot be negative"):
            Capacity(seats=10, booked=-1)


class TestWaitlistAndLocking:
    def test_waitlist_opens_at_capacity(self) -> None:
        assert Capacity(seats=10, booked=10).waitlist_is_open
        assert not Capacity(seats=10, booked=9).waitlist_is_open

    def test_locked_session_refuses_bookings_with_seats_free(self) -> None:
        capacity = Capacity(seats=10, booked=4, locked=True)

        assert capacity.available == 6
        assert capacity.accepts_bookings is False
        assert can_book(capacity) is False

    def test_open_session_accepts_bookings(self) -> None:
        assert can_book(Capacity(seats=10, booked=4)) is True


class TestChangeSeats:
    def test_increasing_seats_frees_seats(self) -> None:
        change = change_seats(Capacity(seats=10, booked=10), new_seats=12)

        assert change.delta == 2
        assert change.seats_freed == 2
        assert change.triggers_sold_out is False

    def test_decreasing_to_exactly_the_booking_count_is_allowed(self) -> None:
        change = change_seats(Capacity(seats=10, booked=8), new_seats=8)

        assert change.delta == -2
        assert change.seats_freed == 0
        assert change.triggers_sold_out is True

    def test_decreasing_below_bookings_is_blocked(self) -> None:
        with pytest.raises(SeatChangeError) as excinfo:
            change_seats(Capacity(seats=10, booked=8), new_seats=6)

        message = str(excinfo.value)
        assert "8 guests booked" in message
        assert "cannot drop to 6" in message
        # The refusal explains itself rather than just failing (PRD §2.2).
        assert "Cancel a booking first" in message

    def test_negative_seats_are_rejected(self) -> None:
        with pytest.raises(SeatChangeError, match="negative"):
            change_seats(Capacity(seats=10, booked=0), new_seats=-1)

    def test_reports_sold_out_transition_only_once(self) -> None:
        already_full = Capacity(seats=10, booked=10)
        change = change_seats(already_full, new_seats=10)

        # Already sold out, so this is not a new sell-out moment — no confetti.
        assert change.triggers_sold_out is False


class TestRingGeometry:
    def test_empty_ring_is_fully_offset(self) -> None:
        assert ring_dash_offset(Capacity(seats=10, booked=0)) == 264.0

    def test_full_ring_has_no_offset(self) -> None:
        assert ring_dash_offset(Capacity(seats=10, booked=10)) == 0.0

    def test_matches_the_prototype_at_eight_of_ten(self) -> None:
        # The prototype hardcodes stroke-dashoffset: 53 for 8/10.
        assert ring_dash_offset(Capacity(seats=10, booked=8)) == pytest.approx(52.8, abs=0.5)
