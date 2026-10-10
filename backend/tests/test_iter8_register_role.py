"""Iteration 8 tests.

Register role choice (guru/keuangan):
- role 'guru' -> 201 role guru
- role 'keuangan' -> 201 role keuangan, can access /invoices (keuangan-only)
- missing role -> defaults to guru
- invalid role value -> 422
- duplicate email -> 409

Student form initial payment flow (backend side):
- create student + invoice + pay (paid now) -> wallet credits == package count, izin_quota set
- create student + invoice unpaid -> invoice status unpaid, wallet credits stay 0
Cleanup: deletes all TEST_ students/invoices/users created.
"""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient

from .conftest import API

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture
def unique_email():
    return f"TEST_role_{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture(autouse=True)
def _cleanup(mongo):
    yield
    mongo["users"].delete_many({"email": {"$regex": "^test_role_", "$options": "i"}})
    stu = list(mongo["students"].find({"name": {"$regex": "^TEST_iter8"}}, {"id": 1}))
    ids = [s["id"] for s in stu]
    mongo["students"].delete_many({"id": {"$in": ids}})
    mongo["invoices"].delete_many({"student_id": {"$in": ids}})
    mongo["transactions"].delete_many({"student_id": {"$in": ids}})


# ---------- register role choice ----------
def test_register_role_guru(unique_email):
    r = requests.post(f"{API}/auth/register", json={
        "name": "Guru Test", "email": unique_email, "password": "secret123", "role": "guru"}, timeout=30)
    assert r.status_code == 201, r.text
    assert r.json()["user"]["role"] == "guru"


def test_register_role_keuangan_can_access_invoices(unique_email):
    r = requests.post(f"{API}/auth/register", json={
        "name": "Keuangan Test", "email": unique_email, "password": "secret123", "role": "keuangan"}, timeout=30)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["user"]["role"] == "keuangan"
    assert body["access_token"]

    # keuangan-only endpoint accessible with the returned token
    inv = requests.get(f"{API}/invoices", headers={"Authorization": f"Bearer {body['access_token']}"}, timeout=30)
    assert inv.status_code == 200, f"expected 200, got {inv.status_code}"


def test_register_missing_role_defaults_guru(unique_email):
    r = requests.post(f"{API}/auth/register", json={
        "name": "No Role", "email": unique_email, "password": "secret123"}, timeout=30)
    assert r.status_code == 201, r.text
    assert r.json()["user"]["role"] == "guru"


def test_register_invalid_role_422(unique_email):
    r = requests.post(f"{API}/auth/register", json={
        "name": "Bad Role", "email": unique_email, "password": "secret123", "role": "admin"}, timeout=30)
    assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"


def test_register_duplicate_email_409(unique_email):
    body = {"name": "Dup", "email": unique_email, "password": "secret123", "role": "keuangan"}
    r1 = requests.post(f"{API}/auth/register", json=body, timeout=30)
    assert r1.status_code == 201
    r2 = requests.post(f"{API}/auth/register", json=body, timeout=30)
    assert r2.status_code == 409, r2.text


# ---------- initial payment flow (mirrors /student/form) ----------
def _first_class_id(kc, program):
    classes = kc.get(f"{API}/classes", timeout=30).json()
    for c in classes:
        if c["program"] == program:
            return c["id"]
    pytest.skip(f"no class for program {program}")


def test_create_student_with_paid_initial_invoice_adds_credits(kc):
    cid = _first_class_id(kc, "gymnastic")
    s = kc.post(f"{API}/students", json={
        "name": "TEST_iter8 Paid", "parent_name": "Ortu", "parent_phone": "0812", "class_ids": [cid]}, timeout=30)
    assert s.status_code in (200, 201), s.text
    student = s.json()
    assert student["wallets"]["gymnastic"]["credits"] == 0

    inv = kc.post(f"{API}/invoices", json={"student_id": student["id"], "program": "gymnastic", "package": 12}, timeout=30)
    assert inv.status_code in (200, 201), inv.text
    invoice = inv.json()
    assert invoice["status"] == "unpaid"
    assert invoice["package"] == 12
    assert invoice["amount"] > 0

    pay = kc.post(f"{API}/invoices/{invoice['id']}/pay", json={"method": "tunai"}, timeout=30)
    assert pay.status_code == 200, pay.text
    assert pay.json()["status"] == "paid"
    assert pay.json()["paid_at"]

    got = kc.get(f"{API}/students/{student['id']}", timeout=30)
    w = got.json()["wallets"]["gymnastic"]
    assert w["credits"] == 12, f"expected 12 credits, got {w}"
    assert w["izin_quota"] > 0
    assert w["package"] == 12


def test_create_student_with_unpaid_initial_invoice_no_credits(kc):
    cid = _first_class_id(kc, "english")
    s = kc.post(f"{API}/students", json={
        "name": "TEST_iter8 Unpaid", "parent_name": "Ortu", "parent_phone": "0812", "class_ids": [cid]}, timeout=30)
    assert s.status_code in (200, 201), s.text
    student = s.json()

    inv = kc.post(f"{API}/invoices", json={"student_id": student["id"], "program": "english", "package": 4}, timeout=30)
    assert inv.status_code in (200, 201), inv.text
    invoice = inv.json()

    # Invoice appears in unpaid list (Tagihan tab source)
    unpaid = kc.get(f"{API}/invoices?status=unpaid", timeout=30).json()
    assert any(i["id"] == invoice["id"] for i in unpaid)

    got = kc.get(f"{API}/students/{student['id']}", timeout=30)
    assert got.json()["wallets"]["english"]["credits"] == 0


# ---------- edit mode regression: update student must not touch wallet credits ----------
def test_update_student_preserves_wallet(kc):
    cid = _first_class_id(kc, "gymnastic")
    s = kc.post(f"{API}/students", json={
        "name": "TEST_iter8 Edit", "parent_name": "Ortu", "parent_phone": "0812", "class_ids": [cid]}, timeout=30).json()
    inv = kc.post(f"{API}/invoices", json={"student_id": s["id"], "program": "gymnastic", "package": 4}, timeout=30).json()
    kc.post(f"{API}/invoices/{inv['id']}/pay", json={"method": "tunai"}, timeout=30)

    upd = kc.put(f"{API}/students/{s['id']}", json={
        "name": "TEST_iter8 Edit Renamed", "parent_name": "Ortu", "parent_phone": "0813", "class_ids": [cid]}, timeout=30)
    assert upd.status_code == 200, upd.text
    w = upd.json()["wallets"]["gymnastic"]
    assert w["credits"] == 4, f"edit must not reset credits, got {w}"
