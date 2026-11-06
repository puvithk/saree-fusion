"""Optional Postgres persistence for serverless hosting (Vercel).

Vercel functions only have an ephemeral, per-instance /tmp, so JSON files and
generated images written there disappear. When DATABASE_URL (or POSTGRES_URL)
is set, this module keeps both in Postgres:

  * kv      (name, data jsonb)         - orders, batches, simulations
  * files   (key, mime, content bytea) - generated images and loom files

When no database URL is configured, enabled() is False and main.py keeps using
the local JSON files and static folder exactly as before.
"""
import json
import mimetypes
import os

DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL") or ""

_schema_ready = False


def enabled() -> bool:
    return bool(DATABASE_URL)


def _connect():
    global _schema_ready
    import psycopg  # imported lazily so local development needs no driver

    conn = psycopg.connect(DATABASE_URL, autocommit=True)
    if not _schema_ready:
        conn.execute("CREATE TABLE IF NOT EXISTS kv (name TEXT PRIMARY KEY, data JSONB NOT NULL)")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS files ("
            "key TEXT PRIMARY KEY, mime TEXT NOT NULL, content BYTEA NOT NULL)"
        )
        _schema_ready = True
    return conn


# --------------------------------------------------------------------------
# JSON collections
# --------------------------------------------------------------------------
def db_load(name, seed_path=None, default=None):
    """Return the stored document, seeding it from a bundled JSON file on first use."""
    with _connect() as conn:
        row = conn.execute("SELECT data FROM kv WHERE name = %s", (name,)).fetchone()
        if row is not None:
            return row[0]

        data = default
        if seed_path and os.path.exists(seed_path):
            try:
                with open(seed_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except (OSError, json.JSONDecodeError) as exc:
                print(f"Could not read seed {seed_path}: {exc}")
        if data is None:
            data = []
        # ON CONFLICT: two cold instances may seed at once; the first one wins
        conn.execute(
            "INSERT INTO kv (name, data) VALUES (%s, %s::jsonb) ON CONFLICT (name) DO NOTHING",
            (name, json.dumps(data)),
        )
        row = conn.execute("SELECT data FROM kv WHERE name = %s", (name,)).fetchone()
        return row[0] if row else data


def db_save(name, data):
    with _connect() as conn:
        conn.execute(
            "INSERT INTO kv (name, data) VALUES (%s, %s::jsonb) "
            "ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data",
            (name, json.dumps(data)),
        )


# --------------------------------------------------------------------------
# Files (generated images, loom files)
# --------------------------------------------------------------------------
def _guess_mime(key):
    return mimetypes.guess_type(key)[0] or "application/octet-stream"


def put_file(key, content, mime=None):
    with _connect() as conn:
        conn.execute(
            "INSERT INTO files (key, mime, content) VALUES (%s, %s, %s) "
            "ON CONFLICT (key) DO UPDATE SET mime = EXCLUDED.mime, content = EXCLUDED.content",
            (key, mime or _guess_mime(key), content),
        )


def get_file(key):
    """Return (bytes, mime) or None."""
    with _connect() as conn:
        row = conn.execute("SELECT content, mime FROM files WHERE key = %s", (key,)).fetchone()
    return (bytes(row[0]), row[1]) if row else None


def persist_dir(directory, root):
    """Upload every file under `directory`; keys are paths relative to `root`."""
    if not enabled() or not os.path.isdir(directory):
        return
    for folder, _dirs, names in os.walk(directory):
        for name in names:
            path = os.path.join(folder, name)
            key = os.path.relpath(path, root).replace(os.sep, "/")
            try:
                with open(path, "rb") as f:
                    put_file(key, f.read())
            except Exception as exc:  # one bad file must not fail the request
                print(f"Could not persist {key}: {exc}")
