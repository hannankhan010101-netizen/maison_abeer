"""Application error types and their HTTP mapping.

Domain code raises plain Python exceptions with host-facing messages; this
module is the only place that knows about HTTP. Error copy follows the product
voice — explain and offer a way forward, never a bare "400 Bad Request"
(design guide: no red error walls, no corporate nouns).
"""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    """Base for expected, host-facing failures.

    `message` is shown to the user, so it must read like the rest of the
    product. `code` is a stable machine identifier the frontend can branch on.
    """

    status_code: int = 400
    code: str = "bad_request"

    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.details:
            payload["details"] = self.details
        return payload


class NotAuthenticatedError(AppError):
    status_code = 401
    code = "not_authenticated"

    def __init__(self, message: str = "Please sign in to continue.") -> None:
        super().__init__(message)


class NotAuthorizedError(AppError):
    """Deliberately indistinguishable from 'not found' for cross-tenant reads.

    Confirming that a resource exists in another studio is itself a leak, so
    tenant-scoped lookups raise NotFoundError instead of this.
    """

    status_code = 403
    code = "not_authorized"

    def __init__(self, message: str = "You don't have access to that.") -> None:
        super().__init__(message)


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"

    def __init__(self, message: str = "We couldn't find that.") -> None:
        super().__init__(message)


class ConflictError(AppError):
    """A valid request that collides with current state."""

    status_code = 409
    code = "conflict"


class ValidationError(AppError):
    status_code = 422
    code = "validation_failed"


class RateLimitedError(AppError):
    status_code = 429
    code = "rate_limited"

    def __init__(self, message: str = "That's a lot of requests — give it a moment.") -> None:
        super().__init__(message)


# ---------------------------------------------------------------------------
# Domain errors mapped onto HTTP
# ---------------------------------------------------------------------------


class SeatsBelowBookingsError(ConflictError):
    """PRD §2.2 — decreasing seats below the booking count is blocked."""

    code = "seats_below_bookings"


class SessionLockedError(ConflictError):
    code = "session_locked"

    def __init__(self, message: str = "This session is fully booked.") -> None:
        super().__init__(message)


class PastSlotError(ValidationError):
    code = "past_slot"


class DuplicateGuestError(ConflictError):
    code = "duplicate_guest"
