"""Scheduled work, triggered over HTTP.

A serverless deployment has nowhere to run `python -m app.cli.worker` on a
timer, so the drain is exposed as an endpoint and Vercel Cron calls it. The
worker itself is unchanged — this is a trigger, not a second implementation.

Authenticated by a shared secret rather than a JWT, because the caller is a
scheduler with no user behind it. Vercel signs cron requests with the
project's `CRON_SECRET` as a bearer token; anything else is rejected.
"""

from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import APIRouter, Header

from app.cli.worker import drain
from app.core.config import get_settings
from app.core.errors import NotAuthenticatedError, NotAuthorizedError

router = APIRouter(prefix="/cron", tags=["cron"])


def _authorise(authorization: str | None) -> None:
    """Constant-time compare against the configured secret.

    Refuses outright when no secret is set, rather than defaulting to open:
    an unauthenticated endpoint that writes rows and sends messages is not
    something to fall back to.
    """
    settings = get_settings()

    if not settings.cron_secret:
        raise NotAuthorizedError("Scheduled tasks are not configured.")

    if not authorization or not authorization.lower().startswith("bearer "):
        raise NotAuthenticatedError("Missing scheduler credentials.")

    supplied = authorization.split(" ", 1)[1].strip()

    # compare_digest, not ==: a plain comparison leaks the secret's prefix
    # through timing to anyone able to call this repeatedly.
    if not hmac.compare_digest(supplied, settings.cron_secret):
        raise NotAuthenticatedError("Missing scheduler credentials.")


# GET, because Vercel Cron issues a GET. Not idempotent in the strict HTTP
# sense — it sends messages — but the scheduler decides the method, and the
# secret plus the worker's claim-then-send is what makes it safe to repeat.
@router.get("/drain-messages")
def drain_messages(
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, int]:
    """Send whatever is due. Safe to call more often than needed.

    Claim-then-send inside the worker means two overlapping invocations
    cannot double-send: the second finds the rows already claimed and skips
    them.
    """
    _authorise(authorization)
    return drain()
