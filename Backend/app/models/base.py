"""Declarative base, mixins and naming conventions.

The `TenantMixin` is the structural half of tenant isolation: every business
table inherits `studio_id` with a FK and an index, so a table cannot be added
without one. The behavioural half — filtering by it on every query — lives in
`app/core/db.py`.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, MetaData, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Predictable constraint names, so migrations can reference them by name
# rather than by whatever the database happened to generate.
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def uuid_pk() -> Mapped[uuid.UUID]:
    """Primary key column. UUIDs keep IDs non-enumerable in URLs."""
    return mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )


class TimestampMixin:
    """Server-side timestamps — never trust a client clock for audit data."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class ArchiveMixin:
    """Soft delete.

    The PRD requires history to survive deletion in several places — deleting
    a session archives its checklist so the host's streak record stays intact
    (§2.5), and a guest's anonymised attendance count outlives their personal
    data (§2.4).
    """

    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )

    @property
    def is_archived(self) -> bool:
        return self.archived_at is not None


class TenantMixin:
    """Every business table is reachable from exactly one studio."""

    @property
    def _tenant_column_name(self) -> str:  # pragma: no cover - documentation aid
        return "studio_id"

    studio_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("studio.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
