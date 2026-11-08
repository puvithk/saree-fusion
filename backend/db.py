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
"""

# `files` predates this module without a user_id, so add it when upgrading in place.
_MIGRATIONS = [
    "ALTER TABLE files ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE",
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
            "SELECT id, google_sub, email, name, picture_url FROM users WHERE id = %s",
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
