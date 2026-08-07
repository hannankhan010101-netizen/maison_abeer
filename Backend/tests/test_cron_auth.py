"""The scheduled-task endpoint's authorisation.

This route sends messages to real guests and is reachable from the internet
without a user session. The only thing standing in front of it is a shared
secret, so every way of getting past it is worth a test.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings

PATH = "/api/v1/cron/drain-messages"
SECRET = "test-secret-value"  # noqa: S105 - a fixture, not a credential


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("CRON_SECRET", SECRET)
    get_settings.cache_clear()

    from app.main import create_app

    # The drain itself needs a database; these tests only reach it on the one
    # authorised call, which is asserted separately in the live suite.
    yield TestClient(create_app(), raise_server_exceptions=False)

    get_settings.cache_clear()


@pytest.fixture
def unconfigured(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("CRON_SECRET", "")
    get_settings.cache_clear()

    from app.main import create_app

    yield TestClient(create_app(), raise_server_exceptions=False)

    get_settings.cache_clear()


def test_a_request_with_no_credentials_is_refused(client: TestClient) -> None:
    assert client.get(PATH).status_code == 401


def test_a_wrong_secret_is_refused(client: TestClient) -> None:
    assert client.get(PATH, headers={"Authorization": "Bearer nope"}).status_code == 401


def test_the_secret_must_be_sent_as_a_bearer_token(client: TestClient) -> None:
    """A bare value in the header is not the scheme Vercel sends."""
    assert client.get(PATH, headers={"Authorization": SECRET}).status_code == 401


def test_a_wrong_secret_is_indistinguishable_from_a_missing_one(client: TestClient) -> None:
    """Different codes would tell a prober whether their guess had the shape."""
    missing = client.get(PATH)
    wrong = client.get(PATH, headers={"Authorization": "Bearer nope"})

    assert missing.status_code == wrong.status_code
    assert missing.json()["code"] == wrong.json()["code"]


def test_an_unconfigured_secret_closes_the_endpoint(unconfigured: TestClient) -> None:
    """It must fail closed. An open endpoint that sends messages is worse
    than a scheduled task that does not run."""
    response = unconfigured.get(PATH, headers={"Authorization": "Bearer anything"})
    assert response.status_code == 403
