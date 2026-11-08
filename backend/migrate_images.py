"""Upload generated designs and loom files to object storage (Cloudflare R2).

Moves only what users made -- static/batches and static/orders. The bundled
artwork in static/assets and static/demo_reference is a fixed set that ships
with the repository, already serves fine from disk, and would gain nothing but
a network hop from being in a bucket.

Nothing is deleted. Local files stay as the first tier of the lookup in
serve_static, so this is safe to run and safe to re-run: objects already in the
bucket are skipped unless --force is given.

    python migrate_images.py --dry-run   # report, upload nothing
    python migrate_images.py             # upload what is missing
    python migrate_images.py --force     # re-upload everything
    python migrate_images.py --verify    # check every local file has an object
"""
import os
import sys

# Load .env before importing the storage module: it reads its config at import.
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

import blobstore  # noqa: E402 - must follow load_dotenv() above

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(HERE, "static")

# User-generated and private. Everything else under static/ stays in the repo.
MIGRATE_DIRS = ("batches", "orders")

DRY_RUN = "--dry-run" in sys.argv
FORCE = "--force" in sys.argv
VERIFY = "--verify" in sys.argv


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024


def survey():
    """(files, total_bytes) per directory we intend to migrate."""
    out = {}
    for name in MIGRATE_DIRS:
        root = os.path.join(STATIC_DIR, name)
        files = []
        for folder, _dirs, names in os.walk(root):
            for f in names:
                path = os.path.join(folder, f)
                files.append((path, os.path.relpath(path, STATIC_DIR).replace(os.sep, "/")))
        out[name] = (files, sum(os.path.getsize(p) for p, _ in files))
    return out


def verify(plan):
    missing = []
    checked = 0
    for name, (files, _size) in plan.items():
        for _path, key in files:
            checked += 1
            if not blobstore.exists(key):
                missing.append(key)
    print(f"\nChecked {checked} file(s).")
    if missing:
        print(f"{len(missing)} missing from the bucket:")
        for k in missing[:20]:
            print(f"  {k}")
        if len(missing) > 20:
            print(f"  ... and {len(missing) - 20} more")
        print("\nRun without --verify to upload them.")
        return 1
    print("Every local file has an object in the bucket.")
    return 0


def main():
    if not blobstore.enabled():
        print(blobstore.SETUP_HELP)
        return 1

    plan = survey()
    total_files = sum(len(f) for f, _ in plan.values())
    total_bytes = sum(b for _, b in plan.values())

    print(f"Bucket: {blobstore.BUCKET}   endpoint: {blobstore.endpoint()}")
    print(f"Prefix: {blobstore.PREFIX or '(none)'}")
    for name, (files, size) in plan.items():
        print(f"  static/{name}: {len(files)} file(s), {human(size)}")
    print(f"  total: {total_files} file(s), {human(total_bytes)}")
    print("  (static/assets and static/demo_reference stay in the repo)")

    if VERIFY:
        return verify(plan)

    if DRY_RUN:
        print("\nDry run: nothing uploaded.")
        return 0

    print()
    done = 0
    uploaded = skipped = failed = 0
    for name, (files, _size) in plan.items():
        for path, key in files:
            done += 1
            try:
                if not FORCE and blobstore.exists(key):
                    skipped += 1
                else:
                    blobstore.upload_path(key, path)
                    uploaded += 1
            except Exception as exc:
                failed += 1
                print(f"  failed {key}: {exc}")
            if done % 10 == 0 or done == total_files:
                print(f"  {done}/{total_files}  uploaded {uploaded}, skipped {skipped},"
                      f" failed {failed}", flush=True)

    print(f"\nDone. {uploaded} uploaded, {skipped} already present, {failed} failed.")
    if failed:
        print("Re-run to retry the failures; files already uploaded are skipped.")
        return 1
    print(
        "Local files were not deleted. serve_static still checks disk first, so"
        " nothing changed for this machine; other instances now read from GCS."
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except blobstore.BlobStoreNotConfigured as exc:
        print(exc)
        sys.exit(1)
