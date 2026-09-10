"""Public booking shapes.

Deliberately narrow. These are the only fields an unauthenticated caller can
see or set, and the allowlist *is* the security boundary: anything not named
here cannot leak, however the ORM object changes later.

Specifically absent, and absent on purpose:

* other guests' names, notes, phone numbers or allergies
* the studio's internal ids, settings, revenue or class templates
* whether a phone number is already a customer — a booking form that says
  "welcome back!" is a lookup oracle for anyone with a phone number
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class PublicStudio(BaseModel):
    """Branding only. No settings, no contact details, no counts.

    `logo_url`/`primary_color`/`accent_color` come straight from the studio's
    own brand kit (Settings → Brand Kit) — the whole point of that screen is
    a guest-facing page that looks like *this* studio's brand, not every
    studio's identical default.
    """

    name: str
    instagram_handle: str | None = None
    logo_url: str | None = None
    primary_color: str | None = None
    accent_color: str | None = None
    hero_photo_url: str | None = None
    """A real photo of the studio, when one's been added. Null shows no
    photo — the page falls back to the type-led design, never a blank box."""
    story: str | None = None
    """A short "what happens here" blurb. Null shows no section at all."""


class PublicClass(BaseModel):
    """One bookable class as a stranger may see it."""

    id: UUID
    name: str
    starts_at: datetime
    ends_at: datetime
    location: str | None = None
    color_token: str
    photo_url: str | None = None
    """A real photo of this craft, when the class type has one."""

    seats_left: int
    """Exact number, not the roster. Scarcity is the point of the page."""

    is_full: bool
    waitlist_is_open: bool


class PublicClassList(BaseModel):
    studio: PublicStudio
    classes: list[PublicClass] = Field(default_factory=list)


class PublicBookingRequest(BaseModel):
    """What a guest fills in. Four fields, three of them optional."""

    full_name: Annotated[str, Field(min_length=1, max_length=160)]
    phone: Annotated[str | None, Field(default=None, max_length=32)] = None
    email: Annotated[str | None, Field(default=None, max_length=320)] = None

    allergies: Annotated[str | None, Field(default=None, max_length=200)] = None
    """Free text. Safety-critical, so it is asked for warmly and never required."""

    note: Annotated[str | None, Field(default=None, max_length=280)] = None
    """The one fun question — becomes the name-tag subtext."""

    # Bot trap. A real browser never fills a hidden field; a naive scraper
    # fills every input it finds. Cheaper and more private than a captcha,
    # and it costs a legitimate guest nothing.
    website: Annotated[str | None, Field(default=None, max_length=200)] = None

    @field_validator("full_name")
    @classmethod
    def _name_is_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Please tell us your name.")
        return cleaned

    @field_validator("phone", "email", "allergies", "note")
    @classmethod
    def _blank_to_none(cls, value: str | None) -> str | None:
        """An empty input is "not provided", not an empty string in the database."""
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class PublicBookingResult(BaseModel):
    """Confirmation copy the page renders directly."""

    outcome: Literal["booked", "waitlisted"]
    class_name: str
    starts_at: datetime
    location: str | None = None

    waitlist_position: int | None = None
    """Only set when waitlisted. Being told "you're 3rd" beats being told nothing."""

    portal_token: str | None = None
    """A single-use login, so the confirmation screen can open their portal.

    Null when minting failed — the confirmation still reads as a success,
    because the booking *was* one, and the button simply is not offered.

    This is a credential. It is returned only here, in the response to the
    guest's own booking request; it must never reach a URL, a log line, or
    anywhere it could be replayed from.
    """

    portal_token_type: Literal["signup", "magiclink"] | None = None
    """Which OTP type the browser must verify the token as."""


class PublicFeedbackPrompt(BaseModel):
    """Just enough context for a guest to know what they are rating.

    The class name and date, and nothing else. No guest name — the link
    arrives by message and the person holding it already knows who they are,
    while anyone who intercepts it should learn nothing about them.
    """

    class_name: str
    starts_at: datetime
    already_answered: bool = False


class PublicFeedbackRequest(BaseModel):
    """One tap and one word (PRD §2.6)."""

    rating: Annotated[int, Field(ge=1, le=3, description="1 = 😕, 2 = 🙂, 3 = 😍")]
    one_word: Annotated[str | None, Field(default=None, max_length=60)] = None

    @field_validator("one_word")
    @classmethod
    def _blank_word_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None
