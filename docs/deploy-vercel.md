# Deploying to Vercel

Two Vercel projects from one repository. They are separate projects, not one
with two builders, because they have different runtimes, different build
commands and different environment variables — and because a frontend rollback
should not roll the API back with it.

| Project            | Root directory | Runtime                   |
| ------------------ | -------------- | ------------------------- |
| `maison-abeer-web` | `Frontend`     | Next.js                   |
| `maison-abeer-api` | `Backend`      | Python (`@vercel/python`) |

---

## 1. The API project

**Root directory:** `Backend`

Vercel finds `api/index.py`, which exposes the ASGI app, and `vercel.json`
rewrites every path to it. Without that rewrite only `/api/index` resolves and
every real route 404s.

### Environment variables

| Variable                    | Value                             | Notes                                  |
| --------------------------- | --------------------------------- | -------------------------------------- |
| `SUPABASE_URL`              | `https://<ref>.supabase.co`       | JWKS is derived from this              |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_…`                     | Server-side only                       |
| `DATABASE_URL`              | transaction pooler, **port 6543** | See below                              |
| `ENVIRONMENT`               | `production`                      | Disables `/docs` and `/openapi.json`   |
| `CORS_ORIGINS`              | the web project's domain          | Comma-separated, no JSON               |
| `DB_SERVERLESS`             | `true`                            | **Required.** See below                |
| `CRON_SECRET`               | a long random string              | Must match the project's `CRON_SECRET` |
| `LOG_LEVEL`                 | `INFO`                            |                                        |

### Why the transaction pooler, and why `DB_SERVERLESS`

A serverless function handles one request and freezes. A connection pool it
holds is dead weight the database still counts against `max_connections`;
enough concurrent invocations and the project stops accepting connections at
all — including from the dashboard.

`DB_SERVERLESS=true` switches the engine to `NullPool` and disables psycopg's
prepared statements. Both are required with the transaction pooler, which
hands each statement to a different backend: a cached plan will not be there,
and you get `prepared statement "_pg3_0" does not exist` — under load only,
which is the worst way to find out.

Use port **6543** (transaction), not 5432 (session), for this project.

> Migrations are the exception. `alembic upgrade head` needs prepared
> statements, so run it against the **session** pooler on 5432 from your
> machine or CI — never from a serverless function.

### Cron

`vercel.json` schedules `/api/v1/cron/drain-messages` every 15 minutes. Vercel
issues a `GET` with `Authorization: Bearer $CRON_SECRET`.

Fifteen minutes is deliberate. A message held for quiet hours is only released
on the next run, so an hourly schedule would let a 09:00 send land at 09:59 —
close enough to be indistinguishable from a bug.

Overlapping runs are safe: the worker claims rows with `SELECT … FOR UPDATE
SKIP LOCKED` before contacting any provider, so a second invocation finds them
already claimed.

> **The default transport does not send anything.** It logs what it would
> send. Wiring a real provider is a deliberate, separate step — see
> `app/cli/worker.py`.

---

## 2. The web project

**Root directory:** `Frontend`

| Variable                        | Value                       |
| ------------------------------- | --------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_…`          |
| `NEXT_PUBLIC_API_URL`           | the API project's domain    |

Do **not** set `NEXT_PUBLIC_DEMO_MODE`. A production build folds it to `false`
and drops the branch, but leaving it set is a confusing signal.

`NEXT_PUBLIC_API_URL` must be reachable from a _guest's_ browser, not an
internal hostname — the public booking page calls it directly.

---

## 3. Order of operations

1. Deploy the API first and note its domain.
2. Set `NEXT_PUBLIC_API_URL` on the web project to that domain.
3. Deploy the web project and note its domain.
4. Set `CORS_ORIGINS` on the API to the web domain, and redeploy the API.

Step 4 is easy to forget and the symptom is unhelpful: every request fails in
the browser with a CORS error while the API looks healthy in isolation.

If you use Vercel preview deployments, each gets its own domain. Either add
them to `CORS_ORIGINS` or accept that previews cannot reach the API.

---

## 4. Before the first real traffic

- **Run the migration** against the session pooler: `alembic upgrade head`
- **Rotate any key that has been shared** — Project Settings → API Keys
- **Point the ad at** `https://<web-domain>/book/<studio-slug>`

---

## Known gaps

**Rate limiting is in-process.** Each serverless instance keeps its own
counters, so the public booking limit (10/hour) is per-instance rather than
global. It still stops a naive script; it does not stop a distributed one.
Redis-backed storage is the fix when that matters.

**RLS is declared but not enforced for the API's connection.** The API
connects as `postgres`, which owns the tables and carries `rolbypassrls`;
Postgres exempts owners from RLS unless `FORCE ROW LEVEL SECURITY` is set.
Tenant isolation today comes from `TenantSession` in application code, which
is covered by tests — but it is one layer, not the two the policies imply.
Closing this means a dedicated non-owner role that sets the JWT claim per
request.

**`LandingPage/` is empty.** Not deployed.
