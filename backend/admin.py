"""Admin portal credentials.

The admin signs in with a username and password, separate from the weavers'
Google sign-in. Both come from the environment (ADMIN_USERNAME and
ADMIN_PASSWORD_HASH), so no plaintext password lives in any file. Generate the
hash with:  python admin.py --set-password
"""
import hmac
import os
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import request
from werkzeug.security import check_password_hash, generate_password_hash

import db

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "").strip()
ADMIN_PASSWORD_HASH = os.environ.get("ADMIN_PASSWORD_HASH", "").strip()

COOKIE_NAME = "sf_admin"
SESSION_HOURS = 8
JWT_ALGORITHM = "HS256"
ADMIN_ROLE = "admin"

# Login throttle: this many failures from one IP inside the window locks it out.
MAX_ATTEMPTS = 10
LOCKOUT_MINUTES = 15


def hash_password(plain: str) -> str:
    return generate_password_hash(plain)


def verify_credentials(username: str, password: str) -> bool:
    """True only if both the username and the password match the configured admin.

    Total over any input a JSON body can deliver: wrong types, empty values and
    lone surrogates all return False instead of raising.
    """
    # Reject bad input before any hashing: non-strings (JSON can send numbers or
    # lists), empty values, and an unconfigured admin, so empty env vars can never
    # be matched by empty input.
    if not isinstance(username, str) or not isinstance(password, str):
        return False
    if not username or not password or not ADMIN_USERNAME or not ADMIN_PASSWORD_HASH:
        return False
    # Compare as bytes: compare_digest rejects non-ASCII str. surrogatepass keeps
    # a lone surrogate (which JSON allows) from raising.
    username_ok = hmac.compare_digest(
        username.encode("utf-8", errors="surrogatepass"),
        ADMIN_USERNAME.encode("utf-8", errors="surrogatepass"),
    )
    # With non-empty input, always check the password, even when the username is
    # wrong, so a wrong username and a wrong password take the same time.
    try:
        password_ok = check_password_hash(ADMIN_PASSWORD_HASH, password)
    except UnicodeError:
        # werkzeug cannot encode a lone surrogate; such a password cannot match.
        password_ok = False
    return username_ok and password_ok


# --------------------------------------------------------------------------
# Admin session cookie
# --------------------------------------------------------------------------
class AdminAuthError(Exception):
    """An admin request could not be authenticated. Carries the HTTP status to return."""

    def __init__(self, message, status=401):
        super().__init__(message)
        self.message = message
        self.status = status


def admin_session_secret():
    """The key admin session JWTs are signed with (never SESSION_SECRET).

    There is no development fallback: a known constant in source would let anyone
    mint a valid admin session on any deployment that forgot to set the variable.
    """
    secret = os.environ.get("ADMIN_SESSION_SECRET", "").strip()
    if not secret:
        raise AdminAuthError(
            "ADMIN_SESSION_SECRET is not set. Generate one with: python -c "
            '"import secrets; print(secrets.token_urlsafe(48))"',
            status=500,
        )
    return secret


def _jwt():
    try:
        import jwt
    except ImportError as exc:
        raise AdminAuthError(
            "The PyJWT package is missing. Run: pip install -r requirements.txt", status=500
        ) from exc
    return jwt


def issue_session() -> str:
    jwt = _jwt()
    now = datetime.now(timezone.utc)
    payload = {
        "role": ADMIN_ROLE,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=SESSION_HOURS)).timestamp()),
    }
    return jwt.encode(payload, admin_session_secret(), algorithm=JWT_ALGORITHM)


def read_session(token: str) -> dict:
    jwt = _jwt()
    try:
        claims = jwt.decode(
            token,
            admin_session_secret(),
            algorithms=[JWT_ALGORITHM],
            # PyJWT only checks exp when present; require it so no token lives forever.
            options={"require": ["exp", "iat"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AdminAuthError("Your session has expired. Please sign in again.") from exc
    except jwt.InvalidTokenError as exc:
        raise AdminAuthError("Your session is not valid. Please sign in again.") from exc
    # Defence that does not depend on the two secrets differing: a weaver token
    # has no role claim, so it is refused even if the secrets were ever equal.
    if claims.get("role") != ADMIN_ROLE:
        raise AdminAuthError("Your session is not valid. Please sign in again.")
    return claims


def set_session_cookie(response, token):
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=SESSION_HOURS * 60 * 60,
        httponly=True,          # page JavaScript must not be able to read this
        samesite="Lax",         # blocks the cross-site requests CSRF relies on
        secure=_use_secure_cookies(),
        path="/",
    )
    return response


def clear_session_cookie(response):
    response.delete_cookie(COOKIE_NAME, path="/", samesite="Lax", secure=_use_secure_cookies())
    return response


def _use_secure_cookies():
    """Secure cookies in production; plain HTTP localhost could not send them otherwise."""
    if os.environ.get("VERCEL"):
        return True
    return os.environ.get("SESSION_COOKIE_SECURE", "").lower() in ("1", "true", "yes")


def is_locked_out(ip) -> bool:
    """True when `ip` has MAX_ATTEMPTS or more failed logins in the last LOCKOUT_MINUTES."""
    return db.recent_failed_attempts(ip, LOCKOUT_MINUTES) >= MAX_ATTEMPTS


def require_admin(view):
    """Reject the request unless a valid admin session cookie is present."""

    @wraps(view)
    def wrapper(*args, **kwargs):
        token = request.cookies.get(COOKIE_NAME)
        if not token:
            raise AdminAuthError("Please sign in to continue.")
        read_session(token)  # raises AdminAuthError, turned into JSON by the app error handler
        return view(*args, **kwargs)

    return wrapper


if __name__ == "__main__":
    import argparse
    import getpass

    parser = argparse.ArgumentParser(description="Admin portal helper")
    parser.add_argument("--set-password", action="store_true",
                        help="prompt for a password and print its hash for ADMIN_PASSWORD_HASH in .env")
    args = parser.parse_args()
    if not args.set_password:
        parser.print_help()
    else:
        # getpass keeps the plaintext off the screen and out of shell history;
        # only the hash is printed, and nothing is written to disk.
        plain = getpass.getpass("New admin password: ")
        if plain != getpass.getpass("Repeat password: "):
            raise SystemExit("Passwords do not match.")
        if not plain:
            raise SystemExit("Password must not be empty.")
        print(hash_password(plain))
