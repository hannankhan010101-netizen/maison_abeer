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
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

WorkshopStatus = Literal["upcoming", "live", "completed", "cancelled", "waitlisted", "invited"]
"""`waitlisted` is not a seat — it is a place in a queue, shown so a guest who
joined one is not told they have nothing. `invited` is a seat on hold: a spot
opened up and this guest has until `invite_expires_at` to claim it before it
passes to the next person."""


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

    waitlist_position: int | None = None
    """Set only when `status` is `waitlisted`. "You are 3rd" beats silence."""

    invite_expires_at: datetime | None = None
    """Set only when `status` is `invited` — when the hold on this seat runs out."""


class PortalWorkshopDetail(PortalWorkshop):
    """The detail page: the same workshop, plus who else is going."""

    notes: str | None = None
    attendees: list[AttendeePeek] = Field(default_factory=list)

    others_count: int = 0
    """Attendees excluding this guest — what "+ 23 others" counts."""


class DeclineResult(BaseModel):
    """The outcome of turning down a held seat."""

    declined: bool
    message: str


class ClaimResult(BaseModel):
    """The outcome of matching a Supabase identity to a guest record."""

    claimed: bool
    display_name: str | None = None
    message: str


class WhoAmI(BaseModel):
    """Which side of the app a token belongs to."""

    role: Literal["host", "guest", "unknown"]


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------


class ReactionSummary(BaseModel):
    """One emoji, aggregated across everyone who tapped it."""

    emoji: str
    count: int
    reacted: bool
    """Whether *this* guest is one of them, so the pill renders active."""


class ChatMessageRead(BaseModel):
    """One message as a guest sees it."""

    id: UUID
    body: str
    created_at: datetime

    author_id: UUID | None = None
    """Null when the host wrote it."""

    author_name: str
    is_you: bool = False
    is_host: bool = False
    is_broadcast: bool = False
    """Rendered in the official style so an announcement is not lost."""

    reactions: list[ReactionSummary] = Field(default_factory=list)


class ChatRoomRead(BaseModel):
    id: UUID
    kind: Literal["workshop", "lounge", "direct"]
    name: str
    session_id: UUID | None = None

    unread_count: int = 0
    last_message_at: datetime | None = None
    last_message_preview: str | None = None

    banner: str | None = None
    """The host's pinned announcement, if there is one. Read-only here — a
    guest can see it and never touch it."""

    starts_at: datetime | None = None
    """When the workshop this room belongs to runs. Null for the lounge and
    for a private thread.

    Sent so the list can tell two rooms apart. A studio that runs the same
    class weekly gets several rooms called "Pottery & wheel throwing", and
    without a date they are indistinguishable — you cannot tell which one you
    are about to open."""


class SendMessage(BaseModel):
    body: Annotated[str, Field(min_length=1, max_length=2000)]

    @field_validator("body")
    @classmethod
    def _not_only_whitespace(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Say something first.")
        return cleaned


class ToggleReaction(BaseModel):
    emoji: Annotated[str, Field(min_length=1, max_length=16)]
