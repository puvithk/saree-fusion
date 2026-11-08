"""Google sign-in and session handling.

Flow (chosen because Google's own ID tokens expire after one hour, which would
log a weaver out in the middle of generating a batch):

  1. The browser signs in with Google and gets an ID token.
  2. It POSTs that token once to /api/auth/google.
  3. We verify the token's signature against Google's public keys, upsert the
     user, then mint OUR OWN session JWT and set it as an httpOnly cookie.
  4. Every later request is authenticated by that cookie.

The cookie is httpOnly, so page JavaScript cannot read it and an XSS bug cannot
steal the session the way it could from localStorage. Session lifetime is ours
to choose and ours to revoke.
"""
import os
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import g, jsonify, request

import db

COOKIE_NAME = "sf_session"
SESSION_DAYS = 7
JWT_ALGORITHM = "HS256"

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
# Whoever owns this email claims the records migrated out of the old JSON files.
# Gating on a configured address stops a stranger who signs in first from taking them.
BOOTSTRAP_OWNER_EMAIL = os.environ.get("BOOTSTRAP_OWNER_EMAIL", "").strip().lower()

_DEV_SECRET = "dev-only-insecure-secret-change-me"


class AuthError(Exception):
    """A request could not be authenticated. Carries the HTTP status to return."""

    def __init__(self, message, status=401):
        super().__init__(message)
        self.message = message
        self.status = status


def session_secret():
    """The key our session JWTs are signed with.

    In production a missing secret is fatal: falling back to a known constant
    would let anyone mint a valid session for any account.
    """
    secret = os.environ.get("SESSION_SECRET", "").strip()
    if secret:
        return secret
    if os.environ.get("VERCEL") or os.environ.get("FLASK_ENV") == "production":
        raise AuthError(
            "SESSION_SECRET is not set. Generate one with: python -c "
            '"import secrets; print(secrets.token_urlsafe(48))"',
            status=500,
        )
    return _DEV_SECRET


def configured() -> bool:
    return bool(GOOGLE_CLIENT_ID)


# --------------------------------------------------------------------------
# Google ID token verification
# --------------------------------------------------------------------------
def verify_google_token(id_token_str):
    """Verify a Google ID token and return its claims.

    Raises AuthError on anything suspect. Never trust an unverified token: the
    signature check is what stops a caller from inventing an email claim.
    """
    if not GOOGLE_CLIENT_ID:
        raise AuthError(
            "GOOGLE_CLIENT_ID is not set on the server, so Google sign-in cannot be verified.",
            status=500,
        )
    if not id_token_str:
        raise AuthError("No Google credential was supplied.", status=400)

    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token
    except ImportError as exc:
        raise AuthError(
            "The google-auth package is missing. Run: pip install -r requirements.txt",
            status=500,
        ) from exc

    try:
        claims = google_id_token.verify_oauth2_token(
            id_token_str,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
            # Small tolerance so a slightly skewed client clock is not an outage.
            clock_skew_in_seconds=10,
        )
    except ValueError as exc:
        # Wrong audience, bad signature, or expired: all are "not signed in".
        raise AuthError(f"Google sign-in could not be verified: {exc}") from exc

    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise AuthError("Google token has an unexpected issuer.")
    if not claims.get("email"):
        raise AuthError("Google did not return an email address for this account.")
    if not claims.get("email_verified", False):
        raise AuthError("This Google account's email address is not verified.")
    if not claims.get("sub"):
        raise AuthError("Google token is missing its subject id.")
    return claims


# --------------------------------------------------------------------------
# Our own session tokens
# --------------------------------------------------------------------------
def _jwt():
    try:
        import jwt
    except ImportError as exc:
        raise AuthError(
            "The PyJWT package is missing. Run: pip install -r requirements.txt", status=500
        ) from exc
    return jwt


def issue_session(user):
    jwt = _jwt()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=SESSION_DAYS)).timestamp()),
    }
    return jwt.encode(payload, session_secret(), algorithm=JWT_ALGORITHM)


def read_session(token):
    jwt = _jwt()
    try:
        return jwt.decode(token, session_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("Your session has expired. Please sign in again.") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError("Your session is not valid. Please sign in again.") from exc


def set_session_cookie(response, token):
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=SESSION_DAYS * 24 * 60 * 60,
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


# --------------------------------------------------------------------------
# Request helpers
# --------------------------------------------------------------------------
def current_user(required=True):
    """Resolve the signed-in user for this request, caching it on `g`."""
    if hasattr(g, "sf_user"):
        user = g.sf_user
    else:
        user = None
        token = request.cookies.get(COOKIE_NAME)
        if token:
            claims = read_session(token)
            if claims.get("role"):
                # An admin token is never a weaver session.
                raise AuthError("Your session is not valid. Please sign in again.")
            user = db.get_user(claims.get("sub"))
            # A valid token whose user row is gone means the account was deleted.
            if user is None:
                raise AuthError("Your account no longer exists. Please sign in again.")
            if user.get("status") == "suspended":
                raise AuthError("This account has been suspended. Contact support.", status=403)
        g.sf_user = user

    if required and user is None:
        raise AuthError("Please sign in to continue.")
    return user


def current_user_id(required=True):
    user = current_user(required=required)
    return user["id"] if user else None


def require_auth(view):
    """Reject the request unless a valid session cookie is present."""

    @wraps(view)
    def wrapper(*args, **kwargs):
        current_user()  # raises AuthError, turned into JSON by the app error handler
        return view(*args, **kwargs)

    return wrapper


def login_and_claim(claims):
    """Upsert the verified Google user and, if configured, hand them the legacy records."""
    user = db.upsert_user(
        google_sub=claims["sub"],
        email=claims["email"],
        name=claims.get("name"),
        picture_url=claims.get("picture"),
    )
    if BOOTSTRAP_OWNER_EMAIL and user["email"] == BOOTSTRAP_OWNER_EMAIL:
        claimed = db.claim_unowned_records(user["id"])
        if any(claimed.values()):
            print(f"Claimed pre-account records for {user['email']}: {claimed}")
    return user


def register_error_handler(app):
    """Return AuthError as JSON so the frontend can react instead of parsing HTML."""

    @app.errorhandler(AuthError)
    def _handle(err):
        return jsonify({"error": err.message, "authenticated": False}), err.status
