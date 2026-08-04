"""Structural guarantees about the schema.

These run without a database. They exist because tenant isolation is only as
strong as its weakest table: a single business table added without `studio_id`
is a cross-tenant leak waiting to happen, and code review is not a reliable
way to catch that on every future PR.
"""

from __future__ import annotations

import pytest
from sqlalchemy import Table
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex, CreateTable

from app.models import Base

# The tenant root itself, plus tables scoped through an owning row rather than
# directly. Each entry needs a justification, so the exemption list cannot grow
# quietly.
TENANT_ROOT = "studio"

SCOPED_VIA_PARENT: dict[str, str] = {
    "message_feedback": "scoped through booking -> session -> studio",
}

ALL_TABLES = sorted(Base.metadata.tables)


def table(name: str) -> Table:
    return Base.metadata.tables[name]


class TestTenantIsolation:
    @pytest.mark.parametrize("table_name", ALL_TABLES)
    def test_every_business_table_carries_studio_id(self, table_name: str) -> None:
        if table_name == TENANT_ROOT or table_name in SCOPED_VIA_PARENT:
            pytest.skip(SCOPED_VIA_PARENT.get(table_name, "tenant root"))

        columns = table(table_name).columns
        assert "studio_id" in columns, (
            f"{table_name} has no studio_id. Every business table must be "
            f"reachable from exactly one studio — see ADR 0001."
        )
        assert not columns["studio_id"].nullable, f"{table_name}.studio_id must be NOT NULL"

    @pytest.mark.parametrize("table_name", ALL_TABLES)
    def test_studio_id_is_indexed_and_cascades(self, table_name: str) -> None:
        if table_name == TENANT_ROOT or table_name in SCOPED_VIA_PARENT:
            pytest.skip("not directly tenant-scoped")

        column = table(table_name).columns["studio_id"]

        foreign_keys = list(column.foreign_keys)
        assert foreign_keys, f"{table_name}.studio_id must reference studio.id"
        assert foreign_keys[0].column.table.name == TENANT_ROOT
        assert foreign_keys[0].ondelete == "CASCADE", (
            f"{table_name}.studio_id must cascade — deleting a studio must not strand its rows."
        )

        indexed = column.index or any(
            column.name in index.columns for index in table(table_name).indexes
        )
        assert indexed, f"{table_name}.studio_id must be indexed; every query filters on it"

    def test_exemptions_are_documented(self) -> None:
        for name, reason in SCOPED_VIA_PARENT.items():
            assert name in Base.metadata.tables, f"stale exemption: {name}"
            assert reason.strip(), f"{name} needs a justification"


class TestPrimaryKeys:
    @pytest.mark.parametrize("table_name", ALL_TABLES)
    def test_uuid_primary_key(self, table_name: str) -> None:
        primary_key = list(table(table_name).primary_key.columns)

        assert len(primary_key) == 1, f"{table_name} should have a single-column PK"
        assert primary_key[0].name == "id"
        # UUIDs keep identifiers non-enumerable in URLs.
        assert isinstance(primary_key[0].type, postgresql.UUID)


class TestTimestamps:
    @pytest.mark.parametrize("table_name", ALL_TABLES)
    def test_audit_timestamps_are_server_generated(self, table_name: str) -> None:
        columns = table(table_name).columns

        for name in ("created_at", "updated_at"):
            assert name in columns, f"{table_name} is missing {name}"
            assert columns[name].server_default is not None, (
                f"{table_name}.{name} must be server-generated — a client clock "
                f"is not trustworthy audit data."
            )
            assert columns[name].type.timezone is True, (
                f"{table_name}.{name} must be timestamptz; naive timestamps in a "
                f"scheduling product send reminders at the wrong hour."
            )


class TestSchedulingColumnsAreTimezoneAware:
    """Any column holding a moment in time must be `timestamptz`."""

    @pytest.mark.parametrize("table_name", ALL_TABLES)
    def test_no_naive_datetime_columns(self, table_name: str) -> None:
        naive = [
            column.name
            for column in table(table_name).columns
            if isinstance(column.type, postgresql.TIMESTAMP) and not column.type.timezone
        ]

        assert naive == [], f"{table_name} has naive datetime columns: {naive}"


class TestDDLCompiles:
    """The whole schema must render as valid PostgreSQL."""

    @pytest.mark.parametrize("table_name", ALL_TABLES)
    def test_create_table_compiles(self, table_name: str) -> None:
        sql = str(CreateTable(table(table_name)).compile(dialect=postgresql.dialect()))

        assert "CREATE TABLE" in sql
        assert table_name in sql

    @pytest.mark.parametrize("table_name", ALL_TABLES)
    def test_indexes_compile(self, table_name: str) -> None:
        for index in table(table_name).indexes:
            sql = str(CreateIndex(index).compile(dialect=postgresql.dialect()))
            assert "INDEX" in sql

    def test_tables_sort_into_a_valid_dependency_order(self) -> None:
        ordered = [t.name for t in Base.metadata.sorted_tables]

        # A cycle would make sorted_tables lose entries.
        assert len(ordered) == len(Base.metadata.tables)
        assert ordered[0] == TENANT_ROOT, "studio must be creatable first"


class TestBusinessInvariants:
    """Constraints the PRD depends on, asserted at the schema level."""

    def test_seats_cannot_be_negative(self) -> None:
        constraints = {c.name for c in table("session").constraints}
        assert "ck_session_seats_non_negative" in constraints

    def test_session_must_end_after_it_starts(self) -> None:
        constraints = {c.name for c in table("session").constraints}
        assert "ck_session_ends_after_start" in constraints

    def test_a_guest_cannot_hold_two_live_places_in_one_session(self) -> None:
        index = next(
            i for i in table("booking").indexes if i.name == "uq_booking_session_id_guest_id_active"
        )

        assert index.unique
        # Cancelled bookings are excluded so a guest can rebook after cancelling.
        assert "cancelled" in str(index.dialect_options["postgresql"]["where"])

    def test_duplicate_guest_detection_is_enforced_not_advisory(self) -> None:
        index_names = {i.name for i in table("guest").indexes}

        assert "uq_guest_studio_id_phone" in index_names
        assert "uq_guest_studio_id_email" in index_names

        for name in ("uq_guest_studio_id_phone", "uq_guest_studio_id_email"):
            index = next(i for i in table("guest").indexes if i.name == name)
            assert index.unique
            # Partial, so many contact-less guests can coexist per studio.
            assert index.dialect_options["postgresql"]["where"] is not None

    def test_pending_reminders_have_a_partial_index(self) -> None:
        # The worker polls this constantly; a full scan would not hold up.
        index_names = {i.name for i in table("scheduled_message").indexes}
        assert "ix_scheduled_message_due" in index_names

    def test_class_type_deletion_is_restricted(self) -> None:
        # Deleting a class type with historical sessions must fail loudly
        # rather than cascade away the host's history.
        fk = next(iter(table("session").columns["class_type_id"].foreign_keys))
        assert fk.ondelete == "RESTRICT"
