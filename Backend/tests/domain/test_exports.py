"""Roster fingerprinting.

The banner these drive is a promise: "your printed tags are out of date".
Both failure directions are bad. A false positive trains the host to ignore
it; a false negative sends someone to a table that no longer exists.
"""

from __future__ import annotations

from app.domain.exports import TagSubject, roster_fingerprint


def subject(guest_id: str = "g1", **overrides: object) -> TagSubject:
    values: dict[str, object] = {
        "guest_id": guest_id,
        "full_name": "Sana R.",
        "table_number": 2,
        "subtext": None,
    }
    values.update(overrides)
    return TagSubject(**values)  # type: ignore[arg-type]


def test_the_same_roster_hashes_the_same() -> None:
    roster = [subject("g1"), subject("g2", full_name="Ayesha K.")]
    assert roster_fingerprint(roster) == roster_fingerprint(list(roster))


def test_row_order_does_not_change_the_hash() -> None:
    """Database ordering is not guaranteed; the banner must not depend on it."""
    a = subject("g1")
    b = subject("g2", full_name="Ayesha K.")

    assert roster_fingerprint([a, b]) == roster_fingerprint([b, a])


def test_an_empty_roster_is_stable() -> None:
    assert roster_fingerprint([]) == roster_fingerprint([])


# ---------------------------------------------------------------------------
# What must invalidate a print
# ---------------------------------------------------------------------------


def test_adding_a_guest_changes_the_hash() -> None:
    before = [subject("g1")]
    after = [subject("g1"), subject("g2", full_name="Meerab A.")]

    assert roster_fingerprint(before) != roster_fingerprint(after)


def test_removing_a_guest_changes_the_hash() -> None:
    assert roster_fingerprint([subject("g1"), subject("g2")]) != roster_fingerprint([subject("g1")])


def test_renaming_a_guest_changes_the_hash() -> None:
    assert roster_fingerprint([subject(full_name="Sana R.")]) != roster_fingerprint(
        [subject(full_name="Sana Riaz")]
    )


def test_moving_a_table_changes_the_hash() -> None:
    """The table number is printed on the tag, so it invalidates the print."""
    assert roster_fingerprint([subject(table_number=2)]) != roster_fingerprint(
        [subject(table_number=3)]
    )


def test_unassigning_a_table_changes_the_hash() -> None:
    assert roster_fingerprint([subject(table_number=2)]) != roster_fingerprint(
        [subject(table_number=None)]
    )


def test_changing_the_printed_subtext_changes_the_hash() -> None:
    assert roster_fingerprint([subject(subtext=None)]) != roster_fingerprint(
        [subject(subtext="Team gulab jamun 🍮")]
    )


# ---------------------------------------------------------------------------
# What must not
# ---------------------------------------------------------------------------


def test_two_guests_swapping_ids_is_not_the_same_roster() -> None:
    """Guarding against a fingerprint that only looks at the visible fields."""
    a = [subject("g1", full_name="Sana R."), subject("g2", full_name="Ayesha K.")]
    b = [subject("g2", full_name="Sana R."), subject("g1", full_name="Ayesha K.")]

    assert roster_fingerprint(a) != roster_fingerprint(b)


def test_the_hash_is_hex_and_fixed_length() -> None:
    """Stored in a String(64) column; a longer digest would silently truncate."""
    digest = roster_fingerprint([subject()])

    assert len(digest) == 64
    assert all(char in "0123456789abcdef" for char in digest)


def test_unicode_survives_the_round_trip() -> None:
    """Emoji in a booking answer must not raise or collapse to the same hash."""
    assert roster_fingerprint([subject(subtext="🍮")]) != roster_fingerprint(
        [subject(subtext="🎂")]
    )
