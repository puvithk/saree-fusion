"""Test environment, set before any test module imports `admin`.

admin.py reads its credentials from the environment at import time, so these
must be in place first. conftest.py is loaded before test modules are collected.
"""
import os
import sys

from werkzeug.security import generate_password_hash

# Let `import admin` work however pytest is invoked, not only via `python -m pytest`
# from backend/.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["ADMIN_USERNAME"] = "admin"
os.environ["ADMIN_PASSWORD_HASH"] = generate_password_hash("test-password-123", method="scrypt")
# Distinct values on purpose: tests prove a weaver token signed with SESSION_SECRET
# cannot pass as an admin session signed with ADMIN_SESSION_SECRET.
os.environ["SESSION_SECRET"] = "test-weaver-session-secret"
os.environ["ADMIN_SESSION_SECRET"] = "test-admin-session-secret"
