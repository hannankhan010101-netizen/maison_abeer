"""Studio settings and brand kit endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import Db
from app.models.studio import BrandKit, StudioSettings
from app.schemas.settings import BrandKitRead, BrandKitUpdate, SettingsRead, SettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


def _settings_row(db: Db) -> StudioSettings:
    """The studio's settings, created on first read.

    A studio always has settings conceptually; materialising them lazily means
    signup does not have to remember to.
    """
    rows = db.scalars(db.query(StudioSettings))

    if rows:
        return rows[0]

    row = StudioSettings()
    db.add(row)
    db.flush()

    return row


def _brand_kit_row(db: Db) -> BrandKit:
    rows = db.scalars(db.query(BrandKit))

    if rows:
        return rows[0]

    row = BrandKit()
    db.add(row)
    db.flush()

    return row


@router.get("", response_model=SettingsRead)
def get_settings_(db: Db) -> StudioSettings:
    return _settings_row(db)


@router.patch("", response_model=SettingsRead)
def update_settings(payload: SettingsUpdate, db: Db) -> StudioSettings:
    row = _settings_row(db)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)

    db.flush()
    return row


@router.get("/brand-kit", response_model=BrandKitRead)
def get_brand_kit(db: Db) -> BrandKit:
    return _brand_kit_row(db)


@router.patch("/brand-kit", response_model=BrandKitRead)
def update_brand_kit(payload: BrandKitUpdate, db: Db) -> BrandKit:
    row = _brand_kit_row(db)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)

    db.flush()
    return row
