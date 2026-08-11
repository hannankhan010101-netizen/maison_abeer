"""Chat: rooms, membership, messages and reactions (Communication Hub).

Every workshop gets a room, and each studio has one lounge. Membership is
*derived* from bookings rather than managed by hand — a guest who books is in
the room, and one who cancels is not, without a second thing to keep in step.

The rows here exist to record what was said and who has read it. Access
control lives in the API layer, which resolves `guest_id` from a verified
token; these tables carry `studio_id` and the usual RLS policy so a future
direct-from-client path cannot cross tenants either.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TenantMixin, TimestampMixin, uuid_pk
from app.models.enums import ChatRoomKind

if TYPE_CHECKING:
    from app.models.guest import Guest
    from app.models.session import Session


class ChatRoom(Base, TenantMixin, TimestampMixin):
    """A place to talk.

    Created lazily, on first open rather than on session create — a workshop
    nobody ever chats in should not leave an empty room behind.
    """

    __tablename__ = "chat_room"
    __table_args__ = (
        # One room per workshop, and exactly one lounge per studio. The
        # partial index is what makes "exactly one lounge" a database fact
        # rather than something the application remembers to check.
        UniqueConstraint("session_id", name="uq_chat_room_session_id"),
        Index(
            "uq_chat_room_studio_lounge",
            "studio_id",
            unique=True,
            postgresql_where="kind = 'lounge'",
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    kind: Mapped[ChatRoomKind] = mapped_column(nullable=False)

    session_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("session.id", ondelete="CASCADE"), index=True
    )
    """Null for the lounge, which belongs to the studio rather than a class."""

    name: Mapped[str] = mapped_column(String(120), nullable=False)

    session: Mapped[Session | None] = relationship()
    messages: Mapped[list[ChatMessage]] = relationship(
        back_populates="room", cascade="all, delete-orphan"
    )


class ChatMembership(Base, TenantMixin, TimestampMixin):
    """A guest's presence in a room, and how far they have read.

    `last_read_at` is a timestamp rather than a message id: messages arrive
    out of order under concurrency, and a timestamp cannot be left pointing at
    a message that was later deleted.
    """

    __tablename__ = "chat_membership"
    __table_args__ = (
        UniqueConstraint("room_id", "guest_id", name="uq_chat_membership_room_guest"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()

    room_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("chat_room.id", ondelete="CASCADE"), nullable=False
    )
    guest_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("guest.id", ondelete="CASCADE"), nullable=False, index=True
    )

    last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    """Null means never opened — every message counts as unread."""


class ChatMessage(Base, TenantMixin, TimestampMixin):
    """One message.

    `guest_id` is null when the host wrote it. That is deliberate rather than
    a separate table: a room is one conversation, and splitting it would mean
    merging two orderings on every read.
    """

    __tablename__ = "chat_message"
    __table_args__ = (
        # The paging index. Descending created_at because a chat is read from
        # the bottom, and every query here starts at "most recent".
        Index("ix_chat_message_room_created", "room_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()

    room_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("chat_room.id", ondelete="CASCADE"), nullable=False
    )
    guest_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("guest.id", ondelete="SET NULL"), index=True
    )
    """Null for the host. Also null once a guest record is deleted — the
    message stays, because removing it would tear a hole in the conversation
    everyone else remembers."""

    body: Mapped[str] = mapped_column(Text, nullable=False)

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    """Soft delete. Moderation needs a trail, and a hard delete would pull
    rows out from under a paging cursor mid-scroll."""

    is_broadcast: Mapped[bool] = mapped_column(default=False, nullable=False)
    """Rendered in the official style so an announcement is not lost in the
    scroll. Set by the broadcast fan-out in Phase 3."""

    room: Mapped[ChatRoom] = relationship(back_populates="messages")
    guest: Mapped[Guest | None] = relationship()
    reactions: Mapped[list[MessageReaction]] = relationship(
        back_populates="message", cascade="all, delete-orphan"
    )


class MessageReaction(Base, TenantMixin, TimestampMixin):
    """One emoji from one guest on one message.

    Unique per triple, so tapping the same emoji twice removes it rather than
    stacking duplicates.
    """

    __tablename__ = "message_reaction"
    __table_args__ = (
        UniqueConstraint("message_id", "guest_id", "emoji", name="uq_message_reaction_triple"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()

    message_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("chat_message.id", ondelete="CASCADE"), nullable=False
    )
    guest_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("guest.id", ondelete="CASCADE"), nullable=False
    )

    emoji: Mapped[str] = mapped_column(String(16), nullable=False)
    """A single emoji. Sixteen characters covers the multi-codepoint ones —
    skin tones and ZWJ sequences are longer than they look."""

    message: Mapped[ChatMessage] = relationship(back_populates="reactions")
