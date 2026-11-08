"""Per-user Postgres persistence for SareeFusion.

This replaces the old `storage.py` design, which kept an entire collection as a
single JSONB blob in one `kv` row. That had two fatal problems once accounts
exist:

  * two users saving at once overwrite each other's whole collection, and
  * ownership cannot be filtered in SQL, only in Python after loading everything.

Here every record is its own row with a real, indexed `user_id`. Each record
keeps its existing nested shape in a `data` JSONB column, because the frontend
consumes that shape directly and normalising `designs[]` / `uploadedComponents{}`
would be a far larger change that buys nothing today.

A DATABASE_URL is required. There is no JSON-file fallback: local development
and production both run Postgres so a bug found locally is the bug production has.
"""
import json
import mimetypes
import os
import uuid

DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL") or ""

_schema_ready = False


class DatabaseNotConfigured(RuntimeError):
    """Raised when DATABASE_URL is missing, with instructions rather than a stack trace."""


def enabled() -> bool:
    return bool(DATABASE_URL)


SCHEMA = """
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_sub     TEXT UNIQUE NOT NULL,
    email          TEXT UNIQUE NOT NULL,
    name           TEXT,
    picture_url    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS batches (
    id          TEXT PRIMARY KEY,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
    id          TEXT PRIMARY KEY,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    batch_id    TEXT,
    status      TEXT NOT NULL DEFAULT '',
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulations (
    id             TEXT PRIMARY KEY,
    user_id        UUID REFERENCES users(id) ON DELETE CASCADE,
    name           TEXT,
    drape_style    TEXT,
    thumbnail_key  TEXT,
    data           JSONB NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS files (
    key      TEXT PRIMARY KEY,
    mime     TEXT NOT NULL,
    content  BYTEA NOT NULL,
    user_id  UUID REFERENCES users(id) ON DELETE CASCADE
);

-- Every list query is "mine, newest first".
CREATE INDEX IF NOT EXISTS batches_owner_idx     ON batches     (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_owner_idx      ON orders      (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS simulations_owner_idx ON simulations (user_id, created_at DESC);

-- Admin portal. users.status is NOT here: users already exists with live rows, so
-- the column is added by _MIGRATIONS below (CREATE TABLE IF NOT EXISTS would skip it).
CREATE TABLE IF NOT EXISTS admin_actions (
    id          BIGSERIAL PRIMARY KEY,
    action      TEXT NOT NULL,
    target_id   TEXT,
    detail      JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
    id            BIGSERIAL PRIMARY KEY,
    ip            TEXT,
    succeeded     BOOLEAN NOT NULL,
    attempted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_login_attempts_ip_idx ON admin_login_attempts (ip, attempted_at DESC);

-- Small key/value store for things the admin edits (e.g. the Help phone number).
CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""

# `files` predates this module without a user_id, so add it when upgrading in place.
_MIGRATIONS = [
    "ALTER TABLE files ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE",
    # `users` has live rows, so the admin portal's status column must be an ALTER.
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'",
]


def connect():
    """Open an autocommit connection, creating the schema on first use."""
    global _schema_ready
    if not DATABASE_URL:
        raise DatabaseNotConfigured(
            "DATABASE_URL is not set. SareeFusion needs Postgres for per-user data.\n"
            "  Local:  docker run -d --name sareefusion-db -e POSTGRES_PASSWORD=dev \\\n"
            "            -e POSTGRES_DB=sareefusion -p 5432:5432 postgres:16\n"
            "          then put this in backend/.env:\n"
            "            DATABASE_URL=postgresql://postgres:dev@localhost:5432/sareefusion\n"
            "  Hosted: create a free database at neon.tech or supabase.com and use its URL."
        )
    import psycopg  # imported lazily so tooling that only reads this file needs no driver

    conn = psycopg.connect(DATABASE_URL, autocommit=True)
    if not _schema_ready:
        conn.execute(SCHEMA)
        for statement in _MIGRATIONS:
            try:
                conn.execute(statement)
            except Exception as exc:  # an older server without IF NOT EXISTS support
                print(f"Schema migration skipped ({statement.split()[2]}): {exc}")
        _schema_ready = True
    return conn


# --------------------------------------------------------------------------
# Users
# --------------------------------------------------------------------------
def upsert_user(google_sub, email, name=None, picture_url=None):
    """Create or refresh the user behind a verified Google token; returns the row as a dict.

    Keyed on google_sub rather than email: a Google account's address can change,
    but `sub` is stable for the life of the account.
    """
    email = (email or "").strip().lower()
    with connect() as conn:
        row = conn.execute(
            """
            INSERT INTO users (google_sub, email, name, picture_url, last_login_at)
            VALUES (%s, %s, %s, %s, now())
            ON CONFLICT (google_sub) DO UPDATE
               SET email         = EXCLUDED.email,
                   name          = COALESCE(EXCLUDED.name, users.name),
                   picture_url   = COALESCE(EXCLUDED.picture_url, users.picture_url),
                   last_login_at = now()
            RETURNING id, google_sub, email, name, picture_url
            """,
            (google_sub, email, name, picture_url),
        ).fetchone()
    return _user_dict(row)


def get_user(user_id):
    with connect() as conn:
        row = conn.execute(
            "SELECT id, google_sub, email, name, picture_url, status FROM users WHERE id = %s",
            (user_id,),
        ).fetchone()
    return _user_dict(row) if row else None


def _user_dict(row):
    return {
        "id": str(row[0]),
        "googleSub": row[1],
        "email": row[2],
        "name": row[3],
        "pictureUrl": row[4],
        "status": row[5] if len(row) > 5 else "active",
    }


def claim_unowned_records(user_id):
    """Hand every pre-accounts record to `user_id`.

    Called only for the account whose email matches BOOTSTRAP_OWNER_EMAIL, so the
    data migrated out of the old JSON files cannot be claimed by a stranger who
    happens to sign in first. Returns a per-table count of what was claimed.
    """
    claimed = {}
    with connect() as conn:
        for table in ("batches", "orders", "simulations", "files"):
            result = conn.execute(
                f"UPDATE {table} SET user_id = %s WHERE user_id IS NULL",
                (user_id,),
            )
            claimed[table] = result.rowcount
    return claimed


USER_STATUSES = ("active", "suspended")


def set_user_status(user_id, status):
    """Set a user's status. Returns True when a row changed.

    Anything other than 'active' or 'suspended' returns False without touching
    the database, so the HTTP layer can answer 400. A user_id that is not a
    valid UUID also returns False (Postgres would raise a DataError otherwise).
    """
    if status not in USER_STATUSES or not user_id:
        return False
    try:
        user_id = str(uuid.UUID(user_id))
    except (ValueError, AttributeError, TypeError):
        return False
    with connect() as conn:
        result = conn.execute(
            "UPDATE users SET status = %s WHERE id = %s", (status, user_id)
        )
    return result.rowcount > 0


# --------------------------------------------------------------------------
# Admin audit log and login throttling
# --------------------------------------------------------------------------
def record_admin_action(action, target_id=None, detail=None):
    with connect() as conn:
        conn.execute(
            "INSERT INTO admin_actions (action, target_id, detail) VALUES (%s, %s, %s::jsonb)",
            (action, target_id, json.dumps(detail) if detail is not None else None),
        )


UNKNOWN_IP = "unknown"


def _ip_key(ip):
    """Coalesce a missing IP to one shared bucket.

    `ip = %s` never matches NULL, so a None IP would be unthrottleable. All
    unknown-IP attempts share the 'unknown' bucket: this can over-throttle but
    never under-throttle.
    """
    return ip or UNKNOWN_IP


def clear_login_attempts(ip):
    """Delete every recorded attempt for `ip` (a success resets its throttle)."""
    with connect() as conn:
        conn.execute(
            "DELETE FROM admin_login_attempts WHERE ip = %s", (_ip_key(ip),)
        )


def record_login_attempt(ip, succeeded):
    """Record a failure, or on success clear that IP's recent failures.

    Clearing is done here, so the login endpoint only has to call this once
    per attempt. A success is not stored as a row: it would be deleted by the
    clear anyway, and successes are never counted.
    """
    if succeeded:
        clear_login_attempts(ip)
        return
    with connect() as conn:
        conn.execute(
            "INSERT INTO admin_login_attempts (ip, succeeded) VALUES (%s, %s)",
            (_ip_key(ip), False),
        )


def recent_failed_attempts(ip, minutes=15):
    """Failed admin logins from `ip` in the last `minutes`, counted in Postgres.

    Counted in SQL, not memory: serverless instances do not share memory, so an
    in-process counter could be evaded by spreading attempts across instances.
    """
    with connect() as conn:
        row = conn.execute(
            """
            SELECT count(*) FROM admin_login_attempts
            WHERE ip = %s AND succeeded = false
              AND attempted_at > now() - make_interval(mins => %s)
            """,
            (_ip_key(ip), int(minutes)),
        ).fetchone()
    return int(row[0])


# --------------------------------------------------------------------------
# Ownership checks
# --------------------------------------------------------------------------
OWNABLE_TABLES = ("batches", "orders", "simulations")


def user_owns(kind, record_id, user_id):
    """True only when `record_id` exists in `kind` AND belongs to `user_id`.

    Deliberately strict: a record that does not exist, or one still unowned
    after migration, answers False. Image requests authorise through this, so a
    looser rule would leak another account's designs to anyone who guessed a
    batch id.
    """
    if kind not in OWNABLE_TABLES:
        raise ValueError(f"Unknown record kind: {kind}")
    if not record_id or not user_id:
        return False
    with connect() as conn:
        row = conn.execute(
            f"SELECT 1 FROM {kind} WHERE id = %s AND user_id = %s",  # noqa: S608 - kind is allowlisted above
            (record_id, user_id),
        ).fetchone()
    return row is not None


# --------------------------------------------------------------------------
# Batches
# --------------------------------------------------------------------------
def list_batches(user_id):
    with connect() as conn:
        rows = conn.execute(
            "SELECT data FROM batches WHERE user_id = %s ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
    return [r[0] for r in rows]


def get_batch(batch_id, user_id):
    """Return the batch only if it belongs to this user, else None."""
    with connect() as conn:
        row = conn.execute(
            "SELECT data FROM batches WHERE id = %s AND user_id = %s",
            (batch_id, user_id),
        ).fetchone()
    return row[0] if row else None


def save_batch(batch_id, user_id, data):
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO batches (id, user_id, data) VALUES (%s, %s, %s::jsonb)
            ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
            """,
            (batch_id, user_id, json.dumps(data)),
        )


# --------------------------------------------------------------------------
# Orders
# --------------------------------------------------------------------------
def list_orders(user_id):
    with connect() as conn:
        rows = conn.execute(
            "SELECT data FROM orders WHERE user_id = %s ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
    return [r[0] for r in rows]


def get_order(order_id, user_id):
    with connect() as conn:
        row = conn.execute(
            "SELECT data FROM orders WHERE id = %s AND user_id = %s",
            (order_id, user_id),
        ).fetchone()
    return row[0] if row else None


def save_order(order_id, user_id, data, batch_id=None, status=None):
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO orders (id, user_id, batch_id, status, data)
            VALUES (%s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (id) DO UPDATE
               SET data     = EXCLUDED.data,
                   status   = EXCLUDED.status,
                   batch_id = EXCLUDED.batch_id
            """,
            (
                order_id,
                user_id,
                batch_id if batch_id is not None else data.get("batchId"),
                status if status is not None else (data.get("status") or ""),
                json.dumps(data),
            ),
        )


def delete_order(order_id, user_id):
    """Delete one of this user's orders. Returns True when a row was removed."""
    with connect() as conn:
        result = conn.execute(
            "DELETE FROM orders WHERE id = %s AND user_id = %s", (order_id, user_id)
        )
    return result.rowcount > 0


# --------------------------------------------------------------------------
# Simulations
# --------------------------------------------------------------------------
def list_simulations(user_id):
    """Saved drapes, newest first.

    `thumbnail` is returned as an /api/static URL rather than the inline base64
    the old JSON held, so listing 32 drapes no longer ships ~3.8 MB.
    """
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT data, thumbnail_key FROM simulations
            WHERE user_id = %s ORDER BY created_at DESC
            """,
            (user_id,),
        ).fetchall()
    out = []
    for data, thumb_key in rows:
        record = dict(data)
        if thumb_key:
            record["thumbnail"] = f"/api/static/{thumb_key}"
        out.append(record)
    return out


def save_simulation(sim_id, user_id, data, thumbnail_key=None):
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO simulations (id, user_id, name, drape_style, thumbnail_key, data)
            VALUES (%s, %s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (id) DO UPDATE
               SET data          = EXCLUDED.data,
                   name          = EXCLUDED.name,
                   drape_style   = EXCLUDED.drape_style,
                   thumbnail_key = COALESCE(EXCLUDED.thumbnail_key, simulations.thumbnail_key)
            """,
            (
                sim_id,
                user_id,
                data.get("name"),
                data.get("drapeStyle"),
                thumbnail_key,
                json.dumps(data),
            ),
        )


def delete_simulation(sim_id, user_id):
    with connect() as conn:
        result = conn.execute(
            "DELETE FROM simulations WHERE id = %s AND user_id = %s", (sim_id, user_id)
        )
    return result.rowcount > 0


# --------------------------------------------------------------------------
# Files (generated images, loom files, drape thumbnails)
# --------------------------------------------------------------------------
def _guess_mime(key):
    return mimetypes.guess_type(key)[0] or "application/octet-stream"


def put_file(key, content, mime=None, user_id=None):
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO files (key, mime, content, user_id) VALUES (%s, %s, %s, %s)
            ON CONFLICT (key) DO UPDATE
               SET mime = EXCLUDED.mime, content = EXCLUDED.content, user_id = EXCLUDED.user_id
            """,
            (key, mime or _guess_mime(key), content, user_id),
        )


def get_file(key):
    """Return (bytes, mime) or None. Callers authorise by path prefix before calling."""
    with connect() as conn:
        row = conn.execute("SELECT content, mime FROM files WHERE key = %s", (key,)).fetchone()
    return (bytes(row[0]), row[1]) if row else None


def persist_dir(directory, root, user_id=None):
    """Upload every file under `directory`; keys are paths relative to `root`."""
    if not os.path.isdir(directory):
        return
    for folder, _dirs, names in os.walk(directory):
        for name in names:
            path = os.path.join(folder, name)
            key = os.path.relpath(path, root).replace(os.sep, "/")
            try:
                with open(path, "rb") as f:
                    put_file(key, f.read(), user_id=user_id)
            except Exception as exc:  # one bad file must not fail the whole request
                print(f"Could not persist {key}: {exc}")


# --------------------------------------------------------------------------
# Admin read-only queries (cross-user by design; only admin_routes calls these)
# --------------------------------------------------------------------------
def admin_overview():
    with connect() as conn:
        one = lambda q: conn.execute(q).fetchone()[0]
        totals = {
            "users": one("SELECT count(*) FROM users"),
            "suspended": one("SELECT count(*) FROM users WHERE status = 'suspended'"),
            "batches": one("SELECT count(*) FROM batches"),
            "orders": one("SELECT count(*) FROM orders"),
            "simulations": one("SELECT count(*) FROM simulations"),
            "activeUsers7d": one("SELECT count(*) FROM users WHERE last_login_at > now() - interval '7 days'"),
            "storageBytes": one("SELECT COALESCE(sum(length(content)),0) FROM files"),
        }
        series = conn.execute(
            """
            SELECT to_char(d::date, 'YYYY-MM-DD'),
                   (SELECT count(*) FROM batches b WHERE b.created_at::date = d::date),
                   (SELECT count(*) FROM orders o WHERE o.created_at::date = d::date),
                   (SELECT count(*) FROM users u WHERE u.created_at::date = d::date)
            FROM generate_series(now()::date - 29, now()::date, interval '1 day') AS d
            ORDER BY d
            """
        ).fetchall()
        recent = conn.execute(
            """
            SELECT 'batch', b.id, u.email, b.created_at FROM batches b LEFT JOIN users u ON u.id = b.user_id
            UNION ALL
            SELECT 'order', o.id, u.email, o.created_at FROM orders o LEFT JOIN users u ON u.id = o.user_id
            ORDER BY 4 DESC LIMIT 12
            """
        ).fetchall()
    return {
        "totals": totals,
        "series": [{"date": r[0], "batches": r[1], "orders": r[2], "signups": r[3]} for r in series],
        "recent": [{"kind": r[0], "id": r[1], "email": r[2], "at": r[3].isoformat()} for r in recent],
    }


def admin_list_users():
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT u.id, u.email, u.name, u.picture_url, u.status, u.created_at, u.last_login_at,
                   (SELECT count(*) FROM batches b WHERE b.user_id = u.id),
                   (SELECT count(*) FROM orders o WHERE o.user_id = u.id),
                   (SELECT count(*) FROM simulations s WHERE s.user_id = u.id)
            FROM users u ORDER BY u.created_at DESC
            """
        ).fetchall()
    iso = lambda v: v.isoformat() if v else None
    return [{
        "id": str(r[0]), "email": r[1], "name": r[2], "pictureUrl": r[3], "status": r[4],
        "createdAt": iso(r[5]), "lastLoginAt": iso(r[6]),
        "batches": r[7], "orders": r[8], "simulations": r[9],
    } for r in rows]


def _valid_uuid(value):
    try:
        return str(uuid.UUID(value))
    except (ValueError, AttributeError, TypeError):
        return None


def admin_user_records(user_id):
    """All batches and orders of one user, newest first; None for an unknown user."""
    uid = _valid_uuid(user_id)
    if not uid:
        return None
    with connect() as conn:
        if not conn.execute("SELECT 1 FROM users WHERE id = %s", (uid,)).fetchone():
            return None
        batches = conn.execute(
            "SELECT data, created_at FROM batches WHERE user_id = %s ORDER BY created_at DESC", (uid,)
        ).fetchall()
        orders = conn.execute(
            "SELECT data, created_at FROM orders WHERE user_id = %s ORDER BY created_at DESC", (uid,)
        ).fetchall()
    def batch_view(data, at):
        comps = data.get("uploadedComponents") or {}
        return {
            "id": data.get("id"), "name": data.get("name"), "status": data.get("status"),
            "createdOn": data.get("createdOn"), "_createdAt": at.isoformat(),
            "description": data.get("description"), "engine": data.get("engine"),
            "totalDesigns": data.get("totalDesigns"),
            "uploaded": sum(len(comps.get(k, [])) for k in ("pallu", "border", "body")),
            "generated": len(data.get("designs") or []),
            "inputs": {k: [c.get("label") for c in comps.get(k, [])] for k in ("pallu", "border", "body")},
            "designs": [{"name": x.get("name"), "tags": x.get("tags"), "matchPercent": x.get("matchPercent")}
                        for x in data.get("designs") or []],
        }

    def order_view(data, at):
        return {k: data.get(k) for k in ("id", "batchId", "status", "customerName", "quantity", "price", "createdOn")} | {"_createdAt": at.isoformat()}

    return {
        "batches": [batch_view(r[0], r[1]) for r in batches],
        "orders": [order_view(r[0], r[1]) for r in orders],
    }


# --------------------------------------------------------------------------
# App settings (admin-editable, e.g. the Help contact shown to weavers)
# --------------------------------------------------------------------------
def get_settings(keys):
    """Return {key: value} for the given keys; missing keys come back as ''."""
    out = {k: "" for k in keys}
    with connect() as conn:
        rows = conn.execute(
            "SELECT key, value FROM app_settings WHERE key = ANY(%s)", (list(keys),)
        ).fetchall()
    for k, v in rows:
        out[k] = v
    return out


def set_setting(key, value):
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO app_settings (key, value, updated_at) VALUES (%s, %s, now())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
            """,
            (key, value),
        )
