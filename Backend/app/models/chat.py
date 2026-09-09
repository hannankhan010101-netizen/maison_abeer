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

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
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
        # One private thread per guest, enforced by the database rather than
        # by the application remembering to look first. Two rooms for one
        # guest would split their conversation in half with no way to tell
        # which one the host is reading.
        Index(
            "uq_chat_room_direct_guest",
            "studio_id",
            "guest_id",
            unique=True,
            postgresql_where="kind = 'direct'",
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    kind: Mapped[ChatRoomKind] = mapped_column(nullable=False)

    session_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("session.id", ondelete="CASCADE"), index=True
    )
    """Null for the lounge, which belongs to the studio rather than a class."""

    guest_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("guest.id", ondelete="CASCADE"), index=True
    )
    """The one guest a `direct` room belongs to. Null for every other kind.

    This is the authorisation fact for a DM, deliberately kept here rather
    than inferred from `chat_membership`. Membership rows are created lazily
    on first read — so deriving permission from them would mean the act of
    opening a room could grant the right to open it.

    `ON DELETE CASCADE`: a deleted guest takes their private thread with them.
    A workshop room survives a guest leaving because it belongs to everyone
    else too; this one belongs to nobody once they are gone.
    """

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


class ChatBanner(Base, TenantMixin, TimestampMixin):
    """A pinned announcement at the top of one room.

    One per room, enforced by the unique constraint rather than by the
    application remembering to replace rather than insert. Editing overwrites;
    removing deletes the row, because a banner nobody can see is not a banner
    worth keeping history for.
    """

    __tablename__ = "chat_banner"
    __table_args__ = (UniqueConstraint("room_id", name="uq_chat_banner_room_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()

    room_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("chat_room.id", ondelete="CASCADE"), nullable=False
    )

    body: Mapped[str] = mapped_column(String(280), nullable=False)
    """Short on purpose. A banner that needs scrolling is a message."""


class Broadcast(Base, TenantMixin, TimestampMixin):
    """One announcement, fanned out to every room.

    Kept as its own row rather than inferred from the messages it produced:
    the host needs to know they sent it once, to how many rooms, and when —
    and counting `chat_message` rows tagged `is_broadcast` would lose that the
    moment one of them is deleted.
    """

    __tablename__ = "broadcast"

    id: Mapped[uuid.UUID] = uuid_pk()

    body: Mapped[str] = mapped_column(Text, nullable=False)

    room_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    """How many rooms it reached, recorded at send time."""

    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
