"""Database engine, session factory and tenant scoping.

`TenantSession` is the behavioural half of tenant isolation. Rather than
trusting every query author to remember `WHERE studio_id = :id`, it applies
the filter itself and refuses to load a tenant-scoped model without one.

The service-role connection bypasses RLS by design (ADR 0001), which makes
this class the effective boundary — hence the deliberate belt-and-braces:
filtered reads, an assertion on writes, and an integration suite that proves
studio A cannot reach studio B.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import TYPE_CHECKING, Any, TypeVar

from sqlalchemy import Select, create_engine, event, select
from sqlalchemy.orm import Session as SASession
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings, get_settings
from app.core.errors import NotFoundError
from app.models.base import Base, TenantMixin

if TYPE_CHECKING:
    from collections.abc import Iterator
    from uuid import UUID

    from sqlalchemy.engine import Engine

ModelT = TypeVar("ModelT", bound=Base)

_engine: Engine | None = None
_session_factory: sessionmaker[SASession] | None = None


def create_db_engine(settings: Settings | None = None) -> Engine:
    """Build the engine.

    `pool_pre_ping` matters on Supabase's pooler, which drops idle server-side
    connections; without it the first query after an idle period fails.
    """
    resolved = settings or get_settings()

    return create_engine(
        str(resolved.database_url),
        pool_size=resolved.db_pool_size,
        max_overflow=resolved.db_max_overflow,
        pool_recycle=resolved.db_pool_recycle_seconds,
        pool_pre_ping=True,
        future=True,
        # Statement-level timeout so one pathological query cannot pin a
        # connection indefinitely.
        connect_args={"options": "-c statement_timeout=15000"},
    )


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = create_db_engine()
    return _engine


def get_session_factory() -> sessionmaker[SASession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(
            bind=get_engine(),
            autoflush=False,
            expire_on_commit=False,
            future=True,
        )
    return _session_factory


def reset_engine() -> None:
    """Dispose the engine and factory. Used by tests and on shutdown."""
    global _engine, _session_factory

    if _engine is not None:
        _engine.dispose()

    _engine = None
    _session_factory = None


class TenantSession:
    """A database session bound to exactly one studio.

    Every read helper injects `studio_id`, and `add` refuses to persist a
    tenant-scoped row belonging to a different studio. Callers that genuinely
    need cross-tenant access (there are none in the request path) must reach
    for `raw` and say so explicitly.
    """

    __slots__ = ("_session", "_studio_id")

    def __init__(self, session: SASession, studio_id: UUID) -> None:
        self._session = session
        self._studio_id = studio_id

    @property
    def studio_id(self) -> UUID:
        return self._studio_id

    @property
    def raw(self) -> SASession:
        """The unscoped session.

        Every use is a deliberate escape from tenant scoping and should be
        rare, local, and commented.
        """
        return self._session

    # -- reads --------------------------------------------------------------

    def query(self, model: type[ModelT]) -> Select[tuple[ModelT]]:
        """A SELECT already filtered to this studio.

        Reads the mapped column off the class rather than narrowing with
        `issubclass(model, TenantMixin)`: `ModelT` is bound to `Base`, so a
        type narrowing to the mixin makes the branch statically unreachable
        even though it is reached at runtime.
        """
        statement = select(model)

        tenant_column = getattr(model, "studio_id", None)
        if tenant_column is not None:
            statement = statement.where(tenant_column == self._studio_id)

        return statement

    def get(self, model: type[ModelT], entity_id: UUID) -> ModelT | None:
        """Fetch one row by id, scoped to this studio.

        Returns None for rows belonging to another studio — indistinguishable
        from genuinely absent, because confirming existence is itself a leak.
        """
        statement = self.query(model).where(model.id == entity_id)  # type: ignore[attr-defined]
        return self._session.execute(statement).scalar_one_or_none()

    def get_or_404(self, model: type[ModelT], entity_id: UUID) -> ModelT:
        entity = self.get(model, entity_id)

        if entity is None:
            raise NotFoundError("We couldn't find that.")

        return entity

    def scalars(self, statement: Select[tuple[ModelT]]) -> list[ModelT]:
        return list(self._session.execute(statement).scalars().all())

    # -- writes -------------------------------------------------------------

    def add(self, entity: Base) -> None:
        """Stage a row, stamping and validating its tenant."""
        self._assert_tenant(entity)
        self._session.add(entity)

    def add_all(self, entities: list[Base]) -> None:
        for entity in entities:
            self.add(entity)

    def delete(self, entity: Base) -> None:
        self._assert_tenant(entity)
        self._session.delete(entity)

    def _assert_tenant(self, entity: Base) -> None:
        if not isinstance(entity, TenantMixin):
            return

        current = getattr(entity, "studio_id", None)

        if current is None:
            entity.studio_id = self._studio_id
            return

        if current != self._studio_id:
            # A bug, not a user error: something constructed a row for another
            # tenant inside this request. Fail loudly rather than persisting it.
            raise RuntimeError(
                f"Refusing to persist {type(entity).__name__} belonging to studio "
                f"{current} from a session scoped to {self._studio_id}."
            )

    def flush(self) -> None:
        self._session.flush()

    def commit(self) -> None:
        self._session.commit()

    def rollback(self) -> None:
        self._session.rollback()


@contextmanager
def tenant_session(studio_id: UUID) -> Iterator[TenantSession]:
    """Open a tenant-scoped session, committing on success."""
    factory = get_session_factory()
    session = factory()

    try:
        scoped = TenantSession(session, studio_id)
        yield scoped
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def register_engine_diagnostics(engine: Engine) -> None:
    """Attach lightweight diagnostics without logging query parameters.

    Guest rows carry contact details and allergy information, so bound
    parameters must never reach the logs (PRD §3.3).
    """

    @event.listens_for(engine, "handle_error")
    def _redact_parameters(context: Any) -> None:  # pragma: no cover - I/O path
        if context.parameters is not None:
            context.parameters = "[redacted]"
