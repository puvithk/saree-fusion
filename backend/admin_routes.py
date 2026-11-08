"""Admin portal API. Admins see counts and lists only: no route here serves design images. Everything except login/logout requires the sf_admin cookie.

Kept in its own blueprint so the weaver routes in main.py are untouched.
"""
from flask import Blueprint, jsonify, request

import admin
import db

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def _client_ip():
    # Vercel puts the real client first in X-Forwarded-For.
    fwd = request.headers.get("X-Forwarded-For", "")
    return (fwd.split(",")[0].strip() if fwd else request.remote_addr) or None


@admin_bp.route("/login", methods=["POST"])
def login():
    ip = _client_ip()
    if admin.is_locked_out(ip):
        return jsonify({"error": f"Too many failed attempts. Try again in {admin.LOCKOUT_MINUTES} minutes."}), 429
    body = request.get_json(silent=True) or {}
    ok = admin.verify_credentials(body.get("username"), body.get("password"))
    db.record_login_attempt(ip, ok)
    if not ok:
        # One message for wrong user and wrong password.
        return jsonify({"error": "Invalid username or password."}), 401
    resp = jsonify({"authenticated": True, "role": "admin"})
    return admin.set_session_cookie(resp, admin.issue_session())


@admin_bp.route("/logout", methods=["POST"])
def logout():
    return admin.clear_session_cookie(jsonify({"authenticated": False}))


@admin_bp.route("/me", methods=["GET"])
@admin.require_admin
def me():
    return jsonify({"authenticated": True, "role": "admin", "username": admin.ADMIN_USERNAME})


@admin_bp.route("/overview", methods=["GET"])
@admin.require_admin
def overview():
    return jsonify(db.admin_overview())


@admin_bp.route("/users", methods=["GET"])
@admin.require_admin
def users():
    return jsonify({"users": db.admin_list_users()})


@admin_bp.route("/users/<user_id>/status", methods=["PATCH"])
@admin.require_admin
def user_status(user_id):
    status = (request.get_json(silent=True) or {}).get("status")
    if status not in db.USER_STATUSES:
        return jsonify({"error": "status must be 'active' or 'suspended'."}), 400
    if not db.set_user_status(user_id, status):
        return jsonify({"error": "User not found."}), 404
    db.record_admin_action("user.status", target_id=user_id, detail={"status": status})
    return jsonify({"id": user_id, "status": status})


@admin_bp.route("/users/<user_id>/records", methods=["GET"])
@admin.require_admin
def user_records(user_id):
    records = db.admin_user_records(user_id)
    if records is None:
        return jsonify({"error": "User not found."}), 404
    return jsonify(records)
