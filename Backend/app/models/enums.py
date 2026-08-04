"""Persisted enumerations.

Stored as native Postgres enums. Values are lowercase snake_case and are part
of the database contract — renaming one is a migration, not a refactor.
"""

from __future__ import annotations

from enum import StrEnum


class CraftKind(StrEnum):
    """The three crafts the PRD names, plus host-defined types.

    Drives the default colour and checklist template (PRD §2.2).
    """

    BENTO_CAKE = "bento_cake"
    POTTERY = "pottery"
    CERAMIC_PAINTING = "ceramic_painting"
    CUSTOM = "custom"


class SessionStatus(StrEnum):
    SCHEDULED = "scheduled"
    LOCKED = "locked"
    """Host closed the session to new bookings (PRD §2.2)."""
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class BookingStatus(StrEnum):
    """PRD §2.4 — the roster filters map directly onto these."""

    CONFIRMED = "confirmed"
    ATTENDED = "attended"
    NO_SHOW = "no_show"
    CANCELLED = "cancelled"

    @property
    def occupies_seat(self) -> bool:
        """Whether this booking consumes capacity."""
        return self in {BookingStatus.CONFIRMED, BookingStatus.ATTENDED, BookingStatus.NO_SHOW}


class WaitlistStatus(StrEnum):
    WAITING = "waiting"
    INVITED = "invited"
    """Offer sent; holds a seat until `invite_expires_at` (PRD §2.4)."""
    ACCEPTED = "accepted"
    DECLINED = "declined"
    EXPIRED = "expired"
    WITHDRAWN = "withdrawn"


class CreditStatus(StrEnum):
    """Rain-check credits turn a refund into a retention moment (PRD §2.4)."""

    AVAILABLE = "available"
    REDEEMED = "redeemed"
    EXPIRED = "expired"


class MessageChannel(StrEnum):
    SMS = "sms"
    WHATSAPP = "whatsapp"
    EMAIL = "email"
    IN_APP = "in_app"
    """Host-facing operational nudges (PRD §2.6)."""


class MessageKind(StrEnum):
    GUEST_REMINDER = "guest_reminder"
    GUEST_THANK_YOU = "guest_thank_you"
    SCHEDULE_CHANGE = "schedule_change"
    WAITLIST_INVITE = "waitlist_invite"
    WAITLIST_POSITION = "waitlist_position"
    CREDIT_ISSUED = "credit_issued"
    BIRTHDAY_OFFER = "birthday_offer"
    HOST_NUDGE = "host_nudge"


class MessageStatus(StrEnum):
    """A failed send must always be visible to the host — silent failure is a
    critical defect (PRD §3.2)."""

    SCHEDULED = "scheduled"
    QUEUED = "queued"
    """Held outside quiet hours, waiting for the window to open (PRD §2.6)."""
    SENDING = "sending"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    CANCELLED = "cancelled"
    SKIPPED_OPTED_OUT = "skipped_opted_out"
    SKIPPED_NO_CONTACT = "skipped_no_contact"


class VoicePreset(StrEnum):
    """The three tones every template exists in (PRD §2.6)."""

    SOFT_SWEET = "soft_sweet"
    CHAOTIC_BESTIE = "chaotic_bestie"
    CLEAN_MINIMAL = "clean_minimal"


class EmojiDensity(StrEnum):
    NONE = "none"
    LIGHT = "light"
    FULL = "full"


class ChecklistPhase(StrEnum):
    """Operational memory covers the full cycle: prepare, host, reset."""

    PREP = "prep"
    POST_CLASS = "post_class"


class AllergySeverity(StrEnum):
    """Nut allergies render as a red-outlined chip everywhere they matter."""

    PREFERENCE = "preference"
    INTOLERANCE = "intolerance"
    ALLERGY = "allergy"
    SEVERE = "severe"


class CelebrationKind(StrEnum):
    BIRTHDAY = "birthday"
    ANNIVERSARY = "anniversary"
