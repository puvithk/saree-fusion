import pytest
from flask import Flask

import admin
import admin_routes
import db


@pytest.fixture
def client(monkeypatch):
    attempts = []
    monkeypatch.setattr(db, "recent_failed_attempts", lambda ip, minutes=15: len([a for a in attempts if not a]))
    monkeypatch.setattr(db, "record_login_attempt", lambda ip, ok: attempts.append(ok))
    app = Flask(__name__)

    @app.errorhandler(admin.AdminAuthError)
    def _h(e):
        return {"error": e.message}, e.status

    app.register_blueprint(admin_routes.admin_bp)
    return app.test_client()


def test_login_ok_sets_cookie_and_me_works(client):
    r = client.post("/api/admin/login", json={"username": "admin", "password": "test-password-123"})
    assert r.status_code == 200
    assert "sf_admin" in r.headers["Set-Cookie"] and "HttpOnly" in r.headers["Set-Cookie"]
    assert client.get("/api/admin/me").status_code == 200


def test_wrong_password_401_no_cookie(client):
    r = client.post("/api/admin/login", json={"username": "admin", "password": "nope"})
    assert r.status_code == 401 and "Set-Cookie" not in r.headers


def test_me_requires_cookie(client):
    assert client.get("/api/admin/me").status_code == 401


def test_logout_clears_cookie(client):
    client.post("/api/admin/login", json={"username": "admin", "password": "test-password-123"})
    client.post("/api/admin/logout")
    assert client.get("/api/admin/me").status_code == 401


def test_lockout_after_ten_failures(client):
    for _ in range(10):
        client.post("/api/admin/login", json={"username": "admin", "password": "bad"})
    r = client.post("/api/admin/login", json={"username": "admin", "password": "test-password-123"})
    assert r.status_code == 429


def test_data_routes_need_admin(client):
    for path in ("/api/admin/overview", "/api/admin/users"):
        assert client.get(path).status_code == 401


def test_no_image_route(client):
    client.post("/api/admin/login", json={"username": "admin", "password": "test-password-123"})
    assert client.get("/api/admin/file/batches/x/y.png").status_code == 404
