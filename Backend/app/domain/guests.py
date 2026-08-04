"""Guest identity and recognition rules.

The PRD's ambition for this module is "the superpower of remembering every
guest like a favourite regular" (§2.4). That rests on two unglamorous things:
matching a returning guest to their existing record, and knowing whether we
can actually reach them.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum

BIRTHDAY_LOOKAHEAD_DAYS = 30
"""PRD §2.4 — a thirty-day birthday lookahead on the roster."""

REGULAR_FROM_VISIT = 3
"""The visit at which a guest earns the Regulars filter."""

_NON_DIGITS = re.compile(r"[^\d+]")


class MessageChannel(StrEnum):
    SMS = "sms"
    WHATSAPP = "whatsapp"
    EMAIL = "email"


def normalise_phone(raw: str | None) -> str | None:
    """Reduce a phone number to a comparable form.

    Hosts type numbers inconsistently — "0300 1234567", "+92 300 1234567",
    "(0300) 123-4567". Without normalising, the same guest becomes three
    records and their visit history fragments, which defeats the whole point
    of remembering them.

    Deliberately conservative: punctuation and spacing are stripped, but no
    country code is inferred, because guessing wrongly merges two real people.
    """
    if raw is None:
        return None

    cleaned = _NON_DIGITS.sub("", raw.strip())

    # A leading "+" is only meaningful at the front.
    if "+" in cleaned:
        cleaned = "+" + cleaned.replace("+", "")

    return cleaned or None


def normalise_email(raw: str | None) -> str | None:
    """Lowercase and trim. Local-part casing is preserved by some providers,
    but treating "Sana@x.com" and "sana@x.com" as different guests would be
    surprising to a host."""
    if raw is None:
        return None

    cleaned = raw.strip().lower()
    return cleaned or None


@dataclass(frozen=True, slots=True)
class GuestIdentity:
    """The fields used to recognise a returning guest."""

    guest_id: str
    full_name: str
    phone: str | None = None
    email: str | None = None

    @property
    def normalised_phone(self) -> str | None:
        return normalise_phone(self.phone)

    @property
    def normalised_email(self) -> str | None:
        return normalise_email(self.email)


def find_duplicate(candidate: GuestIdentity, existing: list[GuestIdentity]) -> GuestIdentity | None:
    """Find an existing guest that is the same person.

    Matches on normalised phone or email only. Name is deliberately *not* a
    match key: two different guests called "Sana" is ordinary, and merging
    them would blend their allergies — a safety problem, not a data problem.
    """
    phone = candidate.normalised_phone
    email = candidate.normalised_email

    if phone is None and email is None:
        return None

    for other in existing:
        if other.guest_id == candidate.guest_id:
            continue
        if phone is not None and other.normalised_phone == phone:
            return other
        if email is not None and other.normalised_email == email:
            return other

    return None


def is_contactable(
    *,
    channel: MessageChannel,
    phone: str | None,
    email: str | None,
    opted_out: bool,
) -> bool:
    """Whether automated messages can reach this guest.

    A guest added from a DM with only a name simply drops out of automated
    sends and is badged on the roster, so the host knows to reach them
    personally (PRD §2.4 edge cases).
    """
    if opted_out:
        return False

    if channel is MessageChannel.EMAIL:
        return normalise_email(email) is not None

    return normalise_phone(phone) is not None


def visit_badge(visit_count: int) -> str | None:
    """Roster badge copy: "3rd visit". None before it means anything."""
    if visit_count < 2:
        return None

    suffix = "th"
    if visit_count % 100 not in {11, 12, 13}:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(visit_count % 10, "th")

    return f"{visit_count}{suffix} visit"


def is_regular(visit_count: int) -> bool:
    return visit_count >= REGULAR_FROM_VISIT


def next_birthday(birthday: date, today: date) -> date:
    """The next occurrence of a birthday on or after `today`.

    29 February falls back to 1 March in non-leap years, so the host is still
    prompted in the right week.
    """
    month, day = birthday.month, birthday.day

    def _on(year: int) -> date:
        if month == 2 and day == 29:
            try:
                return date(year, 2, 29)
            except ValueError:
                return date(year, 3, 1)
        return date(year, month, day)

    this_year = _on(today.year)
    return this_year if this_year >= today else _on(today.year + 1)


def days_until_birthday(birthday: date, today: date) -> int:
    return (next_birthday(birthday, today) - today).days


def in_birthday_lookahead(
    birthday: date | None, today: date, *, window_days: int = BIRTHDAY_LOOKAHEAD_DAYS
) -> bool:
    """Whether a birthday falls inside the lookahead window."""
    if birthday is None:
        return False

    return days_until_birthday(birthday, today) <= window_days


def upcoming_birthdays(
    guests: list[tuple[str, date | None]],
    today: date,
    *,
    window_days: int = BIRTHDAY_LOOKAHEAD_DAYS,
) -> list[tuple[str, int]]:
    """(guest_id, days_away) for everyone with a birthday in the window,
    soonest first — the roster's birthday radar."""
    found = [
        (guest_id, days_until_birthday(birthday, today))
        for guest_id, birthday in guests
        if birthday is not None and days_until_birthday(birthday, today) <= window_days
    ]

    return sorted(found, key=lambda pair: pair[1])


def lookahead_window(
    today: date, *, window_days: int = BIRTHDAY_LOOKAHEAD_DAYS
) -> tuple[date, date]:
    return today, today + timedelta(days=window_days)
