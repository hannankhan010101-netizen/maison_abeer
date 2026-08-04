# Maison Abeer

> your studio bestie ✨

Admin portal for independent creative-workshop hosts — pottery, bento cake decorating and
ceramic painting studios. Replaces the spreadsheet-and-chat-thread patchwork with one warm,
mobile-first tool that remembers the operational detail so the host can focus on hosting.

Specified in [`prd_creative_workshop_admin_portal.pdf`](./prd_creative_workshop_admin_portal.pdf).
Visual source of truth is [`creative-workshop-portal-design.html`](./creative-workshop-portal-design.html)
— open it in a browser; it contains a self-documenting style-guide screen.

## Stack

| Layer | Technology |
|---|---|
| Web | Next.js 15 · App Router · TypeScript · Tailwind v4 |
| API | Python 3.12 · FastAPI · SQLAlchemy 2.0 · Alembic |
| Data | Supabase Postgres |
| Auth | Supabase Auth (JWT verified by the API) |

The browser authenticates against Supabase and then talks **only** to the FastAPI gateway.
See [ADR 0001](./docs/adr/0001-architecture.md) for why.

## Layout

```
Frontend/       the admin portal
Backend/        the API and scheduled worker
LandingPage/    marketing site (pass 3)
packages/       shared TypeScript packages
docs/adr/       architecture decision records
```

## Getting started

You need a free [Supabase](https://supabase.com) project.

```bash
# 1. Backend
cd Backend
python -m venv .venv
.venv/Scripts/activate          # Windows;  source .venv/bin/activate on macOS/Linux
pip install -e ".[dev]"
cp .env.example .env            # fill in your Supabase values
alembic upgrade head
uvicorn app.main:create_app --factory --reload   # http://localhost:8000 · docs at /docs

# 2. Frontend
cd ../Frontend
cp .env.example .env.local      # fill in your Supabase values
npm install                     # from the repo root
npm run dev                     # http://localhost:3000
```

## Checks

```bash
cd Backend  && ruff check . && mypy app && pytest
cd Frontend && npm run lint && npm run typecheck && npm run test
```

CI runs all of the above on every push.

## Accessibility

The palette is ported from the prototype with contrast corrected to the PRD's WCAG 2.1 AA
requirement without altering a single fill colour — see [ADR 0002](./docs/adr/0002-design-system-contrast.md).
A contrast validator runs as a unit test so the palette cannot regress.
