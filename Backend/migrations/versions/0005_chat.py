"""Chat rooms, membership, messages and reactions.

Revision ID: 0005_chat
Revises: 0004_guest_auth
Create Date: 2026-08-11

Phase 2 of the Communication Hub. Four tables, every one tenant-scoped and
carrying the same RLS policy as everything since 0003.

Two shapes worth noting, because they are not obvious from the DDL:

* `chat_message.deleted_at` is a soft delete. Moderation needs a trail, and a
  hard delete would pull rows out from under a paging cursor mid-scroll.
* `chat_membership.last_read_at` is a timestamp, not a message id. Messages
  arrive out of order under concurrency, and a timestamp cannot end up
  pointing at a message that was later deleted.

`ChatRoomKind` lives in `models/enums.py` rather than beside the model, because
`Base.type_annotation_map` only scans that module. Declared anywhere else the
Postgres labels revert to member names — `LOUNGE` in the database against
`lounge` in the JSON — which is the fault that broke a partial index in 0001.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0005_chat"
down_revision: str | None = "0004_guest_auth"
branch_labels: str | None = None
depends_on: str | None = None

TENANT_TABLES = ("chat_room", "chat_membership", "chat_message", "message_reaction")


def upgrade() -> None:
    op.create_table(
        "chat_room",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.Enum("workshop", "lounge", name="chatroomkind"), nullable=False),
        sa.Column("session_id", sa.UUID(), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
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
            ["session_id"],
            ["session.id"],
            name=op.f("fk_chat_room_session_id_session"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["studio_id"],
            ["studio.id"],
            name=op.f("fk_chat_room_studio_id_studio"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_chat_room")),
        sa.UniqueConstraint("session_id", name="uq_chat_room_session_id"),
    )
    op.create_index(op.f("ix_chat_room_session_id"), "chat_room", ["session_id"], unique=False)
    op.create_index(op.f("ix_chat_room_studio_id"), "chat_room", ["studio_id"], unique=False)
    op.create_index(
        "uq_chat_room_studio_lounge",
        "chat_room",
        ["studio_id"],
        unique=True,
        postgresql_where="kind = 'lounge'",
    )
    op.create_table(
        "chat_membership",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("room_id", sa.UUID(), nullable=False),
        sa.Column("guest_id", sa.UUID(), nullable=False),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True),
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
            ["guest_id"],
            ["guest.id"],
            name=op.f("fk_chat_membership_guest_id_guest"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["room_id"],
            ["chat_room.id"],
            name=op.f("fk_chat_membership_room_id_chat_room"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["studio_id"],
            ["studio.id"],
            name=op.f("fk_chat_membership_studio_id_studio"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_chat_membership")),
        sa.UniqueConstraint("room_id", "guest_id", name="uq_chat_membership_room_guest"),
    )
    op.create_index(
        op.f("ix_chat_membership_guest_id"), "chat_membership", ["guest_id"], unique=False
    )
    op.create_index(
        op.f("ix_chat_membership_studio_id"), "chat_membership", ["studio_id"], unique=False
    )
    op.create_table(
        "chat_message",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("room_id", sa.UUID(), nullable=False),
        sa.Column("guest_id", sa.UUID(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_broadcast", sa.Boolean(), nullable=False),
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
            ["guest_id"],
            ["guest.id"],
            name=op.f("fk_chat_message_guest_id_guest"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["room_id"],
            ["chat_room.id"],
            name=op.f("fk_chat_message_room_id_chat_room"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["studio_id"],
            ["studio.id"],
            name=op.f("fk_chat_message_studio_id_studio"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_chat_message")),
    )
    op.create_index(op.f("ix_chat_message_guest_id"), "chat_message", ["guest_id"], unique=False)
    op.create_index(
        "ix_chat_message_room_created", "chat_message", ["room_id", "created_at"], unique=False
    )
    op.create_index(op.f("ix_chat_message_studio_id"), "chat_message", ["studio_id"], unique=False)
    op.create_table(
        "message_reaction",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("message_id", sa.UUID(), nullable=False),
        sa.Column("guest_id", sa.UUID(), nullable=False),
        sa.Column("emoji", sa.String(length=16), nullable=False),
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
            ["guest_id"],
            ["guest.id"],
            name=op.f("fk_message_reaction_guest_id_guest"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["message_id"],
            ["chat_message.id"],
            name=op.f("fk_message_reaction_message_id_chat_message"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["studio_id"],
            ["studio.id"],
            name=op.f("fk_message_reaction_studio_id_studio"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_message_reaction")),
        sa.UniqueConstraint("message_id", "guest_id", "emoji", name="uq_message_reaction_triple"),
    )
    op.create_index(
        op.f("ix_message_reaction_studio_id"), "message_reaction", ["studio_id"], unique=False
    )
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
    op.drop_table("message_reaction")
    op.drop_table("chat_message")
    op.drop_table("chat_membership")
    op.drop_table("chat_room")
    sa.Enum(name="chatroomkind").drop(op.get_bind(), checkfirst=True)
