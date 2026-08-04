"""Scheduling rules: T-minus deadlines, rescheduling, quiet hours, energy budget.

Pure functions over aware datetimes. Every datetime crossing this module MUST
be timezone-aware — a scheduling product that drops a tzinfo sends a reminder
at the wrong hour, and the PRD treats a mistimed message as a broken promise
(§3.2). `require_aware` enforces that at the boundary rather than trusting
callers.

PRD references: §2.2 (drag-and-drop reschedule, energy budget),
§2.5 (T-minus timing, deadline warnings), §2.6 (smart send windows).
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime, time, timedelta
from enum import StrEnum
from zoneinfo import ZoneInfo

# Default quiet hours per PRD §2.6 — no guest is messaged at 3am.
DEFAULT_QUIET_START = time(9, 0)
DEFAULT_QUIET_END = time(21, 0)

# "Three or more classes back-to-back within a tight window" (PRD §2.2).
BURNOUT_RUN_LENGTH = 3
BURNOUT_WINDOW = timedelta(days=3)


class DeadlineStatus(StrEnum):
    """Where a checklist deadline sits relative to now (PRD §2.5)."""

    UPCOMING = "upcoming"
    DUE_SOON = "due_soon"
    OVERDUE = "overdue"
    DONE = "done"


def require_aware(value: datetime, field: str = "datetime") -> datetime:
    """Guard against naive datetimes entering scheduling logic."""
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field} must be timezone-aware; got a naive datetime.")
    return value


# ---------------------------------------------------------------------------
# T-minus deadlines
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TMinusOffset:
    """A checklist step's timing, relative to session start.

    Stored on templates as an offset so that a template stays reusable, and
    resolved to an absolute deadline when instantiated onto a session.

    `hours_before=24` means "T-24h". Zero means "at class start"; a negative
    value expresses post-class reset steps ("T+2h").
    """

    hours_before: float

    @property
    def label(self) -> str:
        """Human label matching the prototype's eyebrow copy, e.g. 'T-24h'."""
        if self.hours_before == 0:
            return "at start"
        sign = "-" if self.hours_before > 0 else "+"
        magnitude = abs(self.hours_before)
        rendered = f"{magnitude:g}"
        return f"T{sign}{rendered}h"

    def resolve(self, session_start: datetime) -> datetime:
        """Absolute deadline for a session starting at `session_start`."""
        require_aware(session_start, "session_start")
        return session_start - timedelta(hours=self.hours_before)


def resolve_deadlines(
    session_start: datetime,
    offsets: list[TMinusOffset],
) -> list[datetime]:
    """Anchor a template's offsets to a concrete session start."""
    require_aware(session_start, "session_start")
    return [offset.resolve(session_start) for offset in offsets]


def deadline_status(
    deadline: datetime,
    now: datetime,
    *,
    completed: bool = False,
    due_soon_window: timedelta = timedelta(hours=2),
) -> DeadlineStatus:
    """Classify a deadline for display and escalation.

    The two-stage escalation of PRD §2.5: `DUE_SOON` drives the gentle nudge,
    `OVERDUE` drives the pinned terracotta dashboard card.
    """
    require_aware(deadline, "deadline")
    require_aware(now, "now")

    if completed:
        return DeadlineStatus.DONE
    if now >= deadline:
        return DeadlineStatus.OVERDUE
    if deadline - now <= due_soon_window:
        return DeadlineStatus.DUE_SOON
    return DeadlineStatus.UPCOMING


# ---------------------------------------------------------------------------
# Rescheduling
# ---------------------------------------------------------------------------


class RescheduleError(ValueError):
    """Raised when a proposed reschedule is not permitted."""


@dataclass(frozen=True, slots=True)
class DeadlineShift:
    """One checklist deadline moving as a result of a reschedule."""

    item_id: str
    label: str
    previous_deadline: datetime
    new_deadline: datetime
    was_completed: bool

    @property
    def becomes_overdue_immediately(self) -> bool:
        """Moving a class earlier can pull an unfinished step into the past."""
        return not self.was_completed and self.new_deadline < self.previous_deadline


@dataclass(frozen=True, slots=True)
class RescheduleImpact:
    """Everything the confirmation modal must state before anything saves.

    PRD §2.2 requires the host to see the new slot, how many guests are
    affected, and which prep deadlines shift — *before* the change commits.
    """

    previous_start: datetime
    new_start: datetime
    delta: timedelta
    affected_guest_count: int
    contactable_guest_count: int
    deadline_shifts: list[DeadlineShift]

    @property
    def moves_earlier(self) -> bool:
        return self.delta < timedelta(0)

    @property
    def newly_overdue(self) -> list[DeadlineShift]:
        return [s for s in self.deadline_shifts if s.becomes_overdue_immediately]

    @property
    def requires_guest_notification(self) -> bool:
        return self.contactable_guest_count > 0


@dataclass(frozen=True, slots=True)
class ChecklistDeadline:
    """A checklist item's current deadline, as input to reschedule planning."""

    item_id: str
    label: str
    offset: TMinusOffset
    deadline: datetime
    completed: bool = False


def plan_reschedule(
    *,
    previous_start: datetime,
    new_start: datetime,
    now: datetime,
    deadlines: list[ChecklistDeadline],
    affected_guest_count: int,
    contactable_guest_count: int,
) -> RescheduleImpact:
    """Compute the full impact of moving a session, without applying it.

    Raises:
        RescheduleError: if the new slot is in the past (PRD §2.2 edge case).
    """
    require_aware(previous_start, "previous_start")
    require_aware(new_start, "new_start")
    require_aware(now, "now")

    if new_start < now:
        raise RescheduleError(
            "That slot is in the past. Pick a time from now onwards — "
            "past classes can't be scheduled."
        )

    if contactable_guest_count > affected_guest_count:
        raise ValueError("contactable_guest_count cannot exceed affected_guest_count")

    shifts = [
        DeadlineShift(
            item_id=item.item_id,
            label=item.label,
            previous_deadline=item.deadline,
            new_deadline=item.offset.resolve(new_start),
            was_completed=item.completed,
        )
        for item in deadlines
    ]

    return RescheduleImpact(
        previous_start=previous_start,
        new_start=new_start,
        delta=new_start - previous_start,
        affected_guest_count=affected_guest_count,
        contactable_guest_count=contactable_guest_count,
        deadline_shifts=shifts,
    )


def reanchor(deadline: ChecklistDeadline, new_start: datetime) -> ChecklistDeadline:
    """Return the item with its deadline re-derived from a new session start."""
    return replace(deadline, deadline=deadline.offset.resolve(new_start))


# ---------------------------------------------------------------------------
# Quiet hours
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class QuietHours:
    """The studio's guest-messaging window, in the studio's own timezone."""

    start: time = DEFAULT_QUIET_START
    end: time = DEFAULT_QUIET_END
    timezone: str = "UTC"

    @property
    def zone(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)

    def allows(self, moment: datetime) -> bool:
        """Whether a guest message may send at `moment`."""
        require_aware(moment, "moment")
        local = moment.astimezone(self.zone).time()

        if self.start <= self.end:
            return self.start <= local < self.end
        # Window wraps midnight (e.g. 21:00–09:00).
        return local >= self.start or local < self.end


def next_send_window(moment: datetime, quiet_hours: QuietHours) -> datetime:
    """The moment a message may send: now, or the next window opening.

    Anything triggered outside the window queues for the next opening rather
    than being dropped (PRD §2.6).
    """
    require_aware(moment, "moment")

    if quiet_hours.allows(moment):
        return moment

    local = moment.astimezone(quiet_hours.zone)
    candidate = local.replace(
        hour=quiet_hours.start.hour,
        minute=quiet_hours.start.minute,
        second=0,
        microsecond=0,
    )

    if candidate <= local:
        candidate += timedelta(days=1)

    return candidate.astimezone(moment.tzinfo)


# ---------------------------------------------------------------------------
# Energy budget — the calendar protecting the host (PRD §2.2)
# ---------------------------------------------------------------------------


class EnergyWarning(StrEnum):
    NONE = "none"
    REST_DAY = "rest_day"
    WEEKLY_CAP = "weekly_cap"
    BACK_TO_BACK = "back_to_back"


@dataclass(frozen=True, slots=True)
class EnergyAssessment:
    """Advisory only. These prompts never block saving — the system cares,
    it does not control (PRD §2.2)."""

    warning: EnergyWarning
    message: str

    @property
    def should_warn(self) -> bool:
        return self.warning is not EnergyWarning.NONE


def assess_energy(
    *,
    proposed_start: datetime,
    existing_starts: list[datetime],
    rest_days: frozenset[int],
    weekly_cap: int | None,
    timezone: str = "UTC",
) -> EnergyAssessment:
    """Evaluate a proposed session against the host's energy budget.

    Args:
        proposed_start: When the new session would begin.
        existing_starts: Starts of already-scheduled sessions.
        rest_days: ISO weekday numbers (Monday=1 … Sunday=7) marked as rest.
        weekly_cap: Maximum classes the host wants in one ISO week, if set.
        timezone: The studio's timezone; all comparisons are local to it.
    """
    require_aware(proposed_start, "proposed_start")
    zone = ZoneInfo(timezone)
    local = proposed_start.astimezone(zone)

    if local.isoweekday() in rest_days:
        return EnergyAssessment(
            EnergyWarning.REST_DAY,
            "This is your rest day. Schedule anyway?",
        )

    local_existing = [require_aware(s, "existing start").astimezone(zone) for s in existing_starts]

    if weekly_cap is not None:
        target_week = local.isocalendar()[:2]
        in_week = sum(1 for s in local_existing if s.isocalendar()[:2] == target_week)
        if in_week + 1 > weekly_cap:
            return EnergyAssessment(
                EnergyWarning.WEEKLY_CAP,
                f"That would be {in_week + 1} classes this week, past your "
                f"{weekly_cap}-class goal. Still want to add it?",
            )

    run = _longest_run_including(local, local_existing)
    if run >= BURNOUT_RUN_LENGTH:
        return EnergyAssessment(
            EnergyWarning.BACK_TO_BACK,
            f"{run} classes in a row is a lot. Want to space these out?",
        )

    return EnergyAssessment(EnergyWarning.NONE, "")


def _longest_run_including(proposed: datetime, existing: list[datetime]) -> int:
    """Count classes on consecutive days in the unbroken run containing `proposed`.

    Days are counted, not sessions: two classes on one day are one day of the
    run. The host's complaint is "tue → wed → thu", not "two on Tuesday".
    """
    days = {s.date() for s in existing}
    days.add(proposed.date())

    target = proposed.date()
    run = 1

    cursor = target - timedelta(days=1)
    while cursor in days:
        run += 1
        cursor -= timedelta(days=1)

    cursor = target + timedelta(days=1)
    while cursor in days:
        run += 1
        cursor += timedelta(days=1)

    return run
