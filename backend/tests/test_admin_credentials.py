import pytest

import admin


def test_correct_credentials_accepted():
    assert admin.verify_credentials("admin", "test-password-123") is True


def test_wrong_password_rejected():
    assert admin.verify_credentials("admin", "wrong") is False


def test_wrong_username_rejected():
    assert admin.verify_credentials("root", "test-password-123") is False


def test_empty_password_rejected():
    assert admin.verify_credentials("admin", "") is False


def test_none_inputs_rejected():
    assert admin.verify_credentials(None, None) is False


@pytest.fixture
def hasher_calls(monkeypatch):
    """Replace the hasher with a recorder that always says no."""
    calls = []

    def fake(pw_hash, password):
        calls.append(password)
        return False

    monkeypatch.setattr(admin, "check_password_hash", fake)
    return calls


def test_empty_password_never_reaches_hasher(hasher_calls):
    # The real hasher also rejects "", so the return value alone proves nothing;
    # this fails if the empty-input guard is removed.
    assert admin.verify_credentials(admin.ADMIN_USERNAME, "") is False
    assert admin.verify_credentials("", "x") is False
    assert hasher_calls == []


def test_wrong_username_still_runs_hash_check(hasher_calls):
    # Timing equalisation: fails if the code short-circuits on a wrong username.
    assert admin.verify_credentials("root", "test-password-123") is False
    assert hasher_calls == ["test-password-123"]


def test_unconfigured_admin_never_matches(monkeypatch, hasher_calls):
    monkeypatch.setattr(admin, "ADMIN_USERNAME", "")
    monkeypatch.setattr(admin, "ADMIN_PASSWORD_HASH", "")
    assert admin.verify_credentials("admin", "test-password-123") is False
    # Username configured but hash missing, and the reverse.
    monkeypatch.setattr(admin, "ADMIN_USERNAME", "admin")
    assert admin.verify_credentials("admin", "test-password-123") is False
    monkeypatch.setattr(admin, "ADMIN_USERNAME", "")
    monkeypatch.setattr(admin, "ADMIN_PASSWORD_HASH", "x")
    assert admin.verify_credentials("admin", "test-password-123") is False
    assert hasher_calls == []


@pytest.mark.parametrize("username,password", [
    (123, "x"),
    ("admin", 123),
    (["admin"], "x"),
    ("admin", ["x"]),
    ({"a": 1}, {"b": 2}),
])
def test_non_string_inputs_rejected_without_raising(username, password):
    assert admin.verify_credentials(username, password) is False


def test_lone_surrogates_rejected_without_raising():
    assert admin.verify_credentials("\ud800", "test-password-123") is False
    assert admin.verify_credentials("admin", "\ud800") is False
