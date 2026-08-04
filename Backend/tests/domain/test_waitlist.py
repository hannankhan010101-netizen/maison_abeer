"""Waitlist ordering, invitations and expiry."""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.domain.scheduling import QuietHours
from app.domain.waitlist import (
    DEFAULT_INVITE_WINDOW,
    WaitlistEntry,
    WaitlistStatus,
    accept,
    expire_lapsed,
    invite_next,
    normalise_positions,
    position_of,
    withdraw,
)

KARACHI = "Asia/Karachi"
NOON = datetime(2026, 8, 4, 12, 0, tzinfo=ZoneInfo(KARACHI))
OPEN_HOURS = QuietHours(timezone=KARACHI)


def entry(
    entry_id: str,
    position: int,
    *,
    status: WaitlistStatus = WaitlistStatus.WAITING,
    contactable: bool = True,
    invite_expires_at: datetime | None = None,
) -> WaitlistEntry:
    return WaitlistEntry(
        entry_id=entry_id,
        guest_id=f"guest-{entry_id}",
        position=position,
        status=status,
        contactable=contactable,
        invite_expires_at=invite_expires_at,
        invited_at=NOON if status is WaitlistStatus.INVITED else None,
    )


class TestOrdering:
    def test_renumbers_without_gaps_after_a_withdrawal(self) -> None:
        entries = [entry("a", 0), entry("b", 1), entry("c", 2)]

        remaining = withdraw(entries, "b")
        live = [e for e in remaining if e.is_live]

        # "You're 3rd in line" must not stay wrong after someone drops out.
        assert [(e.entry_id, e.position) for e in live] == [("a", 0), ("c", 1)]

    def test_settled_entries_keep_out_of_the_queue(self) -> None:
        entries = [
            entry("a", 0, status=WaitlistStatus.DECLINED),
            entry("b", 1),
            entry("c", 2),
        ]

        live = [e for e in normalise_positions(entries) if e.is_live]

        assert [(e.entry_id, e.position) for e in live] == [("b", 0), ("c", 1)]

    def test_position_is_one_based_for_guest_copy(self) -> None:
        entries = [entry("a", 0), entry("b", 1)]

        assert position_of(entries, "guest-a") == 1
        assert position_of(entries, "guest-b") == 2
        assert position_of(entries, "guest-nobody") is None

    def test_accepting_removes_the_guest_from_the_queue(self) -> None:
        entries = [entry("a", 0), entry("b", 1)]

        updated = accept(entries, "a")

        assert position_of(updated, "guest-a") is None
        assert position_of(updated, "guest-b") == 1


class TestInviteNext:
    def test_invites_the_person_at_the_front(self) -> None:
        entries = [entry("a", 0), entry("b", 1)]

        updated, decision = invite_next(entries, now=NOON, quiet_hours=OPEN_HOURS)

        assert decision.someone_was_invited
        assert decision.invited is not None
        assert decision.invited.entry_id == "a"
        assert decision.invited.status is WaitlistStatus.INVITED
        assert updated[0].status is WaitlistStatus.INVITED

    def test_holds_the_seat_for_twelve_hours(self) -> None:
        entries = [entry("a", 0)]

        _, decision = invite_next(entries, now=NOON, quiet_hours=OPEN_HOURS)

        assert decision.invited is not None
        assert decision.invited.invite_expires_at == NOON + DEFAULT_INVITE_WINDOW

    def test_does_not_double_offer_a_held_seat(self) -> None:
        entries = [
            entry(
                "a", 0, status=WaitlistStatus.INVITED, invite_expires_at=NOON + timedelta(hours=6)
            ),
            entry("b", 1),
        ]

        _, decision = invite_next(entries, now=NOON, quiet_hours=OPEN_HOURS)

        assert not decision.someone_was_invited
        assert decision.reason is not None
        assert "on hold" in decision.reason

    def test_passes_down_the_list_when_an_invite_lapses(self) -> None:
        entries = [
            entry(
                "a", 0, status=WaitlistStatus.INVITED, invite_expires_at=NOON - timedelta(hours=1)
            ),
            entry("b", 1),
        ]

        updated, decision = invite_next(entries, now=NOON, quiet_hours=OPEN_HOURS)

        assert [e.entry_id for e in decision.expired] == ["a"]
        assert decision.invited is not None
        assert decision.invited.entry_id == "b"

        lapsed = next(e for e in updated if e.entry_id == "a")
        assert lapsed.status is WaitlistStatus.EXPIRED

    def test_skips_guests_who_cannot_be_messaged(self) -> None:
        # Added by the host from a DM with only a name — no way to auto-invite.
        entries = [entry("a", 0, contactable=False), entry("b", 1)]

        _, decision = invite_next(entries, now=NOON, quiet_hours=OPEN_HOURS)

        assert decision.invited is not None
        assert decision.invited.entry_id == "b"

    def test_says_so_when_nobody_can_be_reached(self) -> None:
        entries = [entry("a", 0, contactable=False)]

        _, decision = invite_next(entries, now=NOON, quiet_hours=OPEN_HOURS)

        assert not decision.someone_was_invited
        assert decision.reason is not None
        assert "directly" in decision.reason

    def test_reports_an_empty_queue(self) -> None:
        _, decision = invite_next([], now=NOON, quiet_hours=OPEN_HOURS)

        assert not decision.someone_was_invited
        assert decision.reason == "Nobody's waiting right now."

    def test_refuses_when_there_is_no_free_seat(self) -> None:
        entries = [entry("a", 0)]

        updated, decision = invite_next(
            entries, now=NOON, quiet_hours=OPEN_HOURS, seats_available=0
        )

        assert not decision.someone_was_invited
        assert updated == entries


class TestQuietHours:
    def test_defers_a_late_night_invitation(self) -> None:
        three_am = datetime(2026, 8, 4, 3, 0, tzinfo=ZoneInfo(KARACHI))
        entries = [entry("a", 0)]

        _, decision = invite_next(entries, now=three_am, quiet_hours=OPEN_HOURS)

        assert decision.send_at is not None
        # Nobody is invited to a class at three in the morning (PRD §2.4).
        assert decision.send_at.astimezone(ZoneInfo(KARACHI)).hour == 9

    def test_the_hold_starts_when_the_message_sends(self) -> None:
        three_am = datetime(2026, 8, 4, 3, 0, tzinfo=ZoneInfo(KARACHI))
        entries = [entry("a", 0)]

        _, decision = invite_next(entries, now=three_am, quiet_hours=OPEN_HOURS)

        assert decision.invited is not None
        assert decision.send_at is not None
        # Counting from `now` would deliver an offer already six hours spent.
        assert decision.invited.invite_expires_at == decision.send_at + DEFAULT_INVITE_WINDOW

    def test_sends_immediately_inside_the_window(self) -> None:
        entries = [entry("a", 0)]

        _, decision = invite_next(entries, now=NOON, quiet_hours=OPEN_HOURS)

        assert decision.send_at == NOON


class TestExpiry:
    def test_only_expires_invitations_past_their_window(self) -> None:
        entries = [
            entry(
                "a", 0, status=WaitlistStatus.INVITED, invite_expires_at=NOON - timedelta(minutes=1)
            ),
            entry(
                "b", 1, status=WaitlistStatus.INVITED, invite_expires_at=NOON + timedelta(minutes=1)
            ),
            entry("c", 2),
        ]

        updated = expire_lapsed(entries, NOON)

        assert updated[0].status is WaitlistStatus.EXPIRED
        assert updated[1].status is WaitlistStatus.INVITED
        assert updated[2].status is WaitlistStatus.WAITING

    def test_rejects_a_naive_now(self) -> None:
        with pytest.raises(ValueError, match="timezone-aware"):
            expire_lapsed([], datetime(2026, 8, 4, 12, 0))  # noqa: DTZ001
