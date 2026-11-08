import os
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from flask import Flask, Response, jsonify

import admin


def _token(secret, **claims):
    now = datetime.now(timezone.utc)
    payload = {"iat": int(now.timestamp()), "exp": int((now + timedelta(hours=1)).timestamp())}
    payload.update(claims)
    return jwt.encode(payload, secret, algorithm="HS256")


def _set_cookie_header(response):
    headers = response.headers.get_all("Set-Cookie")
    assert len(headers) == 1
    return headers[0]


# ---- issue_session / read_session ----------------------------------------
def test_roundtrip_session():
    claims = admin.read_session(admin.issue_session())
    assert claims["role"] == "admin"


def test_session_lasts_eight_hours():
    claims = admin.read_session(admin.issue_session())
    assert claims["exp"] - claims["iat"] == 8 * 60 * 60


def test_tampered_token_rejected():
    with pytest.raises(admin.AdminAuthError) as exc:
        admin.read_session(admin.issue_session() + "x")
    assert exc.value.status == 401


def test_weaver_token_rejected_by_secret():
    # A weaver session: signed with SESSION_SECRET, no role claim.
    weaver = _token(os.environ["SESSION_SECRET"], sub="u1", email="w@example.com")
    with pytest.raises(admin.AdminAuthError) as exc:
        admin.read_session(weaver)
    assert exc.value.status == 401


def test_weaver_token_rejected_even_if_secrets_match(monkeypatch):
    # The two secrets misconfigured to the same value: only the role check stands.
    monkeypatch.setenv("ADMIN_SESSION_SECRET", os.environ["SESSION_SECRET"])
    weaver = _token(os.environ["SESSION_SECRET"], sub="u1", email="w@example.com")
    with pytest.raises(admin.AdminAuthError):
        admin.read_session(weaver)


def test_wrong_role_rejected():
    token = _token(os.environ["ADMIN_SESSION_SECRET"], role="user")
    with pytest.raises(admin.AdminAuthError):
        admin.read_session(token)


def test_expired_token_rejected():
    past = int((datetime.now(timezone.utc) - timedelta(minutes=1)).timestamp())
    token = _token(os.environ["ADMIN_SESSION_SECRET"], role="admin", exp=past)
    with pytest.raises(admin.AdminAuthError) as exc:
        admin.read_session(token)
    assert "expired" in exc.value.message


# ---- secret handling -------------------------------------------------------
@pytest.mark.parametrize("env", [{}, {"VERCEL": "1"}, {"FLASK_ENV": "production"}])
def test_unset_secret_raises_instead_of_signing(monkeypatch, env):
    monkeypatch.delenv("ADMIN_SESSION_SECRET")
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("FLASK_ENV", raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    # SESSION_SECRET stays set: it must NOT be used as a fallback either.
    assert os.environ["SESSION_SECRET"]
    with pytest.raises(admin.AdminAuthError) as exc:
        admin.issue_session()
    assert exc.value.status == 500
    assert "ADMIN_SESSION_SECRET" in exc.value.message


def test_blank_secret_raises(monkeypatch):
    monkeypatch.setenv("ADMIN_SESSION_SECRET", "   ")
    with pytest.raises(admin.AdminAuthError) as exc:
        admin.read_session("anything")
    assert exc.value.status == 500


def test_no_dev_secret_constant_exists():
    assert not hasattr(admin, "_DEV_SECRET")


def test_token_without_exp_rejected():
    secret = os.environ["ADMIN_SESSION_SECRET"]
    now = int(datetime.now(timezone.utc).timestamp())
    token = jwt.encode({"role": "admin", "iat": now}, secret, algorithm="HS256")
    with pytest.raises(admin.AdminAuthError) as exc:
        admin.read_session(token)
    assert exc.value.status == 401


def test_token_without_iat_rejected():
    secret = os.environ["ADMIN_SESSION_SECRET"]
    exp = int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp())
    token = jwt.encode({"role": "admin", "exp": exp}, secret, algorithm="HS256")
    with pytest.raises(admin.AdminAuthError):
        admin.read_session(token)


def test_session_not_signed_with_weaver_secret():
    token = admin.issue_session()
    with pytest.raises(jwt.InvalidTokenError):
        jwt.decode(token, os.environ["SESSION_SECRET"], algorithms=["HS256"])


# ---- cookie helpers --------------------------------------------------------
def test_cookie_name_is_sf_admin():
    assert admin.COOKIE_NAME == "sf_admin"


def test_set_session_cookie_flags(monkeypatch):
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("SESSION_COOKIE_SECURE", raising=False)
    header = _set_cookie_header(admin.set_session_cookie(Response(), "tok123"))
    assert header.startswith("sf_admin=tok123")
    assert "HttpOnly" in header
    assert "SameSite=Lax" in header
    assert "Max-Age=28800" in header
    assert "Path=/" in header
    assert "Secure" not in header


def test_set_session_cookie_secure_in_production(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    header = _set_cookie_header(admin.set_session_cookie(Response(), "tok123"))
    assert "Secure" in header


def test_clear_session_cookie_expires_it(monkeypatch):
    monkeypatch.delenv("VERCEL", raising=False)
    header = _set_cookie_header(admin.clear_session_cookie(Response()))
    assert header.startswith("sf_admin=;")
    assert "Max-Age=0" in header or "1970" in header


# ---- require_admin ---------------------------------------------------------
@pytest.fixture
def client():
    app = Flask(__name__)
    calls = []

    @app.errorhandler(admin.AdminAuthError)
    def _handle(err):
        return jsonify({"error": err.message}), err.status

    @app.get("/secret")
    @admin.require_admin
    def secret():
        calls.append(1)
        return "ok"

    test_client = app.test_client()
    test_client.calls = calls
    return test_client


def _cookie(name, value):
    return {"Cookie": f"{name}={value}"}


def test_require_admin_allows_valid_session(client):
    resp = client.get("/secret", headers=_cookie("sf_admin", admin.issue_session()))
    assert resp.status_code == 200
    assert client.calls == [1]


def test_require_admin_rejects_missing_cookie(client):
    resp = client.get("/secret")
    assert resp.status_code == 401
    assert client.calls == []


def test_require_admin_rejects_weaver_token_in_admin_cookie(client):
    weaver = _token(os.environ["SESSION_SECRET"], sub="u1")
    resp = client.get("/secret", headers=_cookie("sf_admin", weaver))
    assert resp.status_code == 401
    assert client.calls == []


def test_require_admin_ignores_weaver_cookie_name(client):
    # A perfectly valid admin token under the weaver cookie name grants nothing.
    resp = client.get("/secret", headers=_cookie("sf_session", admin.issue_session()))
    assert resp.status_code == 401
    assert client.calls == []
