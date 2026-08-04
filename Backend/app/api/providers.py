"""Real dependency providers.

The routers declare placeholder providers so they never construct their own
dependencies; these replace them at app-wiring time. Tests swap in in-memory
doubles the same way, which is why the routers stay ignorant of both.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends

from app.api.deps import Db
from app.repositories.checklist import SqlChecklistRepository
from app.repositories.guests import SqlGuestRepository
from app.repositories.sessions import SqlSessionRepository
from app.services.checklist import ChecklistService
from app.services.guests import GuestService
from app.services.sessions import SessionService


def request_now() -> datetime:
    """One reference time per request.

    Every service takes `now` rather than reading the clock itself, so a
    request that spans midnight cannot produce two different answers for
    "today" — and tests can pin it without patching global state.
    """
    return datetime.now(UTC)


Now = Annotated[datetime, Depends(request_now)]


def provide_session_service(db: Db, now: Now) -> SessionService:
    return SessionService(SqlSessionRepository(db), now=now)


def provide_guest_service(db: Db, now: Now) -> GuestService:
    return GuestService(SqlGuestRepository(db), now=now)


def provide_checklist_service(db: Db, now: Now) -> ChecklistService:
    return ChecklistService(SqlChecklistRepository(db), now=now)
