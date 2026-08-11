"""SQLAlchemy models.

Importing this package registers every table on `Base.metadata`, which is what
Alembic autogenerate and the schema tests rely on. Import models from here
rather than from their defining module so the registry is always complete.
"""

from __future__ import annotations

from app.models.base import ArchiveMixin, Base, TenantMixin, TimestampMixin
from app.models.catalog import ChecklistTemplateItem, ClassType
from app.models.chat import ChatMembership, ChatMessage, ChatRoom, MessageReaction
from app.models.enums import (
    AllergySeverity,
    BookingStatus,
    CelebrationKind,
    ChatRoomKind,
    ChecklistPhase,
    CraftKind,
    CreditStatus,
    EmojiDensity,
    MessageChannel,
    MessageKind,
    MessageStatus,
    SessionStatus,
    VoicePreset,
    WaitlistStatus,
)
from app.models.guest import Guest, GuestAllergy, GuestCelebration, GuestCredit
from app.models.session import (
    Booking,
    ChecklistItem,
    ExportRecord,
    MessageFeedback,
    ScheduledMessage,
    Session,
    WaitlistEntry,
)
from app.models.studio import BrandKit, HostBadge, HostUser, Studio, StudioSettings

__all__ = [
    "AllergySeverity",
    "ArchiveMixin",
    "Base",
    "Booking",
    "BookingStatus",
    "BrandKit",
    "CelebrationKind",
    "ChatMembership",
    "ChatMessage",
    "ChatRoom",
    "ChatRoomKind",
    "ChecklistItem",
    "ChecklistPhase",
    "ChecklistTemplateItem",
    "ClassType",
    "CraftKind",
    "CreditStatus",
    "EmojiDensity",
    "ExportRecord",
    "Guest",
    "GuestAllergy",
    "GuestCelebration",
    "GuestCredit",
    "HostBadge",
    "HostUser",
    "MessageChannel",
    "MessageFeedback",
    "MessageKind",
    "MessageReaction",
    "MessageStatus",
    "ScheduledMessage",
    "Session",
    "SessionStatus",
    "Studio",
    "StudioSettings",
    "TenantMixin",
    "TimestampMixin",
    "VoicePreset",
    "WaitlistEntry",
    "WaitlistStatus",
]
