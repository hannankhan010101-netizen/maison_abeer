"""Guest, booking and waitlist endpoints over HTTP."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, date, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.v1.guests import get_guest_service
from app.core.config import Settings
from app.domain.capacity import Capacity
from app.domain.waitlist import WaitlistEntry
from app.main import create_app
from app.services.guests import GuestService
from tests.fakes_guests import FakeGuestRepository

NOW = datetime(2026, 8, 4, 12, 0, tzinfo=UTC)


@pytest.fixture
def repo() -> FakeGuestRepository:
    return FakeGuestRepository()


@pytest.fixture
def client(repo: FakeGuestRepository, settings: Settings) -> Iterator[TestClient]:
    app = create_app(settings)
    app.dependency_overrides[get_guest_service] = lambda: GuestService(repo, now=NOW)

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


class TestGuestEndpoints:
    def test_creates_a_guest_with_only_a_name(self, client: TestClient) -> None:
        response = client.post("/api/v1/guests", json={"full_name": "Hira S."})

        assert response.status_code == 201
        body = response.json()
        assert body["full_name"] == "Hira S."
        # Badged so the host knows to reach them personally.
        assert body["is_contactable"] is False

    def test_duplicate_returns_conflict_not_a_silent_merge(
        self, client: TestClient, repo: FakeGuestRepository
    ) -> None:
        repo.add_guest(full_name="Sana R.", phone="0300 1234567")

        response = client.post(
            "/api/v1/guests", json={"full_name": "Sana", "phone": "(0300) 123-4567"}
        )

        assert response.status_code == 409
        assert response.json()["code"] == "duplicate_guest"
        assert "Sana R." in response.json()["message"]

    def test_merge_flag_returns_the_existing_guest(
        self, client: TestClient, repo: FakeGuestRepository
    ) -> None:
        existing = repo.add_guest(full_name="Sana R.", phone="03001234567")

        response = client.post(
            "/api/v1/guests",
            params={"merge_duplicates": True},
            json={"full_name": "Sana", "phone": "0300 123 4567"},
        )

        assert response.status_code == 201
        assert response.json()["id"] == str(existing.id)

    def test_rejects_an_invalid_email(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/guests", json={"full_name": "Sana", "email": "not-an-email"}
        )

        assert response.status_code == 422
        assert response.json()["code"] == "validation_failed"

    def test_rejects_an_empty_name(self, client: TestClient) -> None:
        assert client.post("/api/v1/guests", json={"full_name": ""}).status_code == 422

    def test_catches_email_channel_without_an_email(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/guests",
            json={
                "full_name": "Sana",
                "phone": "03001234567",
                "preferred_channel": "email",
            },
        )

        assert response.status_code == 422
        messages = [f["message"] for f in response.json()["details"]["fields"]]
        assert any("only gave a phone" in m for m in messages)

    def test_exposes_the_visit_badge(self, client: TestClient, repo: FakeGuestRepository) -> None:
        guest = repo.add_guest(visit_count=3)

        body = client.get(f"/api/v1/guests/{guest.id}").json()

        assert body["visit_badge"] == "3rd visit"
        assert body["is_regular"] is True

    def test_regulars_filter(self, client: TestClient, repo: FakeGuestRepository) -> None:
        repo.add_guest(full_name="Regular", visit_count=5, phone="03001111111")
        repo.add_guest(full_name="Newcomer", visit_count=1, phone="03002222222")

        body = client.get("/api/v1/guests", params={"regulars_only": True}).json()

        assert [g["full_name"] for g in body] == ["Regular"]

    def test_unknown_guest_returns_404(self, client: TestClient) -> None:
        assert client.get(f"/api/v1/guests/{uuid4()}").status_code == 404


class TestBirthdayRadar:
    def test_lists_upcoming_birthdays(self, client: TestClient, repo: FakeGuestRepository) -> None:
        repo.add_guest(full_name="Ayesha K.", phone="03001111111", birthday=date(1995, 8, 8))
        repo.add_guest(full_name="Zainab T.", phone="03002222222", birthday=date(1995, 12, 1))

        body = client.get("/api/v1/guests/birthdays").json()

        assert len(body) == 1
        assert body[0]["full_name"] == "Ayesha K."
        assert body[0]["days_away"] == 4

    def test_route_is_not_shadowed_by_the_id_route(self, client: TestClient) -> None:
        # /guests/birthdays must not be parsed as /guests/{guest_id}.
        assert client.get("/api/v1/guests/birthdays").status_code == 200


class TestBookingEndpoints:
    def test_books_a_guest(self, client: TestClient, repo: FakeGuestRepository) -> None:
        guest = repo.add_guest()
        session_id = uuid4()
        repo.capacities[session_id] = Capacity(seats=10, booked=4)

        response = client.post(
            f"/api/v1/sessions/{session_id}/bookings",
            json={"guest_id": str(guest.id), "booking_answers": {"flavour": "gulab jamun"}},
        )

        assert response.status_code == 201
        assert response.json()["booking_answers"] == {"flavour": "gulab jamun"}

    def test_full_class_points_at_the_waitlist(
        self, client: TestClient, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest()
        session_id = uuid4()
        repo.capacities[session_id] = Capacity(seats=10, booked=10)

        response = client.post(
            f"/api/v1/sessions/{session_id}/bookings", json={"guest_id": str(guest.id)}
        )

        assert response.status_code == 409
        assert "waitlist" in response.json()["message"]

    def test_assigns_a_table(self, client: TestClient, repo: FakeGuestRepository) -> None:
        guest = repo.add_guest()
        booking = repo.add_booking(uuid4(), guest.id)

        response = client.patch(
            f"/api/v1/bookings/{booking.id}/table",
            json={"table_number": 2, "sit_with_note": "sits with Sana"},
        )

        assert response.status_code == 200
        assert response.json()["table_number"] == 2

    def test_rejects_a_zero_table_number(
        self, client: TestClient, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest()
        booking = repo.add_booking(uuid4(), guest.id)

        response = client.patch(f"/api/v1/bookings/{booking.id}/table", json={"table_number": 0})

        assert response.status_code == 422

    def test_roster_counts_unassigned_guests(
        self, client: TestClient, repo: FakeGuestRepository
    ) -> None:
        session_id = uuid4()
        g1, g2 = repo.add_guest(phone="03001111111"), repo.add_guest(phone="03002222222")
        repo.add_booking(session_id, g1.id, table_number=2)
        repo.add_booking(session_id, g2.id)

        body = client.get(f"/api/v1/sessions/{session_id}/roster").json()

        assert len(body["bookings"]) == 2
        assert body["unassigned_count"] == 1

    def test_cancelling_with_credit(self, client: TestClient, repo: FakeGuestRepository) -> None:
        guest = repo.add_guest()
        session_id = uuid4()
        booking = repo.add_booking(session_id, guest.id)

        response = client.post(
            f"/api/v1/bookings/{booking.id}/cancel",
            json={"resolution": "credit", "note": "life happens"},
        )

        assert response.status_code == 200
        assert response.json()["status"] == "cancelled"
        assert repo.credits == [(guest.id, session_id, "life happens")]

    def test_rejects_an_unknown_resolution(
        self, client: TestClient, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest()
        booking = repo.add_booking(uuid4(), guest.id)

        response = client.post(
            f"/api/v1/bookings/{booking.id}/cancel", json={"resolution": "whatever"}
        )

        assert response.status_code == 422


class TestWaitlistEndpoint:
    def test_invites_the_next_guest(self, client: TestClient, repo: FakeGuestRepository) -> None:
        session_id = uuid4()
        repo.capacities[session_id] = Capacity(seats=10, booked=9)
        guest = repo.add_guest(full_name="Hira S.")
        repo.waitlists[session_id] = [
            WaitlistEntry(entry_id="w1", guest_id=str(guest.id), position=0)
        ]

        response = client.post(f"/api/v1/sessions/{session_id}/waitlist/invite")

        assert response.status_code == 200
        body = response.json()
        assert body["invited_guest_id"] == str(guest.id)
        assert "held until they reply" in body["message"]

        # The invite is a real, queued message — not just a status flip and a
        # claim in the response body.
        assert len(repo.scheduled_invites) == 1
        scheduled_session, scheduled_guest, _send_at = repo.scheduled_invites[0]
        assert scheduled_session == session_id
        assert scheduled_guest == guest.id

    def test_reports_when_nobody_is_waiting(
        self, client: TestClient, repo: FakeGuestRepository
    ) -> None:
        session_id = uuid4()
        repo.capacities[session_id] = Capacity(seats=10, booked=9)

        body = client.post(f"/api/v1/sessions/{session_id}/waitlist/invite").json()

        assert body["invited_guest_id"] is None
        assert body["message"] == "Nobody's waiting right now."


class TestAllergyWrites:
    """The one write path safety-critical data had none of.

    `POST /guests` documented and validated an `allergies` array and then
    dropped it, and no endpoint anywhere could add, correct or remove one. The
    only allergy that could exist was one a guest typed into the public
    booking form, force-stamped as `allergy` — so a host told about a severe
    nut allergy on the phone had nowhere to put it, and the red chip, the
    critical count and the day-of alert all stayed empty.
    """

    def test_create_records_the_allergies_it_was_given(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/guests",
            json={
                "full_name": "Ayesha K.",
                "phone": "03002222222",
                "allergies": [
                    {"label": "Nuts", "severity": "severe", "notes": "EpiPen in her bag"},
                    {"label": "Dairy", "severity": "intolerance"},
                ],
            },
        )

        assert response.status_code == 201
        allergies = response.json()["allergies"]

        assert {a["label"] for a in allergies} == {"Nuts", "Dairy"}
        nuts = next(a for a in allergies if a["label"] == "Nuts")
        assert nuts["severity"] == "severe"
        assert nuts["notes"] == "EpiPen in her bag"
        assert nuts["is_critical"] is True
        # An intolerance is real but does not get the red chip.
        assert next(a for a in allergies if a["label"] == "Dairy")["is_critical"] is False

    def test_adds_one_to_an_existing_guest(
        self, client: TestClient, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest(full_name="Ayesha K.")

        response = client.post(
            f"/api/v1/guests/{guest.id}/allergies",
            json={"label": "Nuts", "severity": "severe"},
        )

        assert response.status_code == 201
        assert response.json()["is_critical"] is True

        # And it is on the guest, not just in the response.
        fetched = client.get(f"/api/v1/guests/{guest.id}").json()
        assert [a["label"] for a in fetched["allergies"]] == ["Nuts"]

    def test_adding_the_same_label_twice_does_not_double_the_chip(
        self, client: TestClient, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest()

        client.post(f"/api/v1/guests/{guest.id}/allergies", json={"label": "Nuts"})
        response = client.post(f"/api/v1/guests/{guest.id}/allergies", json={"label": " nuts "})

        assert response.status_code == 201
        assert len(client.get(f"/api/v1/guests/{guest.id}").json()["allergies"]) == 1

    def test_a_wrong_severity_can_be_corrected(
        self, client: TestClient, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest()
        created = client.post(
            f"/api/v1/guests/{guest.id}/allergies",
            json={"label": "Dairy", "severity": "preference"},
        ).json()

        response = client.patch(
            f"/api/v1/guests/{guest.id}/allergies/{created['id']}",
            json={"severity": "severe", "notes": "Turned out to be serious"},
        )

        assert response.status_code == 200
        assert response.json()["severity"] == "severe"
        assert response.json()["is_critical"] is True
        assert response.json()["notes"] == "Turned out to be serious"

    def test_an_allergy_can_be_removed(self, client: TestClient, repo: FakeGuestRepository) -> None:
        guest = repo.add_guest()
        created = client.post(f"/api/v1/guests/{guest.id}/allergies", json={"label": "Nuts"}).json()

        assert (
            client.delete(f"/api/v1/guests/{guest.id}/allergies/{created['id']}").status_code == 204
        )
        assert client.get(f"/api/v1/guests/{guest.id}").json()["allergies"] == []

    def test_another_guests_allergy_is_not_reachable(
        self, client: TestClient, repo: FakeGuestRepository
    ) -> None:
        ayesha = repo.add_guest(full_name="Ayesha K.")
        sana = repo.add_guest(full_name="Sana R.")

        created = client.post(
            f"/api/v1/guests/{ayesha.id}/allergies", json={"label": "Nuts"}
        ).json()

        # Same allergy id, wrong guest in the path.
        response = client.patch(
            f"/api/v1/guests/{sana.id}/allergies/{created['id']}",
            json={"severity": "preference"},
        )

        assert response.status_code == 404

    def test_a_blank_label_is_rejected(self, client: TestClient, repo: FakeGuestRepository) -> None:
        guest = repo.add_guest()

        response = client.post(f"/api/v1/guests/{guest.id}/allergies", json={"label": "   "})

        assert response.status_code == 422

    def test_merging_a_duplicate_keeps_the_allergies_just_typed(
        self, client: TestClient, repo: FakeGuestRepository
    ) -> None:
        """ "Add to their history instead" promises exactly this."""
        existing = repo.add_guest(full_name="Ayesha K.", phone="03002222222")

        response = client.post(
            "/api/v1/guests?merge_duplicates=true",
            json={
                "full_name": "Ayesha",
                "phone": "03002222222",
                "allergies": [{"label": "Nuts", "severity": "severe"}],
            },
        )

        assert response.status_code == 201
        body = response.json()
        # Merged into the existing record, carrying the new allergy with it.
        assert body["id"] == str(existing.id)
        assert [a["label"] for a in body["allergies"]] == ["Nuts"]


class TestGuestEdits:
    """Nothing about a guest could be corrected after the moment of creation.

    The endpoint was served and never called, and the service filtered out
    every `None` on top of the route's `exclude_unset` — so even once a caller
    existed, clearing a wrong email or wiping a stale memory note would have
    returned 200 with the old value still stored.
    """

    def test_a_memory_note_can_be_added_later(
        self, client: TestClient, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest(memory_note=None)

        body = client.patch(
            f"/api/v1/guests/{guest.id}",
            json={"memory_note": "Came with her sister; loved the matcha buttercream"},
        ).json()

        assert body["memory_note"] == "Came with her sister; loved the matcha buttercream"

    def test_a_wrong_email_can_be_cleared(
        self, client: TestClient, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest(email="typo@example.com", preferred_channel="whatsapp")

        body = client.patch(f"/api/v1/guests/{guest.id}", json={"email": None}).json()

        assert body["email"] is None

    def test_an_untouched_field_is_not_cleared(
        self, client: TestClient, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest(memory_note="Loves the wheel", phone="03001234567")

        body = client.patch(f"/api/v1/guests/{guest.id}", json={"full_name": "Sana Riaz"}).json()

        assert body["full_name"] == "Sana Riaz"
        assert body["memory_note"] == "Loves the wheel"
        assert body["phone"] == "03001234567"

    def test_a_guest_can_be_opted_out(self, client: TestClient, repo: FakeGuestRepository) -> None:
        guest = repo.add_guest()

        body = client.patch(f"/api/v1/guests/{guest.id}", json={"opted_out": True}).json()

        assert body["opted_out"] is True
        # And they drop out of automated sends, which is the point.
        assert body["is_contactable"] is False

    def test_refuses_a_channel_with_nothing_to_send_to(
        self, client: TestClient, repo: FakeGuestRepository
    ) -> None:
        guest = repo.add_guest(phone="03001234567", email=None)

        response = client.patch(f"/api/v1/guests/{guest.id}", json={"preferred_channel": "email"})

        # Validated against the merged state: `GuestUpdate` cannot see it,
        # because either half of the pair may be absent from the patch.
        assert response.status_code == 422
        assert "only a phone number" in response.json()["message"]

    def test_refuses_pointing_a_guest_at_another_guests_number(
        self, client: TestClient, repo: FakeGuestRepository
    ) -> None:
        repo.add_guest(full_name="Ayesha K.", phone="03002222222")
        sana = repo.add_guest(full_name="Sana R.", phone="03001111111")

        response = client.patch(f"/api/v1/guests/{sana.id}", json={"phone": "03002222222"})

        # The same collision `create` refuses — and now that both entry points
        # store normalised numbers, the unique index would otherwise catch it
        # as a bare 500.
        assert response.status_code == 409
        assert "Ayesha K." in response.json()["message"]

    def test_re_saving_a_guests_own_number_is_not_a_duplicate(
        self, client: TestClient, repo: FakeGuestRepository
    ) -> None:
        sana = repo.add_guest(full_name="Sana R.", phone="03001111111")

        response = client.patch(
            f"/api/v1/guests/{sana.id}",
            json={"phone": "03001111111", "full_name": "Sana Riaz"},
        )

        assert response.status_code == 200
