"""Request dependencies.

The chain that matters: bearer token → verified Principal → studio_id resolved
from the database → tenant-scoped session. `studio_id` is never read from the
request, so a caller cannot choose which studio they operate on.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Annotated
from uuid import UUID

from fastapi import Depends, Header

from app.core.config import Settings, get_settings
from app.core.db import TenantSession, get_session_factory
from app.core.errors import NotAuthenticatedError, NotAuthorizedError
from app.core.security import Principal, extract_bearer_token, verify_access_token
from app.models.guest import Guest
from app.models.studio import HostUser

if TYPE_CHECKING:
    from collections.abc import Iterator


def get_principal(
    authorization: Annotated[str | None, Header()] = None,
    settings: Annotated[Settings, Depends(get_settings)] = None,  # type: ignore[assignment]
) -> Principal:
    """Verify the bearer token and return the caller."""
    token = extract_bearer_token(authorization)
    return verify_access_token(token, settings=settings)


def get_tenant_session(
    principal: Annotated[Principal, Depends(get_principal)],
) -> Iterator[TenantSession]:
    """Resolve the caller's studio and open a session scoped to it.

    The lookup is the whole point: the studio comes from a row keyed on the
    token's verified `sub`, never from anything the client sent.
    """
    factory = get_session_factory()
    session = factory()

    try:
        # Phase one: the verified subject, which is all `host_user`'s policy
        # needs to let us read the row that names the studio.
        TenantSession.announce_subject(session, principal.auth_user_id)

        studio_id = _resolve_studio_id(session, principal.auth_user_id)
        scoped = TenantSession(session, studio_id)

        # Identifies the tenant to Postgres for this transaction, so the RLS
        # policies have a claim to match. Without it every policy matches zero
        # rows and the API reads nothing.
        scoped.announce_tenant()

        yield scoped

        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _resolve_studio_id(session: object, auth_user_id: UUID) -> UUID:
    from sqlalchemy import select
    from sqlalchemy.orm import Session as SASession

    assert isinstance(session, SASession)

    statement = select(HostUser.studio_id).where(HostUser.auth_user_id == auth_user_id)
    studio_id = session.execute(statement).scalar_one_or_none()

    if studio_id is None:
        # A signed-in *guest* reaching a host route is authenticated and simply
        # not allowed — 403, not 401. Answering 401 would tell them to sign in
        # again, which they have already done and which cannot help.
        is_guest = session.execute(
            select(Guest.id).where(
                Guest.auth_user_id == auth_user_id,
                Guest.archived_at.is_(None),
            )
        ).scalar_one_or_none()

        if is_guest is not None:
            raise NotAuthorizedError("That part of the studio isn't yours to open.")

        # Authenticated with Supabase but no studio record — the account was
        # never finished setting up. Treated as unauthenticated rather than
        # forbidden, because there is nothing to be forbidden from yet.
        raise NotAuthenticatedError("Finish setting up your studio to continue.")

    return studio_id


# ---------------------------------------------------------------------------
# Guests
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class GuestCaller:
    """A signed-in guest, resolved entirely from their verified token.

    Both ids come from the database, keyed on the token's `sub`. Neither is
    ever read from the request — the same rule that makes studio scoping a
    real boundary rather than a suggestion, applied one level down: a guest
    must not be able to name a different guest and read their bookings.
    """

    guest_id: UUID
    studio_id: UUID
    db: TenantSession


def get_guest_session(
    principal: Annotated[Principal, Depends(get_principal)],
) -> Iterator[GuestCaller]:
    """Open a session scoped to the studio, carrying the caller's guest id.

    A host token is rejected here rather than silently allowed through. The
    two audiences see different data under different rules, and an endpoint
    that quietly accepted either would be one refactor away from serving host
    data on a guest route.
    """
    factory = get_session_factory()
    session = factory()

    try:
        TenantSession.announce_subject(session, principal.auth_user_id)

        guest_id, studio_id = _resolve_guest(session, principal.auth_user_id)
        scoped = TenantSession(session, studio_id)
        scoped.announce_tenant()

        yield GuestCaller(guest_id=guest_id, studio_id=studio_id, db=scoped)

        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _resolve_guest(session: object, auth_user_id: UUID) -> tuple[UUID, UUID]:
    from sqlalchemy import select
    from sqlalchemy.orm import Session as SASession

    assert isinstance(session, SASession)

    row = session.execute(
        select(Guest.id, Guest.studio_id).where(
            Guest.auth_user_id == auth_user_id,
            Guest.archived_at.is_(None),
        )
    ).one_or_none()

    if row is None:
        # Authenticated with Supabase, but this identity has not been matched
        # to a guest record. Not "forbidden" — there is nothing yet to be
        # forbidden from, and the claim flow is what fixes it.
        raise NotAuthenticatedError("We couldn't find your booking. Check the email you used.")

    return row[0], row[1]


CurrentPrincipal = Annotated[Principal, Depends(get_principal)]
Db = Annotated[TenantSession, Depends(get_tenant_session)]
GuestDb = Annotated[GuestCaller, Depends(get_guest_session)]
