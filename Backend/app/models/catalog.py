"""Class types and their reusable checklist templates."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import ArchiveMixin, Base, TenantMixin, TimestampMixin, uuid_pk
from app.models.enums import ChecklistPhase, CraftKind

if TYPE_CHECKING:
    from app.models.studio import Studio


class ClassType(Base, TenantMixin, TimestampMixin, ArchiveMixin):
    """A kind of workshop the studio runs.

    Carries the signature colour used across the calendar, chips and tags, so
    the palette stays cohesive even for host-created types (PRD §2.2).
    """

    __tablename__ = "class_type"
    __table_args__ = (
        UniqueConstraint("studio_id", "name", name="uq_class_type_studio_id_name"),
        CheckConstraint("default_seats >= 0", name="default_seats_non_negative"),
        CheckConstraint("default_duration_minutes > 0", name="duration_positive"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    craft: Mapped[CraftKind] = mapped_column(default=CraftKind.CUSTOM, nullable=False)

    # Stored as a token name (e.g. "pink", "terra", "sage") rather than a raw
    # hex, so a palette change in tokens.css reaches existing data.
    color_token: Mapped[str] = mapped_column(String(24), default="pink", nullable=False)

    default_seats: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    default_duration_minutes: Mapped[int] = mapped_column(Integer, default=150, nullable=False)

    photo_url: Mapped[str | None] = mapped_column(String(500))
    """A real photo of this craft for the public booking page. Same
    paste-a-link pattern as `BrandKit.logo_url` — no upload infrastructure."""

    studio: Mapped[Studio] = relationship(back_populates="class_types")
    checklist_items: Mapped[list[ChecklistTemplateItem]] = relationship(
        back_populates="class_type",
        cascade="all, delete-orphan",
        order_by="ChecklistTemplateItem.position",
    )


class ChecklistTemplateItem(Base, TenantMixin, TimestampMixin):
    """One step in a class type's default checklist.

    Templates store a *relative* offset; sessions store the resolved absolute
    deadline. That split is what lets a template stay reusable while a
    rescheduled session re-anchors cleanly (PRD §2.5).
    """

    __tablename__ = "checklist_template_item"
    __table_args__ = (CheckConstraint("position >= 0", name="position_non_negative"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    class_type_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("class_type.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # May contain a quantity expression, e.g. "Bake {seats + 2} cake bases".
    text: Mapped[str] = mapped_column(String(500), nullable=False)

    hours_before: Mapped[float] = mapped_column(Float, default=24.0, nullable=False)
    """T-minus offset. Negative values are post-class steps (T+2h)."""

    phase: Mapped[ChecklistPhase] = mapped_column(default=ChecklistPhase.PREP, nullable=False)
    is_high_priority: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    """High-priority items escalate to a push notification (PRD §2.5)."""

    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    class_type: Mapped[ClassType] = relationship(back_populates="checklist_items")
