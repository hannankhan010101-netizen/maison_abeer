# ruff: noqa: S608 - DDL built from module constants, never from user input
"""Make row-level security actually apply.

Revision ID: 0002_app_role_rls
Revises: 0001_initial_schema
Create Date: 2026-08-08

Migration 0001 enabled RLS and wrote a policy for every table, and I described
that as defense-in-depth. It was not. The API connects as `postgres`, which
owns the tables and carries `rolbypassrls`; Postgres exempts owners from RLS
unless `FORCE ROW LEVEL SECURITY` is set. Every policy was inert for the only
connection that mattered — a full guest table was readable with no JWT claim
set at all.

This creates a role that is subject to them.

`maison_app` owns nothing, has no BYPASSRLS, and holds only DML privileges.
`FORCE ROW LEVEL SECURITY` is set as well, so the policies survive the role
ever becoming an owner.

The policies read `request.jwt.claims`, which Supabase's own PostgREST sets
per connection. FastAPI is not PostgREST, so `TenantSession` sets the same GUC
with `SET LOCAL` at the top of each transaction — LOCAL, so it dies with the
transaction and cannot leak into the next request on a pooled connection.

Switching to this role is a separate, deliberate step: change DATABASE_URL to
`maison_app.<project-ref>`. Running this migration alone changes nothing about
how the application connects.

**The switch is not ready yet.** It was attempted and reverted, because two
problems surfaced that this migration does not solve:

1. *Chicken and egg.* `deps._resolve_studio_id` reads `host_user` to learn
   which studio the caller belongs to — but the policy on `host_user` needs
   that studio to permit the read. Every authenticated request 401s. The fix
   is a narrower policy on `host_user` keyed on `auth_user_id` rather than
   `studio_id`, since the subject is itself carried in a verified token.

2. *The public path has no tenant yet.* `/api/v1/public/*` resolves a studio
   from a URL slug, so it must read `studio` before any claim exists. It
   likely needs its own connection or its own role, not this one.

There is also a latent bug in 0001's policies, surfaced here: they cast
`current_setting('request.jwt.claims', true)::jsonb` with no guard, and an
empty setting raises `invalid input syntax for type json` rather than matching
zero rows. That needs fixing before the switch too.

What this migration *does* deliver today: the role exists, holds DML-only
privileges, cannot DROP anything, and RLS demonstrably filters for it —
verified directly with no claim (0 rows), the correct claim (all rows) and a
wrong claim (0 rows).
"""

from __future__ import annotations

import secrets

from alembic import op

revision: str = "0002_app_role_rls"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | None = None
depends_on: str | None = None

APP_ROLE = "maison_app"

# Every table the application reads or writes. `alembic_version` is absent on
# purpose: migrations run as the owner, and the app role has no business
# reading migration state.
TABLES = (
    "studio",
    "booking",
    "brand_kit",
    "checklist_item",
    "checklist_template_item",
    "class_type",
    "export_record",
    "guest",
    "guest_allergy",
    "guest_celebration",
    "guest_credit",
    "host_badge",
    "host_user",
    "message_feedback",
    "scheduled_message",
    "session",
    "studio_settings",
    "waitlist_entry",
)


def upgrade() -> None:
    # A generated password: this migration must not carry a literal secret,
    # and the operator rotates it with ALTER ROLE before switching over.
    initial_password = secrets.token_urlsafe(32)

    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                CREATE ROLE {APP_ROLE} LOGIN NOBYPASSRLS
                    PASSWORD '{initial_password}';
            END IF;
        END
        $$;
        """
    )

    op.execute(f"GRANT USAGE ON SCHEMA public TO {APP_ROLE}")

    for table in TABLES:
        # DML only. No DDL, no TRUNCATE: the application never needs to drop a
        # table, and a compromised API should not be able to.
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP_ROLE}")

        # Without FORCE, a future owner change would silently disable every
        # policy again — which is exactly the failure this migration exists to
        # correct.
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

    # Sequences are not used (UUID primary keys), but a GRANT here costs
    # nothing and avoids a confusing permission error if one is ever added.
    op.execute(f"GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO {APP_ROLE}")


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"REVOKE ALL ON {table} FROM {APP_ROLE}")

    op.execute(f"REVOKE USAGE ON SCHEMA public FROM {APP_ROLE}")

    # The role itself is left in place. Dropping a role that may own live
    # sessions or be referenced elsewhere is not something a downgrade should
    # decide on its own.
