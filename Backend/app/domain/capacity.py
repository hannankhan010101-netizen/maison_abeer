"""Seat capacity rules.

Pure functions over value objects — no ORM, no FastAPI. The dashboard capacity
ring, the calendar's seat editor and the waitlist all derive from here, so the
"8 of 10 seats" a host sees can never disagree with what the API enforces.

PRD references: §2.1 (capacity ring states), §2.2 (live slot adjustment),
§2.4 (waitlist opens at capacity).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

# Fill thresholds for the ring's visual state. Expressed as a fraction of
# capacity so they hold for a 6-seat class and a 16-seat class alike.
FILLING_AT = 0.40
NEARLY_FULL_AT = 0.80


class CapacityState(StrEnum):
    """Visual state of the capacity ring (PRD §2.1)."""

    OPEN = "open"
    FILLING = "filling"
    NEARLY_FULL = "nearly_full"
    SOLD_OUT = "sold_out"


class SeatChangeError(ValueError):
    """Raised when a seat count change would invalidate existing bookings."""


@dataclass(frozen=True, slots=True)
class Capacity:
    """A session's seat position at a point in time.

    Attributes:
        seats: Total seats offered.
        booked: Confirmed bookings occupying a seat.
        locked: Host has closed the session to new bookings (PRD §2.2).
    """

    seats: int
    booked: int
    locked: bool = False

    def __post_init__(self) -> None:
        if self.seats < 0:
            raise ValueError("seats cannot be negative")
        if self.booked < 0:
            raise ValueError("booked cannot be negative")

    @property
    def available(self) -> int:
        """Seats a new guest could take. Never negative."""
        return max(0, self.seats - self.booked)

    @property
    def fraction(self) -> float:
        """Fill level in 0.0–1.0. A zero-seat session reads as full, not empty."""
        if self.seats == 0:
            return 1.0
        return min(1.0, self.booked / self.seats)

    @property
    def is_sold_out(self) -> bool:
        return self.booked >= self.seats

    @property
    def accepts_bookings(self) -> bool:
        """A locked session shows 'Fully booked' wherever guests are added."""
        return not self.locked and not self.is_sold_out

    @property
    def state(self) -> CapacityState:
        if self.is_sold_out:
            return CapacityState.SOLD_OUT
        if self.fraction >= NEARLY_FULL_AT:
            return CapacityState.NEARLY_FULL
        if self.fraction >= FILLING_AT:
            return CapacityState.FILLING
        return CapacityState.OPEN

    @property
    def waitlist_is_open(self) -> bool:
        """The waitlist opens automatically once a session reaches capacity."""
        return self.is_sold_out


@dataclass(frozen=True, slots=True)
class SeatChange:
    """The outcome of changing a session's seat count."""

    previous_seats: int
    new_seats: int
    delta: int
    seats_freed: int
    """Newly available seats — drives the 'invite next from waitlist?' offer."""
    triggers_sold_out: bool
    """True when this change causes the session to become sold out."""


def change_seats(current: Capacity, new_seats: int) -> SeatChange:
    """Validate and describe a seat-count change.

    Decreasing below the current booking count is blocked outright, because
    the alternative is silently un-booking a guest who has already been told
    they have a seat (PRD §2.2).

    Raises:
        SeatChangeError: if `new_seats` is negative or below current bookings.
    """
    if new_seats < 0:
        raise SeatChangeError("A session cannot have a negative number of seats.")

    if new_seats < current.booked:
        raise SeatChangeError(
            f"You have {current.booked} guests booked, so you cannot drop to "
            f"{new_seats} seats. Cancel a booking first if someone can't make it."
        )

    delta = new_seats - current.seats
    after = Capacity(seats=new_seats, booked=current.booked, locked=current.locked)

    return SeatChange(
        previous_seats=current.seats,
        new_seats=new_seats,
        delta=delta,
        seats_freed=max(0, after.available - current.available),
        triggers_sold_out=after.is_sold_out and not current.is_sold_out,
    )


def can_book(capacity: Capacity) -> bool:
    """Whether one more guest can take a seat right now."""
    return capacity.accepts_bookings and capacity.available > 0


def ring_dash_offset(capacity: Capacity, circumference: float = 264.0) -> float:
    """SVG `stroke-dashoffset` for the capacity ring.

    The prototype hardcodes `stroke-dasharray: 264` for an r=42 circle; this
    keeps the frontend from re-deriving the same arithmetic in two components.
    """
    return round(circumference * (1.0 - capacity.fraction), 2)
