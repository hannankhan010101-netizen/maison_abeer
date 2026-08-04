"""Guests — the memory that lets a solo host treat everyone like a regular."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import ArchiveMixin, Base, TenantMixin, TimestampMixin, uuid_pk
from app.models.enums import AllergySeverity, CelebrationKind, CreditStatus, MessageChannel

if TYPE_CHECKING:
    from app.models.session import Booking
    from app.models.studio import Studio


class Guest(Base, TenantMixin, TimestampMixin, ArchiveMixin):
    """A person who books.

    Contact details are optional: the PRD allows a host to add a guest with
    only a name, from a DM or a phone call. Such a guest is simply excluded
    from automated messages and badged so the host knows to reach them
    personally (§2.4 edge cases).
    """

    __tablename__ = "guest"
    __table_args__ = (
        # Partial unique indexes make duplicate-merge enforceable rather than
        # advisory, while still allowing many contact-less guests per studio.
        Index(
            "uq_guest_studio_id_phone",
            "studio_id",
            "phone",
            unique=True,
            postgresql_where=text("phone IS NOT NULL AND archived_at IS NULL"),
        ),
        Index(
            "uq_guest_studio_id_email",
            "studio_id",
            "email",
            unique=True,
            postgresql_where=text("email IS NOT NULL AND archived_at IS NULL"),
        ),
        Index("ix_guest_studio_id_full_name", "studio_id", "full_name"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(320))

    preferred_channel: Mapped[MessageChannel] = mapped_column(
        default=MessageChannel.WHATSAPP, nullable=False
    )
    opted_out: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    """Opt-outs are enforced automatically and badged on the roster (§2.6)."""

    # Denormalised for the roster's "3rd visit" badge and Regulars filter.
    # Recomputed on booking status change rather than counted per render.
    visit_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    birthday: Mapped[date | None] = mapped_column(Date)
    """Drives the 30-day birthday lookahead (PRD §2.4)."""

    # The mini-CRM note: "came with her sister; loved the matcha buttercream".
    # Surfaces automatically on their next booking and the day-of roster.
    memory_note: Mapped[str | None] = mapped_column(Text)

    studio: Mapped[Studio] = relationship(back_populates="guests")
    allergies: Mapped[list[GuestAllergy]] = relationship(
        back_populates="guest", cascade="all, delete-orphan"
    )
    celebrations: Mapped[list[GuestCelebration]] = relationship(
        back_populates="guest", cascade="all, delete-orphan"
    )
    credits: Mapped[list[GuestCredit]] = relationship(
        back_populates="guest", cascade="all, delete-orphan"
    )
    bookings: Mapped[list[Booking]] = relationship(back_populates="guest")

    @property
    def is_contactable(self) -> bool:
        """Whether automated messages can reach this guest at all."""
        if self.opted_out:
            return False
        if self.preferred_channel is MessageChannel.EMAIL:
            return bool(self.email)
        return bool(self.phone)


class GuestAllergy(Base, TenantMixin, TimestampMixin):
    """A structured dietary flag, not free text.

    Surfaces on the roster, the seating map, the printed host copy and as a
    day-of dashboard alert (PRD §2.4).
    """

    __tablename__ = "guest_allergy"

    id: Mapped[uuid.UUID] = uuid_pk()
    guest_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("guest.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    severity: Mapped[AllergySeverity] = mapped_column(
        default=AllergySeverity.ALLERGY, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text)

    guest: Mapped[Guest] = relationship(back_populates="allergies")

    @property
    def is_critical(self) -> bool:
        """Critical allergies render as a red-outlined chip and a day-of alert."""
        return self.severity in {AllergySeverity.ALLERGY, AllergySeverity.SEVERE}


class GuestCelebration(Base, TenantMixin, TimestampMixin):
    """Birthday or anniversary flag, with a suggested gesture (PRD §2.4)."""

    __tablename__ = "guest_celebration"
    __table_args__ = (
        UniqueConstraint("guest_id", "kind", name="uq_guest_celebration_guest_id_kind"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    guest_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("guest.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[CelebrationKind] = mapped_column(nullable=False)
    occurs_on: Mapped[date] = mapped_column(Date, nullable=False)

    guest: Mapped[Guest] = relationship(back_populates="celebrations")


class GuestCredit(Base, TenantMixin, TimestampMixin):
    """A rain-check credit.

    Issued instead of a refund, which turns an awkward money conversation into
    a retention moment (PRD §2.4). Money itself is off-platform in v1.
    """

    __tablename__ = "guest_credit"

    id: Mapped[uuid.UUID] = uuid_pk()
    guest_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("guest.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[CreditStatus] = mapped_column(default=CreditStatus.AVAILABLE, nullable=False)

    issued_for_session_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("session.id", ondelete="SET NULL")
    )
    redeemed_for_session_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("session.id", ondelete="SET NULL")
    )
    redeemed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(Text)

    guest: Mapped[Guest] = relationship(back_populates="credits")
