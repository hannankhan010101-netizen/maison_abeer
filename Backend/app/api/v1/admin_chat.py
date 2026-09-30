"""Host oversight of the chat: read any room, pin banners, broadcast, moderate.

Everything here is gated on the host dependency (`Db`), which resolves a
studio from `host_user`. A signed-in guest reaching these routes gets 403 —
authenticated, and simply not allowed. Hiding the buttons in the UI is
presentation; this is the control.

The host reads every room in their studio without membership, deliberately.
They are responsible for what is said in their name, and moderation you have
to join a room to perform is moderation that will not happen.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import func, select

from app.api.deps import Db
from app.api.v1.chat import LOUNGE_NAME, ensure_lounge
from app.api.v1.portal import SEAT_HOLDING, display_name_for
from app.core.errors import ConflictError, NotFoundError
from app.models.chat import Broadcast, ChatBanner, ChatMessage, ChatRoom
from app.models.enums import ChatRoomKind
from app.models.guest import Guest
from app.models.session import Booking, Session
from app.schemas.admin_chat import (
    AdminMessageRead,
    AdminRoomRead,
    BannerRead,
    BannerWrite,
    BroadcastPreview,
    BroadcastRequest,
    BroadcastResult,
    HostReply,
)

router = APIRouter(tags=["admin-chat"])

PAGE_SIZE = 100


def _room_or_404(db: Db, room_id: UUID) -> ChatRoom:
    room = db.get(ChatRoom, room_id)

    if room is None:
        raise NotFoundError("We couldn't find that chat.")

    return room


# ---------------------------------------------------------------------------
# Oversight
# ---------------------------------------------------------------------------


@router.get("/chat/rooms", response_model=list[AdminRoomRead])
def list_all_rooms(db: Db) -> list[AdminRoomRead]:
    """Every room in the studio, busiest first.

    Counts and last-message times come back in **one** grouped query rather
    than two per room. The loop version issued twenty-one round trips for ten
    rooms, and against a hosted database that is four to six seconds of
    "Loading rooms…" every time the host opens this page — slow enough that
    it reads as broken rather than slow.
    """
    rooms = list(db.scalars(db.query(ChatRoom).order_by(ChatRoom.created_at)))

    banners = {banner.room_id: banner for banner in db.scalars(db.query(ChatBanner))}

    # Deleted messages are excluded: the host cares how busy a room is, not
    # how much has been moderated out of it.
    stats = {
        row[0]: (row[1], row[2])
        for row in db.raw.execute(
            select(
                ChatMessage.room_id,
                func.count(ChatMessage.id),
                func.max(ChatMessage.created_at),
            )
            .where(
                ChatMessage.studio_id == db.studio_id,
                ChatMessage.deleted_at.is_(None),
            )
            .group_by(ChatMessage.room_id)
        ).all()
    }

    out: list[AdminRoomRead] = []

    for room in rooms:
        total, latest = stats.get(room.id, (0, None))
        banner = banners.get(room.id)

        out.append(
            AdminRoomRead(
                id=room.id,
                kind=room.kind.value,
                name=room.name,
                session_id=room.session_id,
                message_count=int(total),
                last_message_at=latest,
                banner=BannerRead(body=banner.body, updated_at=banner.updated_at)
                if banner
                else None,
            )
        )

    return out


@router.get("/chat/rooms/{room_id}/messages", response_model=list[AdminMessageRead])
def read_room(room_id: UUID, db: Db) -> list[AdminMessageRead]:
    """Read a room as the host.

    Deleted messages are included and flagged, unlike the guest view. Removing
    them from the host's own record would leave nothing to review a complaint
    against.
    """
    _room_or_404(db, room_id)

    messages = list(
        db.scalars(
            db.query(ChatMessage)
            .where(ChatMessage.room_id == room_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(PAGE_SIZE)
        )
    )
    messages.reverse()

    guest_ids = {m.guest_id for m in messages if m.guest_id is not None}
    names: dict[UUID, str] = {}

    if guest_ids:
        names = {
            guest.id: display_name_for(guest)
            for guest in db.scalars(db.query(Guest).where(Guest.id.in_(guest_ids)))
        }

    return [
        AdminMessageRead(
            id=message.id,
            body=message.body,
            created_at=message.created_at,
            author_id=message.guest_id,
            author_name=(
                names.get(message.guest_id, "Someone") if message.guest_id is not None else "You"
            ),
            is_host=message.guest_id is None,
            is_broadcast=message.is_broadcast,
            is_deleted=message.deleted_at is not None,
        )
        for message in messages
    ]


@router.post(
    "/guests/{guest_id}/chat",
    response_model=AdminRoomRead,
    status_code=status.HTTP_200_OK,
)
def open_direct_room(guest_id: UUID, db: Db) -> AdminRoomRead:
    """Open the private thread with one guest, creating it on first use.

    Get-or-create rather than create, so the button on a guest's profile can
    be pressed twice without splitting the conversation in two. The partial
    unique index backs that up in the database — this is the polite path, not
    the only guard.

    Returns 200 rather than 201 for the same reason: after the first press,
    nothing is created, and reporting otherwise would be a lie the client
    might act on.

    Only the host can start one. A guest opening a thread the host never asked
    for would put an empty conversation at the top of their list, and give
    every guest a channel straight to the studio owner whether or not that is
    wanted — which is a product decision, not a default.
    """
    guest = db.get_or_404(Guest, guest_id)

    existing = db.scalars(
        db.query(ChatRoom).where(
            ChatRoom.kind == ChatRoomKind.DIRECT,
            ChatRoom.guest_id == guest.id,
        )
    )
    room = existing[0] if existing else None

    if room is None:
        room = ChatRoom(
            studio_id=db.studio_id,
            kind=ChatRoomKind.DIRECT,
            guest_id=guest.id,
            # Stored under the guest's name because that is what the host
            # needs in their room list. The guest is shown the studio's name
            # instead — from their side the thread is with the studio.
            name=display_name_for(guest),
        )
        db.add(room)
        db.flush()

    return AdminRoomRead(
        id=room.id,
        kind=room.kind.value,
        name=room.name,
        session_id=None,
        message_count=0,
        last_message_at=None,
        banner=None,
    )


@router.post(
    "/chat/rooms/{room_id}/messages",
    response_model=AdminMessageRead,
    status_code=status.HTTP_201_CREATED,
)
def reply_in_room(room_id: UUID, payload: HostReply, db: Db) -> AdminMessageRead:
    """Say something in one room, as the host.

    The counterpart to the guest's own send. Until this existed the host could
    read every conversation and answer none of them: the only ways to speak
    were a banner pinned to the top of a room, or a broadcast that went into
    every other class as well. A guest asking "should I bring an apron?" in
    their workshop chat could not be answered in that workshop chat.

    Deliberately **not** `is_broadcast`. That flag means "an announcement sent
    to everybody" and is styled to stand out from the conversation precisely
    so it is not missed. A reply is part of the conversation, and dressing one
    up as the other would make every answer shout and, worse, make real
    announcements ordinary.

    `guest_id` stays null, which is already how the schema records a host
    message — so the guest side renders it as "Your host" with no change.
    """
    _room_or_404(db, room_id)

    message = ChatMessage(
        studio_id=db.studio_id,
        room_id=room_id,
        guest_id=None,
        body=payload.body,
        is_broadcast=False,
    )
    db.add(message)
    db.flush()

    return AdminMessageRead(
        id=message.id,
        body=message.body,
        created_at=message.created_at,
        author_id=None,
        author_name="You",
        is_host=True,
        is_broadcast=False,
        is_deleted=False,
    )


@router.delete("/chat/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_message(message_id: UUID, db: Db) -> None:
    """Remove a message from every guest's view.

    Soft: the row stays so there is something to review if the person who
    wrote it disputes the removal.
    """
    message = db.get_or_404(ChatMessage, message_id)

    if message.deleted_at is None:
        message.deleted_at = datetime.now(UTC)


# ---------------------------------------------------------------------------
# Banners
# ---------------------------------------------------------------------------


@router.put("/chat/rooms/{room_id}/banner", response_model=BannerRead)
def pin_banner(room_id: UUID, payload: BannerWrite, db: Db) -> BannerRead:
    """Pin an announcement, or edit the one already there.

    PUT rather than POST: one banner per room is a database constraint, so a
    second call is an edit by definition and 409ing on it would be pedantry.
    """
    _room_or_404(db, room_id)

    banner = db.raw.execute(
        select(ChatBanner).where(
            ChatBanner.studio_id == db.studio_id, ChatBanner.room_id == room_id
        )
    ).scalar_one_or_none()

    if banner is None:
        banner = ChatBanner(studio_id=db.studio_id, room_id=room_id, body=payload.body)
        db.add(banner)
    else:
        banner.body = payload.body

    db.flush()
    return BannerRead(body=banner.body, updated_at=banner.updated_at)


@router.delete("/chat/rooms/{room_id}/banner", status_code=status.HTTP_204_NO_CONTENT)
def remove_banner(room_id: UUID, db: Db) -> None:
    _room_or_404(db, room_id)

    banner = db.raw.execute(
        select(ChatBanner).where(
            ChatBanner.studio_id == db.studio_id, ChatBanner.room_id == room_id
        )
    ).scalar_one_or_none()

    # Idempotent: removing a banner that is already gone is the state the
    # caller wanted, not an error.
    if banner is not None:
        db.raw.delete(banner)


# ---------------------------------------------------------------------------
# Broadcast
# ---------------------------------------------------------------------------


def _broadcast_rooms(db: Db) -> list[ChatRoom]:
    """The rooms a studio-wide announcement belongs in.

    Two exclusions, both of them things a broadcast did before:

    * `DIRECT` rooms. The guest is told that thread is "just you and the
      studio"; a studio-wide notice arriving there breaks that promise, and a
      guest with a private thread and three booked classes received the same
      announcement five times.
    * Finished and archived workshops. Their rooms resurface as unread and
      pull the guest back into a conversation about a class that is over.

    The lounge is always included — it is the one room every guest can read.
    """
    rooms = db.scalars(
        db.query(ChatRoom).where(ChatRoom.kind != ChatRoomKind.DIRECT).order_by(ChatRoom.name)
    )

    now = datetime.now(UTC)
    keep: list[ChatRoom] = []

    for room in rooms:
        if room.kind is not ChatRoomKind.WORKSHOP:
            keep.append(room)
            continue

        session = db.get(Session, room.session_id) if room.session_id else None

        if session is not None and session.archived_at is None and session.ends_at > now:
            keep.append(room)

    return keep


def _broadcast_reach(db: Db, rooms: list[ChatRoom]) -> int:
    """How many guests would actually see it.

    If the lounge is in the set, that is every guest in the studio: the lounge
    is one shared room and `_may_read` grants it to every guest with no
    membership row required, so guests who have never opened chat are reached
    too. Counting memberships instead would under-report the reach of an
    action that cannot be recalled, which is the worse direction to be wrong
    in. Without the lounge, it is the seat-holders on the included classes.
    """
    if any(room.kind is ChatRoomKind.LOUNGE for room in rooms):
        return int(
            db.raw.execute(
                select(func.count(Guest.id)).where(
                    Guest.studio_id == db.studio_id, Guest.archived_at.is_(None)
                )
            ).scalar_one()
        )

    session_ids = [room.session_id for room in rooms if room.session_id is not None]

    if not session_ids:
        return 0

    return int(
        db.raw.execute(
            select(func.count(func.distinct(Booking.guest_id))).where(
                Booking.studio_id == db.studio_id,
                Booking.session_id.in_(session_ids),
                Booking.status.in_(SEAT_HOLDING),
            )
        ).scalar_one()
    )


@router.post("/broadcasts/preview", response_model=BroadcastPreview)
def preview_broadcast(payload: BroadcastRequest, db: Db) -> BroadcastPreview:
    """What this would do, before it does it.

    A broadcast reaches every guest at once and cannot be recalled — only
    deleted message by message. Showing the room and guest counts first is the
    difference between a considered send and a regretted one.

    The counts here are the ones `send_broadcast` will act on, including the
    lounge whether or not a row for it exists yet — the send creates it. The
    preview must not, because a preview that writes rows is not a preview.
    """
    rooms = _broadcast_rooms(db)
    has_lounge = any(room.kind is ChatRoomKind.LOUNGE for room in rooms)

    room_names = [room.name for room in rooms]
    room_count = len(room_names)

    if not has_lounge:
        # The send will make it, so count it and name it.
        room_names = [LOUNGE_NAME, *room_names]
        room_count += 1

    guest_count = int(
        db.raw.execute(
            select(func.count(Guest.id)).where(
                Guest.studio_id == db.studio_id, Guest.archived_at.is_(None)
            )
        ).scalar_one()
    )

    return BroadcastPreview(
        body=payload.body,
        room_count=room_count,
        room_names=room_names[:10],
        guest_count=guest_count,
    )


@router.post("/broadcasts", response_model=BroadcastResult, status_code=status.HTTP_201_CREATED)
def send_broadcast(payload: BroadcastRequest, db: Db) -> BroadcastResult:
    """Post one announcement into every room.

    Written as ordinary messages flagged `is_broadcast` rather than a parallel
    delivery path, so it appears in the conversation where guests already are
    — and can be moderated with the same tools as anything else.
    """
    if not payload.confirmed:
        # The confirmation is a field rather than a second endpoint so it
        # cannot be skipped by calling the wrong one.
        raise ConflictError("Confirm the broadcast before sending it.")

    # Get-or-create the lounge first.
    #
    # Rooms are created lazily when a guest opens chat, so a studio whose
    # guests have not done that yet had nothing to broadcast into and got a
    # 409 — on the announcement that most needs to reach everyone. The lounge
    # is one idempotent row per studio and every guest can read it.
    reachable = int(
        db.raw.execute(
            select(func.count(Guest.id)).where(
                Guest.studio_id == db.studio_id, Guest.archived_at.is_(None)
            )
        ).scalar_one()
    )

    if not reachable:
        raise ConflictError("There's nobody in your guest book to broadcast to yet.")

    ensure_lounge(db)
    rooms = _broadcast_rooms(db)

    for room in rooms:
        db.add(
            ChatMessage(
                studio_id=db.studio_id,
                room_id=room.id,
                guest_id=None,
                body=payload.body,
                is_broadcast=True,
            )
        )

    record = Broadcast(
        studio_id=db.studio_id,
        body=payload.body,
        room_count=len(rooms),
        sent_at=datetime.now(UTC),
    )
    db.add(record)
    db.flush()

    return BroadcastResult(
        id=record.id, body=record.body, room_count=record.room_count, sent_at=record.sent_at
    )
