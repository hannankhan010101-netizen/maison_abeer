"""Renumber waitlist queues to the 0-based convention the domain uses.

`normalise_positions` renumbers live entries with `enumerate(live)`, so
storage is 0-based and every guest-facing surface adds one. The public
booking endpoint wrote `max(position) + 1` instead — 1-based, and counting
withdrawn and expired rows, which keep their old numbers. Rows it inserted
are therefore one too high, and now that the read path adds one they would
read two too high.

This renumbers the live entries of every session by their current order and
leaves settled rows alone, exactly as `normalise_positions` does. It is
order-preserving: nobody moves up or down the queue, the numbers just become
consistent.

Revision ID: 0009_waitlist_positions_zero_based
Revises: 0008_workshop_content
"""

from __future__ import annotations

from alembic import op

revision = "0009_waitlist_positions_zero_based"
down_revision = "0008_workshop_content"
branch_labels = None
depends_on = None

LIVE = ("waiting", "invited")


def upgrade() -> None:
    # No unique index on (session_id, position), so this can be a single
    # statement without a collision dance.
    op.execute(
        """
        WITH ranked AS (
            SELECT
                id,
                row_number() OVER (
                    PARTITION BY session_id
                    ORDER BY position, created_at, id
                ) - 1 AS zero_based
            FROM waitlist_entry
            WHERE status IN ('waiting', 'invited')
        )
        UPDATE waitlist_entry AS w
        SET position = ranked.zero_based
        FROM ranked
        WHERE w.id = ranked.id
          AND w.position <> ranked.zero_based
        """
    )


def downgrade() -> None:
    # Deliberately not reversible. The old data was inconsistent by session —
    # some queues 0-based from `normalise_positions`, some 1-based from the
    # public endpoint — so there is no single numbering to restore. Going back
    # means re-running this migration's forward step after a code rollback.
    pass
