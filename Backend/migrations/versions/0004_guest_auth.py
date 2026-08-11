"""Let a guest claim an account.

Revision ID: 0004_guest_auth
Revises: 0003_workable_rls_policies
Create Date: 2026-08-11

Until now the app had exactly one kind of user. Guests were records — a name
and a phone number — with no way to sign in. This adds the link between a
`guest` row and a Supabase identity, which everything in the guest portal
depends on.

Both columns are nullable, and that is the point: most guests are added by the
host from a DM or a phone call and will never log in. Those records must keep
working exactly as they do today.

`auth_user_id` is unique globally rather than per studio. One Supabase identity
claiming guest records in two studios would let a single login read two
studios' data, which is the tenancy boundary this whole application is built
around.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_guest_auth"
down_revision: str | None = "0003_workable_rls_policies"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "guest",
        sa.Column("auth_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("guest", sa.Column("display_name", sa.String(length=60), nullable=True))

    # Unique across every studio, not within one.
    op.create_index(
        "uq_guest_auth_user_id",
        "guest",
        ["auth_user_id"],
        unique=True,
        postgresql_where=sa.text("auth_user_id IS NOT NULL"),
    )

    # A guest signing in must be able to find their own row before any studio
    # is known — the same bootstrap problem `host_user` has, solved the same
    # way. Without this the portal cannot resolve who is calling.
    op.execute(
        """
        DROP POLICY IF EXISTS guest_isolation ON guest;

        CREATE POLICY guest_isolation ON guest
        USING (
            studio_id = public.app_studio_id()
            OR auth_user_id = NULLIF(public.app_claims() ->> 'sub', '')::uuid
        )
        WITH CHECK (studio_id = public.app_studio_id());
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP POLICY IF EXISTS guest_isolation ON guest;

        CREATE POLICY guest_isolation ON guest
        USING (studio_id = public.app_studio_id())
        WITH CHECK (studio_id = public.app_studio_id());
        """
    )

    op.drop_index("uq_guest_auth_user_id", table_name="guest")
    op.drop_column("guest", "display_name")
    op.drop_column("guest", "auth_user_id")
