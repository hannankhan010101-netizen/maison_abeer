"""Private threads between the host and one guest.

The behaviour under test is an absence: nobody except the one guest may read
the room. A DM that leaks is worse than no DM at all, because the host will
have written in it believing otherwise.

`_may_read` is exercised directly rather than through the API. It is the whole
of the authorisation decision — every route funnels through `_room_or_404`,
which funnels through here — and testing it in isolation means these cases can
be enumerated exhaustively instead of sampled.
"""

from __future__ import annotations

import uuid
from typing import Any, cast

import pytest

from app.api.deps import GuestCaller
from app.api.v1.chat import _may_read
from app.core.db import TenantSession
from app.models.chat import ChatRoom
from app.models.enums import ChatRoomKind


def make_caller() -> GuestCaller:
    """A real `GuestCaller`, with no session behind it.

    `db` is deliberately None. Every assertion below is about a code path that
    must decide without touching the database — if one ever reaches for it,
    these tests fail loudly with an AttributeError rather than quietly passing
    against a stub that answered something plausible.
    """
    return GuestCaller(
        guest_id=uuid.uuid4(),
        studio_id=uuid.uuid4(),
        db=cast("TenantSession", None),
    )


def room(kind: ChatRoomKind, **kwargs: Any) -> ChatRoom:
    made = ChatRoom(kind=kind, name="x", studio_id=uuid.uuid4(), **kwargs)
    made.id = uuid.uuid4()
    return made


@pytest.fixture
def caller() -> GuestCaller:
    return make_caller()


# ---------------------------------------------------------------------------
# The one guest it belongs to
# ---------------------------------------------------------------------------


def test_the_guest_it_belongs_to_may_read_it(caller: GuestCaller) -> None:
    assert _may_read(caller, room(ChatRoomKind.DIRECT, guest_id=caller.guest_id)) is True


def test_another_guest_may_not_read_it(caller: GuestCaller) -> None:
    """The whole feature. Everything else is arrangement around this line."""
    someone_else = room(ChatRoomKind.DIRECT, guest_id=uuid.uuid4())

    assert _may_read(caller, someone_else) is False


def test_a_direct_room_with_no_guest_is_readable_by_nobody(caller: GuestCaller) -> None:
    """A row that should not exist must not fail open.

    The unique index and the endpoint both set `guest_id`, so this is a state
    the application does not produce. It is worth pinning anyway: `None ==
    None` would hand an orphaned room to whichever guest asked first, and the
    partial index would not stop it — it constrains uniqueness, not presence.
    """
    orphan = room(ChatRoomKind.DIRECT, guest_id=None)

    assert _may_read(caller, orphan) is False


def test_a_direct_room_is_not_judged_by_the_workshop_rule(caller: GuestCaller) -> None:
    """The `direct` branch must come before the booking check.

    Without it a DM falls through to `room.session_id in booked_ids`. That is
    null on a private room, so it evaluates false for everybody — including
    the guest whose thread it is. Fail-safe, but the feature would be dead
    rather than private, and `db` being None here proves the booking lookup is
    never reached — it would raise on a None session.
    """
    mine = room(ChatRoomKind.DIRECT, guest_id=caller.guest_id)

    assert _may_read(caller, mine) is True


# ---------------------------------------------------------------------------
# The other kinds are unchanged
# ---------------------------------------------------------------------------


def test_the_lounge_is_still_open_to_everyone(caller: GuestCaller) -> None:
    assert _may_read(caller, room(ChatRoomKind.LOUNGE)) is True


def test_a_lounge_is_not_affected_by_a_stray_guest_id(caller: GuestCaller) -> None:
    """The lounge check comes first and does not consult `guest_id`."""
    assert _may_read(caller, room(ChatRoomKind.LOUNGE, guest_id=uuid.uuid4())) is True
