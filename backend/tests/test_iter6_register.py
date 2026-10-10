"""Iteration 6: self sign-up (POST /api/auth/register) tests.

Covers:
- 201 success: returns access_token + user.role 'guru' (role ignored if client sends it)
- Duplicate email case-insensitive -> 409
- Short password -> 422
- Invalid email -> 422
- New account can login + GET /auth/me returns role guru
- Guru cannot access /api/invoices (403)
- Smoke: seeded keuangan login still works
"""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient

from .conftest import API, KEUANGAN

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def mongo_users():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]["users"]
    client.close()


@pytest.fixture
def unique_email():
    return f"TEST_signup_{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture(autouse=True)
def _cleanup_test_users(mongo_users):
    yield
    # Only delete users we created (prefix TEST_signup_); never seeded ones.
    mongo_users.delete_many({"email": {"$regex": "^test_signup_", "$options": "i"}})


# ---------- register success ----------
def test_register_success_returns_token_and_guru_role(unique_email):
    r = requests.post(
        f"{API}/auth/register",
        json={"name": "Test User", "email": unique_email, "password": "secret123"},
        timeout=30,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert "access_token" in body and body["access_token"]
    assert body["user"]["role"] == "guru"
    assert body["user"]["email"] == unique_email.lower()
    assert body["user"]["name"] == "Test User"


def test_register_ignores_client_role_field(unique_email):
    # Even if attacker sends role=keuangan, server must force guru.
    r = requests.post(
        f"{API}/auth/register",
        json={
            "name": "Hacker",
            "email": unique_email,
            "password": "secret123",
            "role": "keuangan",
        },
        timeout=30,
    )
    assert r.status_code == 201, r.text
    assert r.json()["user"]["role"] == "guru"


# ---------- validation errors ----------
def test_register_short_password_422(unique_email):
    r = requests.post(
        f"{API}/auth/register",
        json={"name": "X", "email": unique_email, "password": "short"},
        timeout=30,
    )
    assert r.status_code == 422


def test_register_invalid_email_422():
    r = requests.post(
        f"{API}/auth/register",
        json={"name": "X", "email": "not-an-email", "password": "secret123"},
        timeout=30,
    )
    assert r.status_code == 422


# ---------- duplicate email ----------
def test_register_duplicate_email_case_insensitive_409(unique_email):
    body = {"name": "A", "email": unique_email, "password": "secret123"}
    r1 = requests.post(f"{API}/auth/register", json=body, timeout=30)
    assert r1.status_code == 201

    # Same email with uppercase chars -> still 409
    dup = dict(body, email=unique_email.upper())
    r2 = requests.post(f"{API}/auth/register", json=dup, timeout=30)
    assert r2.status_code == 409, r2.text
    assert "sudah terdaftar" in r2.json().get("detail", "").lower()


# ---------- end-to-end: register -> login -> me -> forbidden ----------
def test_new_account_login_me_and_forbidden_on_invoices(unique_email):
    reg = requests.post(
        f"{API}/auth/register",
        json={"name": "Bu Ani", "email": unique_email, "password": "secret123"},
        timeout=30,
    ).json()
    token = reg["access_token"]

    # Login works independently
    login = requests.post(
        f"{API}/auth/login",
        json={"email": unique_email, "password": "secret123"},
        timeout=30,
    )
    assert login.status_code == 200

    # GET /auth/me returns guru
    me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    assert me.status_code == 200
    assert me.json()["role"] == "guru"
    assert me.json()["name"] == "Bu Ani"

    # Guru cannot access invoices (keuangan-only)
    inv = requests.get(f"{API}/invoices", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    assert inv.status_code == 403, f"expected 403, got {inv.status_code}"


# ---------- smoke: seeded keuangan still works ----------
def test_smoke_seeded_keuangan_login():
    r = requests.post(f"{API}/auth/login", json=KEUANGAN, timeout=30)
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "keuangan"
