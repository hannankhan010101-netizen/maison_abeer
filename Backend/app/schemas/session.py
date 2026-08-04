"""Request and response models for sessions.

Validation lives here so a malformed request never reaches domain code. Field
constraints mirror the database's CHECK constraints, giving a friendly 422
instead of a database error the host can't act on.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.domain.capacity import CapacityState
from app.models.enums import SessionStatus

# A workshop of 6-16 guests is the PRD's stated range; the ceiling is generous
# so a host running parallel stations is not blocked by our assumption.
Seats = Annotated[int, Field(ge=0, le=200)]


class SessionBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str | None = Field(default=None, max_length=160)
    location: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)


class SessionCreate(SessionBase):
    """Quick-add from a blank calendar date (PRD §2.2)."""

    class_type_id: UUID
    starts_at: datetime
    ends_at: datetime
    seats: Seats

    # Simple weekly recurrence: "repeat weekly until a chosen end date".
    repeat_weekly_until: datetime | None = None

    @field_validator("starts_at", "ends_at", "repeat_weekly_until")
    @classmethod
    def _must_be_aware(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("Timestamps must include a timezone offset.")
        return value

    @model_validator(mode="after")
    def _check_window(self) -> SessionCreate:
        if self.ends_at <= self.starts_at:
            raise ValueError("A class has to end after it starts.")

        if self.repeat_weekly_until is not None and self.repeat_weekly_until < self.starts_at:
            raise ValueError("The repeat end date is before the first class.")

        return self


class SessionUpdate(SessionBase):
    """Partial edit from the calendar's quick-edit panel."""

    starts_at: datetime | None = None
    ends_at: datetime | None = None
    seats: Seats | None = None

    @field_validator("starts_at", "ends_at")
    @classmethod
    def _must_be_aware(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("Timestamps must include a timezone offset.")
        return value

    @model_validator(mode="after")
    def _check_window(self) -> SessionUpdate:
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("A class has to end after it starts.")
        return self


class RescheduleRequest(BaseModel):
    """Drag-and-drop move. Two-step by design (PRD §2.2).

    The host sees the impact before anything saves, so `confirm=False` returns
    a preview and changes nothing.
    """

    starts_at: datetime
    confirm: bool = False
    notify_guests: bool = False

    @field_validator("starts_at")
    @classmethod
    def _must_be_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("Timestamps must include a timezone offset.")
        return value


class SeatChangeRequest(BaseModel):
    seats: Seats


class CapacityRead(BaseModel):
    seats: int
    booked: int
    available: int
    state: CapacityState
    waitlist_is_open: bool
    accepts_bookings: bool
    """Drives the ring, the chip copy and whether guests can be added."""


class DeadlineShiftRead(BaseModel):
    item_id: str
    """Opaque to the client. The domain treats checklist ids as strings."""
    label: str
    previous_deadline: datetime
    new_deadline: datetime
    becomes_overdue_immediately: bool


class RescheduleImpactRead(BaseModel):
    """Everything the confirmation modal must state before saving."""

    previous_start: datetime
    new_start: datetime
    moves_earlier: bool
    affected_guest_count: int
    contactable_guest_count: int
    requires_guest_notification: bool
    deadline_shifts: list[DeadlineShiftRead]
    newly_overdue_count: int


class EnergyWarningRead(BaseModel):
    """Advisory only — never blocks saving (PRD §2.2)."""

    warning: Literal["none", "rest_day", "weekly_cap", "back_to_back"]
    message: str


class SessionRead(SessionBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    class_type_id: UUID
    class_type_name: str
    color_token: str
    starts_at: datetime
    ends_at: datetime
    status: SessionStatus
    capacity: CapacityRead
    unassigned_guest_count: int
    """Keeps the seating plan honest before tags are printed (PRD §2.4)."""
    roster_changed_since_export: bool
    """Raises the "re-export tags?" banner (PRD §2.3)."""


class SessionCreateResponse(BaseModel):
    sessions: list[SessionRead]
    """More than one when weekly recurrence was requested."""
    energy: EnergyWarningRead
