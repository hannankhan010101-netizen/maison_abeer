"""Message scheduling and rendering rules.

Pure functions over dataclasses: no FastAPI, no SQLAlchemy, no clock. The
reminder worker and the HTTP layer both call into here, so the answer to
"when does this send, and does it send at all" is decided in exactly one
place.

Three rules carry most of the weight, and all three come straight from the
PRD's edge cases (§2.6):

* A message triggered outside quiet hours **queues** for the next opening
  rather than being dropped or sent at 3am.
* A guest with no usable contact method, or who has opted out, is **skipped
  with a reason**. Silence the host cannot explain is the failure mode this
  product cannot have.
* A reminder whose send time has already passed by the time it is scheduled
  is **not** back-dated into an immediate send; a "see you tomorrow!" that
  arrives after the class is worse than nothing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum

from app.domain.scheduling import QuietHours, next_send_window, require_aware

__all__ = [
    "TEMPLATES",
    "MessagePlan",
    "SkipReason",
    "fill_template",
    "plan_message",
    "reminder_schedule",
    "render",
    "unresolved_placeholders",
]


class SkipReason(StrEnum):
    """Why a message will not be sent. Never silent — always one of these."""

    OPTED_OUT = "opted_out"
    NO_CONTACT = "no_contact"
    IN_THE_PAST = "in_the_past"


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

# Mirrors the three voices in the frontend's `lib/messages/voices.ts`. Kept in
# step deliberately: the host previews copy in the browser and the worker is
# what actually sends it, so a divergence here means the preview lies.
TEMPLATES: dict[tuple[str, str], str] = {
    ("guest_reminder", "soft_sweet"): (
        "We can't wait to see you tomorrow at {time}! Wear something comfy — "
        "aprons are on us. Parking is right out front, lovely."
    ),
    ("guest_reminder", "chaotic_bestie"): (
        "BESTIE. Tomorrow. {time}. {class_name}. Be there. "
        "(wear clothes you can get frosting on, this is a warning)"
    ),
    ("guest_reminder", "clean_minimal"): (
        "Reminder: {class_name}, tomorrow {time}. Aprons provided. Parking at the front."
    ),
    ("guest_thank_you", "soft_sweet"): (
        "Thank you for making with us, {guest_name} — tap an emoji and one "
        "word to tell us how it felt? {feedback_link}"
    ),
    ("guest_thank_you", "chaotic_bestie"): (
        "{guest_name}!! You ATE that (literally) — one emoji + one word, "
        "how was it?? {feedback_link}"
    ),
    ("guest_thank_you", "clean_minimal"): (
        "Thanks for joining, {guest_name}. One tap and one word — how was "
        "today's class? {feedback_link}"
    ),
    ("schedule_change", "soft_sweet"): (
        "Heads up lovely — {class_name} has moved to {date} at {time}. "
        "Same spot, same fun. Reply if that no longer works!"
    ),
    ("schedule_change", "chaotic_bestie"): (
        "PLOT TWIST. {class_name} is now {date} at {time}. "
        "Same vibes, new day. Shout if you can't make it!"
    ),
    ("schedule_change", "clean_minimal"): (
        "{class_name} has moved to {date} at {time}. Location unchanged. "
        "Reply if you can no longer attend."
    ),
    ("waitlist_invite", "soft_sweet"): (
        "A seat just opened up for {class_name} on {date}! "
        "It's yours if you'd like it — just reply and it's saved."
    ),
    ("waitlist_invite", "chaotic_bestie"): (
        "SEAT. OPENED. {class_name}, {date}. Say the word and it's yours."
    ),
    ("waitlist_invite", "clean_minimal"): (
        "A seat is available for {class_name} on {date}. Reply to confirm."
    ),
}

PLACEHOLDER = re.compile(r"\{(\w+)\}")


def unresolved_placeholders(body: str) -> list[str]:
    """Placeholders still present after filling.

    A message going out with a literal `{guest_name}` in it is a defect the
    host should see before it sends, not after.
    """
    return sorted(set(PLACEHOLDER.findall(body)))


def fill_template(body: str, values: dict[str, str]) -> str:
    """Substitute known placeholders, leaving unknown ones intact.

    Deliberately not `str.format`: a missing key would raise, and a stray
    brace in host-authored copy would raise too. Leaving the placeholder
    visible lets `unresolved_placeholders` report it instead.
    """
    return PLACEHOLDER.sub(lambda m: values.get(m.group(1), m.group(0)), body)


def render(kind: str, voice: str, values: dict[str, str]) -> str:
    """The body for a (kind, voice) pair with `values` substituted."""
    template = TEMPLATES.get((kind, voice))

    if template is None:
        raise KeyError(f"no template for kind={kind!r} voice={voice!r}")

    return fill_template(template, values)


# ---------------------------------------------------------------------------
# Scheduling
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class MessagePlan:
    """What the worker should do with one prospective message."""

    send_at: datetime | None
    skip_reason: SkipReason | None = None
    was_shifted: bool = False
    """True when quiet hours moved the send. Shown to the host as 'sends 9am'."""

    @property
    def will_send(self) -> bool:
        return self.skip_reason is None and self.send_at is not None


def plan_message(
    *,
    desired_send_at: datetime,
    now: datetime,
    quiet_hours: QuietHours,
    opted_out: bool,
    is_contactable: bool,
) -> MessagePlan:
    """Decide whether and when a single message sends.

    Order matters. Opt-out is checked before contactability so a guest who
    opted out is reported as such rather than as missing a phone number --
    the two lead the host to different actions.
    """
    require_aware(desired_send_at, "desired_send_at")
    require_aware(now, "now")

    if opted_out:
        return MessagePlan(send_at=None, skip_reason=SkipReason.OPTED_OUT)

    if not is_contactable:
        return MessagePlan(send_at=None, skip_reason=SkipReason.NO_CONTACT)

    # A reminder for a class that already started has no useful send time.
    # Shifting it to "now" would deliver "see you tomorrow!" after the fact.
    if desired_send_at < now:
        return MessagePlan(send_at=None, skip_reason=SkipReason.IN_THE_PAST)

    shifted = next_send_window(desired_send_at, quiet_hours)

    return MessagePlan(
        send_at=shifted,
        skip_reason=None,
        was_shifted=shifted != desired_send_at,
    )


# T-minus offsets for the automatic reminders (PRD §2.6). Negative is after.
REMINDER_OFFSETS: dict[str, float] = {
    "guest_reminder": 24.0,
    "host_nudge": 3.0,
    "guest_thank_you": -24.0,
}


def reminder_schedule(session_starts_at: datetime) -> dict[str, datetime]:
    """The three automatic reminders anchored to one session start.

    Anchored to the session rather than stored as absolute times, so a
    reschedule recomputes them instead of leaving them pointing at the old
    date -- the same rule the checklist deadlines follow.
    """
    require_aware(session_starts_at, "session_starts_at")

    return {
        kind: session_starts_at - timedelta(hours=hours) for kind, hours in REMINDER_OFFSETS.items()
    }
