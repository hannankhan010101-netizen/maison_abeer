"""Class type shapes (PRD §2.2)."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel


class ClassTypeRead(BaseModel):
    """One entry in the studio's catalogue.

    The defaults travel with the name so quick-add can prefill seats and
    duration the moment a class type is picked, instead of making the host
    correct two fields every time.
    """

    id: UUID
    name: str
    color_token: str
    default_seats: int
    default_duration_minutes: int
