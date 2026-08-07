"""Seed a studio with a signed-in host and a plausible week of work.

Run with:

    python -m app.cli.seed --email you@example.com --password 'something long'

Idempotent by design. Every row is looked up by a natural key before it is
created, so re-running converges on the same state rather than stacking
duplicates -- which is what makes this usable as a reset during development
rather than a one-shot.

The auth user is created through Supabase's admin API, because `auth.users`
is Supabase-managed and must not be written to directly: the trigger that
provisions identities and the encrypted-password format are both internal.
The application row that matters is `host_user`, which maps the Supabase
`sub` claim onto a `studio_id` -- the single link that makes tenancy work.
"""

from __future__ import annotations

import argparse
import sys
import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import TYPE_CHECKING, Any

import httpx
from sqlalchemy import select

from app.core.config import Settings, get_settings
from app.core.db import get_session_factory, reset_engine
from app.models import (
    Base,
    Booking,
    BrandKit,
    ChecklistTemplateItem,
    ClassType,
    Guest,
    GuestAllergy,
    GuestCredit,
    HostUser,
    Studio,
    StudioSettings,
)
from app.models import (
    Session as SessionModel,
)
from app.models.enums import (
    AllergySeverity,
    BookingStatus,
    ChecklistPhase,
    CraftKind,
    CreditStatus,
    EmojiDensity,
    MessageChannel,
    SessionStatus,
    VoicePreset,
)

if TYPE_CHECKING:
    from sqlalchemy.orm import Session as SASession

STUDIO_NAME = "Maison Abeer"
STUDIO_SLUG = "maison-abeer"


# ---------------------------------------------------------------------------
# Supabase auth
# ---------------------------------------------------------------------------


def ensure_auth_user(settings: Settings, email: str, password: str) -> uuid.UUID:
    """Create (or find) the Supabase auth user and return its id.

    `email_confirm=True` skips the confirmation mail: this is a seeded
    development account and nobody is going to click a link for it.
    """
    base = str(settings.supabase_url).rstrip("/")
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=30) as client:
        created = client.post(
            f"{base}/auth/v1/admin/users",
            headers=headers,
            json={"email": email, "password": password, "email_confirm": True},
        )

        if created.status_code in (200, 201):
            return uuid.UUID(created.json()["id"])

        # Already there: find it and reset the password, so a re-run with a
        # different password still leaves you able to sign in.
        listed = client.get(
            f"{base}/auth/v1/admin/users",
            headers=headers,
            params={"page": 1, "per_page": 200},
        )
        listed.raise_for_status()

        for user in listed.json().get("users", []):
            if user.get("email", "").lower() == email.lower():
                user_id = uuid.UUID(user["id"])
                client.put(
                    f"{base}/auth/v1/admin/users/{user_id}",
                    headers=headers,
                    json={"password": password, "email_confirm": True},
                ).raise_for_status()
                return user_id

        created.raise_for_status()
        raise RuntimeError("could not create or find the auth user")


# ---------------------------------------------------------------------------
# Application rows
# ---------------------------------------------------------------------------


def _get_or_create[RowT: Base](
    db: SASession,
    model: type[RowT],
    defaults: dict[str, Any],
    **lookup: Any,
) -> RowT:
    """Fetch by natural key, or insert. This is what makes the seed re-runnable."""
    # A key in both places reaches the model constructor twice and raises a
    # TypeError only once that branch is actually hit -- which, for an
    # idempotent seeder, may be the second run rather than the first.
    overlap = lookup.keys() & defaults.keys()
    if overlap:
        raise ValueError(f"{model.__name__}: {sorted(overlap)} given as both lookup and default")

    existing = db.execute(select(model).filter_by(**lookup)).scalar_one_or_none()
    if existing is not None:
        return existing

    row = model(**lookup, **defaults)
    db.add(row)
    db.flush()
    return row


def seed_studio(db: SASession, auth_user_id: uuid.UUID, email: str) -> Studio:
    studio = _get_or_create(db, Studio, {"name": STUDIO_NAME}, slug=STUDIO_SLUG)

    _get_or_create(
        db,
        HostUser,
        {
            "studio_id": studio.id,
            "email": email,
            "display_name": "Abeer",
            "is_owner": True,
        },
        auth_user_id=auth_user_id,
    )

    _get_or_create(
        db,
        StudioSettings,
        {
            "timezone": "Asia/Karachi",
            "quiet_hours_start": time(9, 0),
            "quiet_hours_end": time(21, 0),
            "weekly_class_cap": 4,
            "rest_days": [7],
            "default_voice": VoicePreset.SOFT_SWEET,
            "emoji_density": EmojiDensity.FULL,
            "show_greeting": True,
        },
        studio_id=studio.id,
    )

    _get_or_create(
        db,
        BrandKit,
        {"instagram_handle": "maisonabeer"},
        studio_id=studio.id,
    )

    return studio


CLASS_TYPES = [
    ("Bento cake decorating", CraftKind.BENTO_CAKE, "pink", 10, 150),
    ("Pottery & wheel throwing", CraftKind.POTTERY, "terra", 8, 120),
    ("Ceramic painting", CraftKind.CERAMIC_PAINTING, "sage", 12, 120),
]

# (text template, hours before, phase, high priority)
CHECKLIST_TEMPLATE = [
    ("Bake {seats + 2} cake bases", 24.0, ChecklistPhase.PREP, True),
    ("Make buttercream · {seats // 4 + 1} batches", 24.0, ChecklistPhase.PREP, False),
    ("Mix pastel piping bags ×{seats}", 4.0, ChecklistPhase.PREP, False),
    ("Set out the sprinkle bar", 1.0, ChecklistPhase.PREP, False),
    ("Wash piping tips", -2.0, ChecklistPhase.POST_CLASS, False),
    ("Restock aprons", -2.0, ChecklistPhase.POST_CLASS, False),
]


def seed_class_types(db: SASession, studio: Studio) -> dict[str, ClassType]:
    result: dict[str, ClassType] = {}

    for name, craft, colour, seats, minutes in CLASS_TYPES:
        class_type = _get_or_create(
            db,
            ClassType,
            {
                "craft": craft,
                "color_token": colour,
                "default_seats": seats,
                "default_duration_minutes": minutes,
            },
            studio_id=studio.id,
            name=name,
        )
        result[name] = class_type

    bento = result["Bento cake decorating"]
    for position, (text, hours, phase, urgent) in enumerate(CHECKLIST_TEMPLATE):
        _get_or_create(
            db,
            ChecklistTemplateItem,
            {
                "studio_id": studio.id,
                "hours_before": hours,
                "phase": phase,
                "is_high_priority": urgent,
                "position": position,
            },
            class_type_id=bento.id,
            text=text,
        )

    return result


# (name, phone, visits, birthday offset in days, memory note)
GUESTS = [
    ("Sana R.", "03001111111", 4, None, "Brought her mum last time · loved the matcha buttercream"),
    ("Ayesha K.", "03002222222", 2, 4, "Surprise from her sister — bring the candle"),
    ("Meerab A.", "03003333333", 1, None, "Found you on Instagram"),
    ("Fatima N.", "03004444444", 3, None, "Sits with Sana, always early"),
    ("Zainab T.", None, 1, None, "Added from a DM — no number yet"),
    ("Hira S.", "03006666666", 0, None, None),
]


def seed_guests(db: SASession, studio: Studio, today: date) -> dict[str, Guest]:
    result: dict[str, Guest] = {}

    for name, phone, visits, birthday_in, note in GUESTS:
        guest = _get_or_create(
            db,
            Guest,
            {
                "phone": phone,
                "preferred_channel": MessageChannel.WHATSAPP,
                "visit_count": visits,
                "birthday": today + timedelta(days=birthday_in) if birthday_in else None,
                "memory_note": note,
            },
            studio_id=studio.id,
            full_name=name,
        )
        result[name] = guest

    # Ayesha's nut allergy is the one that must reach the dashboard.
    _get_or_create(
        db,
        GuestAllergy,
        {
            "studio_id": studio.id,
            "severity": AllergySeverity.SEVERE,
            "notes": "No traces, please",
        },
        guest_id=result["Ayesha K."].id,
        label="Nut allergy",
    )

    # Zainab holds a rain-check credit from a cancelled class.
    _get_or_create(
        db,
        GuestCredit,
        {
            "studio_id": studio.id,
            "status": CreditStatus.AVAILABLE,
            "note": "Rain check from the cancelled April class",
        },
        guest_id=result["Zainab T."].id,
    )

    return result


def seed_sessions(
    db: SASession,
    studio: Studio,
    class_types: dict[str, ClassType],
    guests: dict[str, Guest],
    now: datetime,
) -> list[SessionModel]:
    """A week that looks lived-in: one past, one nearly full, one sold out."""

    def at(day_offset: int, hour: int, minute: int = 0) -> datetime:
        return (now + timedelta(days=day_offset)).replace(
            hour=hour, minute=minute, second=0, microsecond=0
        )

    plan = [
        ("Bento cake decorating", -2, 14, 150, 10, SessionStatus.COMPLETED, "Studio A"),
        ("Bento cake decorating", 2, 14, 150, 10, SessionStatus.SCHEDULED, "Studio A"),
        ("Pottery & wheel throwing", 4, 18, 120, 8, SessionStatus.LOCKED, "Studio B"),
        ("Ceramic painting", 6, 17, 120, 12, SessionStatus.SCHEDULED, "Studio A"),
    ]

    created: list[SessionModel] = []
    for class_name, offset, hour, minutes, seats, status, location in plan:
        starts = at(offset, hour)
        session = _get_or_create(
            db,
            SessionModel,
            {
                "class_type_id": class_types[class_name].id,
                "ends_at": starts + timedelta(minutes=minutes),
                "seats": seats,
                "status": status,
                "location": location,
            },
            studio_id=studio.id,
            starts_at=starts,
        )
        created.append(session)

    # Bookings on the upcoming bento class: two unassigned, so the dashboard's
    # "guests need a table" nudge has something to point at.
    upcoming = created[1]
    roster = [
        ("Sana R.", 2, None),
        ("Ayesha K.", 2, "With her sister"),
        ("Fatima N.", 1, "Sits with Sana"),
        ("Meerab A.", None, None),
        ("Zainab T.", None, None),
    ]

    for guest_name, table, note in roster:
        _get_or_create(
            db,
            Booking,
            {
                "studio_id": studio.id,
                "status": BookingStatus.CONFIRMED,
                "table_number": table,
                "sit_with_note": note,
            },
            session_id=upcoming.id,
            guest_id=guests[guest_name].id,
        )

    # The sold-out pottery class: fill every seat so capacity state is real.
    pottery = created[2]
    for guest_name in list(guests)[: pottery.seats]:
        _get_or_create(
            db,
            Booking,
            {
                "studio_id": studio.id,
                "status": BookingStatus.CONFIRMED,
                "table_number": None,
            },
            session_id=pottery.id,
            guest_id=guests[guest_name].id,
        )

    return created


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Seed a studio you can sign into.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args(argv)

    settings = get_settings()

    if settings.is_production:
        print("refusing to seed a production environment", file=sys.stderr)
        return 2

    print(f"auth user for {args.email} …")
    auth_user_id = ensure_auth_user(settings, args.email, args.password)
    print(f"  sub = {auth_user_id}")

    now = datetime.now(UTC)
    factory = get_session_factory()

    try:
        with factory() as db:
            studio = seed_studio(db, auth_user_id, args.email)
            class_types = seed_class_types(db, studio)
            guests = seed_guests(db, studio, now.date())
            sessions = seed_sessions(db, studio, class_types, guests, now)
            db.commit()

            print(f"  studio      {studio.id}")
            print(f"  class types {len(class_types)}")
            print(f"  guests      {len(guests)}")
            print(f"  sessions    {len(sessions)}")
    finally:
        reset_engine()

    print("\nSeeded. Sign in with the email and password above.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
