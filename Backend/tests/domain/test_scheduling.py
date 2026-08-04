"""Scheduling rules: deadlines, rescheduling, quiet hours, energy budget."""

from __future__ import annotations

from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.domain.scheduling import (
    ChecklistDeadline,
    DeadlineStatus,
    EnergyWarning,
    QuietHours,
    RescheduleError,
    TMinusOffset,
    assess_energy,
    deadline_status,
    next_send_window,
    plan_reschedule,
    reanchor,
    require_aware,
)

KARACHI = "Asia/Karachi"


def at(year: int, month: int, day: int, hour: int = 0, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=UTC)


class TestAwarenessGuard:
    def test_rejects_naive_datetimes(self) -> None:
        with pytest.raises(ValueError, match="must be timezone-aware"):
            require_aware(datetime(2026, 8, 8, 14, 0))  # noqa: DTZ001

    def test_accepts_aware_datetimes(self) -> None:
        moment = at(2026, 8, 8, 14)
        assert require_aware(moment) is moment


class TestTMinusOffsets:
    @pytest.mark.parametrize(
        ("hours", "label"),
        [(24, "T-24h"), (4, "T-4h"), (1, "T-1h"), (0, "at start"), (-2, "T+2h"), (1.5, "T-1.5h")],
    )
    def test_labels_match_the_prototype(self, hours: float, label: str) -> None:
        assert TMinusOffset(hours_before=hours).label == label

    def test_resolves_against_session_start(self) -> None:
        start = at(2026, 8, 8, 14)  # Saturday 2pm
        assert TMinusOffset(24).resolve(start) == at(2026, 8, 7, 14)
        assert TMinusOffset(1).resolve(start) == at(2026, 8, 8, 13)

    def test_post_class_offsets_land_after_start(self) -> None:
        start = at(2026, 8, 8, 14)
        assert TMinusOffset(-2).resolve(start) == at(2026, 8, 8, 16)


class TestDeadlineStatus:
    def test_two_stage_escalation(self) -> None:
        deadline = at(2026, 8, 8, 14)

        assert deadline_status(deadline, at(2026, 8, 8, 8)) is DeadlineStatus.UPCOMING
        assert deadline_status(deadline, at(2026, 8, 8, 13)) is DeadlineStatus.DUE_SOON
        assert deadline_status(deadline, at(2026, 8, 8, 15)) is DeadlineStatus.OVERDUE

    def test_completed_items_are_never_overdue(self) -> None:
        status = deadline_status(at(2026, 8, 1, 9), at(2026, 8, 8, 9), completed=True)
        assert status is DeadlineStatus.DONE

    def test_exact_deadline_counts_as_overdue(self) -> None:
        moment = at(2026, 8, 8, 14)
        assert deadline_status(moment, moment) is DeadlineStatus.OVERDUE


class TestPlanReschedule:
    def _deadlines(self, start: datetime) -> list[ChecklistDeadline]:
        return [
            ChecklistDeadline(
                "i1", "bake cake bases", TMinusOffset(24), TMinusOffset(24).resolve(start)
            ),
            ChecklistDeadline(
                "i2", "set out sprinkles", TMinusOffset(1), TMinusOffset(1).resolve(start)
            ),
        ]

    def test_reports_impact_without_applying_it(self) -> None:
        previous = at(2026, 8, 8, 14)
        new = at(2026, 8, 9, 14)

        impact = plan_reschedule(
            previous_start=previous,
            new_start=new,
            now=at(2026, 8, 4, 9),
            deadlines=self._deadlines(previous),
            affected_guest_count=8,
            contactable_guest_count=8,
        )

        assert impact.delta == timedelta(days=1)
        assert impact.affected_guest_count == 8
        assert impact.requires_guest_notification is True
        assert len(impact.deadline_shifts) == 2
        # Every deadline follows the session.
        assert impact.deadline_shifts[0].new_deadline == at(2026, 8, 8, 14)
        assert impact.deadline_shifts[1].new_deadline == at(2026, 8, 9, 13)

    def test_moving_earlier_flags_newly_overdue_prep(self) -> None:
        previous = at(2026, 8, 8, 14)
        new = at(2026, 8, 5, 14)

        impact = plan_reschedule(
            previous_start=previous,
            new_start=new,
            now=at(2026, 8, 4, 9),
            deadlines=self._deadlines(previous),
            affected_guest_count=8,
            contactable_guest_count=8,
        )

        assert impact.moves_earlier is True
        assert len(impact.newly_overdue) == 2

    def test_rejects_moving_into_the_past(self) -> None:
        with pytest.raises(RescheduleError, match="in the past"):
            plan_reschedule(
                previous_start=at(2026, 8, 8, 14),
                new_start=at(2026, 8, 1, 14),
                now=at(2026, 8, 4, 9),
                deadlines=[],
                affected_guest_count=0,
                contactable_guest_count=0,
            )

    def test_guests_without_contact_details_are_excluded_from_notification(self) -> None:
        previous = at(2026, 8, 8, 14)
        impact = plan_reschedule(
            previous_start=previous,
            new_start=at(2026, 8, 9, 14),
            now=at(2026, 8, 4, 9),
            deadlines=[],
            affected_guest_count=8,
            contactable_guest_count=0,
        )

        # Eight guests affected but nobody reachable — don't offer to notify.
        assert impact.affected_guest_count == 8
        assert impact.requires_guest_notification is False

    def test_contactable_cannot_exceed_affected(self) -> None:
        with pytest.raises(ValueError, match="cannot exceed"):
            plan_reschedule(
                previous_start=at(2026, 8, 8, 14),
                new_start=at(2026, 8, 9, 14),
                now=at(2026, 8, 4, 9),
                deadlines=[],
                affected_guest_count=2,
                contactable_guest_count=5,
            )

    def test_reanchor_moves_a_single_deadline(self) -> None:
        previous = at(2026, 8, 8, 14)
        item = self._deadlines(previous)[0]

        moved = reanchor(item, at(2026, 8, 9, 14))

        assert moved.deadline == at(2026, 8, 8, 14)
        assert moved.item_id == item.item_id


class TestQuietHours:
    def test_allows_messages_inside_the_window(self) -> None:
        quiet = QuietHours(timezone=KARACHI)
        noon_local = datetime(2026, 8, 8, 12, tzinfo=ZoneInfo(KARACHI))

        assert quiet.allows(noon_local) is True

    def test_blocks_messages_outside_the_window(self) -> None:
        quiet = QuietHours(timezone=KARACHI)
        three_am = datetime(2026, 8, 8, 3, tzinfo=ZoneInfo(KARACHI))

        assert quiet.allows(three_am) is False

    def test_evaluates_in_studio_time_not_utc(self) -> None:
        # 23:00 UTC is 04:00 next day in Karachi — must be blocked.
        quiet = QuietHours(timezone=KARACHI)
        assert quiet.allows(at(2026, 8, 8, 23)) is False

    def test_queues_to_the_next_opening(self) -> None:
        quiet = QuietHours(timezone=KARACHI)
        three_am = datetime(2026, 8, 8, 3, tzinfo=ZoneInfo(KARACHI))

        send_at = next_send_window(three_am, quiet)

        assert send_at.astimezone(ZoneInfo(KARACHI)).hour == 9
        assert send_at.astimezone(ZoneInfo(KARACHI)).date() == three_am.date()

    def test_late_night_queues_to_tomorrow_morning(self) -> None:
        quiet = QuietHours(timezone=KARACHI)
        late = datetime(2026, 8, 8, 23, 30, tzinfo=ZoneInfo(KARACHI))

        send_at = next_send_window(late, quiet).astimezone(ZoneInfo(KARACHI))

        assert send_at.hour == 9
        assert send_at.date() == late.date() + timedelta(days=1)

    def test_moment_inside_the_window_is_returned_unchanged(self) -> None:
        quiet = QuietHours(timezone=KARACHI)
        noon = datetime(2026, 8, 8, 12, tzinfo=ZoneInfo(KARACHI))

        assert next_send_window(noon, quiet) == noon

    def test_supports_a_window_that_wraps_midnight(self) -> None:
        quiet = QuietHours(start=time(21, 0), end=time(9, 0), timezone=KARACHI)

        assert quiet.allows(datetime(2026, 8, 8, 23, tzinfo=ZoneInfo(KARACHI))) is True
        assert quiet.allows(datetime(2026, 8, 8, 12, tzinfo=ZoneInfo(KARACHI))) is False


class TestEnergyBudget:
    def test_warns_on_a_rest_day(self) -> None:
        # 2026-08-09 is a Sunday.
        assessment = assess_energy(
            proposed_start=at(2026, 8, 9, 14),
            existing_starts=[],
            rest_days=frozenset({7}),
            weekly_cap=None,
        )

        assert assessment.warning is EnergyWarning.REST_DAY
        assert "rest day" in assessment.message
        # Always overridable — the wording must offer, never refuse.
        assert "anyway" in assessment.message.lower()

    def test_warns_when_the_weekly_cap_is_exceeded(self) -> None:
        week = [at(2026, 8, 3, 18), at(2026, 8, 4, 18), at(2026, 8, 5, 18)]

        assessment = assess_energy(
            proposed_start=at(2026, 8, 7, 18),
            existing_starts=week,
            rest_days=frozenset(),
            weekly_cap=3,
        )

        assert assessment.warning is EnergyWarning.WEEKLY_CAP
        assert "4 classes this week" in assessment.message

    def test_warns_on_three_consecutive_days(self) -> None:
        # tue -> wed -> thu, the prototype's example.
        assessment = assess_energy(
            proposed_start=at(2026, 8, 6, 18),
            existing_starts=[at(2026, 8, 4, 18), at(2026, 8, 5, 18)],
            rest_days=frozenset(),
            weekly_cap=None,
        )

        assert assessment.warning is EnergyWarning.BACK_TO_BACK
        assert "3 classes in a row" in assessment.message

    def test_two_consecutive_days_is_fine(self) -> None:
        assessment = assess_energy(
            proposed_start=at(2026, 8, 5, 18),
            existing_starts=[at(2026, 8, 4, 18)],
            rest_days=frozenset(),
            weekly_cap=None,
        )

        assert assessment.should_warn is False

    def test_two_classes_on_one_day_is_not_a_run(self) -> None:
        # Parallel stations are allowed; only consecutive *days* count.
        assessment = assess_energy(
            proposed_start=at(2026, 8, 4, 18),
            existing_starts=[at(2026, 8, 4, 10)],
            rest_days=frozenset(),
            weekly_cap=None,
        )

        assert assessment.should_warn is False

    def test_quiet_when_nothing_is_scheduled(self) -> None:
        assessment = assess_energy(
            proposed_start=at(2026, 8, 12, 18),
            existing_starts=[],
            rest_days=frozenset(),
            weekly_cap=5,
        )

        assert assessment.warning is EnergyWarning.NONE
        assert assessment.message == ""
