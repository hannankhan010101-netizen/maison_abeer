"""Shapes for a guest's class history (PRD §2.4)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import BookingStatus, CreditStatus


class GuestVisit(BaseModel):
    """One class this guest booked, past or upcoming."""

    booking_id: UUID
    session_id: UUID
    class_name: str
    starts_at: datetime
    location: str | None = None
    status: BookingStatus
    table_number: int | None = None

    is_upcoming: bool
    """Split here rather than in the client, so both agree on 'now'."""


class GuestCreditRead(BaseModel):
    id: UUID
    status: CreditStatus
    note: str | None = None
    expires_at: datetime | None = None
    created_at: datetime


class GuestHistory(BaseModel):
    guest_id: UUID
    visits: list[GuestVisit] = Field(default_factory=list)
    credits: list[GuestCreditRead] = Field(default_factory=list)

    attended_count: int
    upcoming_count: int
    available_credit_count: int


class PortalLink(BaseModel):
    """A fresh way back in, for a guest who lost their session.

    Unlike the token returned at booking, this one has to travel: the host
    sends it to the guest, so it goes in a URL. That is the ordinary
    magic-link trade — single-use and short-lived, but anyone who sees the
    link before it is used can spend it. It is only ever handed to the host,
    who already has full access to this guest's record.
    """

    url: str
    """Open this on the guest's device to sign them in."""
