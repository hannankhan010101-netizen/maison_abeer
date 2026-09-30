"""Studio settings and brand kit."""

from __future__ import annotations

from datetime import time
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import EmojiDensity, VoicePreset

Weekday = Annotated[int, Field(ge=1, le=7)]
"""ISO weekday, Monday=1 … Sunday=7 — matches the domain's rest_days."""


class SettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    timezone: str
    quiet_hours_start: time
    quiet_hours_end: time
    weekly_class_cap: int | None
    rest_days: list[int]
    default_voice: VoicePreset
    emoji_density: EmojiDensity
    show_greeting: bool


class SettingsUpdate(BaseModel):
    timezone: str | None = Field(default=None, max_length=64)
    quiet_hours_start: time | None = None
    quiet_hours_end: time | None = None
    weekly_class_cap: int | None = Field(default=None, ge=1, le=50)
    rest_days: list[Weekday] | None = None
    default_voice: VoicePreset | None = None
    emoji_density: EmojiDensity | None = None
    show_greeting: bool | None = None

    @field_validator("timezone")
    @classmethod
    def _known_zone(cls, value: str | None) -> str | None:
        """Every scheduling rule is local to this string.

        A typo here — "Karachi", "PKT", "GMT+5" — used to save happily and
        then raise `ZoneInfoNotFoundError` (a `KeyError`) out of `ZoneInfo`
        deep inside quiet hours and the energy rules. That surfaced as a 500
        on quick-add, on message preview, on queueing reminders and on the
        cron drain, with nothing naming the cause. Checked by construction
        rather than against `available_timezones()`, which needs tzdata
        installed to return anything at all.
        """
        if value is None:
            return None

        name = value.strip()

        try:
            ZoneInfo(name)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("We don't recognise that timezone — try Asia/Karachi.") from None

        return name

    @field_validator("rest_days")
    @classmethod
    def _unique_days(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return None

        # A day listed twice is a client bug, not a preference.
        return sorted(set(value))


class BrandKitRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    logo_url: str | None
    primary_color: str | None
    accent_color: str | None
    instagram_handle: str | None
    hero_photo_url: str | None
    story: str | None

    booking_slug: str
    """The key that resolves the studio's public page: `/book/<slug>`.

    Exposed here because this is the screen the public page exists to
    decorate, and the address was previously in no API response and on no
    screen — a host could set up their brand kit, write a story and schedule
    classes without any way to find, copy or share the link those things are
    for.
    """


class BrandKitUpdate(BaseModel):
    logo_url: str | None = Field(default=None, max_length=500)
    primary_color: str | None = Field(default=None, max_length=9)
    accent_color: str | None = Field(default=None, max_length=9)
    instagram_handle: str | None = Field(default=None, max_length=60)
    hero_photo_url: str | None = Field(default=None, max_length=500)
    story: str | None = Field(default=None, max_length=600)

    @field_validator("instagram_handle")
    @classmethod
    def _strip_at(cls, value: str | None) -> str | None:
        """Hosts type it both ways; store one form so the QR is predictable."""
        return value.lstrip("@").strip() if value else value
