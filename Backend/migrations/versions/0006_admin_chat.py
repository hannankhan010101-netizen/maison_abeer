"""Pinned banners and broadcasts.

Revision ID: 0006_admin_chat
Revises: 0005_chat
Create Date: 2026-08-11

Phase 3 of the Communication Hub, the host's half.

`chat_banner` is unique on `room_id` — one pinned announcement per room,
enforced by the database rather than by the application remembering to replace
rather than insert.

`broadcast` is its own row rather than something inferred from the messages it
produced. The host needs to know they sent it once, to how many rooms, and
when; counting `chat_message` rows tagged `is_broadcast` would lose that the
moment one of them is deleted.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0006_admin_chat"
down_revision: str | None = "0005_chat"
branch_labels: str | None = None
depends_on: str | None = None

TENANT_TABLES = ("chat_banner", "broadcast")


def upgrade() -> None:
    op.create_table(
        "broadcast",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("room_count", sa.Integer(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("studio_id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["studio_id"],
            ["studio.id"],
            name=op.f("fk_broadcast_studio_id_studio"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_broadcast")),
    )
    op.create_index(op.f("ix_broadcast_studio_id"), "broadcast", ["studio_id"], unique=False)
    op.create_table(
        "chat_banner",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("room_id", sa.UUID(), nullable=False),
        sa.Column("body", sa.String(length=280), nullable=False),
        sa.Column("studio_id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["room_id"],
            ["chat_room.id"],
            name=op.f("fk_chat_banner_room_id_chat_room"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["studio_id"],
            ["studio.id"],
            name=op.f("fk_chat_banner_studio_id_studio"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_chat_banner")),
        sa.UniqueConstraint("room_id", name="uq_chat_banner_room_id"),
    )
    op.create_index(op.f("ix_chat_banner_studio_id"), "chat_banner", ["studio_id"], unique=False)
    # ### end Alembic commands ###

    for table in TENANT_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO maison_app")
        op.execute(
            f"""
            CREATE POLICY {table}_isolation ON {table}
            USING (studio_id = public.app_studio_id())
            WITH CHECK (studio_id = public.app_studio_id())
            """
        )


def downgrade() -> None:
    op.drop_table("broadcast")
    op.drop_table("chat_banner")
