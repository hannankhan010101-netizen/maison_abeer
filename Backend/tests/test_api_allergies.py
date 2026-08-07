"""Allergies must survive the trip from repository to JSON.

This is regression cover for a bug that every other suite missed. The router
hardcoded `allergies=[]` and `critical_allergy_count=0`, so a guest with a
severe nut allergy serialised as having none. The frontend tests passed
because they mock a response that already contains the chip; the backend
tests passed because the fake repository never populated the field.

The lesson these tests encode: assert on what the *endpoint* returns, not on
what the layer beneath it holds.
"""

from __future__ import annotations

from uuid import uuid4

from app.models.enums import AllergySeverity
from app.services.guests import AllergySnapshot, GuestSnapshot


def _guest(**overrides: object) -> GuestSnapshot:
    defaults: dict[str, object] = {
        "id": uuid4(),
        "full_name": "Ayesha K.",
        "phone": "03002222222",
        "email": None,
        "preferred_channel": "whatsapp",
        "opted_out": False,
        "visit_count": 2,
        "birthday": None,
        "memory_note": None,
    }
    defaults.update(overrides)
    return GuestSnapshot(**defaults)  # type: ignore[arg-type]


def _allergy(severity: AllergySeverity, label: str = "Nut allergy") -> AllergySnapshot:
    return AllergySnapshot(id=uuid4(), label=label, severity=severity, notes=None)


# ---------------------------------------------------------------------------
# What counts as critical
# ---------------------------------------------------------------------------


def test_severe_and_allergy_are_critical() -> None:
    assert _allergy(AllergySeverity.SEVERE).is_critical
    assert _allergy(AllergySeverity.ALLERGY).is_critical


def test_preferences_and_intolerances_are_not() -> None:
    """A dislike is not a medical risk; badging it as one dilutes the signal."""
    assert not _allergy(AllergySeverity.PREFERENCE).is_critical
    assert not _allergy(AllergySeverity.INTOLERANCE).is_critical


def test_a_guest_knows_whether_any_allergy_is_critical() -> None:
    guest = _guest(
        allergies=(
            _allergy(AllergySeverity.PREFERENCE, "No coriander"),
            _allergy(AllergySeverity.SEVERE),
        )
    )
    assert guest.has_critical_allergy


def test_a_guest_with_only_preferences_is_not_flagged() -> None:
    guest = _guest(allergies=(_allergy(AllergySeverity.PREFERENCE, "No coriander"),))
    assert not guest.has_critical_allergy


def test_a_guest_with_no_allergies_is_not_flagged() -> None:
    assert not _guest().has_critical_allergy


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------


def test_the_router_serialises_allergies() -> None:
    """The exact bug: this returned [] regardless of what the guest carried."""
    from datetime import date

    from app.api.v1.guests import _to_read

    guest = _guest(allergies=(_allergy(AllergySeverity.SEVERE),))
    payload = _to_read(guest, today=date(2026, 8, 6))

    assert len(payload.allergies) == 1
    assert payload.allergies[0].label == "Nut allergy"
    assert payload.allergies[0].is_critical is True


def test_severity_serialises_as_the_wire_value() -> None:
    """`SEVERE` in the JSON would not match the frontend's union type."""
    from datetime import date

    from app.api.v1.guests import _to_read

    payload = _to_read(
        _guest(allergies=(_allergy(AllergySeverity.SEVERE),)),
        today=date(2026, 8, 6),
    )

    assert payload.allergies[0].severity.value == "severe"
