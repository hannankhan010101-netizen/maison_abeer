"""Guest identity, contactability and birthday recognition."""

from __future__ import annotations

from datetime import date

import pytest

from app.domain.guests import (
    GuestIdentity,
    MessageChannel,
    days_until_birthday,
    find_duplicate,
    in_birthday_lookahead,
    is_contactable,
    is_regular,
    next_birthday,
    normalise_email,
    normalise_phone,
    upcoming_birthdays,
    visit_badge,
)


class TestNormalisation:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("0300 1234567", "03001234567"),
            ("(0300) 123-4567", "03001234567"),
            ("+92 300 1234567", "+923001234567"),
            ("  0300-123-4567  ", "03001234567"),
            ("", None),
            ("   ", None),
            (None, None),
        ],
    )
    def test_phone_normalisation(self, raw: str | None, expected: str | None) -> None:
        assert normalise_phone(raw) == expected

    def test_does_not_infer_a_country_code(self) -> None:
        # Guessing would merge two real people in different countries.
        assert normalise_phone("03001234567") != normalise_phone("+923001234567")

    @pytest.mark.parametrize(
        ("raw", "expected"),
        [("Sana@Example.com", "sana@example.com"), ("  a@b.co ", "a@b.co"), ("", None)],
    )
    def test_email_normalisation(self, raw: str, expected: str | None) -> None:
        assert normalise_email(raw) == expected


class TestDuplicateDetection:
    def test_matches_on_a_differently_formatted_phone(self) -> None:
        existing = [GuestIdentity("g1", "Sana R.", phone="0300 1234567")]
        candidate = GuestIdentity("new", "Sana", phone="(0300) 123-4567")

        found = find_duplicate(candidate, existing)

        assert found is not None
        assert found.guest_id == "g1"

    def test_matches_on_email_case_insensitively(self) -> None:
        existing = [GuestIdentity("g1", "Sana R.", email="sana@example.com")]
        candidate = GuestIdentity("new", "Sana", email="Sana@Example.com")

        assert find_duplicate(candidate, existing) is not None

    def test_does_not_match_on_name_alone(self) -> None:
        """Two guests called Sana is ordinary.

        Merging them would blend their allergy records — a safety problem,
        not just a data one.
        """
        existing = [GuestIdentity("g1", "Sana", phone="03001111111")]
        candidate = GuestIdentity("new", "Sana", phone="03002222222")

        assert find_duplicate(candidate, existing) is None

    def test_contactless_guests_never_match(self) -> None:
        existing = [GuestIdentity("g1", "Sana")]
        candidate = GuestIdentity("new", "Sana")

        assert find_duplicate(candidate, existing) is None

    def test_ignores_the_guest_itself(self) -> None:
        guest = GuestIdentity("g1", "Sana", phone="03001234567")

        assert find_duplicate(guest, [guest]) is None


class TestContactability:
    def test_phone_channels_need_a_phone(self) -> None:
        assert is_contactable(
            channel=MessageChannel.WHATSAPP, phone="03001234567", email=None, opted_out=False
        )
        assert not is_contactable(
            channel=MessageChannel.SMS, phone=None, email="a@b.co", opted_out=False
        )

    def test_email_channel_needs_an_email(self) -> None:
        assert is_contactable(
            channel=MessageChannel.EMAIL, phone=None, email="a@b.co", opted_out=False
        )
        assert not is_contactable(
            channel=MessageChannel.EMAIL, phone="03001234567", email=None, opted_out=False
        )

    def test_opting_out_overrides_everything(self) -> None:
        assert not is_contactable(
            channel=MessageChannel.WHATSAPP,
            phone="03001234567",
            email="a@b.co",
            opted_out=True,
        )


class TestRecognition:
    @pytest.mark.parametrize(
        ("count", "badge"),
        [
            (0, None),
            (1, None),
            (2, "2nd visit"),
            (3, "3rd visit"),
            (4, "4th visit"),
            (11, "11th visit"),
            (21, "21st visit"),
        ],
    )
    def test_visit_badge_copy(self, count: int, badge: str | None) -> None:
        assert visit_badge(count) == badge

    def test_regulars_start_at_the_third_visit(self) -> None:
        assert not is_regular(2)
        assert is_regular(3)


class TestBirthdays:
    def test_finds_the_next_occurrence_this_year(self) -> None:
        assert next_birthday(date(1995, 8, 8), date(2026, 8, 4)) == date(2026, 8, 8)

    def test_rolls_over_to_next_year_once_passed(self) -> None:
        assert next_birthday(date(1995, 8, 1), date(2026, 8, 4)) == date(2027, 8, 1)

    def test_today_counts_as_the_birthday(self) -> None:
        assert days_until_birthday(date(1995, 8, 4), date(2026, 8, 4)) == 0

    def test_leap_day_falls_back_to_the_first_of_march(self) -> None:
        # 2027 is not a leap year; the host should still be prompted.
        assert next_birthday(date(1996, 2, 29), date(2027, 1, 1)) == date(2027, 3, 1)

    def test_leap_day_is_exact_in_a_leap_year(self) -> None:
        assert next_birthday(date(1996, 2, 29), date(2028, 1, 1)) == date(2028, 2, 29)

    def test_thirty_day_lookahead(self) -> None:
        today = date(2026, 8, 4)

        assert in_birthday_lookahead(date(1995, 8, 8), today)
        assert in_birthday_lookahead(date(1995, 9, 3), today)
        assert not in_birthday_lookahead(date(1995, 9, 10), today)
        assert not in_birthday_lookahead(None, today)

    def test_radar_sorts_soonest_first(self) -> None:
        today = date(2026, 8, 4)
        guests = [
            ("far", date(1995, 8, 30)),
            ("soon", date(1995, 8, 6)),
            ("outside", date(1995, 12, 1)),
            ("unknown", None),
        ]

        assert upcoming_birthdays(guests, today) == [("soon", 2), ("far", 26)]
