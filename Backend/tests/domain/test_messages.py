"""Message scheduling rules.

The PRD is explicit that a message must never fail silently (§3.2), so most
of these assert on *why* something will not send rather than merely that it
will not.
"""

from __future__ import annotations

from datetime import UTC, datetime, time, timedelta

import pytest

from app.domain.messages import (
    REMINDER_OFFSETS,
    TEMPLATES,
    MessagePlan,
    SkipReason,
    fill_template,
    plan_message,
    reminder_schedule,
    render,
    unresolved_placeholders,
)
from app.domain.scheduling import QuietHours

KARACHI = QuietHours(start=time(9, 0), end=time(21, 0), timezone="Asia/Karachi")


def at(hour: int, minute: int = 0, day: int = 6) -> datetime:
    """A UTC instant. Karachi is UTC+5, so 04:00Z is 09:00 local."""
    return datetime(2026, 8, day, hour, minute, tzinfo=UTC)


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------


def test_every_kind_exists_in_all_three_voices() -> None:
    """A missing pair would raise at send time, in the worker, unattended."""
    kinds = {kind for kind, _ in TEMPLATES}
    voices = {voice for _, voice in TEMPLATES}

    assert voices == {"soft_sweet", "chaotic_bestie", "clean_minimal"}
    for kind in kinds:
        for voice in voices:
            assert (kind, voice) in TEMPLATES, f"{kind} has no {voice} template"


def test_fill_substitutes_known_placeholders() -> None:
    assert fill_template("Hi {guest_name}, {time}", {"guest_name": "Sana", "time": "2 pm"}) == (
        "Hi Sana, 2 pm"
    )


def test_fill_leaves_unknown_placeholders_visible() -> None:
    """Better a visible defect than a crash in an unattended worker."""
    assert fill_template("Hi {nickname}", {}) == "Hi {nickname}"


def test_unresolved_placeholders_are_reportable() -> None:
    body = fill_template("Hi {guest_name}, see you {when}", {"guest_name": "Sana"})
    assert unresolved_placeholders(body) == ["when"]


def test_a_fully_filled_message_reports_nothing_outstanding() -> None:
    body = render("guest_reminder", "clean_minimal", {"class_name": "Bento", "time": "2 pm"})
    assert unresolved_placeholders(body) == []


def test_an_unknown_voice_raises_rather_than_sending_blank() -> None:
    with pytest.raises(KeyError):
        render("guest_reminder", "shakespearean", {})


def test_a_stray_brace_in_host_copy_does_not_explode() -> None:
    """`str.format` would raise here; the host's copy is not a format string."""
    assert fill_template("50% off {guest_name}", {"guest_name": "Sana"}) == "50% off Sana"


# ---------------------------------------------------------------------------
# Skips
# ---------------------------------------------------------------------------


def _plan(**overrides: object) -> MessagePlan:
    kwargs: dict[str, object] = {
        "desired_send_at": at(10),
        "now": at(6),
        "quiet_hours": KARACHI,
        "opted_out": False,
        "is_contactable": True,
    }
    kwargs.update(overrides)
    return plan_message(**kwargs)  # type: ignore[arg-type]


def test_an_opted_out_guest_is_skipped_with_a_reason() -> None:
    plan = _plan(opted_out=True)

    assert not plan.will_send
    assert plan.skip_reason is SkipReason.OPTED_OUT


def test_an_uncontactable_guest_is_skipped_with_a_reason() -> None:
    plan = _plan(is_contactable=False)

    assert not plan.will_send
    assert plan.skip_reason is SkipReason.NO_CONTACT


def test_opt_out_is_reported_ahead_of_missing_contact_details() -> None:
    """The two lead the host to different actions, so the order is not arbitrary."""
    plan = _plan(opted_out=True, is_contactable=False)
    assert plan.skip_reason is SkipReason.OPTED_OUT


def test_a_send_time_in_the_past_is_skipped_not_sent_immediately() -> None:
    """ "See you tomorrow!" arriving after the class is worse than silence."""
    plan = _plan(desired_send_at=at(4), now=at(10))

    assert not plan.will_send
    assert plan.skip_reason is SkipReason.IN_THE_PAST


# ---------------------------------------------------------------------------
# Quiet hours
# ---------------------------------------------------------------------------


def test_a_send_inside_the_window_is_left_alone() -> None:
    # 10:00Z is 15:00 in Karachi, comfortably inside 09:00–21:00.
    plan = _plan(desired_send_at=at(10))

    assert plan.will_send
    assert plan.send_at == at(10)
    assert not plan.was_shifted


def test_a_send_outside_the_window_queues_for_the_opening() -> None:
    """Triggered at 02:00 local, it waits for 09:00 rather than waking anyone."""
    # 21:00Z is 02:00 next day in Karachi.
    plan = _plan(desired_send_at=at(21), now=at(20))

    assert plan.will_send
    assert plan.was_shifted

    assert plan.send_at is not None
    local = plan.send_at.astimezone(KARACHI.zone)
    assert local.hour == 9


def test_a_shifted_send_never_moves_backwards() -> None:
    plan = _plan(desired_send_at=at(21), now=at(20))

    assert plan.send_at is not None
    assert plan.send_at >= at(21)


def test_a_naive_datetime_is_rejected() -> None:
    """A naive time here would silently be interpreted as UTC."""
    with pytest.raises(ValueError, match="aware"):
        _plan(desired_send_at=datetime(2026, 8, 6, 10, 0))  # noqa: DTZ001 - the point


# ---------------------------------------------------------------------------
# Anchoring
# ---------------------------------------------------------------------------


def test_the_three_reminders_anchor_to_the_session() -> None:
    start = at(9, day=10)
    schedule = reminder_schedule(start)

    assert schedule["guest_reminder"] == start - timedelta(hours=24)
    assert schedule["host_nudge"] == start - timedelta(hours=3)
    # Negative offset: the thank-you lands the day after.
    assert schedule["guest_thank_you"] == start + timedelta(hours=24)


def test_rescheduling_moves_every_reminder_with_it() -> None:
    """Absolute stored times would leave these pointing at the old date."""
    original = reminder_schedule(at(9, day=10))
    moved = reminder_schedule(at(9, day=12))

    for kind in REMINDER_OFFSETS:
        assert moved[kind] - original[kind] == timedelta(days=2)
