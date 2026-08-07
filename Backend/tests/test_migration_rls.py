"""The initial migration must cover every tenant table with RLS.

The policy list in `0001_initial_schema` is written out by hand, because a
migration has to stay a frozen snapshot of the schema at that revision -- it
cannot read `Base.metadata`, or it would silently change meaning as the models
evolve.

That leaves a gap this module closes: add a nineteenth model with a
`studio_id`, and nothing else in the codebase notices that no policy was ever
written for it. The table would be readable across every tenant, and the API's
own scoping is the only thing standing in the way. These tests fail the moment
that happens.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.models import Base

MIGRATION = (
    Path(__file__).resolve().parents[1] / "migrations" / "versions" / "0001_initial_schema.py"
)

SOURCE = MIGRATION.read_text(encoding="utf-8")

# The tenant root scopes on `id`; every other table scopes on `studio_id`.
TENANT_ROOT = "studio"


def _declared_tenant_tables() -> set[str]:
    block = re.search(r"TENANT_TABLES = \((.*?)\)", SOURCE, re.S)
    assert block is not None, "TENANT_TABLES tuple not found in the migration"
    return set(re.findall(r'"([a-z_]+)"', block.group(1)))


def _model_tenant_tables() -> set[str]:
    return {table.name for table in Base.metadata.sorted_tables if "studio_id" in table.columns}


def test_every_tenant_model_has_a_policy() -> None:
    missing = _model_tenant_tables() - _declared_tenant_tables()
    assert not missing, (
        f"tables carry studio_id but no RLS policy: {sorted(missing)}. "
        f"Add them to TENANT_TABLES in {MIGRATION.name}."
    )


def test_no_policy_for_a_table_that_does_not_exist() -> None:
    """A stale entry would fail at migration time, on a real deploy."""
    known = {table.name for table in Base.metadata.sorted_tables}
    unknown = _declared_tenant_tables() - known
    assert not unknown, f"TENANT_TABLES names tables that do not exist: {sorted(unknown)}"


def test_the_tenant_root_is_not_scoped_by_studio_id() -> None:
    """`studio` has no studio_id column; its policy compares `id`."""
    assert TENANT_ROOT not in _declared_tenant_tables()
    assert "studio_id" not in Base.metadata.tables[TENANT_ROOT].columns
    assert "CREATE POLICY studio_tenant_isolation ON studio" in SOURCE


def test_row_level_security_is_enabled_for_every_table() -> None:
    enabled = set(re.findall(r"ALTER TABLE ([a-z_]+) ENABLE ROW LEVEL SECURITY", SOURCE))
    # The loop covers the tenant tables; `studio` is enabled on its own line.
    assert TENANT_ROOT in enabled
    assert 'f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"' in SOURCE

    all_tables = {table.name for table in Base.metadata.sorted_tables}
    assert _declared_tenant_tables() | {TENANT_ROOT} == all_tables
