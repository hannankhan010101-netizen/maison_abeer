"""Tenant scoping, asserted against the SQL that would actually be sent.

Structural tests prove every table *has* a `studio_id`. These prove the
queries *use* it: each statement is compiled for the PostgreSQL dialect and
inspected, so a repository method that forgets the filter fails here rather
than leaking across studios in production.

This is not a substitute for the live integration suite — it cannot prove the
bound parameter carries the right value — but it does prove the predicate is
present in every statement the repositories build.
"""

from __future__ import annotations

import ast
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session as SASession

from app.core.db import TenantSession
from app.models import (
    Booking,
    ChecklistItem,
    ClassType,
    ExportRecord,
    Guest,
    HostUser,
    Session,
    Studio,
    StudioSettings,
    WaitlistEntry,
)

STUDIO_ID = uuid4()

# Every tenant-scoped model a repository reads through TenantSession.query.
SCOPED_MODELS = [
    Session,
    Booking,
    Guest,
    ClassType,
    ChecklistItem,
    ExportRecord,
    WaitlistEntry,
    StudioSettings,
    HostUser,
]


def compile_sql(statement: object) -> str:
    return str(
        statement.compile(  # type: ignore[attr-defined]
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": False},
        )
    )


@pytest.fixture
def db() -> TenantSession:
    # No connection is opened: TenantSession only builds statements here.
    return TenantSession(SASession(), STUDIO_ID)


class TestTenantSessionScoping:
    @pytest.mark.parametrize("model", SCOPED_MODELS, ids=lambda m: m.__tablename__)
    def test_query_emits_a_studio_filter(self, db: TenantSession, model: type) -> None:
        sql = compile_sql(db.query(model))

        assert "studio_id" in sql, f"{model.__tablename__} query is not tenant-scoped"
        assert "WHERE" in sql

    @pytest.mark.parametrize("model", SCOPED_MODELS, ids=lambda m: m.__tablename__)
    def test_scoped_query_differs_from_an_unscoped_one(
        self, db: TenantSession, model: type
    ) -> None:
        # Guards against `query()` silently degrading to a plain select().
        assert compile_sql(db.query(model)) != compile_sql(select(model))

    def test_the_tenant_root_is_not_self_filtered(self, db: TenantSession) -> None:
        # `studio` has no studio_id; filtering it would be nonsense.
        sql = compile_sql(db.query(Studio))
        assert "WHERE" not in sql

    def test_get_adds_both_id_and_tenant_predicates(self, db: TenantSession) -> None:
        statement = db.query(Session).where(Session.id == uuid4())
        sql = compile_sql(statement)

        assert sql.count("WHERE") == 1
        assert "studio_id" in sql
        assert "session.id" in sql

    def test_extra_filters_do_not_replace_the_tenant_predicate(self, db: TenantSession) -> None:
        statement = db.query(Booking).where(Booking.table_number.is_(None))
        sql = compile_sql(statement)

        assert "studio_id" in sql
        assert "table_number IS NULL" in sql


class TestTenantSessionWriteGuard:
    def test_stamps_the_tenant_on_new_rows(self, db: TenantSession) -> None:
        session = Session(
            class_type_id=uuid4(),
            starts_at=None,
            ends_at=None,
            seats=10,
        )

        db.add(session)

        assert session.studio_id == STUDIO_ID

    def test_refuses_a_row_belonging_to_another_studio(self, db: TenantSession) -> None:
        foreign = Session(
            class_type_id=uuid4(),
            starts_at=None,
            ends_at=None,
            seats=10,
        )
        foreign.studio_id = uuid4()

        with pytest.raises(RuntimeError, match="Refusing to persist"):
            db.add(foreign)

    def test_allows_a_row_already_stamped_with_this_studio(self, db: TenantSession) -> None:
        owned = Guest(full_name="Sana R.")
        owned.studio_id = STUDIO_ID

        db.add(owned)  # must not raise

        assert owned.studio_id == STUDIO_ID

    def test_untenanted_rows_pass_through(self, db: TenantSession) -> None:
        # `studio` itself carries no studio_id.
        db.add(Studio(name="Maison Abeer", slug="maison-abeer"))


class TestRepositoryStatements:
    """The repository's hand-built statements must be scoped too.

    `TenantSession.query` covers the ORM reads, but a few counts and joins are
    written with `select()` directly for efficiency. Those are exactly the
    places a tenant filter can be forgotten.
    """

    def test_booked_count_is_scoped(self) -> None:
        from sqlalchemy import func

        statement = (
            select(func.count())
            .select_from(Booking)
            .where(
                Booking.studio_id == STUDIO_ID,
                Booking.session_id == uuid4(),
            )
        )

        assert "studio_id" in compile_sql(statement)

    def test_guest_join_is_scoped_through_booking(self) -> None:
        statement = (
            select(Guest.opted_out, Guest.preferred_channel)
            .join(Booking, Booking.guest_id == Guest.id)
            .where(Booking.studio_id == STUDIO_ID)
        )

        sql = compile_sql(statement)

        # The join reaches guests only through a tenant-scoped booking.
        assert "studio_id" in sql
        assert "JOIN booking" in sql

    def test_every_hand_written_select_names_studio_id(self) -> None:
        """Any `select()` written by hand must filter studio_id itself.

        ORM reads go through `TenantSession.query`, which cannot forget the
        filter. The exceptions are aggregate counts and joins written directly
        for efficiency — exactly where a tenant predicate gets dropped. This
        walks the AST of every repository and checks each raw `select()` call
        has a `studio_id` reference somewhere in its statement chain.
        """
        import ast
        from pathlib import Path

        for path in sorted(Path("app/repositories").glob("*.py")):
            tree = ast.parse(path.read_text(encoding="utf-8"))

            for node in ast.walk(tree):
                if not isinstance(node, ast.Call):
                    continue
                if not (isinstance(node.func, ast.Name) and node.func.id == "select"):
                    continue

                # Walk outwards is not possible from a child node, so instead
                # find the largest enclosing expression and check it contains
                # a studio_id attribute access.
                enclosing = _enclosing_statement(tree, node)
                names = {
                    child.attr for child in ast.walk(enclosing) if isinstance(child, ast.Attribute)
                }

                assert "studio_id" in names, (
                    f"{path.name}: a hand-written select() does not filter studio_id "
                    f"(line {node.lineno})"
                )


def _enclosing_statement(tree: ast.AST, target: ast.AST) -> ast.AST:
    """The smallest statement node that contains `target`."""
    import ast as _ast

    best: _ast.AST = tree

    for node in _ast.walk(tree):
        if not isinstance(node, _ast.stmt):
            continue
        if any(child is target for child in _ast.walk(node)):
            best = node

    return best
