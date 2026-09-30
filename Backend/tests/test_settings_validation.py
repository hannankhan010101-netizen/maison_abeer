"""The timezone field is load-bearing, so it is validated at the boundary.

Every scheduling rule in the product resolves this one string: quiet hours,
the rest-day and burnout checks, the send window the worker drains against.
An unrecognised value used to save with a cheerful 200 and then raise
`ZoneInfoNotFoundError` — a `KeyError` — out of `ZoneInfo`, surfacing as a 500
on quick-add, on message preview, on queueing reminders and on the cron drain,
with nothing naming the cause.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.domain.scheduling import QuietHours, resolve_zone
from app.schemas.settings import SettingsUpdate


class TestTimezoneValidation:
    def test_accepts_an_iana_zone(self) -> None:
        assert SettingsUpdate(timezone="Asia/Karachi").timezone == "Asia/Karachi"

    def test_accepts_utc(self) -> None:
        assert SettingsUpdate(timezone="UTC").timezone == "UTC"

    def test_omitting_it_is_fine(self) -> None:
        assert SettingsUpdate().timezone is None

    @pytest.mark.parametrize("value", ["Karachi", "PKT", "GMT+5", "Asia/Nowhere", ""])
    def test_rejects_anything_zoneinfo_cannot_resolve(self, value: str) -> None:
        with pytest.raises(ValidationError) as caught:
            SettingsUpdate(timezone=value)

        # The message has to name the fix; the host's only tool is another
        # blind edit of the same field.
        assert "timezone" in str(caught.value)
        assert "Asia/Karachi" in str(caught.value)

    def test_trims_surrounding_whitespace(self) -> None:
        assert SettingsUpdate(timezone="  Asia/Karachi  ").timezone == "Asia/Karachi"


class TestAlreadyPersistedBadValues:
    """Rows written before the validator existed must degrade, not crash."""

    def test_resolve_zone_falls_back_to_utc(self) -> None:
        assert str(resolve_zone("Karachi")) == "UTC"
        assert str(resolve_zone("Asia/Karachi")) == "Asia/Karachi"

    def test_quiet_hours_still_answers_with_a_broken_zone(self) -> None:
        from datetime import UTC, datetime

        quiet = QuietHours(timezone="Not/AZone")

        # 3am UTC is outside the 9-21 window whichever way you read it.
        assert quiet.allows(datetime(2026, 8, 4, 3, 0, tzinfo=UTC)) is False
        assert quiet.allows(datetime(2026, 8, 4, 12, 0, tzinfo=UTC)) is True
