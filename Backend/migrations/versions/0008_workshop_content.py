"""Content for the public booking page: a studio story and photo, and a
photo per class type.

The public page had no way to show what a workshop actually looks like —
there was no photo field anywhere in the schema. `logo_url` on `brand_kit`
already proved the pattern (a plain pasted URL, no upload infrastructure):
this extends it rather than inventing a new one.

Revision ID: 0008_workshop_content
Revises: 0007_direct_messages
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0008_workshop_content"
down_revision = "0007_direct_messages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("brand_kit", sa.Column("hero_photo_url", sa.String(length=500), nullable=True))
    op.add_column("brand_kit", sa.Column("story", sa.String(length=600), nullable=True))
    op.add_column("class_type", sa.Column("photo_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("class_type", "photo_url")
    op.drop_column("brand_kit", "story")
    op.drop_column("brand_kit", "hero_photo_url")
