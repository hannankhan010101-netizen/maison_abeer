"""Request dependencies.

The chain that matters: bearer token → verified Principal → studio_id resolved
from the database → tenant-scoped session. `studio_id` is never read from the
request, so a caller cannot choose which studio they operate on.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated
from uuid import UUID

from fastapi import Depends, Header

from app.core.config import Settings, get_settings
from app.core.db import TenantSession, get_session_factory
from app.core.errors import NotAuthenticatedError
from app.core.security import Principal, extract_bearer_token, verify_access_token
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
        # Authenticated with Supabase but no studio record — the account was
        # never finished setting up. Treated as unauthenticated rather than
        # forbidden, because there is nothing to be forbidden from yet.
        raise NotAuthenticatedError("Finish setting up your studio to continue.")

    return studio_id


CurrentPrincipal = Annotated[Principal, Depends(get_principal)]
Db = Annotated[TenantSession, Depends(get_tenant_session)]
