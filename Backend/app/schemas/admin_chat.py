"""Host-side chat shapes.

Separate from `guest_portal.py` because these carry things a guest must never
see: deleted messages, message counts across rooms they do not belong to, and
the reach of a broadcast before it is sent.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class BannerRead(BaseModel):
    body: str
    updated_at: datetime


class BannerWrite(BaseModel):
    body: Annotated[str, Field(min_length=1, max_length=280)]

    @field_validator("body")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Write something to pin.")
        return cleaned


class AdminRoomRead(BaseModel):
    id: UUID
    kind: Literal["workshop", "lounge"]
    name: str
    session_id: UUID | None = None

    message_count: int
    last_message_at: datetime | None = None
    banner: BannerRead | None = None


class AdminMessageRead(BaseModel):
    """A message as the host sees it — including ones already removed."""

    id: UUID
    body: str
    created_at: datetime

    author_id: UUID | None = None
    author_name: str
    is_host: bool = False
    is_broadcast: bool = False

    is_deleted: bool = False
    """Shown struck through rather than hidden: there has to be something to
    review if the author disputes the removal."""


class BroadcastRequest(BaseModel):
    body: Annotated[str, Field(min_length=1, max_length=2000)]

    confirmed: bool = False
    """A field rather than a separate endpoint, so the confirmation step
    cannot be skipped by calling a different route."""

    @field_validator("body")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Write something to send.")
        return cleaned


class BroadcastPreview(BaseModel):
    """What a broadcast would do, before it does it."""

    body: str
    room_count: int
    room_names: list[str] = Field(default_factory=list)
    guest_count: int


class BroadcastResult(BaseModel):
    id: UUID
    body: str
    room_count: int
    sent_at: datetime | None = None
