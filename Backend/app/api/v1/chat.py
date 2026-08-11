"""Guest chat: rooms, messages and reactions.

Membership is **derived from bookings**, not stored and maintained separately.
A guest who holds a seat is in that workshop's room; one who cancels is not.
Two sources of truth would drift, and the drift would show up as someone
reading a room they are no longer part of.

Rooms are created lazily on first open. A workshop nobody ever chats in should
not leave an empty room behind, and creating one per session up front would
mean a backfill for every session that already exists.

Every route checks membership before returning anything. `room_id` arrives
from the client, so unlike `guest_id` it cannot be trusted — the check is what
stops a guest reading a workshop they never booked.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select

from app.api.deps import GuestDb
from app.api.v1.portal import SEAT_HOLDING, display_name_for
from app.core.errors import NotFoundError
from app.models.chat import (
    ChatBanner,
    ChatMembership,
    ChatMessage,
    ChatRoom,
    MessageReaction,
)
from app.models.enums import ChatRoomKind
from app.models.guest import Guest
from app.models.session import Booking, Session
from app.schemas.guest_portal import (
    ChatMessageRead,
    ChatRoomRead,
    ReactionSummary,
    SendMessage,
    ToggleReaction,
)

router = APIRouter(prefix="/portal", tags=["chat"])

LOUNGE_NAME = "The lounge"
PAGE_SIZE = 50


def _lounge(caller: GuestDb) -> ChatRoom:
    """The studio's one lounge, created on first use.

    Per studio, never global: this is a multi-tenant app and guests of
    different studios must not share a room.
    """
    room = caller.db.raw.execute(
        select(ChatRoom).where(
            ChatRoom.studio_id == caller.studio_id,
            ChatRoom.kind == ChatRoomKind.LOUNGE,
        )
    ).scalar_one_or_none()

    if room is None:
        room = ChatRoom(
            studio_id=caller.studio_id,
            kind=ChatRoomKind.LOUNGE,
            name=LOUNGE_NAME,
        )
        caller.db.add(room)
        caller.db.flush()

    return room


def _room_for_session(caller: GuestDb, session: Session) -> ChatRoom:
    room = caller.db.raw.execute(
        select(ChatRoom).where(
            ChatRoom.studio_id == caller.studio_id,
            ChatRoom.session_id == session.id,
        )
    ).scalar_one_or_none()

    if room is None:
        room = ChatRoom(
            studio_id=caller.studio_id,
            kind=ChatRoomKind.WORKSHOP,
            session_id=session.id,
            name=session.title or (session.class_type.name if session.class_type else "Workshop"),
        )
        caller.db.add(room)
        caller.db.flush()

    return room


def _booked_session_ids(caller: GuestDb) -> set[UUID]:
    return set(
        caller.db.raw.execute(
            select(Booking.session_id).where(
                Booking.studio_id == caller.studio_id,
                Booking.guest_id == caller.guest_id,
                Booking.status.in_(SEAT_HOLDING),
            )
        ).scalars()
    )


def _may_read(caller: GuestDb, room: ChatRoom) -> bool:
    """Everyone in the studio gets the lounge; a workshop room needs a seat."""
    if room.kind is ChatRoomKind.LOUNGE:
        return True

    return room.session_id in _booked_session_ids(caller)


def _room_or_404(caller: GuestDb, room_id: UUID) -> ChatRoom:
    room = caller.db.get(ChatRoom, room_id)

    # Same answer for "no such room" and "not yours": confirming a room exists
    # would let someone map the studio's classes one id at a time.
    if room is None or not _may_read(caller, room):
        raise NotFoundError("We couldn't find that chat.")

    return room


def _membership(caller: GuestDb, room: ChatRoom) -> ChatMembership:
    row = caller.db.raw.execute(
        select(ChatMembership).where(
            ChatMembership.studio_id == caller.studio_id,
            ChatMembership.room_id == room.id,
            ChatMembership.guest_id == caller.guest_id,
        )
    ).scalar_one_or_none()

    if row is None:
        row = ChatMembership(studio_id=caller.studio_id, room_id=room.id, guest_id=caller.guest_id)
        caller.db.add(row)
        caller.db.flush()

    return row


def _unread_count(caller: GuestDb, room: ChatRoom, since: datetime | None) -> int:
    """Messages this guest has not seen, excluding their own.

    A badge that counts your own message is noise — you were there when you
    sent it.
    """
    statement = select(func.count(ChatMessage.id)).where(
        ChatMessage.studio_id == caller.studio_id,
        ChatMessage.room_id == room.id,
        ChatMessage.deleted_at.is_(None),
        ChatMessage.guest_id != caller.guest_id,
    )

    if since is not None:
        statement = statement.where(ChatMessage.created_at > since)

    return int(caller.db.raw.execute(statement).scalar_one())


def _serialise(
    caller: GuestDb, messages: list[ChatMessage], names: dict[UUID, str]
) -> list[ChatMessageRead]:
    if not messages:
        return []

    reactions = (
        caller.db.raw.execute(
            select(MessageReaction).where(
                MessageReaction.studio_id == caller.studio_id,
                MessageReaction.message_id.in_([m.id for m in messages]),
            )
        )
        .scalars()
        .all()
    )

    grouped: dict[UUID, dict[str, list[UUID]]] = {}
    for reaction in reactions:
        grouped.setdefault(reaction.message_id, {}).setdefault(reaction.emoji, []).append(
            reaction.guest_id
        )

    return [
        ChatMessageRead(
            id=message.id,
            body=message.body,
            created_at=message.created_at,
            author_id=message.guest_id,
            author_name=(
                names.get(message.guest_id, "Someone")
                if message.guest_id is not None
                else "Your host"
            ),
            is_you=message.guest_id == caller.guest_id,
            is_host=message.guest_id is None,
            is_broadcast=message.is_broadcast,
            reactions=[
                ReactionSummary(
                    emoji=emoji,
                    count=len(guest_ids),
                    reacted=caller.guest_id in guest_ids,
                )
                for emoji, guest_ids in sorted(grouped.get(message.id, {}).items())
            ],
        )
        for message in messages
    ]


def _names_for(caller: GuestDb, messages: list[ChatMessage]) -> dict[UUID, str]:
    ids = {m.guest_id for m in messages if m.guest_id is not None}

    if not ids:
        return {}

    guests = (
        caller.db.raw.execute(
            select(Guest).where(Guest.studio_id == caller.studio_id, Guest.id.in_(ids))
        )
        .scalars()
        .all()
    )

    return {guest.id: display_name_for(guest) for guest in guests}


# ---------------------------------------------------------------------------
# Rooms
# ---------------------------------------------------------------------------


@router.get("/rooms", response_model=list[ChatRoomRead])
def list_rooms(caller: GuestDb) -> list[ChatRoomRead]:
    """The lounge, plus a room for every workshop this guest holds a seat on."""
    rooms = [_lounge(caller)]

    session_ids = _booked_session_ids(caller)
    if session_ids:
        sessions = (
            caller.db.raw.execute(
                select(Session)
                .where(
                    Session.studio_id == caller.studio_id,
                    Session.id.in_(session_ids),
                    Session.archived_at.is_(None),
                )
                .order_by(Session.starts_at.desc())
            )
            .scalars()
            .all()
        )

        rooms.extend(_room_for_session(caller, session) for session in sessions)

    banners = {
        banner.room_id: banner.body
        for banner in caller.db.raw.execute(
            select(ChatBanner).where(ChatBanner.studio_id == caller.studio_id)
        ).scalars()
    }

    out: list[ChatRoomRead] = []

    for room in rooms:
        membership = _membership(caller, room)

        latest = caller.db.raw.execute(
            select(ChatMessage)
            .where(
                ChatMessage.studio_id == caller.studio_id,
                ChatMessage.room_id == room.id,
                ChatMessage.deleted_at.is_(None),
            )
            .order_by(ChatMessage.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()

        out.append(
            ChatRoomRead(
                id=room.id,
                kind=room.kind.value,
                name=room.name,
                session_id=room.session_id,
                unread_count=_unread_count(caller, room, membership.last_read_at),
                last_message_at=latest.created_at if latest else None,
                last_message_preview=latest.body[:80] if latest else None,
                banner=banners.get(room.id),
            )
        )

    caller.db.flush()
    return out


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------


@router.get("/rooms/{room_id}/messages", response_model=list[ChatMessageRead])
def list_messages(
    room_id: UUID,
    caller: GuestDb,
    after: Annotated[datetime | None, Query(description="Only messages newer than this")] = None,
) -> list[ChatMessageRead]:
    """The room's messages, oldest first.

    `after` is what makes polling cheap: the client sends the timestamp of the
    last message it holds and gets back only what arrived since. A page of
    fifty otherwise, which is roughly a screen and a half on a phone.
    """
    room = _room_or_404(caller, room_id)

    statement = select(ChatMessage).where(
        ChatMessage.studio_id == caller.studio_id,
        ChatMessage.room_id == room.id,
        ChatMessage.deleted_at.is_(None),
    )

    if after is not None:
        statement = statement.where(ChatMessage.created_at > after).order_by(ChatMessage.created_at)
    else:
        # Newest fifty, then flipped: a chat opens at the bottom.
        statement = statement.order_by(ChatMessage.created_at.desc()).limit(PAGE_SIZE)

    messages = list(caller.db.raw.execute(statement).scalars())

    if after is None:
        messages.reverse()

    return _serialise(caller, messages, _names_for(caller, messages))


@router.post(
    "/rooms/{room_id}/messages",
    response_model=ChatMessageRead,
    status_code=status.HTTP_201_CREATED,
)
def send_message(room_id: UUID, payload: SendMessage, caller: GuestDb) -> ChatMessageRead:
    room = _room_or_404(caller, room_id)

    message = ChatMessage(
        studio_id=caller.studio_id,
        room_id=room.id,
        guest_id=caller.guest_id,
        body=payload.body,
    )
    caller.db.add(message)
    caller.db.flush()

    # Sending is reading: nobody should return to their own message unread.
    membership = _membership(caller, room)
    membership.last_read_at = datetime.now(UTC)

    return _serialise(caller, [message], _names_for(caller, [message]))[0]


@router.post("/rooms/{room_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(room_id: UUID, caller: GuestDb) -> None:
    room = _room_or_404(caller, room_id)
    _membership(caller, room).last_read_at = datetime.now(UTC)


# ---------------------------------------------------------------------------
# Reactions
# ---------------------------------------------------------------------------


@router.put("/messages/{message_id}/reactions", response_model=ChatMessageRead)
def toggle_reaction(message_id: UUID, payload: ToggleReaction, caller: GuestDb) -> ChatMessageRead:
    """Add the emoji, or remove it if this guest already used it.

    One call rather than an add and a delete: the client knows the guest
    tapped, not what state the server is in, and a toggle cannot desync.
    """
    message = caller.db.get(ChatMessage, message_id)

    if message is None or message.deleted_at is not None:
        raise NotFoundError("We couldn't find that message.")

    # The room check matters here too — a message id is guessable in principle,
    # and reacting to one is a write.
    _room_or_404(caller, message.room_id)

    existing = caller.db.raw.execute(
        select(MessageReaction).where(
            MessageReaction.studio_id == caller.studio_id,
            MessageReaction.message_id == message.id,
            MessageReaction.guest_id == caller.guest_id,
            MessageReaction.emoji == payload.emoji,
        )
    ).scalar_one_or_none()

    if existing is not None:
        caller.db.raw.delete(existing)
    else:
        caller.db.add(
            MessageReaction(
                studio_id=caller.studio_id,
                message_id=message.id,
                guest_id=caller.guest_id,
                emoji=payload.emoji,
            )
        )

    caller.db.flush()

    return _serialise(caller, [message], _names_for(caller, [message]))[0]
