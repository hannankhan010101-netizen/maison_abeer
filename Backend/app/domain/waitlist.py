"""Waitlist rules.

When a session fills, an ordered waitlist opens. A freed seat is offered to
the next person, who holds it for a response window before the offer passes
down the list — and no offer is ever sent during quiet hours (PRD §2.4, §2.6).

Pure functions over value objects: the ordering and expiry decisions are made
here, and the caller persists whatever comes back.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from enum import StrEnum

from app.domain.scheduling import QuietHours, next_send_window, require_aware

DEFAULT_INVITE_WINDOW = timedelta(hours=12)
"""PRD §2.4 — an invitation holds a seat for 12 hours by default."""


class WaitlistStatus(StrEnum):
    WAITING = "waiting"
    INVITED = "invited"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    EXPIRED = "expired"
    WITHDRAWN = "withdrawn"


# Statuses that still occupy a place in the queue.
LIVE_STATUSES = frozenset({WaitlistStatus.WAITING, WaitlistStatus.INVITED})


@dataclass(frozen=True, slots=True)
class WaitlistEntry:
    entry_id: str
    guest_id: str
    position: int
    status: WaitlistStatus = WaitlistStatus.WAITING
    invited_at: datetime | None = None
    invite_expires_at: datetime | None = None
    contactable: bool = True
    """False when the guest opted out or has no contact details (PRD §2.4)."""

    @property
    def is_live(self) -> bool:
        return self.status in LIVE_STATUSES

    def has_expired(self, now: datetime) -> bool:
        if self.status is not WaitlistStatus.INVITED or self.invite_expires_at is None:
            return False
        return now >= self.invite_expires_at


@dataclass(frozen=True, slots=True)
class InviteDecision:
    """The outcome of trying to offer a freed seat."""

    invited: WaitlistEntry | None
    expired: list[WaitlistEntry]
    """Invitations that lapsed and were passed over."""
    send_at: datetime | None
    """When the invitation may actually send, after quiet hours."""
    reason: str | None = None
    """Set when nobody could be invited, for the host-facing message."""

    @property
    def someone_was_invited(self) -> bool:
        return self.invited is not None


def normalise_positions(entries: list[WaitlistEntry]) -> list[WaitlistEntry]:
    """Renumber live entries 0..n-1, preserving their relative order.

    Called after any removal so positions never develop gaps, which would make
    "you're 3rd in line" wrong the moment somebody withdraws.
    """
    live = sorted(
        (e for e in entries if e.is_live),
        key=lambda e: e.position,
    )
    settled = [e for e in entries if not e.is_live]

    renumbered = [replace(entry, position=index) for index, entry in enumerate(live)]

    return renumbered + settled


def expire_lapsed(entries: list[WaitlistEntry], now: datetime) -> list[WaitlistEntry]:
    """Mark invitations whose window has closed."""
    require_aware(now, "now")

    return [
        replace(entry, status=WaitlistStatus.EXPIRED) if entry.has_expired(now) else entry
        for entry in entries
    ]


def invite_next(
    entries: list[WaitlistEntry],
    *,
    now: datetime,
    quiet_hours: QuietHours,
    seats_available: int = 1,
    invite_window: timedelta = DEFAULT_INVITE_WINDOW,
) -> tuple[list[WaitlistEntry], InviteDecision]:
    """Offer a freed seat to the next eligible person.

    Returns the updated list and a decision describing what happened.

    Rules:
        * Expired invitations are settled first, then the queue is renumbered.
        * An outstanding, unexpired invitation blocks a second offer — the seat
          is already being held.
        * Guests with no way to be contacted are skipped rather than silently
          consuming the offer; they stay queued for the host to reach directly.
        * The send time respects quiet hours, so nobody is invited at 3am.
    """
    require_aware(now, "now")

    if seats_available <= 0:
        return entries, InviteDecision(
            invited=None, expired=[], send_at=None, reason="There's no free seat to offer."
        )

    settled = expire_lapsed(entries, now)
    expired = [
        entry
        for entry, before in zip(settled, entries, strict=True)
        if entry.status is WaitlistStatus.EXPIRED and before.status is WaitlistStatus.INVITED
    ]

    outstanding = [
        entry
        for entry in settled
        if entry.status is WaitlistStatus.INVITED and not entry.has_expired(now)
    ]
    if outstanding:
        return normalise_positions(settled), InviteDecision(
            invited=None,
            expired=expired,
            send_at=None,
            reason="Someone already has this seat on hold.",
        )

    ordered = normalise_positions(settled)
    candidates = sorted(
        (e for e in ordered if e.status is WaitlistStatus.WAITING),
        key=lambda e: e.position,
    )

    if not candidates:
        return ordered, InviteDecision(
            invited=None, expired=expired, send_at=None, reason="Nobody's waiting right now."
        )

    reachable = next((e for e in candidates if e.contactable), None)
    if reachable is None:
        return ordered, InviteDecision(
            invited=None,
            expired=expired,
            send_at=None,
            reason="Nobody on the waitlist can be messaged — reach out to them directly.",
        )

    send_at = next_send_window(now, quiet_hours)

    # The hold runs from when the invitation actually sends, not from now —
    # otherwise a message queued overnight would arrive already half-expired.
    invited = replace(
        reachable,
        status=WaitlistStatus.INVITED,
        invited_at=send_at,
        invite_expires_at=send_at + invite_window,
    )

    updated = [invited if e.entry_id == invited.entry_id else e for e in ordered]

    return updated, InviteDecision(invited=invited, expired=expired, send_at=send_at, reason=None)


def accept(entries: list[WaitlistEntry], entry_id: str) -> list[WaitlistEntry]:
    """Record acceptance and renumber those still queued."""
    updated = [
        replace(entry, status=WaitlistStatus.ACCEPTED) if entry.entry_id == entry_id else entry
        for entry in entries
    ]
    return normalise_positions(updated)


def withdraw(entries: list[WaitlistEntry], entry_id: str) -> list[WaitlistEntry]:
    updated = [
        replace(entry, status=WaitlistStatus.WITHDRAWN) if entry.entry_id == entry_id else entry
        for entry in entries
    ]
    return normalise_positions(updated)


def position_of(entries: list[WaitlistEntry], guest_id: str) -> int | None:
    """1-based position for guest-facing copy ("you're 2nd in line")."""
    for entry in normalise_positions(entries):
        if entry.guest_id == guest_id and entry.is_live:
            return entry.position + 1
    return None
