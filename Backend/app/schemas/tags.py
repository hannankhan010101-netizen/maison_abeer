"""Name Tag Studio request and response shapes (PRD §2.3)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TagSubjectRead(BaseModel):
    """One guest as they appear on a tag."""

    guest_id: UUID
    full_name: str
    table_number: int | None = None
    subtext: str | None = None


class TagSheet(BaseModel):
    session_id: UUID
    subjects: list[TagSubjectRead] = Field(default_factory=list)

    roster_hash: str
    """Fingerprint of what would print right now."""

    last_exported_at: datetime | None = None
    last_export_theme: str | None = None

    roster_changed_since_export: bool = False
    """Drives the "roster updated since your last export" banner."""


class ExportCreate(BaseModel):
    theme: Annotated[str, Field(min_length=1, max_length=60)]
    layout: Annotated[str, Field(min_length=1, max_length=40)]
    file_url: Annotated[str | None, Field(default=None, max_length=500)] = None


class ExportRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    session_id: UUID
    theme: str
    layout: str
    roster_hash: str
    file_url: str | None
    created_at: datetime
