# ADR 0001 — Core architecture

- **Status:** Accepted
- **Date:** 2026-08-04

## Context

`Maison Abeer` is the Creative Workshop Admin Portal specified in
`prd_creative_workshop_admin_portal.pdf` (v2.0) and visually defined by
`creative-workshop-portal-design.html`. It serves independent creative-workshop hosts who run
recurring classes of 6–16 guests and manage the business primarily from a phone.

## Decisions

### 1. Next.js 15 (App Router) for the web client

The PRD budgets **under two seconds for dashboard load on a mid-range phone over 4G** (§3.1).
React Server Components let the dashboard stream server-rendered markup before client JS
hydrates, which is the single largest lever on that budget. Route-level code splitting also
keeps the heavy Name Tag Studio dependencies off the `/today` route.

### 2. FastAPI (Python 3.12) for the API

Chosen by the product owner. Pydantic v2 gives runtime validation at the edge and an
auto-generated OpenAPI schema, which we use to generate the typed frontend client — so the API
contract is enforced at compile time on the client despite the language boundary.

### 3. FastAPI is the only data gateway

The browser authenticates against Supabase and then talks exclusively to FastAPI. Supabase's
PostgREST surface is not used from the client.

The PRD is dense with invariants that span multiple tables: seats may not drop below the booking
count (§2.2), rescheduling re-anchors every T-minus checklist deadline (§2.5), capacity changes
rescale quantity-linked checklist items and re-open ones already ticked (§2.5), waitlist
auto-invites must respect quiet hours (§2.4). Expressing these as RLS policies would scatter the
rules across SQL and Python and force each one to be re-proved in two places. A single gateway
gives one auditable location for correctness and one surface to secure.

**Cost accepted:** we forgo Supabase Realtime subscriptions and write more endpoint code. If
live multi-device sync is needed later, we add a websocket channel on the API rather than
opening a second data path.

### 4. Multi-tenant from the first migration

Every table carries `studio_id`. The PRD's success metrics — "new hosts who schedule a class
within 7 days of signup", "hosts opening the app in a given week" (§4) — describe a product with
many customers. Adding a tenant discriminator to a live schema later is among the most expensive
migrations possible; adding it now is nearly free.

RLS policies are still authored on every table. The service role bypasses them, so they are not
load-bearing today — they exist so that a future direct-from-client read path cannot leak across
tenants by omission.

### 5. `studio_id` is never accepted from the client

It is resolved server-side from the verified JWT on every request and applied through a
session-level SQLAlchemy filter rather than by developers remembering a `WHERE` clause. This is
the entirety of the tenant-isolation guarantee, so it is enforced structurally and covered by a
dedicated test suite.

### 6. Business rules live in `app/domain/`, free of framework imports

Seat math, deadline anchoring and quantity rescaling are pure functions over dataclasses. They
are unit-tested without a database and shared between the HTTP layer and the scheduled worker
that sends reminders. This keeps the rules that define product correctness independent of both
the web framework and the ORM.

## Consequences

- Two languages in one repository. Mitigated by generating the frontend API client from OpenAPI.
- No Realtime. Accepted; see §3.
- The API is a required hop for all data. It must be deployed and monitored as a first-class
  service, not treated as an optional backend-for-frontend.
