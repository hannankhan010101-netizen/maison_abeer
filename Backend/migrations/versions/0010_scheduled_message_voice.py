"""Record which voice each queued message was written in.

A reschedule has to re-render the bodies it re-anchors, and the studio
default is not necessarily what produced them — queueing accepts a one-off
voice override. Without this column, re-anchoring would silently rewrite a
guest's message in a tone the host never previewed.

Existing rows are backfilled from their studio's current default, which is
the best available answer for messages queued before the column existed.

Revision ID: 0010_scheduled_message_voice
Revises: 0009_waitlist_zero_based
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0010_scheduled_message_voice"
down_revision = "0009_waitlist_zero_based"
branch_labels = None
depends_on = None

# Created by 0001; referenced, not re-created.
VOICE = sa.Enum(
    "soft_sweet",
    "chaotic_bestie",
    "clean_minimal",
    name="voicepreset",
    create_type=False,
)


def upgrade() -> None:
    op.add_column(
        "scheduled_message",
        sa.Column("voice", VOICE, nullable=False, server_default="soft_sweet"),
    )

    # Their studio's default is the closest thing to what they were written
    # in. A studio with no settings row keeps the column default.
    op.execute(
        """
        UPDATE scheduled_message AS m
        SET voice = s.default_voice
        FROM studio_settings AS s
        WHERE s.studio_id = m.studio_id
        """
    )

    # The default was for the backfill only; new rows say it explicitly.
    op.alter_column("scheduled_message", "voice", server_default=None)


def downgrade() -> None:
    op.drop_column("scheduled_message", "voice")
