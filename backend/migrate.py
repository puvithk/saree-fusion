"""One-time migration: JSON files -> per-user Postgres tables.

Moves the records that existed before accounts into the new schema with
`user_id = NULL`. They stay invisible to every account until the address in
BOOTSTRAP_OWNER_EMAIL signs in, at which point auth.login_and_claim() assigns
them (see db.claim_unowned_records).

Simulation thumbnails are pulled out of the JSON as they go: each one was a
~137 KB base64 data URL stored inline, which is why listing 32 drapes shipped
about 3.8 MB. They become rows in `files`, referenced by `thumbnail_key`.

Safe to run more than once: every write is an upsert keyed on the record id.

    python migrate.py            # migrate records
    python migrate.py --images   # also copy static/ images into the files table
    python migrate.py --dry-run  # report what would happen, change nothing
"""
import base64
import json
import os
import sys

# Load .env BEFORE importing db: db reads DATABASE_URL at module import time,
# so a later load would leave it blank and the script would report no database.
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

import db  # noqa: E402 - must follow load_dotenv() above

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(HERE, "static")

DRY_RUN = "--dry-run" in sys.argv
WITH_IMAGES = "--images" in sys.argv


def read_json(name):
    path = os.path.join(HERE, name)
    if not os.path.exists(path):
        print(f"  {name}: not found, skipping")
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"  {name}: could not read ({exc}), skipping")
        return []
    if not isinstance(data, list):
        print(f"  {name}: expected a list, got {type(data).__name__}, skipping")
        return []
    return data


def split_data_url(value):
    """('image/jpeg', raw_bytes) from a data: URL, or None if it is not one."""
    if not isinstance(value, str) or not value.startswith("data:"):
        return None
    try:
        header, encoded = value.split(",", 1)
        if ";base64" not in header:
            return None
        mime = header[5:].split(";")[0] or "application/octet-stream"
        return mime, base64.b64decode(encoded)
    except (ValueError, base64.binascii.Error) as exc:
        print(f"    could not decode inline thumbnail: {exc}")
        return None


def extension_for(mime):
    return {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
    }.get(mime, "bin")


def migrate_batches():
    records = read_json("batches.json")
    print(f"  batches.json: {len(records)} record(s)")
    for record in records:
        batch_id = record.get("id")
        if not batch_id:
            print("    skipping a batch with no id")
            continue
        if not DRY_RUN:
            db.save_batch(batch_id, None, record)
    return len(records)


def migrate_orders():
    records = read_json("orders.json")
    print(f"  orders.json: {len(records)} record(s)")
    for record in records:
        order_id = record.get("id")
        if not order_id:
            print("    skipping an order with no id")
            continue
        if not DRY_RUN:
            db.save_order(
                order_id,
                None,
                record,
                batch_id=record.get("batchId"),
                status=record.get("status") or "",
            )
    return len(records)


def migrate_simulations():
    records = read_json("simulations.json")
    print(f"  simulations.json: {len(records)} record(s)")
    extracted = 0
    saved_bytes = 0
    for record in records:
        sim_id = record.get("id")
        if not sim_id:
            print("    skipping a simulation with no id")
            continue

        record = dict(record)
        # The old `owner` field was a client-supplied query param with no
        # enforcement behind it. Ownership now lives in the user_id column.
        record.pop("owner", None)

        thumbnail_key = None
        decoded = split_data_url(record.get("thumbnail"))
        if decoded:
            mime, raw = decoded
            thumbnail_key = f"simulations/{sim_id}/thumbnail.{extension_for(mime)}"
            saved_bytes += len(record["thumbnail"]) - len(raw)
            extracted += 1
            if not DRY_RUN:
                db.put_file(thumbnail_key, raw, mime=mime, user_id=None)
            # Drop the inline copy so the row does not carry it twice.
            record.pop("thumbnail", None)

        if not DRY_RUN:
            db.save_simulation(sim_id, None, record, thumbnail_key=thumbnail_key)

    if extracted:
        print(
            f"    extracted {extracted} inline thumbnail(s) into files, "
            f"shrinking the rows by ~{saved_bytes / 1_048_576:.1f} MB"
        )
    return len(records)


def migrate_images():
    """Copy static/ into the files table so serverless instances can serve it."""
    if not os.path.isdir(STATIC_DIR):
        print("  static/ not found, skipping images")
        return 0
    total = sum(len(names) for _root, _dirs, names in os.walk(STATIC_DIR))
    size = sum(
        os.path.getsize(os.path.join(root, n))
        for root, _dirs, names in os.walk(STATIC_DIR)
        for n in names
    )
    print(f"  static/: {total} file(s), {size / 1_048_576:.0f} MB")
    if DRY_RUN:
        return total
    # Shared app assets stay unowned so every account can load them.
    db.persist_dir(STATIC_DIR, STATIC_DIR, user_id=None)
    return total


def main():
    if not db.enabled():
        print("DATABASE_URL is not set, so there is nowhere to migrate to.\n")
        print(
            "  Local Postgres in Docker:\n"
            "    docker run -d --name sareefusion-db -e POSTGRES_PASSWORD=dev \\\n"
            "      -e POSTGRES_DB=sareefusion -p 5432:5432 postgres:16\n\n"
            "  Then create backend/.env containing:\n"
            "    DATABASE_URL=postgresql://postgres:dev@localhost:5432/sareefusion\n"
        )
        return 1

    print("SareeFusion migration" + ("  [DRY RUN, nothing will be written]" if DRY_RUN else ""))
    print(f"Target: {db.DATABASE_URL.split('@')[-1] or 'configured database'}\n")

    if not DRY_RUN:
        db.connect().close()  # create the schema up front so failures surface early
        print("Schema ready.\n")

    print("Migrating records:")
    batches = migrate_batches()
    orders = migrate_orders()
    simulations = migrate_simulations()

    images = 0
    if WITH_IMAGES:
        print("\nMigrating images:")
        images = migrate_images()

    print(
        f"\nDone. {batches} batch(es), {orders} order(s), {simulations} simulation(s)"
        + (f", {images} image file(s)" if WITH_IMAGES else "")
        + "."
    )
    owner = os.environ.get("BOOTSTRAP_OWNER_EMAIL", "").strip()
    if owner:
        print(f"These records are unowned until {owner} signs in with Google, which claims them.")
    else:
        print(
            "No BOOTSTRAP_OWNER_EMAIL is set, so nothing will claim these records.\n"
            "Add BOOTSTRAP_OWNER_EMAIL=<your google address> to backend/.env before signing in."
        )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except db.DatabaseNotConfigured as exc:
        print(exc)
        sys.exit(1)
