"""Session endpoints over HTTP.

Exercises the real router, real schemas and real service against an in-memory
repository, so routing, validation, error mapping and serialisation are all
covered without Postgres.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.v1.sessions import get_session_service
from app.core.config import Settings
from app.domain.quantities import QuantityLinkedItem
from app.domain.scheduling import ChecklistDeadline, TMinusOffset
from app.main import create_app
from app.services.sessions import SessionService
from tests.fakes import FakeSessionRepository

NOW = datetime(2026, 8, 4, 9, 0, tzinfo=UTC)
SATURDAY = datetime(2026, 8, 8, 14, 0, tzinfo=UTC)


@pytest.fixture
def repo() -> FakeSessionRepository:
    return FakeSessionRepository()


@pytest.fixture
def client(repo: FakeSessionRepository, settings: Settings) -> Iterator[TestClient]:
    app = create_app(settings)
    app.dependency_overrides[get_session_service] = lambda: SessionService(repo, now=NOW)

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


class TestHealthAndHeaders:
    def test_health_is_open(self, client: TestClient) -> None:
        assert client.get("/health").status_code == 200

    def test_security_headers_are_present(self, client: TestClient) -> None:
        headers = client.get("/health").headers

        assert headers["X-Content-Type-Options"] == "nosniff"
        assert headers["X-Frame-Options"] == "DENY"
        assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]
        # Guest contact and allergy data must never sit in a shared cache.
        assert headers["Cache-Control"] == "no-store"


class TestReadEndpoints:
    def test_returns_a_session_with_derived_capacity(
        self, client: TestClient, repo: FakeSessionRepository
    ) -> None:
        session = repo.seed(seats=10, booked=8)

        response = client.get(f"/api/v1/sessions/{session.id}")

        assert response.status_code == 200
        body = response.json()
        assert body["capacity"] == {
            "seats": 10,
            "booked": 8,
            "available": 2,
            "state": "nearly_full",
            "waitlist_is_open": False,
            "accepts_bookings": True,
        }

    def test_sold_out_session_opens_the_waitlist(
        self, client: TestClient, repo: FakeSessionRepository
    ) -> None:
        session = repo.seed(seats=10, booked=10)

        capacity = client.get(f"/api/v1/sessions/{session.id}").json()["capacity"]

        assert capacity["state"] == "sold_out"
        assert capacity["waitlist_is_open"] is True
        assert capacity["accepts_bookings"] is False

    def test_missing_session_returns_404(self, client: TestClient) -> None:
        response = client.get(f"/api/v1/sessions/{uuid4()}")

        assert response.status_code == 404
        assert response.json()["code"] == "not_found"

    def test_lists_sessions_in_a_window(
        self, client: TestClient, repo: FakeSessionRepository
    ) -> None:
        repo.seed(starts_at=SATURDAY)
        repo.seed(starts_at=SATURDAY + timedelta(days=60))

        response = client.get(
            "/api/v1/sessions",
            params={
                "start": (SATURDAY - timedelta(days=1)).isoformat(),
                "end": (SATURDAY + timedelta(days=1)).isoformat(),
            },
        )

        assert response.status_code == 200
        assert len(response.json()) == 1


class TestCreateEndpoint:
    def _payload(self, repo: FakeSessionRepository, **overrides: object) -> dict[str, object]:
        class_type_id = uuid4()
        repo.class_type_ids.add(class_type_id)

        payload: dict[str, object] = {
            "class_type_id": str(class_type_id),
            "starts_at": SATURDAY.isoformat(),
            "ends_at": (SATURDAY + timedelta(hours=2, minutes=30)).isoformat(),
            "seats": 10,
        }
        payload.update(overrides)
        return payload

    def test_creates_a_session(self, client: TestClient, repo: FakeSessionRepository) -> None:
        response = client.post("/api/v1/sessions", json=self._payload(repo))

        assert response.status_code == 201
        body = response.json()
        assert len(body["sessions"]) == 1
        assert body["energy"]["warning"] == "none"

    def test_creates_a_weekly_series(self, client: TestClient, repo: FakeSessionRepository) -> None:
        payload = self._payload(
            repo, repeat_weekly_until=(SATURDAY + timedelta(weeks=2)).isoformat()
        )

        body = client.post("/api/v1/sessions", json=payload).json()

        assert len(body["sessions"]) == 3

    def test_rejects_an_end_before_the_start(
        self, client: TestClient, repo: FakeSessionRepository
    ) -> None:
        payload = self._payload(repo, ends_at=(SATURDAY - timedelta(hours=1)).isoformat())

        response = client.post("/api/v1/sessions", json=payload)

        assert response.status_code == 422
        assert response.json()["code"] == "validation_failed"
        messages = [f["message"] for f in response.json()["details"]["fields"]]
        assert any("end after it starts" in m for m in messages)

    def test_rejects_a_naive_timestamp(
        self, client: TestClient, repo: FakeSessionRepository
    ) -> None:
        # Without an offset we cannot know which 2pm the host meant.
        payload = self._payload(repo, starts_at="2026-08-08T14:00:00")

        response = client.post("/api/v1/sessions", json=payload)

        assert response.status_code == 422
        messages = [f["message"] for f in response.json()["details"]["fields"]]
        assert any("timezone offset" in m for m in messages)

    def test_rejects_negative_seats(self, client: TestClient, repo: FakeSessionRepository) -> None:
        response = client.post("/api/v1/sessions", json=self._payload(repo, seats=-5))
        assert response.status_code == 422

    def test_rejects_a_past_slot(self, client: TestClient, repo: FakeSessionRepository) -> None:
        payload = self._payload(
            repo,
            starts_at=(NOW - timedelta(days=2)).isoformat(),
            ends_at=(NOW - timedelta(days=2, hours=-2)).isoformat(),
        )

        response = client.post("/api/v1/sessions", json=payload)

        assert response.status_code == 422
        assert response.json()["code"] == "past_slot"

    def test_validation_errors_do_not_echo_input(
        self, client: TestClient, repo: FakeSessionRepository
    ) -> None:
        payload = self._payload(repo, seats=-5)

        body = client.post("/api/v1/sessions", json=payload).json()

        # Pydantic's default payload includes the raw input and a `url` to its
        # docs; neither belongs in an API response.
        assert "input" not in str(body)
        assert "url" not in body


class TestSeatEndpoint:
    def test_increases_seats(self, client: TestClient, repo: FakeSessionRepository) -> None:
        session = repo.seed(seats=10, booked=8)

        response = client.patch(f"/api/v1/sessions/{session.id}/seats", json={"seats": 12})

        assert response.status_code == 200
        assert response.json()["capacity"]["seats"] == 12

    def test_refuses_to_drop_below_bookings_with_an_explanation(
        self, client: TestClient, repo: FakeSessionRepository
    ) -> None:
        session = repo.seed(seats=10, booked=8)

        response = client.patch(f"/api/v1/sessions/{session.id}/seats", json={"seats": 6})

        assert response.status_code == 409
        body = response.json()
        assert body["code"] == "seats_below_bookings"
        # The refusal explains itself rather than just failing.
        assert "8 guests booked" in body["message"]
        assert "Cancel a booking first" in body["message"]

    def test_rescales_prep_quantities(
        self, client: TestClient, repo: FakeSessionRepository
    ) -> None:
        session = repo.seed(seats=10, booked=8)
        repo.quantities[session.id] = [
            QuantityLinkedItem(
                item_id="i1",
                label="bake cake bases",
                template="Bake {seats + 2} cake bases",
                last_quantity=12,
                completed=True,
            )
        ]

        client.patch(f"/api/v1/sessions/{session.id}/seats", json={"seats": 12})

        assert len(repo.applied_quantity_changes) == 1
        _, changes, seats = repo.applied_quantity_changes[0]
        assert seats == 12
        assert changes[0].new_quantity == 14


class TestRescheduleEndpoint:
    @pytest.fixture
    def seeded(self, repo: FakeSessionRepository) -> object:
        session = repo.seed(starts_at=SATURDAY, ends_at=SATURDAY + timedelta(hours=2))
        repo.deadlines[session.id] = [
            ChecklistDeadline(
                "i1", "bake cake bases", TMinusOffset(24), TMinusOffset(24).resolve(SATURDAY)
            )
        ]
        repo.guests[session.id] = (8, 8)
        return session

    def test_previews_without_saving(
        self, client: TestClient, repo: FakeSessionRepository, seeded: object
    ) -> None:
        new_start = (SATURDAY + timedelta(days=1)).isoformat()

        response = client.post(
            f"/api/v1/sessions/{seeded.id}/reschedule",  # type: ignore[attr-defined]
            json={"starts_at": new_start, "confirm": False},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["preview"] is True
        assert body["impact"]["affected_guest_count"] == 8
        assert len(body["impact"]["deadline_shifts"]) == 1
        # Nothing moved.
        assert repo.sessions[seeded.id].starts_at == SATURDAY  # type: ignore[attr-defined]

    def test_confirm_moves_the_class(
        self, client: TestClient, repo: FakeSessionRepository, seeded: object
    ) -> None:
        new_start = SATURDAY + timedelta(days=1)

        response = client.post(
            f"/api/v1/sessions/{seeded.id}/reschedule",  # type: ignore[attr-defined]
            json={"starts_at": new_start.isoformat(), "confirm": True},
        )

        assert response.status_code == 200
        assert response.json()["preview"] is False
        assert repo.sessions[seeded.id].starts_at == new_start  # type: ignore[attr-defined]
        assert repo.reanchored  # deadlines followed the class

    def test_rejects_a_past_slot(
        self, client: TestClient, repo: FakeSessionRepository, seeded: object
    ) -> None:
        response = client.post(
            f"/api/v1/sessions/{seeded.id}/reschedule",  # type: ignore[attr-defined]
            json={"starts_at": (NOW - timedelta(days=1)).isoformat(), "confirm": True},
        )

        assert response.status_code == 422
        assert response.json()["code"] == "past_slot"


class TestLockEndpoint:
    def test_locking_stops_new_bookings(
        self, client: TestClient, repo: FakeSessionRepository
    ) -> None:
        session = repo.seed(seats=10, booked=4)

        response = client.patch(f"/api/v1/sessions/{session.id}/lock", params={"locked": True})

        assert response.status_code == 200
        capacity = response.json()["capacity"]
        # Seats remain free, but the session is closed (PRD §2.2).
        assert capacity["available"] == 6
        assert capacity["accepts_bookings"] is False
