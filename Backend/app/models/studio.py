"""Tenant root: the studio, its host users, brand kit and settings."""

from __future__ import annotations

import uuid
from datetime import time
from typing import TYPE_CHECKING

from sqlalchemy import (
    ARRAY,
    Boolean,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TenantMixin, TimestampMixin, uuid_pk
from app.models.enums import EmojiDensity, VoicePreset

if TYPE_CHECKING:
    from app.models.catalog import ClassType
    from app.models.guest import Guest
    from app.models.session import Session


class Studio(Base, TimestampMixin):
    """The tenant root. Every other row is reachable from exactly one of these."""

    __tablename__ = "studio"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)

    host_users: Mapped[list[HostUser]] = relationship(
        back_populates="studio", cascade="all, delete-orphan"
    )
    settings: Mapped[StudioSettings | None] = relationship(
        back_populates="studio", cascade="all, delete-orphan", uselist=False
    )
    brand_kit: Mapped[BrandKit | None] = relationship(
        back_populates="studio", cascade="all, delete-orphan", uselist=False
    )
    class_types: Mapped[list[ClassType]] = relationship(
        back_populates="studio", cascade="all, delete-orphan"
    )
    guests: Mapped[list[Guest]] = relationship(
        back_populates="studio", cascade="all, delete-orphan"
    )
    sessions: Mapped[list[Session]] = relationship(
        back_populates="studio", cascade="all, delete-orphan"
    )


class HostUser(Base, TenantMixin, TimestampMixin):
    """A person who signs in.

    `auth_user_id` is the Supabase `auth.users` UUID carried in the JWT `sub`
    claim. It is the only link between the auth system and application data —
    resolving it to a `studio_id` server-side is the whole tenancy guarantee.
    """

    __tablename__ = "host_user"
    __table_args__ = (
        UniqueConstraint("auth_user_id", name="uq_host_user_auth_user_id"),
        UniqueConstraint("studio_id", "email", name="uq_host_user_studio_id_email"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    auth_user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(120))

    # Reserved for the PRD's open question on limited staff logins (§6).
    is_owner: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    studio: Mapped[Studio] = relationship(back_populates="host_users")


class BrandKit(Base, TenantMixin, TimestampMixin):
    """One-time brand setup, applied across every theme and kit piece (PRD §2.3)."""

    __tablename__ = "brand_kit"
    __table_args__ = (UniqueConstraint("studio_id", name="uq_brand_kit_studio_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    logo_url: Mapped[str | None] = mapped_column(String(500))
    primary_color: Mapped[str | None] = mapped_column(String(9))
    accent_color: Mapped[str | None] = mapped_column(String(9))
    instagram_handle: Mapped[str | None] = mapped_column(String(60))
    """Drives the auto-generated QR code on name tags."""

    hero_photo_url: Mapped[str | None] = mapped_column(String(500))
    """A real photo of the studio for the public booking page's hero.

    Same pattern as `logo_url`: a pasted link, not an upload — there is no
    file storage in this app, and a text field a host can paste any hosted
    image into ships without needing one."""

    story: Mapped[str | None] = mapped_column(String(600))
    """A short "what happens here" blurb for the public page. Optional — a
    studio that hasn't written one yet gets no section, not a placeholder."""

    studio: Mapped[Studio] = relationship(back_populates="brand_kit")


class StudioSettings(Base, TenantMixin, TimestampMixin):
    """Operational preferences: timezone, quiet hours, energy budget, voice."""

    __tablename__ = "studio_settings"
    __table_args__ = (UniqueConstraint("studio_id", name="uq_studio_settings_studio_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()

    # All session times are interpreted here (PRD §2.2 edge cases).
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False)

    quiet_hours_start: Mapped[time] = mapped_column(Time, default=time(9, 0), nullable=False)
    quiet_hours_end: Mapped[time] = mapped_column(Time, default=time(21, 0), nullable=False)

    # Energy budget (PRD §2.2). Null cap means the host hasn't set one.
    weekly_class_cap: Mapped[int | None] = mapped_column(Integer)
    rest_days: Mapped[list[int]] = mapped_column(ARRAY(SmallInteger), default=list, nullable=False)
    """ISO weekday numbers, Monday=1 … Sunday=7."""

    default_voice: Mapped[VoicePreset] = mapped_column(
        default=VoicePreset.SOFT_SWEET, nullable=False
    )
    emoji_density: Mapped[EmojiDensity] = mapped_column(default=EmojiDensity.FULL, nullable=False)

    # The vibe-check greeting can be turned off for hosts who prefer a plain
    # header (PRD §2.1).
    show_greeting: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    studio: Mapped[Studio] = relationship(back_populates="settings")


class HostBadge(Base, TenantMixin, TimestampMixin):
    """Collectible milestone badges (PRD §2.1, §2.5).

    Purely celebratory — badges are only ever awarded, never revoked.
    """

    __tablename__ = "host_badge"
    __table_args__ = (UniqueConstraint("studio_id", "code", name="uq_host_badge_studio_id_code"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(60), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("session.id", ondelete="SET NULL")
    )
    """The moment that earned it, when there was one."""
