import json

import pytest

import admin
import db


class FakeResult:
    def __init__(self, rowcount=1, row=(0,)):
        self.rowcount = rowcount
        self._row = row

    def fetchone(self):
        return self._row


class FakeConn:
    """Records every execute() so tests can inspect the SQL and bound parameters."""

    def __init__(self, rowcount=1, row=(0,)):
        self.calls = []
        self._result = FakeResult(rowcount, row)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self.calls.append((sql, params))
        return self._result


@pytest.fixture
def fake_db(monkeypatch):
    def install(**kw):
        conn = FakeConn(**kw)
        monkeypatch.setattr(db, "connect", lambda: conn)
        return conn

    return install


# ---- admin.is_locked_out --------------------------------------------------
def test_constants():
    assert admin.MAX_ATTEMPTS == 10
    assert admin.LOCKOUT_MINUTES == 15


def test_locked_out_at_max_attempts(monkeypatch):
    monkeypatch.setattr(admin.db, "recent_failed_attempts", lambda ip, minutes=15: 10)
    assert admin.is_locked_out("1.2.3.4") is True


def test_not_locked_below_max(monkeypatch):
    monkeypatch.setattr(admin.db, "recent_failed_attempts", lambda ip, minutes=15: 9)
    assert admin.is_locked_out("1.2.3.4") is False


def test_is_locked_out_uses_the_lockout_window_and_ip(monkeypatch):
    seen = {}

    def spy(ip, minutes=15):
        seen["args"] = (ip, minutes)
        return 0

    monkeypatch.setattr(admin.db, "recent_failed_attempts", spy)
    admin.is_locked_out("9.9.9.9")
    assert seen["args"] == ("9.9.9.9", admin.LOCKOUT_MINUTES)


# ---- db.recent_failed_attempts: counting happens in Postgres ---------------
def test_recent_failed_attempts_counts_in_sql_with_bound_params(fake_db):
    conn = fake_db(row=(7,))
    assert db.recent_failed_attempts("1.2.3.4", minutes=15) == 7
    (sql, params), = conn.calls
    lowered = " ".join(sql.lower().split())
    assert "count(*)" in lowered
    assert "from admin_login_attempts" in lowered
    assert "succeeded = false" in lowered
    assert "attempted_at > now() - make_interval(mins => %s)" in lowered
    assert params == ("1.2.3.4", 15)
    assert "1.2.3.4" not in sql  # value is bound, never interpolated


def test_recent_failed_attempts_window_follows_argument(fake_db):
    conn = fake_db(row=(0,))
    db.recent_failed_attempts("1.2.3.4", minutes=3)
    assert conn.calls[0][1] == ("1.2.3.4", 3)


# ---- db.record_login_attempt / record_admin_action -------------------------
def test_record_login_attempt_binds_ip_and_outcome(fake_db):
    conn = fake_db()
    db.record_login_attempt("5.6.7.8", False)
    (sql, params), = conn.calls
    assert "insert into admin_login_attempts" in sql.lower()
    assert params == ("5.6.7.8", False)
    assert "5.6.7.8" not in sql


class FakeAttemptStore:
    """In-memory stand-in for admin_login_attempts that interprets the three
    statements db.py issues, so tests can assert on behaviour, not SQL text."""

    def __init__(self):
        self.rows = []  # (ip, succeeded)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        low = " ".join(sql.lower().split())
        store = self

        class Res:
            rowcount = 0

            def fetchone(self_inner):
                ip = params[0]
                return (sum(1 for r in store.rows if r[0] == ip and not r[1]),)

        if low.startswith("insert into admin_login_attempts"):
            self.rows.append((params[0], params[1]))
        elif low.startswith("delete from admin_login_attempts"):
            self.rows = [r for r in self.rows if r[0] != params[0]]
        elif low.startswith("select count(*)"):
            pass
        else:
            raise AssertionError("unexpected SQL: " + sql)
        return Res()


@pytest.fixture
def store(monkeypatch):
    s = FakeAttemptStore()
    monkeypatch.setattr(db, "connect", lambda: s)
    return s


def test_success_clears_prior_failures_for_that_ip(store):
    for _ in range(9):
        db.record_login_attempt("1.2.3.4", False)
    db.record_login_attempt("9.9.9.9", False)
    assert db.recent_failed_attempts("1.2.3.4") == 9
    db.record_login_attempt("1.2.3.4", True)
    assert db.recent_failed_attempts("1.2.3.4") == 0
    # another IP's failures are untouched
    assert db.recent_failed_attempts("9.9.9.9") == 1
    # and the cleared IP is not one failure from lockout any more
    db.record_login_attempt("1.2.3.4", False)
    assert db.recent_failed_attempts("1.2.3.4") == 1


def test_clear_login_attempts_binds_ip(fake_db):
    conn = fake_db()
    db.clear_login_attempts("5.6.7.8")
    (sql, params), = conn.calls
    assert sql.lower().startswith("delete from admin_login_attempts")
    assert params == ("5.6.7.8",)
    assert "5.6.7.8" not in sql


@pytest.mark.parametrize("missing", [None, ""])
def test_missing_ip_is_counted_and_triggers_lockout(store, monkeypatch, missing):
    for _ in range(admin.MAX_ATTEMPTS):
        db.record_login_attempt(missing, False)
    assert {r[0] for r in store.rows} == {"unknown"}  # never stored as NULL/empty
    assert db.recent_failed_attempts(missing) == admin.MAX_ATTEMPTS
    assert db.recent_failed_attempts(None) == admin.MAX_ATTEMPTS
    assert db.recent_failed_attempts("") == admin.MAX_ATTEMPTS
    assert admin.is_locked_out(missing) is True


def test_missing_ip_binds_unknown_in_every_statement(fake_db):
    conn = fake_db()
    db.record_login_attempt(None, False)
    db.recent_failed_attempts(None)
    db.clear_login_attempts(None)
    assert [c[1][0] for c in conn.calls] == ["unknown", "unknown", "unknown"]


def test_record_admin_action_serialises_detail_as_bound_json(fake_db):
    conn = fake_db()
    db.record_admin_action("suspend_user", target_id="u1", detail={"why": "x'; DROP TABLE users;--"})
    (sql, params), = conn.calls
    assert "insert into admin_actions" in sql.lower()
    assert params[0] == "suspend_user" and params[1] == "u1"
    assert json.loads(params[2]) == {"why": "x'; DROP TABLE users;--"}
    assert "DROP" not in sql


def test_record_admin_action_without_detail_binds_null(fake_db):
    conn = fake_db()
    db.record_admin_action("login")
    assert conn.calls[0][1] == ("login", None, None)


# ---- db.set_user_status -----------------------------------------------------
@pytest.mark.parametrize("bad", ["banned", "", "ACTIVE", "Suspended", None, 1, "active; DROP TABLE users"])
def test_set_user_status_rejects_unknown_status_without_touching_db(monkeypatch, bad):
    def boom():
        raise AssertionError("db.connect must not be called for an invalid status")

    monkeypatch.setattr(db, "connect", boom)
    assert db.set_user_status("123e4567-e89b-12d3-a456-426614174000", bad) is False


@pytest.mark.parametrize("bad_id", ["not-a-uuid", "some-id", "123e4567", 5, b"x", None, "", [], "123e4567-e89b-12d3-a456-426614174000; DROP TABLE users"])
def test_set_user_status_rejects_invalid_user_id_without_touching_db(monkeypatch, bad_id):
    def boom():
        raise AssertionError("db.connect must not be called for an invalid user id")

    monkeypatch.setattr(db, "connect", boom)
    assert db.set_user_status(bad_id, "active") is False


def test_set_user_status_accepts_valid_uuid_and_binds_canonical_form(fake_db):
    conn = fake_db(rowcount=1)
    assert db.set_user_status("123E4567-E89B-12D3-A456-426614174000", "active") is True
    assert conn.calls[0][1] == ("active", "123e4567-e89b-12d3-a456-426614174000")


@pytest.mark.parametrize("status", ["active", "suspended"])
def test_set_user_status_writes_valid_status_with_bound_params(fake_db, status):
    conn = fake_db(rowcount=1)
    assert db.set_user_status("123e4567-e89b-12d3-a456-426614174000", status) is True
    (sql, params), = conn.calls
    assert sql.lower().startswith("update users set status = %s where id = %s")
    assert params == (status, "123e4567-e89b-12d3-a456-426614174000")


def test_set_user_status_false_when_no_such_user(fake_db):
    fake_db(rowcount=0)
    assert db.set_user_status("123e4567-e89b-12d3-a456-426614174000", "suspended") is False


# ---- schema placement -------------------------------------------------------
def test_users_status_is_a_migration_not_in_schema():
    assert any(
        m == "ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'"
        for m in db._MIGRATIONS
    )
    # users already exists in production, so a column inside its CREATE TABLE would never apply.
    users_block = db.SCHEMA.split("CREATE TABLE IF NOT EXISTS users", 1)[1].split(");", 1)[0]
    assert "status" not in users_block


def test_new_tables_and_index_are_idempotent_in_schema():
    assert "CREATE TABLE IF NOT EXISTS admin_actions" in db.SCHEMA
    assert "CREATE TABLE IF NOT EXISTS admin_login_attempts" in db.SCHEMA
    assert "CREATE INDEX IF NOT EXISTS admin_login_attempts_ip_idx ON admin_login_attempts (ip, attempted_at DESC)" in db.SCHEMA
