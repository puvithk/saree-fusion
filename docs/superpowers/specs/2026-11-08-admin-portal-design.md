# SareeFusion Admin Portal — Phase 1 Design

**Date:** 2026-11-08
**Status:** Awaiting review

## Intent

A single administrator needs to see who is using SareeFusion, what they fed
into it, and what came out — without disturbing the weaver-facing application
that went live today.

Success means: the admin signs in with a username and password, sees true
numbers, and can open any generation to compare its input swatches against its
generated outputs and loom files. Everything on screen is backed by data the
system actually records.

**Constraint carried from the discussion:** the existing Google sign-in flow
must not regress. The design achieves this by addition, not modification — the
one deliberate exception is noted under Risks.

## Scope

Phase 1 builds only what real data supports.

| Module | Phase | Why |
|---|---|---|
| Admin login | 1 | New |
| Executive Overview | 1 | Counts and daily generations are derivable from `created_at` |
| Input/Output Inspector | 1 | Fully backed: `uploadedComponents`, `designs[].image`, `.templateImage`, order `loomOutputs` |
| User Directory | 1 | Backed by `users` plus per-user counts |
| Quota / Tier Tracker | 2 | No quota, credit, tier or subscription concept exists |
| Geolocation & Sessions | 2 | No IP, user-agent or device is captured anywhere |

Explicitly **out** of Phase 1: API/token consumption (never measured), a
per-action audit feed (no event log; the generation feed is derived from
created records instead), and user roles (the platform is deliberately
single-role).

## Architecture

Admin is a parallel system beside the weaver app, sharing only the database.

```
Browser
  /            -> weaver SPA   -> sf_session cookie  -> /api/*
  /admin       -> admin SPA    -> sf_admin cookie    -> /api/admin/*
```

Two cookies, two secrets, two decorators. `require_auth` is not modified, and
`/api/admin/*` never consults a weaver session. A defect in admin authorisation
therefore cannot escalate a weaver, and signing in as admin does not end a
weaver session in the same browser.

### Backend components

**`admin.py`** (new) — the only module that understands admin identity.

- `verify_credentials(username, password)` — `hmac.compare_digest` on the
  username so a wrong name and a wrong password take the same time, then
  `werkzeug.security.check_password_hash` on the password.
- `issue_session()` / `read_session()` — cookie `sf_admin`, httpOnly,
  `SameSite=Lax`, Secure in production, signed with `ADMIN_SESSION_SECRET`
  (distinct from `SESSION_SECRET`, so one leaking does not grant the other).
  Eight-hour lifetime, against the weaver's seven days.
- `require_admin` decorator.
- `record_attempt()` / `is_locked_out()` — failed logins counted in Postgres,
  not memory, because serverless instances do not share memory.

**`admin_routes.py`** (new) — every `/api/admin/*` endpoint, registered as a
Flask blueprint so `main.py` gains one import and one `register_blueprint` line.

Credentials come from `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` in the
environment. A helper, `python admin.py --set-password`, prints a scrypt hash
for pasting; the plaintext is never written to a file. Werkzeug ships with
Flask, so this adds no dependency.

### Schema additions

```sql
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
    -- 'active' | 'suspended'

CREATE TABLE admin_actions (
    id          BIGSERIAL PRIMARY KEY,
    action      TEXT NOT NULL,          -- 'login' | 'suspend_user' | 'restore_user'
    target_id   TEXT,
    detail      JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_login_attempts (
    id           BIGSERIAL PRIMARY KEY,
    ip           TEXT,
    succeeded    BOOLEAN NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON admin_login_attempts (ip, attempted_at DESC);
```

`status` is included because showing an Account Status column that nothing
enforces would be decoration. `admin_actions` exists because suspending an
account is destructive and should leave a record; it is also the seed of the
Phase 2 event log.

### API surface

| Method | Path | Returns |
|---|---|---|
| POST | `/api/admin/login` | sets `sf_admin`; 429 when locked out |
| POST | `/api/admin/logout` | clears the cookie |
| GET | `/api/admin/me` | whether an admin session is live |
| GET | `/api/admin/overview` | totals, generations today, 30-day daily series |
| GET | `/api/admin/users` | paginated directory, searchable, with per-user counts |
| GET | `/api/admin/users/<id>` | profile plus full design history |
| PATCH | `/api/admin/users/<id>` | `{"status": "active" \| "suspended"}` |
| GET | `/api/admin/batches` | generation feed, filterable by user |
| GET | `/api/admin/batches/<id>` | inspector payload: inputs, outputs, owner |
| GET | `/api/admin/orders/<id>` | order detail and loom file list |
| GET | `/api/admin/file/<path>` | 302 to a signed URL, admin-authorised |

That last route matters. `/api/static/<path>` authorises by ownership, and the
admin owns nothing, so the inspector cannot use it. Rather than widening the
weaver path with an admin exception, admins read files through their own route
with its own check — the same separation principle as the cookies.

### Frontend

A second route tree under `/admin`, lazy-loaded via `React.lazy` so the weaver
bundle does not carry the dashboard.

```
src/admin/
  AdminApp.jsx            routes + layout shell
  AdminAuthContext.jsx    separate from AuthContext; calls /api/admin/*
  AdminProtectedRoute.jsx
  pages/   AdminLogin · Overview · Inspector · Users
  components/  Sidebar · MetricCard · DataTable · InspectorModal
               ActivityChart · StatusBadge · Skeleton
  admin.css               all rules scoped under .admin-root
```

CSS is scoped under `.admin-root` so the dark enterprise palette cannot leak
into the weaver app's existing light/dark theming.

`ActivityChart` is hand-rolled SVG, roughly forty lines. The project has no
chart library, and one daily bar chart does not justify adding ~500 KB.

### Responsive behaviour

Desktop is a fixed 260px sidebar with multi-column metric cards, sortable
tables and a split-screen inspector modal showing inputs left, outputs right.

Below 768px the sidebar becomes a drawer behind a hamburger, tables fall back
to stacked cards (a horizontally scrolling table is unusable on a phone), and
the inspector modal becomes full-screen with inputs and outputs in tabs rather
than side by side.

### Data flow

Overview issues one request returning every figure, so the page does not
produce a waterfall of calls. The directory and the feed paginate at 25 rows.
The inspector fetches a batch only when a row is opened, then renders each
image through `/api/admin/file/...`, which redirects to a short-lived signed
URL exactly as the weaver path does.

### Error handling

A 401 from any admin endpoint clears admin state and returns to `/admin/login`.
Failed logins are deliberately vague — "Invalid username or password" — so the
response does not reveal which half was wrong. Ten failures from one IP within
fifteen minutes returns 429 until the window passes. Every list view has an
explicit empty state, and every panel a loading skeleton.

### Testing

- `verify_credentials` rejects a wrong username, a wrong password, and an empty password
- `require_admin` rejects no cookie, a weaver `sf_session` cookie, and a tampered admin cookie
- Lockout triggers at the tenth failure and clears after the window
- A suspended user's weaver requests return 403
- `/api/admin/file/<path>` returns 401 without an admin session
- Every overview figure is checked against a direct SQL count

## Risks

**The one touch to the existing flow.** Suspension has to be enforced in
`auth.current_user()`, which is on the weaver path. It is a single additive
check: if `status != 'active'`, raise `AuthError`. Covered by the test above.
No other weaver code changes.

**One admin, one password.** No recovery flow. Losing the password means
setting a new `ADMIN_PASSWORD_HASH` env var and redeploying. Acceptable for a
single operator; a second admin would need a real users-with-roles design.

**The dashboard reads production data.** Admin endpoints are read-only except
the suspend toggle, which is audited.

## Phase 2 (not built here)

An `events` table (user, action, timestamp, ip, user_agent) to make a real
audit feed; quota, tier and credit columns; IP-to-city lookup via a paid
provider. Geolocation is personal-data processing under India's DPDP Act and
needs a stated purpose, retention period and user notice before it is built.
