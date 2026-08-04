"""The Session aggregate.

"Every module reads from the same Session record; nothing is entered twice"
(PRD §2.7). A session owns its roster, checklist, seating, waitlist, name-tag
exports and message schedule.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import ArchiveMixin, Base, TenantMixin, TimestampMixin, uuid_pk
from app.models.enums import (
    BookingStatus,
    ChecklistPhase,
    MessageChannel,
    MessageKind,
    MessageStatus,
    SessionStatus,
    WaitlistStatus,
)

if TYPE_CHECKING:
    from app.models.catalog import ClassType
    from app.models.guest import Guest
    from app.models.studio import Studio


class Session(Base, TenantMixin, TimestampMixin, ArchiveMixin):
    """A scheduled class."""

    __tablename__ = "session"
    __table_args__ = (
        CheckConstraint("seats >= 0", name="seats_non_negative"),
        CheckConstraint("ends_at > starts_at", name="ends_after_start"),
        Index("ix_session_studio_id_starts_at", "studio_id", "starts_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    class_type_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("class_type.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    title: Mapped[str | None] = mapped_column(String(160))
    """Overrides the class type name when the host wants something specific."""

    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    seats: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[SessionStatus] = mapped_column(default=SessionStatus.SCHEDULED, nullable=False)

    location: Mapped[str | None] = mapped_column(String(200))
    notes: Mapped[str | None] = mapped_column(Text)

    # Set when a quick-add created a recurring series, so the whole series can
    # be found later (PRD §2.2 quick-add supports weekly recurrence).
    recurrence_group_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)

    sold_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    """Stamped once, so the confetti and milestone fire exactly one time."""

    studio: Mapped[Studio] = relationship(back_populates="sessions")
    class_type: Mapped[ClassType] = relationship()
    bookings: Mapped[list[Booking]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    waitlist: Mapped[list[WaitlistEntry]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="WaitlistEntry.position",
    )
    checklist_items: Mapped[list[ChecklistItem]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChecklistItem.deadline_at",
    )
    scheduled_messages: Mapped[list[ScheduledMessage]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    exports: Mapped[list[ExportRecord]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )

    @property
    def is_locked(self) -> bool:
        return self.status is SessionStatus.LOCKED


class Booking(Base, TenantMixin, TimestampMixin):
    """A guest's place in a session."""

    __tablename__ = "booking"
    __table_args__ = (
        # A guest cannot hold two live places in the same class. Cancelled
        # bookings are excluded so they can rebook after cancelling.
        Index(
            "uq_booking_session_id_guest_id_active",
            "session_id",
            "guest_id",
            unique=True,
            postgresql_where=text("status <> 'cancelled'"),
        ),
        Index("ix_booking_studio_id_status", "studio_id", "status"),
        CheckConstraint("table_number IS NULL OR table_number > 0", name="table_number_positive"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("session.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    guest_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("guest.id", ondelete="CASCADE"), nullable=False, index=True
    )

    status: Mapped[BookingStatus] = mapped_column(default=BookingStatus.CONFIRMED, nullable=False)
    table_number: Mapped[int | None] = mapped_column(Integer)
    """Null means unassigned — drives the unassigned-guest counter (PRD §2.4)."""

    sit_with_note: Mapped[str | None] = mapped_column(String(200))
    """"Sit with Sana" requests, honoured when planning tables."""

    # Fun answers collected at booking, e.g. {"flavour": "gulab jamun"}.
    # These become the subtext on name tags (PRD §2.3).
    booking_answers: Mapped[dict[str, str] | None] = mapped_column(JSONB)

    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    session: Mapped[Session] = relationship(back_populates="bookings")
    guest: Mapped[Guest] = relationship(back_populates="bookings")


class WaitlistEntry(Base, TenantMixin, TimestampMixin):
    """An ordered place in the queue for a full session (PRD §2.4)."""

    __tablename__ = "waitlist_entry"
    __table_args__ = (
        UniqueConstraint("session_id", "guest_id", name="uq_waitlist_entry_session_id_guest_id"),
        Index("ix_waitlist_entry_session_id_position", "session_id", "position"),
        CheckConstraint("position >= 0", name="position_non_negative"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("session.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    guest_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("guest.id", ondelete="CASCADE"), nullable=False, index=True
    )

    position: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[WaitlistStatus] = mapped_column(default=WaitlistStatus.WAITING, nullable=False)

    invited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    invite_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    """Default 12-hour response window before the offer passes down the list."""

    session: Mapped[Session] = relationship(back_populates="waitlist")
    guest: Mapped[Guest] = relationship()


class ChecklistItem(Base, TenantMixin, TimestampMixin):
    """A prep step instantiated onto a specific session.

    Instantiated rather than read through the template: templates stay
    editable, while a session keeps the checklist it actually ran. Archiving a
    session preserves these so streak history survives (PRD §2.5).
    """

    __tablename__ = "checklist_item"
    __table_args__ = (
        Index("ix_checklist_item_session_id_deadline_at", "session_id", "deadline_at"),
        Index(
            "ix_checklist_item_pending_deadline",
            "studio_id",
            "deadline_at",
            postgresql_where=text("completed_at IS NULL"),
        ),
        CheckConstraint("position >= 0", name="position_non_negative"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("session.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # The authored text, which may still contain "{seats + 2}".
    text_template: Mapped[str] = mapped_column(String(500), nullable=False)

    # The rendered text and the value it was rendered with. Storing the value
    # is what lets us detect drift when capacity changes, rather than diffing
    # rendered strings (PRD §2.5).
    rendered_text: Mapped[str] = mapped_column(String(500), nullable=False)
    last_quantity: Mapped[int | None] = mapped_column(Integer)

    hours_before: Mapped[float] = mapped_column(nullable=False)
    deadline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    phase: Mapped[ChecklistPhase] = mapped_column(default=ChecklistPhase.PREP, nullable=False)
    is_high_priority: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_one_off: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    """Ad-hoc steps live only on this date and never pollute the template."""

    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Set when a capacity change moved this item's quantity after it was
    # ticked, so the UI can re-open the conversation kindly.
    needs_attention_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    session: Mapped[Session] = relationship(back_populates="checklist_items")

    @property
    def is_complete(self) -> bool:
        return self.completed_at is not None


class ScheduledMessage(Base, TenantMixin, TimestampMixin):
    """A queued or sent message.

    Every send is logged, giving each guest a complete communication history
    and making delivery failure visible rather than silent (PRD §2.6, §3.2).
    """

    __tablename__ = "scheduled_message"
    __table_args__ = (
        Index(
            "ix_scheduled_message_due",
            "status",
            "send_at",
            postgresql_where=text("status IN ('scheduled', 'queued')"),
        ),
        Index("ix_scheduled_message_guest_id_created_at", "guest_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("session.id", ondelete="CASCADE"), index=True
    )
    guest_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("guest.id", ondelete="CASCADE"), index=True
    )
    """Null for host-facing operational nudges."""

    kind: Mapped[MessageKind] = mapped_column(nullable=False)
    channel: Mapped[MessageChannel] = mapped_column(nullable=False)
    status: Mapped[MessageStatus] = mapped_column(default=MessageStatus.SCHEDULED, nullable=False)

    send_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    """Already adjusted for quiet hours before it is written."""

    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    body: Mapped[str] = mapped_column(Text, nullable=False)

    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text)
    """Surfaced in the dashboard alert feed with a retry action."""

    provider_message_id: Mapped[str | None] = mapped_column(String(200))

    session: Mapped[Session] = relationship(back_populates="scheduled_messages")


class MessageFeedback(Base, TenantMixin, TimestampMixin):
    """The three-emoji tap plus one word (PRD §2.6)."""

    __tablename__ = "message_feedback"
    __table_args__ = (UniqueConstraint("booking_id", name="uq_message_feedback_booking_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    booking_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("booking.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    """1 = 😕, 2 = 🙂, 3 = 😍"""
    one_word: Mapped[str | None] = mapped_column(String(60))


class ExportRecord(Base, TenantMixin, TimestampMixin):
    """A name-tag export.

    `roster_hash` is a fingerprint of the roster at export time. Comparing it
    to the live roster raises the "roster updated since your last export"
    banner with no background job (PRD §2.3 edge cases).
    """

    __tablename__ = "export_record"

    id: Mapped[uuid.UUID] = uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("session.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    theme: Mapped[str] = mapped_column(String(60), nullable=False)
    layout: Mapped[str] = mapped_column(String(40), nullable=False)
    roster_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    file_url: Mapped[str | None] = mapped_column(String(500))

    session: Mapped[Session] = relationship(back_populates="exports")
