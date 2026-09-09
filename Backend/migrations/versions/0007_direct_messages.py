"""Private threads between the host and one guest.

Two changes: a third `chat_room_kind` value, and the column that says which
guest a private room belongs to.

`guest_id` carries the authorisation for a DM. It is not derived from
`chat_membership`, because those rows are created lazily when someone first
opens a room — permission inferred from them would be granted by the very act
of asking for it.

Revision ID: 0007_direct_messages
Revises: 0006_admin_chat
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007_direct_messages"
down_revision = "0006_admin_chat"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # `chatroomkind`, not `chat_room_kind` — SQLAlchemy names the type after
    # the Python class, lowercased, with no separators.
    #
    # The label is the enum *value*, not the member name. Getting that
    # backwards has bitten this schema twice: the existing labels are
    # 'workshop' and 'lounge', so a partial index written against 'DIRECT'
    # would compile happily and then match nothing, forever.
    op.execute("ALTER TYPE chatroomkind ADD VALUE IF NOT EXISTS 'direct'")

    # Postgres will not let a new enum label be used in the same transaction
    # that added it. Alembic runs migrations in one, so the commit is
    # explicit — without it the index below fails with "unsafe use of new
    # value of enum type".
    op.execute("COMMIT")

    op.add_column(
        "chat_room",
        sa.Column("guest_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_chat_room_guest_id",
        "chat_room",
        "guest",
        ["guest_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_chat_room_guest_id", "chat_room", ["guest_id"])

    # One private thread per guest, as a database fact.
    op.create_index(
        "uq_chat_room_direct_guest",
        "chat_room",
        ["studio_id", "guest_id"],
        unique=True,
        postgresql_where=sa.text("kind = 'direct'"),
    )


def downgrade() -> None:
    op.drop_index("uq_chat_room_direct_guest", table_name="chat_room")
    op.drop_index("ix_chat_room_guest_id", table_name="chat_room")
    op.drop_constraint("fk_chat_room_guest_id", "chat_room", type_="foreignkey")
    op.drop_column("chat_room", "guest_id")

    # The enum label is deliberately left in place. Removing a value from a
    # Postgres enum means rebuilding the type and every column using it, and
    # a leftover label nothing writes is harmless — whereas that rebuild, run
    # against a live table, is not.
