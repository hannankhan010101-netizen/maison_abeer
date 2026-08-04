"""Request and response models for guests, bookings and the waitlist."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.models.enums import AllergySeverity, BookingStatus, MessageChannel

Phone = Annotated[str, Field(min_length=3, max_length=32)]
GuestName = Annotated[str, Field(min_length=1, max_length=160)]

RosterFilter = Literal[
    "all", "confirmed", "waitlisted", "cancelled", "attended", "regulars", "birthdays"
]


class AllergyIn(BaseModel):
    label: Annotated[str, Field(min_length=1, max_length=80)]
    severity: AllergySeverity = AllergySeverity.ALLERGY
    notes: str | None = Field(default=None, max_length=500)


class AllergyRead(AllergyIn):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    is_critical: bool
    """Drives the red-outlined chip and the day-of dashboard alert."""


class GuestCreate(BaseModel):
    """Add a guest.

    Contact details are optional: the PRD allows adding someone from a DM or a
    phone call with only a name. They are simply excluded from automated
    messages and badged so the host knows to reach them personally.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    full_name: GuestName
    phone: Phone | None = None
    email: EmailStr | None = None
    preferred_channel: MessageChannel = MessageChannel.WHATSAPP
    birthday: date | None = None
    memory_note: str | None = Field(default=None, max_length=2000)
    allergies: list[AllergyIn] = Field(default_factory=list)

    @model_validator(mode="after")
    def _channel_matches_details(self) -> GuestCreate:
        # A guest is allowed to have no contact details at all, but choosing
        # email as the channel while giving only a phone is a mistake worth
        # catching before it silently drops them from every send.
        if self.preferred_channel is MessageChannel.EMAIL and self.email is None and self.phone:
            raise ValueError("You picked email, but only gave a phone number.")
        return self


class GuestUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    full_name: GuestName | None = None
    phone: Phone | None = None
    email: EmailStr | None = None
    preferred_channel: MessageChannel | None = None
    birthday: date | None = None
    memory_note: str | None = Field(default=None, max_length=2000)
    opted_out: bool | None = None


class GuestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    phone: str | None
    email: str | None
    preferred_channel: MessageChannel
    opted_out: bool
    is_contactable: bool
    """False means automated messages skip them — the roster badges this."""
    visit_count: int
    visit_badge: str | None
    """"3rd visit", or null before it means anything."""
    is_regular: bool
    birthday: date | None
    days_until_birthday: int | None
    memory_note: str | None
    """"came with her sister; loved the matcha buttercream" (PRD §2.4)."""
    allergies: list[AllergyRead]
    available_credits: int


class BookingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    guest: GuestRead
    status: BookingStatus
    table_number: int | None
    sit_with_note: str | None
    booking_answers: dict[str, str] | None
    """Fun answers from booking — these become name tag subtext (PRD §2.3)."""


class RosterRead(BaseModel):
    session_id: UUID
    bookings: list[BookingRead]
    unassigned_count: int
    """Keeps the seating plan honest before tags are printed."""
    critical_allergy_count: int


class TableAssignment(BaseModel):
    table_number: int | None = Field(default=None, ge=1, le=99)
    """Null unassigns."""
    sit_with_note: str | None = Field(default=None, max_length=200)


class BookingCreate(BaseModel):
    guest_id: UUID
    booking_answers: dict[str, str] | None = None


class CancelBooking(BaseModel):
    """Cancelling prompts a choice (PRD §2.4).

    Money is off-platform in v1, so `refunded` only records what the host did;
    `credit` issues a rain-check that shows on the guest's next booking.
    """

    resolution: Literal["refunded", "credit"]
    note: str | None = Field(default=None, max_length=500)


class WaitlistEntryRead(BaseModel):
    id: UUID
    guest: GuestRead
    position: int
    """1-based, for guest-facing copy."""
    status: str
    invited_at: datetime | None
    invite_expires_at: datetime | None


class WaitlistRead(BaseModel):
    session_id: UUID
    entries: list[WaitlistEntryRead]


class InviteResult(BaseModel):
    invited_guest_id: UUID | None
    send_at: datetime | None
    """Already adjusted for quiet hours."""
    expired_count: int
    message: str
    """Host-facing copy, in the product voice."""


class BirthdayRead(BaseModel):
    guest_id: UUID
    full_name: str
    birthday: date
    days_away: int
    has_upcoming_booking: bool
    """Lets the host offer a treat on a class they're already attending."""
