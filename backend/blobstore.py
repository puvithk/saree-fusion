"""Object storage for generated designs and loom files (S3-compatible).

Built for Cloudflare R2, and works unchanged with Amazon S3, Backblaze B2 or
MinIO, since all of them speak the same API. R2 is the default because it
authenticates with a plain access key and secret -- no service-account key, so
no Google organisation policy standing in the way -- and charges nothing for
egress.

Why a private bucket rather than public objects:

  /api/static/<path> authorises every read against the signed-in user, so
  designs stay private to the weaver who made them. Public object URLs would
  bypass that check entirely -- anyone holding a link could read anyone's work.
  The bucket stays private, and the API issues a presigned URL that expires in
  minutes, only after the ownership check has passed.

The browser then fetches bytes straight from the provider, so Flask never
carries image traffic. An <img src> follows the 302 on its own, so the frontend
needs no changes.

Entirely optional: with no bucket configured, enabled() is False and the app
keeps serving from local disk and Postgres exactly as before.
"""
import mimetypes
import os
import threading

# R2 names its endpoint after the account id; S3/MinIO take a full endpoint URL.
ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "").strip()
BUCKET = (os.environ.get("R2_BUCKET") or os.environ.get("S3_BUCKET") or "").strip()
ACCESS_KEY = (os.environ.get("R2_ACCESS_KEY_ID") or os.environ.get("AWS_ACCESS_KEY_ID") or "").strip()
SECRET_KEY = (
    os.environ.get("R2_SECRET_ACCESS_KEY") or os.environ.get("AWS_SECRET_ACCESS_KEY") or ""
).strip()
ENDPOINT_URL = (os.environ.get("S3_ENDPOINT_URL") or "").strip()
# R2 ignores regions but the SDK insists on one.
REGION = os.environ.get("S3_REGION", "auto").strip()

# Objects live under this prefix so one bucket can hold other things too.
PREFIX = os.environ.get("BLOB_PREFIX", "static").strip().strip("/")
# Short, because the URL grants access to whoever holds it; long enough for a
# slow page to finish loading every image on it.
SIGNED_URL_TTL_SECONDS = int(os.environ.get("BLOB_SIGNED_URL_TTL", "900"))

_client = None
_lock = threading.Lock()

SETUP_HELP = (
    "Object storage is not configured.\n"
    "  1. Cloudflare dashboard > R2 > create a bucket. Leave public access OFF:\n"
    "     the API hands out short-lived presigned URLs, so a public bucket would\n"
    "     undo per-user privacy.\n"
    "  2. R2 > Manage API tokens > create a token with Object Read & Write.\n"
    "     Note the Access Key ID, Secret Access Key and your Account ID.\n"
    "  3. In backend/.env set:\n"
    "       R2_ACCOUNT_ID=<account id>\n"
    "       R2_BUCKET=<bucket name>\n"
    "       R2_ACCESS_KEY_ID=<access key id>\n"
    "       R2_SECRET_ACCESS_KEY=<secret access key>"
)


class BlobStoreNotConfigured(RuntimeError):
    """Raised with setup instructions rather than a stack trace."""


def endpoint():
    if ENDPOINT_URL:
        return ENDPOINT_URL
    if ACCOUNT_ID:
        return f"https://{ACCOUNT_ID}.r2.cloudflarestorage.com"
    return ""


def enabled() -> bool:
    return bool(BUCKET and ACCESS_KEY and SECRET_KEY and endpoint())


def object_name(key):
    """Map an /api/static path to its object key in the bucket."""
    clean = key.replace("\\", "/").lstrip("/")
    return f"{PREFIX}/{clean}" if PREFIX else clean


def client():
    """The S3 client, created once and reused."""
    global _client
    if not enabled():
        raise BlobStoreNotConfigured(SETUP_HELP)
    if _client is not None:
        return _client

    with _lock:
        if _client is not None:  # another thread won the race
            return _client
        try:
            import boto3
            from botocore.config import Config
        except ImportError as exc:
            raise BlobStoreNotConfigured(
                "boto3 is not installed. Run: python -m pip install -r requirements.txt"
            ) from exc
        _client = boto3.client(
            "s3",
            endpoint_url=endpoint(),
            aws_access_key_id=ACCESS_KEY,
            aws_secret_access_key=SECRET_KEY,
            region_name=REGION,
            # R2 requires SigV4; the default would be fine on S3 but not everywhere.
            config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
        )
    return _client


def _guess_mime(key):
    return mimetypes.guess_type(key)[0] or "application/octet-stream"


def _is_missing(exc):
    """True when an S3 error means 'no such object' rather than a real failure."""
    code = getattr(exc, "response", {}).get("Error", {}).get("Code", "")
    return code in ("404", "NoSuchKey", "NotFound")


def upload_bytes(key, content, mime=None):
    """Store raw bytes at `key`. Overwrites any existing object."""
    client().put_object(
        Bucket=BUCKET, Key=object_name(key), Body=content, ContentType=mime or _guess_mime(key)
    )
    return key


def upload_path(key, path, mime=None):
    """Store a file from disk at `key`, streamed rather than read into memory."""
    client().upload_file(
        path, BUCKET, object_name(key), ExtraArgs={"ContentType": mime or _guess_mime(key)}
    )
    return key


def exists(key):
    try:
        client().head_object(Bucket=BUCKET, Key=object_name(key))
        return True
    except BlobStoreNotConfigured:
        return False
    except Exception as exc:
        if _is_missing(exc):
            return False
        raise


def signed_url(key, ttl_seconds=None):
    """A time-limited read URL, or None if the object is not there.

    Callers must authorise the request first: this URL works for anyone who
    holds it until it expires.
    """
    if not exists(key):
        return None
    return client().generate_presigned_url(
        "get_object",
        Params={"Bucket": BUCKET, "Key": object_name(key)},
        ExpiresIn=ttl_seconds or SIGNED_URL_TTL_SECONDS,
    )


def download_bytes(key):
    """(bytes, mime) or None. Used where a redirect is not appropriate."""
    try:
        obj = client().get_object(Bucket=BUCKET, Key=object_name(key))
    except Exception as exc:
        if _is_missing(exc):
            return None
        raise
    return obj["Body"].read(), obj.get("ContentType") or _guess_mime(key)


def check():
    """Confirm the credentials actually work. Raises on failure."""
    client().head_bucket(Bucket=BUCKET)
    return True


def upload_dir(directory, root, skip_existing=True, on_file=None):
    """Upload every file under `directory`; keys are paths relative to `root`.

    Returns (uploaded, skipped, failed).
    """
    uploaded = skipped = failed = 0
    if not os.path.isdir(directory):
        return uploaded, skipped, failed

    for folder, _dirs, names in os.walk(directory):
        for name in names:
            path = os.path.join(folder, name)
            key = os.path.relpath(path, root).replace(os.sep, "/")
            try:
                if skip_existing and exists(key):
                    skipped += 1
                else:
                    upload_path(key, path)
                    uploaded += 1
                if on_file:
                    on_file(key)
            except Exception as exc:  # one bad file must not stop the rest
                failed += 1
                print(f"  could not upload {key}: {exc}")
    return uploaded, skipped, failed
