"""Contact details are canonicalised at the public boundary.

The public booking form is the one place a stranger writes to the database,
and it used to match returning guests on the raw string they typed. A regular
whose record says "03001111111" typing "0300 1111111" therefore became a
second Guest row: visit count back to zero, the memory note and the recorded
allergies attached to the other row, and no allergy chip on the roster for
someone with a severe allergy. The host path has always normalised; these pin
the two together.

No database: the guarantee lives in the schema, which is the point of putting
it there rather than in the endpoint.
"""

from __future__ import annotations

import pytest

from app.domain.waitlist import queue_number
from app.schemas.public import PublicBookingRequest


def booking(**overrides: object) -> PublicBookingRequest:
    payload: dict[str, object] = {"full_name": "Sana R."}
    payload.update(overrides)
    return PublicBookingRequest(**payload)


class TestPhoneNormalisation:
    @pytest.mark.parametrize(
        "typed",
        ["03001111111", "0300 1111111", "(0300) 111-1111", "0300-111-1111", " 03001111111 "],
    )
    def test_every_spelling_lands_on_one_value(self, typed: str) -> None:
        assert booking(phone=typed).phone == "03001111111"

    def test_a_country_code_is_left_alone(self) -> None:
        """Deliberate: guessing a country code merges two real people.

        An international spelling stays its own record, for the host's merge
        prompt to resolve rather than for us to guess at.
        """
        assert booking(phone="+92 300 1111111").phone == "+923001111111"

    def test_blank_is_still_not_provided(self) -> None:
        assert booking(phone="   ").phone is None
        assert booking().phone is None


class TestEmailNormalisation:
    def test_casing_does_not_make_a_second_guest(self) -> None:
        assert booking(email="Sana@Gmail.com").email == "sana@gmail.com"

    def test_surrounding_space_is_trimmed(self) -> None:
        assert booking(email="  sana@gmail.com ").email == "sana@gmail.com"

    def test_blank_is_still_not_provided(self) -> None:
        assert booking(email="").email is None


class TestFreeTextIsUntouched:
    def test_an_allergy_note_is_not_normalised(self) -> None:
        # Only the match keys are canonicalised; the words the guest chose are
        # theirs, and this one is safety-critical.
        assert booking(allergies="Nuts — EpiPen in her bag").allergies == (
            "Nuts — EpiPen in her bag"
        )

    def test_blank_free_text_is_still_none(self) -> None:
        assert booking(note="  ").note is None


class TestQueueNumber:
    def test_the_front_of_the_queue_is_number_one(self) -> None:
        # Storage is 0-based, because `normalise_positions` renumbers with
        # `enumerate`. Handing the raw value to a guest told the person at the
        # front they were "number 0 in the queue".
        assert queue_number(0) == 1

    def test_counts_up_from_there(self) -> None:
        assert [queue_number(p) for p in (1, 2, 5)] == [2, 3, 6]
