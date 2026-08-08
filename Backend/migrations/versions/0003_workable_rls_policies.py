"""Rewrite the RLS policies so the application can actually run under them.

Revision ID: 0003_workable_rls_policies
Revises: 0002_app_role_rls
Create Date: 2026-08-08

0002 proved the policies filter correctly but could not be switched on. Three
things stood in the way, and this fixes all three.

**1. The cast was unguarded.** `current_setting('request.jwt.claims', true)`
returns an empty string, not NULL, once anything has touched it in the
session. `''::jsonb` raises `invalid input syntax for type json` — so an
unauthenticated read failed loudly instead of quietly matching nothing. A
`app_claims()` helper now returns an empty object for both NULL and ''.

**2. `host_user` was unreadable before the studio was known.** The API reads
`host_user` to *learn* which studio the caller belongs to, but its policy
required that studio. Every authenticated request 401'd.

The fix is a two-phase claim. The request first announces only `sub`, taken
from the verified token, and `host_user` is readable by `auth_user_id = sub`.
Once that yields a studio the claim is replaced with the full one. A caller
can therefore reach exactly one `host_user` row — their own — before proving
anything else, which is the minimum needed to bootstrap and no more.

**3. `studio` had to be readable with no claim at all.** The public booking
page resolves a studio from a URL slug before any tenant exists. `studio`
carries only a name and a slug, both of which the booking page already
displays to strangers, so SELECT is permitted unconditionally while INSERT,
UPDATE and DELETE still require the claim. Nothing sensitive hangs off the
row itself; the guests, sessions and settings that do are separate tables
with their own policies.
"""

from __future__ import annotations

from alembic import op

revision: str = "0003_workable_rls_policies"
down_revision: str | None = "0002_app_role_rls"
branch_labels: str | None = None
depends_on: str | None = None

TENANT_TABLES = (
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
    "message_feedback",
    "scheduled_message",
    "session",
    "studio_settings",
    "waitlist_entry",
)


def upgrade() -> None:
    # STABLE, not VOLATILE: the planner may then call it once per statement
    # rather than once per row, which matters on a policy applied to every
    # read. SECURITY INVOKER (the default) is deliberate — this must see the
    # caller's setting, not the definer's.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.app_claims()
        RETURNS jsonb
        LANGUAGE sql
        STABLE
        AS $$
            SELECT COALESCE(
                NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
                '{}'::jsonb
            )
        $$;
        """
    )
    op.execute("GRANT EXECUTE ON FUNCTION public.app_claims() TO PUBLIC")

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.app_studio_id()
        RETURNS uuid
        LANGUAGE sql
        STABLE
        AS $$
            SELECT NULLIF(public.app_claims() ->> 'studio_id', '')::uuid
        $$;
        """
    )
    op.execute("GRANT EXECUTE ON FUNCTION public.app_studio_id() TO PUBLIC")

    # -- studio: public metadata, private writes ----------------------------
    op.execute("DROP POLICY IF EXISTS studio_tenant_isolation ON studio")

    op.execute(
        """
        CREATE POLICY studio_readable ON studio
        FOR SELECT
        USING (true)
        """
    )
    op.execute(
        """
        CREATE POLICY studio_writable ON studio
        FOR ALL
        USING (id = public.app_studio_id())
        WITH CHECK (id = public.app_studio_id())
        """
    )

    # -- host_user: readable by its own subject, to bootstrap the claim -----
    op.execute("DROP POLICY IF EXISTS host_user_tenant_isolation ON host_user")

    op.execute(
        """
        CREATE POLICY host_user_isolation ON host_user
        USING (
            studio_id = public.app_studio_id()
            OR auth_user_id = NULLIF(public.app_claims() ->> 'sub', '')::uuid
        )
        WITH CHECK (studio_id = public.app_studio_id())
        """
    )

    # -- everything else: strictly the caller's studio ----------------------
    for table in TENANT_TABLES:
        op.execute(f"DROP POLICY IF EXISTS {table}_tenant_isolation ON {table}")
        op.execute(
            f"""
            CREATE POLICY {table}_isolation ON {table}
            USING (studio_id = public.app_studio_id())
            WITH CHECK (studio_id = public.app_studio_id())
            """
        )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS studio_readable ON studio")
    op.execute("DROP POLICY IF EXISTS studio_writable ON studio")
    op.execute(
        """
        CREATE POLICY studio_tenant_isolation ON studio
        USING (id = (current_setting('request.jwt.claims', true)::jsonb
                     ->> 'studio_id')::uuid)
        """
    )

    op.execute("DROP POLICY IF EXISTS host_user_isolation ON host_user")

    for table in (*TENANT_TABLES, "host_user"):
        op.execute(f"DROP POLICY IF EXISTS {table}_isolation ON {table}")
        op.execute(
            f"""
            CREATE POLICY {table}_tenant_isolation ON {table}
            USING (studio_id = (current_setting('request.jwt.claims', true)::jsonb
                                ->> 'studio_id')::uuid)
            """
        )

    op.execute("DROP FUNCTION IF EXISTS public.app_studio_id()")
    op.execute("DROP FUNCTION IF EXISTS public.app_claims()")
