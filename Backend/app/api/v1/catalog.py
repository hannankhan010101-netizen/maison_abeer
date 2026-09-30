"""The studio's class types.

Its own endpoint rather than a field on the session list. The calendar reads
one week at a time, so anything derived from that response is missing every
class type the host is not currently looking at — and on an empty week it is
missing all of them, which left the quick-add form with an empty dropdown and
no way to schedule the studio's first class.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.v1.sessions import get_session_service
from app.schemas.catalog import ClassTypeRead
from app.services.sessions import SessionService

router = APIRouter(prefix="/class-types", tags=["catalog"])

# The same dependency key the sessions router declares, so the real provider
# wired in `create_app` — and the in-memory double tests swap in — cover this
# route too, without a second provider to keep in step.
Service = Annotated[SessionService, Depends(get_session_service)]


@router.get("", response_model=list[ClassTypeRead])
def list_class_types(service: Service) -> list[ClassTypeRead]:
    """Every class type the studio still runs, alphabetically."""
    return [
        ClassTypeRead(
            id=option.id,
            name=option.name,
            color_token=option.color_token,
            default_seats=option.default_seats,
            default_duration_minutes=option.default_duration_minutes,
        )
        for option in service.list_class_types()
    ]
