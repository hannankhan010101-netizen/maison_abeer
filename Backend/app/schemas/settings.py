"""Studio settings and brand kit."""

from __future__ import annotations

from datetime import time
from typing import Annotated

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


class BrandKitUpdate(BaseModel):
    logo_url: str | None = Field(default=None, max_length=500)
    primary_color: str | None = Field(default=None, max_length=9)
    accent_color: str | None = Field(default=None, max_length=9)
    instagram_handle: str | None = Field(default=None, max_length=60)

    @field_validator("instagram_handle")
    @classmethod
    def _strip_at(cls, value: str | None) -> str | None:
        """Hosts type it both ways; store one form so the QR is predictable."""
        return value.lstrip("@").strip() if value else value
