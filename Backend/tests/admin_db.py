"""Owner-connection access for tests.

The application connects as `maison_app`, which every row-level policy applies
to — correctly, and that is the point. But a fixture seeding a second studio,
or an assertion reading a row back to check what the API wrote, is doing
administrator work rather than application work. On the app's own connection
those either fail or, worse, quietly prove nothing.

So direct database access in tests uses the owner connection, the same one
Alembic uses. Anything asserting on *behaviour* still goes through HTTP, where
RLS applies exactly as it does in production.
"""

from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings

if TYPE_CHECKING:
    from sqlalchemy.orm import Session as SASession


@lru_cache(maxsize=1)
def _factory() -> sessionmaker[SASession]:
    settings = get_settings()
    url = settings.migration_database_url or str(settings.database_url)

    return sessionmaker(
        bind=create_engine(url, future=True),
        autoflush=False,
        expire_on_commit=False,
        future=True,
    )


def admin_factory() -> SASession:
    """A session that bypasses RLS. Test setup and assertions only."""
    return _factory()()
