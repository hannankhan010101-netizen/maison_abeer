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

### Region

`vercel.json`'s `regions` field pins the function to the **same region as the
Supabase project's pooler** — currently `syd1` (Sydney), matching
`ap-southeast-2`. Vercel otherwise defaults new functions to `iad1` (US
East), and every one of this endpoint's several queries per request pays that
distance twice. Measured warm-request latency: 2.4-3.3s from `iad1` against
an `ap-southeast-2` database, 0.6-0.9s once colocated. If the database ever
moves region, update this to match, or the fix silently reverts.

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
prepared statements.

`NullPool` is the load-bearing half, for the reason above.

Disabling prepared statements is defensive. The classic transaction-pooler
failure is `prepared statement "_pg3_0" does not exist`, because each
statement can land on a different backend. **I could not reproduce it against
Supabase's pooler** — Supavisor appears to handle named prepared statements in
transaction mode — so treat this as belt-and-braces rather than a fix for an
observed fault. It costs a little planning time per query and makes the config
portable to PgBouncer, which does not.

Use port **6543** (transaction), not 5432 (session), for this project.

> Migrations are the exception. `alembic upgrade head` needs prepared
> statements, so run it against the **session** pooler on 5432 from your
> machine or CI — never from a serverless function.

### Cron

`vercel.json` schedules `/api/v1/cron/drain-messages`. Vercel issues a `GET`
with `Authorization: Bearer $CRON_SECRET`.

Fifteen minutes is the intended cadence — a message held for quiet hours is
only released on the next run, so an hourly schedule would let a 09:00 send
land at 09:59, close enough to be indistinguishable from a bug. **Vercel's
Hobby plan only allows a cron to run once a day**, so `vercel.json` currently
runs it at `0 9 * * *` (09:00 UTC) instead. Every message still queues
correctly; they just sit until the next daily drain rather than sending
promptly. Restore `*/15 * * * *` once the project is on a paid plan.

Overlapping runs are safe: the worker claims rows with `SELECT … FOR UPDATE
SKIP LOCKED` before contacting any provider, so a second invocation finds them
already claimed.

### Message delivery

The cron drain uses whatever `MESSAGE_PROVIDER` names. It defaults to `log`,
which records what it would send and contacts nobody — so a deployed cron
runs safely before a provider is wired.

To send for real, set `MESSAGE_PROVIDER=twilio` plus `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_FROM_SMS` and `TWILIO_FROM_WHATSAPP`. Partial
credentials are refused at startup rather than half-configured: a provider
that fails every send is worse than one that plainly did not try.

Email has no implementation. A guest whose preferred channel is email will
fail with a visible reason rather than silently never hearing from you.

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
