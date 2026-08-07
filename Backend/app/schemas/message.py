"""Request and response shapes for the Messages module (PRD §2.6)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import MessageChannel, MessageKind, MessageStatus, VoicePreset


class MessagePreview(BaseModel):
    """What the host sees before anything is queued."""

    kind: MessageKind
    voice: VoicePreset
    body: str
    send_at: datetime | None
    will_send: bool
    skip_reason: str | None = None
    was_shifted: bool = False
    """Quiet hours moved it. The UI says 'sends 9 am' rather than staying silent."""

    unresolved_placeholders: list[str] = Field(default_factory=list)
    """Non-empty means the copy would go out with a literal `{placeholder}`."""


class SchedulePreviewRequest(BaseModel):
    voice: VoicePreset | None = None
    """Defaults to the studio's configured voice."""


class ScheduledMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    session_id: UUID | None
    guest_id: UUID | None
    kind: MessageKind
    channel: MessageChannel
    status: MessageStatus
    send_at: datetime
    sent_at: datetime | None
    body: str
    attempt_count: int
    last_error: str | None

    @property
    def has_failed(self) -> bool:
        return self.status is MessageStatus.FAILED


class MessageScheduleResult(BaseModel):
    """The outcome of scheduling a session's reminders."""

    session_id: UUID
    queued: int
    skipped: int
    skips: dict[str, int] = Field(default_factory=dict)
    """Reason → count, so the host can see *why* nobody was messaged."""

    messages: list[ScheduledMessageRead] = Field(default_factory=list)


class FeedbackCreate(BaseModel):
    """One tap and one word — the whole survey (PRD §2.6).

    Rating ascends with sentiment to match the column: 1 = 😕, 2 = 🙂, 3 = 😍.
    """

    rating: Annotated[int, Field(ge=1, le=3, description="1 = 😕, 2 = 🙂, 3 = 😍")]
    one_word: Annotated[str | None, Field(default=None, max_length=60)] = None


class FeedbackRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    booking_id: UUID
    rating: int
    one_word: str | None
    created_at: datetime


class CancelMessage(BaseModel):
    reason: Annotated[str | None, Field(default=None, max_length=200)] = None
