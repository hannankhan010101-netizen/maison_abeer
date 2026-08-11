"""What a signed-in guest is allowed to see.

A deliberately separate module from `schemas/guest.py`, which is the *host's*
view and carries phone numbers, allergies, memory notes and visit history.
Reusing it here would mean one careless field addition leaks a guest's medical
information to everyone in a chat room.

The allowlist is the boundary. Two rules hold everywhere below:

* A guest sees their **own** record in full detail, because it is theirs.
* A guest sees **other** guests as a display name and a generated avatar tone,
  and nothing else. No phone, no email, no allergies, no notes.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

WorkshopStatus = Literal["upcoming", "live", "completed", "cancelled"]


class PortalProfile(BaseModel):
    """The signed-in guest, looking at themselves."""

    guest_id: UUID
    full_name: str
    display_name: str
    email: str | None = None

    upcoming_count: int
    attended_count: int


class AttendeePeek(BaseModel):
    """Another guest, as far as this guest is concerned.

    Everything identifying beyond a display name is absent by construction —
    there is no field here to accidentally populate.
    """

    guest_id: UUID
    display_name: str

    is_you: bool = False
    """So the UI can say "You + 23 others" without guessing."""


class PortalWorkshop(BaseModel):
    """One workshop this guest is enrolled in."""

    session_id: UUID
    booking_id: UUID

    name: str
    starts_at: datetime
    ends_at: datetime
    location: str | None = None
    color_token: str

    status: WorkshopStatus
    """Computed server-side. The chip and the countdown must not disagree."""

    attendee_count: int
    """Everyone holding a seat, including this guest."""


class PortalWorkshopDetail(PortalWorkshop):
    """The detail page: the same workshop, plus who else is going."""

    notes: str | None = None
    attendees: list[AttendeePeek] = Field(default_factory=list)

    others_count: int = 0
    """Attendees excluding this guest — what "+ 23 others" counts."""


class ClaimResult(BaseModel):
    """The outcome of matching a Supabase identity to a guest record."""

    claimed: bool
    display_name: str | None = None
    message: str


class WhoAmI(BaseModel):
    """Which side of the app a token belongs to."""

    role: Literal["host", "guest", "unknown"]
