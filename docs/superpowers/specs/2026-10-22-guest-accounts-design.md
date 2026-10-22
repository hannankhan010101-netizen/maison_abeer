# Guest accounts: your own email and password, and an owner who can manage them

- **Status:** Design drafted 2026-10-22 from the owner's request and her approval of this version.
  Nothing is built until this document and its plan are approved.
- **Date:** 2026-10-22
- **Scope:** the booking confirmation's "Open my portal", sign-in for guests, a forgot-password
  request, and an Accounts screen for the owner. Backend, guest side and host side.
- **Builds on:** `app/services/portal_tokens.py` (the one-time portal token), `POST /portal/claim`,
  `/enter`, `/login` (works for any Supabase user), the host's `POST /guests/{id}/portal-link`, and the
  hardening rules in the doors phase (one sign-in error message, `safeDestination`, a token redeemed
  once).

## Intent

The owner asked for four things: after booking, "Open my portal" lets a guest **save an email and
password**; the **email must be unique**; a guest who forgets the password can **ask the owner to reset
it**; and the owner can **see all the accounts and manage them** (create, read, update, delete).

She also asked to see each guest's credentials. **Passwords are never shown, by design.** Supabase keeps
only a scrambled form, and showing them would mean saving every guest's real password in plain text.
Most guests are teenagers who reuse passwords on other apps, so a leak here would reach well beyond this
studio. The owner agreed to the version below, which gives her everything she needs to look after
guests without ever being able to read a password.

## What exists (read from the code, 2026-10-22)

- Booking creates a guest and quietly makes a Supabase account for them with a **placeholder email**
  `guest-<id>@maison-abeer.invalid` and no usable password. The one-time token returned with the booking
  signs them in once. That placeholder is deliberate: **who you are is the guest row, not an email you
  typed**, so booking with someone else's email can never hand you their portal.
- `guest.email` is contact information as typed (or null). It is separate from the login identity.
- `/login` already signs in any Supabase user by email and password and `RoleRouter` sends a guest to
  `/portal`; guests simply have no password to use.
- A guest who loses their session is told to ask the studio for a fresh link (`/enter`).
- The app sends no email at all.
- The host can already issue a fresh portal link for a guest.

## Goals

1. After booking, "Open my portal" opens a short popup to save a login email and password, then
   continues into the portal.
2. A login email can belong to only one account. A taken email gets a clear, friendly message.
3. A guest can sign in at `/login` with that email and password, from any device.
4. A guest who forgets the password taps "Ask the studio to reset it". The request appears in the
   owner's admin. The guest never types a new password into the request.
5. The owner has an **Accounts** screen: every guest account with name, login email, status, last
   sign-in and bookings; add, edit, disable, enable and delete; "Set a new password"; "Send sign-in
   link"; and an inbox of reset requests.
6. Every existing hardening rule stays.

## Non-goals

- Showing or storing any password (see Intent). The only password the app ever displays is one the owner
  has just set or generated, shown once on that screen and not stored.
- Sending email, verifying email ownership, social login or two-factor sign-in. Each is a later phase.
- Changing how booking works. A guest who never saves a login keeps working exactly as today.

## Anti-goals

- A plain-text password in the database, a request row, a log line or a URL.
- Account takeover through the booking email, or through a reset request (a request only tells the
  owner; it changes nothing by itself).
- Telling a stranger whether an email has an account (no enumeration).
- Skipping the popup being a dead end: the guest can always continue and save a login later.

## The design

### 1. The popup

Tapping "Open my portal" opens a dialog: "Save your login so you can come back." Fields: email and
password (with a show toggle), `autocomplete="email"` and `autocomplete="new-password"`, 16 px inputs.
Buttons: **Save and open my portal**, and **Skip for now**.

- Save: (1) redeem the one-time token, which signs the guest in; (2) call `POST /portal/account` with
  `{ email, password }`; (3) go to `/portal`. If step 2 fails (a taken email, a weak password), the dialog
  stays open with the reason and retries **only** step 2, because the token is already spent and the guest
  is already signed in.
- Skip: redeem the token and go to the portal. The portal shows a small "Save your login" card until they
  do, so a guest who skipped can save it later.
- The dialog is focus-trapped, closes with Escape (equivalent to Skip), is announced politely, keeps what
  was typed on an error, and uses no animation beyond the existing tokens.

### 2. Saving a login (backend)

`POST /portal/account` (guest-authenticated). It validates, then updates the guest's Supabase user through
the admin API: new email, new password, and the email marked confirmed. The email is normalised to
lower case and must look like an email (at most 254 characters). The password must be 8 to 72 characters
and not equal to the email. A duplicate email returns `409` with `email_taken`; the dialog says "That
email already has an account. Sign in instead" with a link to `/login`. The guest row, its bookings and
`guest.email` (the contact email) are untouched. Rate limited per caller and per IP.

**Honest limit:** the app cannot send email, so a login email is **not verified**. The first person to
register an address owns that address as a login. That is acceptable because the login only opens the
guest's own portal, the owner can edit or disable any account, and the Accounts screen marks emails as
unverified. Verification arrives with email sending, as a later phase.

### 3. Signing in, and forgetting

`/login` is unchanged for hosts and now works for guests too. It gains a "Forgot your password?" link that
opens a small form for an email address and calls `POST /public/password-reset-requests` (no sign-in). The
reply is always the same ("If that email has an account, the studio has been told"), whether or not it
does, and the call is rate limited per IP and per email. When the email belongs to a guest account it
creates one **open** request for that guest (a second one is ignored while one is open). Nothing about the
account changes.

### 4. The Accounts screen (host)

A new `/accounts` route, linked from Guests, with a "needs you" card on Today when requests are waiting.

- **List:** name, login email (with an "unverified" label), status (active or disabled), last sign-in,
  number of bookings, and a flag when a reset request is open. Search and filter by status.
- **Add:** pick a guest who has no login, set a login email and a temporary password (typed or generated),
  or just send them a sign-in link.
- **Edit:** the login email and the display name. A taken email is refused with the same friendly message.
- **Disable and enable:** a disabled account cannot sign in; nothing is deleted.
- **Delete:** removes the login only. The guest record and bookings stay, and the guest goes back to a
  placeholder identity.
- **Set a new password:** the owner types one or generates one. It is shown **once** with a copy button,
  never stored or logged, and the guest can change it themselves after signing in.
- **Send sign-in link:** the existing portal link for the guest, shown for copying.
- **Reset requests inbox:** each open request with Set a new password, Send sign-in link and Dismiss.
- Every action asks for confirmation when it cannot be undone, and shows the result in words.

### 5. Data and services

- A **migration** (needs the owner's explicit go): table `password_reset_request` with `id`, `studio_id`,
  `guest_id`, `requested_at`, `resolved_at`, `resolved_by`, `resolution` (`password_set`, `link_sent`,
  `dismissed`), a unique index allowing one open request per guest, and the same row-level policy pattern as
  the other tables.
- An `AccountService` with a small protocol, a Supabase implementation (the admin API) and a null
  implementation for tests, in the style of `portal_tokens.py`. All Supabase calls live there.
- Endpoints: `POST /portal/account`; host-only `GET /accounts`, `POST /accounts`, `PATCH
/accounts/{guest_id}`, `POST /accounts/{guest_id}/disable`, `.../enable`, `DELETE /accounts/{guest_id}`,
  `POST /accounts/{guest_id}/password`, `POST /accounts/{guest_id}/sign-in-link`, `GET /reset-requests`,
  `POST /reset-requests/{id}/resolve`; public `POST /public/password-reset-requests`.
- Admin actions are logged by action and guest id only, never a password or an email body.

## Phases

| Phase | Scope                                                                                    | Gate                                                |
| ----- | ---------------------------------------------------------------------------------------- | --------------------------------------------------- |
| A1    | Backend: AccountService, `/portal/account`, reset requests, the Accounts API, migration  | **Explicit go for the migration and the auth code** |
| A2    | Guest side: the popup, the "save your login" card, `/login` forgot link and request form | Review of A1                                        |
| A3    | Host side: the Accounts screen, the inbox, the Today card                                | Review of A2                                        |
| A4    | Security review and a real-device walk-through                                           | Review of A3                                        |

## Verification

- Backend unit tests with the null service (validation, taken email, weak password, enumeration-safe
  replies, one open request per guest, host-only access, tenant isolation across studios); a test that no
  password appears in any log call or response except the one just set.
- Frontend unit tests for the popup states (success, taken email, skip, retry after error, keyboard,
  focus trap) and the Accounts screen (every action, confirmations, the one-time password).
- Browser tests at 375 and 1440: book, save a login, sign out, sign in with it; forgot-password request;
  owner resolves it; axe with and without reduced motion; 44 px targets.
- An independent adversarial review of the whole auth surface before it ships.

## Risks

| Risk                                                       | Handling                                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Someone registers another person's email first             | Unverified label, owner can edit or disable, verification later with email sending  |
| A reset request used to harass the owner or probe accounts | Same reply always, rate limits, one open request per guest, requests change nothing |
| The token is spent but saving the login fails              | The guest is already signed in; the dialog retries only the save                    |
| A guest locks themselves out                               | Owner sets a new password or sends a link; the existing `/enter` path still works   |
| An admin action deletes the wrong account                  | Delete removes the login only, with confirmation; the guest and bookings stay       |

## Decisions and my calls (mark any you disagree with)

- Password length 8 to 72; no composition rules (they push people to reuse passwords).
- Skipping the popup is allowed and a card reminds them later.
- Login emails are lower-cased and unverified, labelled as such.
- "Delete" removes the login, not the guest.
- No notification email is sent when the owner changes a password (there is no email sending yet).

## Left to the builder

The dialog and screen layouts within the existing look; copy beyond the lines above; the rate-limit
numbers; the generated-password format (long, readable, no ambiguous characters); table column widths and
the Today card's wording.
