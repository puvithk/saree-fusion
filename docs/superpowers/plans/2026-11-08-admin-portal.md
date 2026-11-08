# Admin Portal Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A password-protected admin portal at `/admin` showing true platform metrics, a full user directory, and an input/output inspector for every generation.

**Architecture:** A parallel auth system beside the weaver app. Admin identity lives in `admin.py`, admin endpoints in an `admin_routes.py` blueprint, and the dashboard in a lazy-loaded `src/admin/` route tree. The weaver path is extended, not rewritten: `require_auth` is untouched and the only weaver-side change is a suspension check in `current_user()`.

**Tech Stack:** Flask blueprint, Werkzeug scrypt (ships with Flask — no new backend dependency), psycopg 3, React 19, React Router 7, hand-rolled SVG chart (no chart library). pytest is added for the backend.

**Spec:** `docs/superpowers/specs/2026-11-08-admin-portal-design.md`

## Global Constraints

- No new backend dependency except `pytest`. Password hashing uses `werkzeug.security`.
- No new frontend dependency. The activity chart is hand-rolled SVG.
- `auth.py`'s `require_auth` must not be modified. The sole weaver-path change is in `current_user()` (Task 5).
- Admin cookie is `sf_admin`, signed with `ADMIN_SESSION_SECRET`, distinct from `SESSION_SECRET`. Lifetime 8 hours.
- Weaver cookie `sf_session` must never grant admin access, and vice versa.
- Credentials come from `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH`. No plaintext password in any file.
- Lockout: 10 failed attempts from one IP within 15 minutes returns 429.
- All admin CSS is scoped under `.admin-root`.
- Login failures return exactly "Invalid username or password" regardless of which field was wrong.
- **No commits.** All work stays in the working tree on branch `feature/admin-portal`. Implementers must not run any git command.

## Review Focus

1. A login POST with a missing or empty `username` or `password` must return 401, never a 500 from hashing `None`. — Task 1
2. A valid weaver `sf_session` cookie presented to `/api/admin/*` must return 401, never be read as an admin session. — Task 2
3. `PATCH /api/admin/users/<id>` with a status other than `active` or `suspended` must return 400 and write nothing. — Task 6
4. `/api/admin/file/<path>` containing a `..` segment must return 404 without touching storage. — Task 7
5. A user suspended while holding a valid unexpired `sf_session` must be rejected on their next request, not merely blocked at next login. — Task 5

---

### Task 1: Admin credential verification

**Files:**
- Create: `backend/admin.py`
- Create: `backend/tests/test_admin_credentials.py`
- Create: `backend/tests/conftest.py`
- Modify: `backend/requirements.txt`

**Interfaces:**
- Consumes: nothing
- Produces: `verify_credentials(username: str, password: str) -> bool`; `hash_password(plain: str) -> str`; module constants `ADMIN_USERNAME: str`, `ADMIN_PASSWORD_HASH: str`

- [ ] **Step 1: Add `pytest>=8.0` to `backend/requirements.txt` and create `backend/tests/conftest.py` setting `ADMIN_USERNAME=admin` and `ADMIN_PASSWORD_HASH` (scrypt hash of `test-password-123`) in `os.environ` before `admin` is imported**

- [ ] **Step 2: Write the failing tests**

```python
def test_correct_credentials_accepted():
    assert admin.verify_credentials("admin", "test-password-123") is True

def test_wrong_password_rejected():
    assert admin.verify_credentials("admin", "wrong") is False

def test_wrong_username_rejected():
    assert admin.verify_credentials("root", "test-password-123") is False

def test_empty_password_rejected():          # Review Focus 1
    assert admin.verify_credentials("admin", "") is False

def test_none_inputs_rejected():             # Review Focus 1
    assert admin.verify_credentials(None, None) is False
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd backend && python -m pytest tests/test_admin_credentials.py -v`
Expected: FAIL, no module named `admin`

- [ ] **Step 4: Implement `hash_password` and `verify_credentials` in `backend/admin.py`**

`verify_credentials` compares the username with `hmac.compare_digest` so a wrong username and a wrong password cost the same time, then checks the password with `werkzeug.security.check_password_hash`. It returns False for falsy inputs before touching the hasher. `hash_password` uses `werkzeug.security.generate_password_hash`.

- [ ] **Step 5: Run to verify they pass**

Run: `cd backend && python -m pytest tests/test_admin_credentials.py -v`
Expected: 5 passed

- [ ] **Step 6: Add a `--set-password` CLI block to `admin.py`** that reads a password with `getpass.getpass` and prints the hash for pasting into `.env`. The plaintext is never written to disk.

- [ ] **Step 7: Stop. Do not run any git command.**

Leave every change in the working tree, staged by nobody. The
controller stages the task's files after review so the next task's
unstaged diff contains only its own work. Running `git add`,
`git commit`, `git stash` or `git checkout` yourself destroys that
isolation and loses work that is not committed anywhere.

---

### Task 2: Admin session cookie and require_admin

**Files:**
- Modify: `backend/admin.py`
- Create: `backend/tests/test_admin_session.py`

**Interfaces:**
- Consumes: Task 1's `admin` module
- Produces: `issue_session() -> str`; `read_session(token: str) -> dict` (raises `AdminAuthError`); `set_session_cookie(response, token)`; `clear_session_cookie(response)`; `require_admin(view)` decorator; `COOKIE_NAME = "sf_admin"`; `class AdminAuthError(Exception)` with `.message` and `.status`

- [ ] **Step 1: Write the failing tests**

```python
def test_roundtrip_session():
    claims = admin.read_session(admin.issue_session())
    assert claims["role"] == "admin"

def test_tampered_token_rejected():
    with pytest.raises(admin.AdminAuthError):
        admin.read_session(admin.issue_session() + "x")

def test_weaver_token_rejected():            # Review Focus 2
    # A token signed with SESSION_SECRET must not pass as an admin session.
    weaver = jwt.encode({"sub": "u1", "exp": ...}, os.environ["SESSION_SECRET"], algorithm="HS256")
    with pytest.raises(admin.AdminAuthError):
        admin.read_session(weaver)

def test_expired_token_rejected():
    ...
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && python -m pytest tests/test_admin_session.py -v`

- [ ] **Step 3: Implement the session functions and `require_admin` in `backend/admin.py`**

Tokens are PyJWT HS256 signed with `ADMIN_SESSION_SECRET`, carrying `role: "admin"` and an 8-hour `exp`. `read_session` rejects a token whose `role` is not `"admin"`, which is what makes a weaver token fail even if the secrets were ever misconfigured to match. Cookie flags mirror `auth.py`: httpOnly, `SameSite=Lax`, Secure in production. `ADMIN_SESSION_SECRET` is required in production and falls back to a dev constant locally, as `auth.session_secret()` does.

- [ ] **Step 4: Run to verify they pass**

- [ ] **Step 5: Stop. Do not run any git command.**

Leave every change in the working tree, staged by nobody. The
controller stages the task's files after review so the next task's
unstaged diff contains only its own work. Running `git add`,
`git commit`, `git stash` or `git checkout` yourself destroys that
isolation and loses work that is not committed anywhere.

---

### Task 3: Schema additions and login throttling

**Files:**
- Modify: `backend/db.py`
- Modify: `backend/admin.py`
- Create: `backend/tests/test_admin_lockout.py`

**Interfaces:**
- Consumes: `db.connect()`
- Produces: `db.set_user_status(user_id, status) -> bool`; `db.record_admin_action(action, target_id=None, detail=None)`; `db.record_login_attempt(ip, succeeded)`; `db.recent_failed_attempts(ip, minutes=15) -> int`; `admin.is_locked_out(ip) -> bool`; `admin.MAX_ATTEMPTS = 10`; `admin.LOCKOUT_MINUTES = 15`

- [ ] **Step 1: Add to `db.SCHEMA`** the three changes from the spec: `users.status TEXT NOT NULL DEFAULT 'active'` (as an `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` entry in `_MIGRATIONS`, since `users` already exists), plus `CREATE TABLE IF NOT EXISTS admin_actions` and `admin_login_attempts` with the columns and index given in the spec.

- [ ] **Step 2: Write the failing test for the lockout window**

```python
def test_locked_out_at_max_attempts(monkeypatch):
    monkeypatch.setattr(admin.db, "recent_failed_attempts", lambda ip, minutes=15: 10)
    assert admin.is_locked_out("1.2.3.4") is True

def test_not_locked_below_max(monkeypatch):
    monkeypatch.setattr(admin.db, "recent_failed_attempts", lambda ip, minutes=15: 9)
    assert admin.is_locked_out("1.2.3.4") is False
```

- [ ] **Step 3: Run to verify they fail**

- [ ] **Step 4: Implement the four `db` functions and `admin.is_locked_out`**

`recent_failed_attempts` counts rows where `succeeded = false` and `attempted_at > now() - interval`. Counting in Postgres rather than memory is deliberate: serverless instances do not share memory. `set_user_status` returns False for a status other than `active` or `suspended`.

- [ ] **Step 5: Run to verify they pass**

- [ ] **Step 6: Stop. Do not run any git command.**

Leave every change in the working tree, staged by nobody. The
controller stages the task's files after review so the next task's
unstaged diff contains only its own work. Running `git add`,
`git commit`, `git stash` or `git checkout` yourself destroys that
isolation and loses work that is not committed anywhere.

---

### Task 4: Admin auth endpoints

**Files:**
- Create: `backend/admin_routes.py`
- Modify: `backend/main.py` (one import, one `register_blueprint`)
- Create: `backend/tests/test_admin_routes_auth.py`

**Interfaces:**
- Consumes: Tasks 1–3
- Produces: Flask blueprint `admin_bp` with url_prefix `/api/admin`; routes `POST /login`, `POST /logout`, `GET /me`

- [ ] **Step 1: Write the failing tests** using Flask's test client, with `db` functions monkeypatched so no database is needed.

```python
def test_login_sets_cookie(client):
    r = client.post("/api/admin/login", json={"username": "admin", "password": "test-password-123"})
    assert r.status_code == 200 and "sf_admin" in r.headers.get("Set-Cookie", "")

def test_login_wrong_password_401_and_vague(client):
    r = client.post("/api/admin/login", json={"username": "admin", "password": "nope"})
    assert r.status_code == 401
    assert r.get_json()["error"] == "Invalid username or password"

def test_login_missing_fields_401(client):   # Review Focus 1
    assert client.post("/api/admin/login", json={}).status_code == 401

def test_me_requires_cookie(client):
    assert client.get("/api/admin/me").status_code == 401
```

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement the blueprint in `backend/admin_routes.py` and register it in `main.py`**

`login` checks `is_locked_out` first and returns 429 if locked, records every attempt via `record_login_attempt`, and on success records an `admin_actions` row and sets the cookie. The client IP comes from the first entry of `X-Forwarded-For` when present, else `request.remote_addr`, because Vercel proxies every request. Register the AdminAuthError handler alongside the existing ones in `main.py`.

- [ ] **Step 4: Run to verify they pass**

- [ ] **Step 5: Stop. Do not run any git command.**

Leave every change in the working tree, staged by nobody. The
controller stages the task's files after review so the next task's
unstaged diff contains only its own work. Running `git add`,
`git commit`, `git stash` or `git checkout` yourself destroys that
isolation and loses work that is not committed anywhere.

---

### Task 5: Enforce user suspension on the weaver path

**Files:**
- Modify: `backend/auth.py` (`current_user` only)
- Modify: `backend/db.py` (`get_user` returns `status`)
- Create: `backend/tests/test_suspension.py`

**Interfaces:**
- Consumes: `db.get_user`
- Produces: `db.get_user` dict gains a `status` key

This is the only change to code the weaver flow runs. It is additive: a check that defaults to allowing.

- [ ] **Step 1: Write the failing test**

```python
def test_suspended_user_rejected_mid_session(monkeypatch):   # Review Focus 5
    # A valid, unexpired cookie must stop working the moment the account is suspended.
    monkeypatch.setattr(auth.db, "get_user", lambda uid: {"id": uid, "email": "x@y.z", "status": "suspended"})
    with pytest.raises(auth.AuthError):
        auth.current_user()

def test_active_user_allowed(monkeypatch):
    monkeypatch.setattr(auth.db, "get_user", lambda uid: {"id": uid, "email": "x@y.z", "status": "active"})
    assert auth.current_user()["status"] == "active"
```

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Add `status` to `db.get_user`'s SELECT and `_user_dict`, then in `auth.current_user()` raise `AuthError("This account has been suspended.", status=403)` when `user["status"] != "active"`**

Place the check immediately after the user row is loaded, before it is cached on `g`.

- [ ] **Step 4: Run to verify they pass, then run the whole backend suite to confirm nothing else broke**

Run: `cd backend && python -m pytest tests/ -v`

- [ ] **Step 5: Stop. Do not run any git command.**

Leave every change in the working tree, staged by nobody. The
controller stages the task's files after review so the next task's
unstaged diff contains only its own work. Running `git add`,
`git commit`, `git stash` or `git checkout` yourself destroys that
isolation and loses work that is not committed anywhere.

---

### Task 6: Overview and user directory endpoints

**Files:**
- Modify: `backend/admin_routes.py`
- Modify: `backend/db.py`
- Create: `backend/tests/test_admin_users.py`

**Interfaces:**
- Consumes: Tasks 3–4
- Produces: `db.admin_overview() -> dict`; `db.admin_list_users(query, limit, offset) -> (rows, total)`; `db.admin_user_detail(user_id) -> dict`; routes `GET /overview`, `GET /users`, `GET /users/<id>`, `PATCH /users/<id>`

- [ ] **Step 1: Write the failing tests**

```python
def test_patch_rejects_unknown_status(client, admin_cookie):   # Review Focus 3
    r = client.patch("/api/admin/users/abc", json={"status": "deleted"}, headers=admin_cookie)
    assert r.status_code == 400

def test_endpoints_require_admin(client):
    for path in ("/api/admin/overview", "/api/admin/users", "/api/admin/users/abc"):
        assert client.get(path).status_code == 401
```

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement the three `db` functions and four routes**

`admin_overview` returns, in one round trip: total users, total batches, batches created today, total orders, and a 30-element daily series of batch counts, using `date_trunc('day', created_at)` with a generated date series so days with no activity appear as zero rather than being missing. `admin_list_users` returns each user's row plus their batch and order counts via a lateral join, filtered by a case-insensitive match on name or email, paginated at 25. `PATCH` validates the status against `{"active", "suspended"}`, writes through `db.set_user_status`, and records an `admin_actions` row.

- [ ] **Step 4: Run to verify they pass**

- [ ] **Step 5: Verify the numbers against the database directly**

Run `/api/admin/overview` and compare each figure to a hand-written `SELECT count(*)`. They must match exactly.

- [ ] **Step 6: Stop. Do not run any git command.**

Leave every change in the working tree, staged by nobody. The
controller stages the task's files after review so the next task's
unstaged diff contains only its own work. Running `git add`,
`git commit`, `git stash` or `git checkout` yourself destroys that
isolation and loses work that is not committed anywhere.

---

### Task 7: Inspector endpoints and admin file access

**Files:**
- Modify: `backend/admin_routes.py`
- Modify: `backend/db.py`
- Create: `backend/tests/test_admin_files.py`

**Interfaces:**
- Consumes: Tasks 3–4, `blobstore.signed_url`, `db.get_file`
- Produces: `db.admin_list_batches(user_id, limit, offset) -> (rows, total)`; `db.admin_batch_detail(batch_id) -> dict`; `db.admin_order_detail(order_id) -> dict`; routes `GET /batches`, `GET /batches/<id>`, `GET /orders/<id>`, `GET /file/<path:filename>`

- [ ] **Step 1: Write the failing tests**

```python
def test_file_route_requires_admin(client):
    assert client.get("/api/admin/file/batches/FS-1/design_0_wearable.png").status_code == 401

def test_file_route_refuses_traversal(client, admin_cookie):   # Review Focus 4
    r = client.get("/api/admin/file/assets/../../secret.txt", headers=admin_cookie)
    assert r.status_code == 404
```

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement the three `db` functions and four routes**

`admin_batch_detail` returns the batch's `data` plus its owner's id, email and name by joining `users`. The inspector needs no reshaping beyond that: `uploadedComponents` already holds the pallu, border and body swatches, and `designs[]` already holds `image` and `templateImage`.

`GET /file/<path>` mirrors `serve_static`'s tiers — local disk, then a `blobstore` signed-URL redirect, then the Postgres `files` row — but authorises with `require_admin` instead of ownership. Reject any path containing a `..` segment before touching storage, exactly as `_may_read_static` does. Do not modify `_may_read_static` or `serve_static`.

- [ ] **Step 4: Run to verify they pass**

- [ ] **Step 5: Stop. Do not run any git command.**

Leave every change in the working tree, staged by nobody. The
controller stages the task's files after review so the next task's
unstaged diff contains only its own work. Running `git add`,
`git commit`, `git stash` or `git checkout` yourself destroys that
isolation and loses work that is not committed anywhere.

---

### Task 8: Admin auth frontend and route wiring

**Files:**
- Create: `frontend/src/admin/AdminAuthContext.jsx`, `frontend/src/admin/AdminProtectedRoute.jsx`, `frontend/src/admin/pages/AdminLogin.jsx`, `frontend/src/admin/admin.css`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: Task 4's endpoints
- Produces: `useAdminAuth()` returning `{ admin, loading, signIn(username, password), signOut }`; default-exported `AdminProtectedRoute`

- [ ] **Step 1: Create `AdminAuthContext.jsx`** following `AuthContext.jsx`'s structure: restore state from `GET /api/admin/me` on mount, `signIn` posts to `/api/admin/login`, `signOut` posts to `/api/admin/logout`. It must not import or touch `AuthContext`.

- [ ] **Step 2: Create `AdminProtectedRoute.jsx`** mirroring `ProtectedRoute.jsx`, including the `useMemo` on the redirect state — a fresh object literal there caused an infinite redirect loop in the weaver app because `<Navigate>` re-runs its effect when `state` changes identity.

- [ ] **Step 3: Create `AdminLogin.jsx`** — username and password fields, a submit that calls `signIn`, and an error line rendering the server's message verbatim.

- [ ] **Step 4: Add the `/admin/*` route to `App.jsx`** inside `AdminAuthProvider`, lazy-loaded with `React.lazy` and wrapped in `Suspense`, placed outside `AnimatedRoutes` so the admin tree does not inherit the weaver page transitions.

- [ ] **Step 5: Verify manually**

Run both servers. `/admin` redirects to `/admin/login`; a wrong password shows the error; the right one reaches the shell. Confirm the weaver app at `/` still signs in and lists collections.

- [ ] **Step 6: Stop. Do not run any git command.**

Leave every change in the working tree, staged by nobody. The
controller stages the task's files after review so the next task's
unstaged diff contains only its own work. Running `git add`,
`git commit`, `git stash` or `git checkout` yourself destroys that
isolation and loses work that is not committed anywhere.

---

### Task 9: Admin layout shell

**Files:**
- Create: `frontend/src/admin/AdminApp.jsx`, `frontend/src/admin/components/Sidebar.jsx`, `frontend/src/admin/components/Skeleton.jsx`
- Modify: `frontend/src/admin/admin.css`

**Interfaces:**
- Consumes: Task 8
- Produces: `AdminApp` with nested routes for `overview`, `users`, `inspector`; `<Skeleton rows={n} />`

- [ ] **Step 1: Build the shell** — a fixed 260px sidebar on desktop; below 768px a drawer behind a hamburger, closing on route change and on Escape.

- [ ] **Step 2: Write the theme in `admin.css`**, every rule under `.admin-root`: deep midnight-indigo background, frosted-glass cards (`backdrop-filter: blur()` with a solid-colour fallback), gold and neon status accents, high-contrast text.

- [ ] **Step 3: Verify** at 1440px and 375px, and confirm the weaver app's own theming is visually unchanged.

- [ ] **Step 4: Stop. Do not run any git command.**

Leave every change in the working tree, staged by nobody. The
controller stages the task's files after review so the next task's
unstaged diff contains only its own work. Running `git add`,
`git commit`, `git stash` or `git checkout` yourself destroys that
isolation and loses work that is not committed anywhere.

---

### Task 10: Executive overview page

**Files:**
- Create: `frontend/src/admin/pages/Overview.jsx`, `frontend/src/admin/components/MetricCard.jsx`, `frontend/src/admin/components/ActivityChart.jsx`

**Interfaces:**
- Consumes: `GET /api/admin/overview`
- Produces: `<MetricCard label value hint />`, `<ActivityChart data={[{date, count}]} />`

- [ ] **Step 1: Build `ActivityChart`** as inline SVG with a `viewBox` for responsive scaling: one bar per day, height scaled to the maximum, a hover tooltip, and an explicit "no activity yet" state when every count is zero.

- [ ] **Step 2: Build `Overview`** — four metric cards over the chart, `Skeleton` while loading, and an error state on failure.

- [ ] **Step 3: Verify** each card against the matching `SELECT count(*)`.

- [ ] **Step 4: Stop. Do not run any git command.**

Leave every change in the working tree, staged by nobody. The
controller stages the task's files after review so the next task's
unstaged diff contains only its own work. Running `git add`,
`git commit`, `git stash` or `git checkout` yourself destroys that
isolation and loses work that is not committed anywhere.

---

### Task 11: User directory

**Files:**
- Create: `frontend/src/admin/pages/Users.jsx`, `frontend/src/admin/components/DataTable.jsx`, `frontend/src/admin/components/StatusBadge.jsx`

**Interfaces:**
- Consumes: `GET /api/admin/users`, `GET /api/admin/users/<id>`, `PATCH /api/admin/users/<id>`
- Produces: `<DataTable columns rows onRowClick />` — renders a table at ≥768px and stacked cards below

- [ ] **Step 1: Build `DataTable`** with client-side sorting on the current page and the responsive card fallback. A horizontally scrolling table is unusable on a phone, so the card layout is the mobile rendering, not a degraded one.

- [ ] **Step 2: Build `Users`** — search box, pagination, and a detail modal showing profile, counts, design history and a suspend/restore toggle that asks for confirmation before sending the PATCH.

- [ ] **Step 3: Verify** suspending a test account: the badge flips, and that account's next weaver request returns 403.

- [ ] **Step 4: Stop. Do not run any git command.**

Leave every change in the working tree, staged by nobody. The
controller stages the task's files after review so the next task's
unstaged diff contains only its own work. Running `git add`,
`git commit`, `git stash` or `git checkout` yourself destroys that
isolation and loses work that is not committed anywhere.

---

### Task 12: Input/output inspector

**Files:**
- Create: `frontend/src/admin/pages/Inspector.jsx`, `frontend/src/admin/components/InspectorModal.jsx`

**Interfaces:**
- Consumes: `GET /api/admin/batches`, `GET /api/admin/batches/<id>`, `GET /api/admin/orders/<id>`, `GET /api/admin/file/<path>`
- Produces: none

- [ ] **Step 1: Build the feed** — a `DataTable` of generations with owner, batch id, design count, status and timestamp, filterable by user.

- [ ] **Step 2: Build `InspectorModal`** — split screen at ≥1024px with the uploaded pallu, border and body swatches on the left and the wearable render plus flat template on the right; below that, tabs instead of a split. Every image loads through `/api/admin/file/...`. Loom files from `loomOutputs` render as download links.

- [ ] **Step 3: Verify** against a real batch: the swatches shown match `uploadedComponents` and the outputs match `designs[].image` and `.templateImage`.

- [ ] **Step 4: Run the whole backend suite and confirm the weaver app is unaffected**

Run: `cd backend && python -m pytest tests/ -v`, then sign in as a weaver and open Collections.

- [ ] **Step 5: Stop. Do not run any git command.**

Leave every change in the working tree, staged by nobody. The
controller stages the task's files after review so the next task's
unstaged diff contains only its own work. Running `git add`,
`git commit`, `git stash` or `git checkout` yourself destroys that
isolation and loses work that is not committed anywhere.
