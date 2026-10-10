"""Iteration 2: Kelola Akun, Upgrade Paket, Bukti Transfer, Laporan Bulanan."""
import io
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests

from .conftest import API, KEUANGAN


# ---------- Helpers ----------

def _get_or_create_class(kc, program="gymnastic"):
    r = kc.get(f"{API}/classes")
    r.raise_for_status()
    for c in r.json():
        if c["program"] == program:
            return c
    r = kc.post(f"{API}/classes", json={"name": f"TEST_Kelas_{program}", "program": program, "schedule": "Senin 15:00"})
    r.raise_for_status()
    return r.json()


def _get_or_create_student(kc, class_id):
    r = kc.get(f"{API}/students", params={"class_id": class_id})
    r.raise_for_status()
    rows = r.json()
    if rows:
        return rows[0]
    r = kc.post(f"{API}/students", json={
        "name": "TEST_Siswa", "parent_name": "TEST_Ortu", "parent_phone": "6281234567890",
        "class_ids": [class_id],
    })
    r.raise_for_status()
    return r.json()


# ============ Kelola Akun / Users ============

class TestUsers:
    created_ids: list = []

    def test_guru_cannot_list(self, gc):
        r = gc.get(f"{API}/users")
        assert r.status_code == 403, r.text

    def test_keuangan_can_list(self, kc):
        r = kc.get(f"{API}/users")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 2
        emails = {u["email"] for u in data}
        assert "keuangan@sekolah.id" in emails and "guru@sekolah.id" in emails

    def test_create_guru_and_login(self, kc):
        email = f"test_guru_{uuid.uuid4().hex[:8]}@sekolah.id"
        r = kc.post(f"{API}/users", json={"email": email, "name": "TEST Guru A", "password": "password123", "role": "guru"})
        assert r.status_code == 201, r.text
        u = r.json()
        assert u["email"] == email and u["role"] == "guru" and "id" in u
        TestUsers.created_ids.append(u["id"])
        # Verify persisted via GET
        emails = {x["email"] for x in kc.get(f"{API}/users").json()}
        assert email in emails
        # Can login
        login = requests.post(f"{API}/auth/login", json={"email": email, "password": "password123"}, timeout=20)
        assert login.status_code == 200
        assert login.json()["user"]["role"] == "guru"

    def test_create_keuangan(self, kc):
        email = f"test_keu_{uuid.uuid4().hex[:8]}@sekolah.id"
        r = kc.post(f"{API}/users", json={"email": email, "name": "TEST Keu B", "password": "password123", "role": "keuangan"})
        assert r.status_code == 201
        TestUsers.created_ids.append(r.json()["id"])

    def test_duplicate_email_409(self, kc):
        email = f"dup_{uuid.uuid4().hex[:8]}@sekolah.id"
        r1 = kc.post(f"{API}/users", json={"email": email, "name": "A", "password": "password123", "role": "guru"})
        assert r1.status_code == 201
        TestUsers.created_ids.append(r1.json()["id"])
        r2 = kc.post(f"{API}/users", json={"email": email, "name": "B", "password": "password123", "role": "guru"})
        assert r2.status_code == 409

    def test_password_too_short_422(self, kc):
        r = kc.post(f"{API}/users", json={"email": f"short_{uuid.uuid4().hex[:6]}@x.id", "name": "X", "password": "short1", "role": "guru"})
        assert r.status_code == 422

    def test_guru_cannot_create(self, gc):
        r = gc.post(f"{API}/users", json={"email": "x@x.id", "name": "X", "password": "password123", "role": "guru"})
        assert r.status_code == 403

    def test_cannot_delete_self(self, kc, keuangan_token):
        # Find my id
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {keuangan_token}"}).json()
        r = kc.delete(f"{API}/users/{me['id']}")
        assert r.status_code == 400

    def test_cannot_delete_last_keuangan(self, kc):
        # Delete temporarily created keuangan users first (if any from this suite)
        all_users = kc.get(f"{API}/users").json()
        keu_ids = [u["id"] for u in all_users if u["role"] == "keuangan"]
        # Delete all but the seeded one by removing extras we created
        for uid in list(TestUsers.created_ids):
            u = next((x for x in all_users if x["id"] == uid), None)
            if u and u["role"] == "keuangan":
                kc.delete(f"{API}/users/{uid}")
                TestUsers.created_ids.remove(uid)
        # Now try deleting the last remaining keuangan (seeded)
        remaining = [u for u in kc.get(f"{API}/users").json() if u["role"] == "keuangan"]
        assert len(remaining) == 1
        r = kc.delete(f"{API}/users/{remaining[0]['id']}")
        assert r.status_code == 400

    def test_delete_user_and_verify_gone(self, kc):
        email = f"delme_{uuid.uuid4().hex[:8]}@sekolah.id"
        r = kc.post(f"{API}/users", json={"email": email, "name": "DelMe", "password": "password123", "role": "guru"})
        uid = r.json()["id"]
        d = kc.delete(f"{API}/users/{uid}")
        assert d.status_code == 200
        emails = {x["email"] for x in kc.get(f"{API}/users").json()}
        assert email not in emails

    def test_delete_nonexistent_404(self, kc):
        r = kc.delete(f"{API}/users/does-not-exist-{uuid.uuid4().hex}")
        assert r.status_code == 404

    @classmethod
    def teardown_class(cls):
        # Cleanup remaining
        try:
            tok = requests.post(f"{API}/auth/login", json=KEUANGAN, timeout=15).json()["access_token"]
            for uid in cls.created_ids:
                requests.delete(f"{API}/users/{uid}", headers={"Authorization": f"Bearer {tok}"})
        except Exception:
            pass


# ============ Package switch ============

class TestPackageSwitch:
    inv_id = None
    student_id = None
    class_id = None

    @pytest.fixture(autouse=True, scope="class")
    def _setup(self, request):
        tok = requests.post(f"{API}/auth/login", json=KEUANGAN).json()["access_token"]
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
        cls = _get_or_create_class(s, "gymnastic")
        stu = _get_or_create_student(s, cls["id"])
        TestPackageSwitch.class_id = cls["id"]
        TestPackageSwitch.student_id = stu["id"]
        r = s.post(f"{API}/invoices", json={"student_id": stu["id"], "program": "gymnastic", "package": 4})
        r.raise_for_status()
        TestPackageSwitch.inv_id = r.json()["id"]
        yield
        # Cleanup: delete invoice if unpaid
        try:
            inv = s.get(f"{API}/invoices/{TestPackageSwitch.inv_id}").json()
            if inv.get("status") == "unpaid":
                s.delete(f"{API}/invoices/{TestPackageSwitch.inv_id}")
        except Exception:
            pass

    def test_switch_to_12(self, kc):
        r = kc.post(f"{API}/invoices/{self.inv_id}/package", json={"package": 12})
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv["package"] == 12 and inv["amount"] == 900000
        # GET verification
        g = kc.get(f"{API}/invoices/{self.inv_id}").json()
        assert g["package"] == 12 and g["amount"] == 900000

    def test_switch_back_to_4(self, kc):
        r = kc.post(f"{API}/invoices/{self.inv_id}/package", json={"package": 4})
        assert r.status_code == 200
        assert r.json()["amount"] == 350000

    def test_invalid_package_422(self, kc):
        r = kc.post(f"{API}/invoices/{self.inv_id}/package", json={"package": 8})
        assert r.status_code == 422

    def test_guru_forbidden(self, gc):
        r = gc.post(f"{API}/invoices/{self.inv_id}/package", json={"package": 12})
        assert r.status_code == 403

    def test_english_12_amount(self, kc):
        cls = _get_or_create_class(kc, "english")
        # Create a new student in english class
        r = kc.post(f"{API}/students", json={
            "name": "TEST_EngSiswa", "parent_name": "P", "parent_phone": "628000111222",
            "class_ids": [cls["id"]],
        })
        assert r.status_code == 200, f"student create failed: {r.status_code} {r.text}"
        stu_id = r.json()["id"]
        resp = kc.post(f"{API}/invoices", json={"student_id": stu_id, "program": "english", "package": 4})
        assert resp.status_code == 200, f"invoice create failed: {resp.status_code} {resp.text}"
        inv = resp.json()
        r = kc.post(f"{API}/invoices/{inv['id']}/package", json={"package": 12})
        assert r.status_code == 200
        assert r.json()["amount"] == 1335000
        # cleanup
        kc.delete(f"{API}/invoices/{inv['id']}")
        kc.delete(f"{API}/students/{stu_id}")

    def test_paid_invoice_400(self, kc):
        # Create a fresh student & invoice, mark paid, then try switch
        cls = _get_or_create_class(kc, "gymnastic")
        r = kc.post(f"{API}/students", json={
            "name": "TEST_PaidSiswa", "parent_name": "P", "parent_phone": "628000999888",
            "class_ids": [cls["id"]],
        })
        assert r.status_code == 200, r.text
        stu_id = r.json()["id"]
        resp = kc.post(f"{API}/invoices", json={"student_id": stu_id, "program": "gymnastic", "package": 4})
        assert resp.status_code == 200, resp.text
        inv = resp.json()
        p = kc.post(f"{API}/invoices/{inv['id']}/pay", json={"method": "tunai"})
        assert p.status_code == 200
        r = kc.post(f"{API}/invoices/{inv['id']}/package", json={"package": 12})
        assert r.status_code == 400
        kc.delete(f"{API}/students/{stu_id}")

    def test_not_found_404(self, kc):
        r = kc.post(f"{API}/invoices/nonexistent/package", json={"package": 12})
        assert r.status_code == 404


# ============ Receipt upload / file access ============

TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS"
    b"\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01[\x1c<\xb3\x00\x00\x00\x00IEND\xaeB`\x82"
)


class TestReceipt:
    inv_id = None
    receipt_path = None

    @pytest.fixture(autouse=True, scope="class")
    def _setup(self):
        tok = requests.post(f"{API}/auth/login", json=KEUANGAN).json()["access_token"]
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {tok}"})
        cls = _get_or_create_class(s, "gymnastic")
        stu = _get_or_create_student(s, cls["id"])
        inv = s.post(f"{API}/invoices", json={"student_id": stu["id"], "program": "gymnastic", "package": 4},
                     headers={"Content-Type": "application/json"}).json()
        TestReceipt.inv_id = inv["id"]
        yield
        try:
            s.delete(f"{API}/invoices/{TestReceipt.inv_id}")
        except Exception:
            pass

    def test_upload_receipt(self, keuangan_token):
        files = {"file": ("bukti.png", io.BytesIO(TINY_PNG), "image/png")}
        r = requests.post(f"{API}/invoices/{self.inv_id}/receipt",
                          headers={"Authorization": f"Bearer {keuangan_token}"},
                          files=files, timeout=60)
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv.get("receipt_path")
        TestReceipt.receipt_path = inv["receipt_path"]

    def test_non_image_400(self, keuangan_token):
        files = {"file": ("bukti.txt", io.BytesIO(b"hello"), "text/plain")}
        r = requests.post(f"{API}/invoices/{self.inv_id}/receipt",
                          headers={"Authorization": f"Bearer {keuangan_token}"},
                          files=files, timeout=30)
        assert r.status_code == 400

    def test_download_with_token_query(self, keuangan_token):
        assert self.receipt_path
        r = requests.get(f"{API}/files/{self.receipt_path}", params={"token": keuangan_token}, timeout=30)
        assert r.status_code == 200
        assert len(r.content) > 0

    def test_download_bearer_header(self, keuangan_token):
        r = requests.get(f"{API}/files/{self.receipt_path}",
                         headers={"Authorization": f"Bearer {keuangan_token}"}, timeout=30)
        assert r.status_code == 200

    def test_download_no_token_401(self):
        r = requests.get(f"{API}/files/{self.receipt_path}", timeout=15)
        assert r.status_code == 401

    def test_download_guru_403(self, guru_token):
        r = requests.get(f"{API}/files/{self.receipt_path}",
                         headers={"Authorization": f"Bearer {guru_token}"}, timeout=15)
        assert r.status_code == 403


# ============ Monthly Report ============

class TestMonthlyReport:
    def test_bad_format_422(self, kc):
        r = kc.get(f"{API}/reports/monthly", params={"month": "2026/01"})
        assert r.status_code == 422

    def test_missing_month_422(self, kc):
        r = kc.get(f"{API}/reports/monthly")
        assert r.status_code == 422

    def test_current_month(self, kc):
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        r = kc.get(f"{API}/reports/monthly", params={"month": month})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["month"] == month
        assert isinstance(data["income_total"], int) and data["income_total"] >= 0
        assert isinstance(data["income_count"], int)
        assert "gymnastic" in data["income_by_program"] and "english" in data["income_by_program"]
        assert isinstance(data["unpaid_total"], int)
        assert isinstance(data["classes"], list)
        for c in data["classes"]:
            assert set(c["counts"].keys()) >= {"hadir", "izin", "alpha", "pengganti"}

    def test_guru_forbidden(self, gc):
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        r = gc.get(f"{API}/reports/monthly", params={"month": month})
        assert r.status_code == 403

    def test_income_reflects_payment(self, kc):
        """Create+pay invoice this month; income_total should increase."""
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        before = kc.get(f"{API}/reports/monthly", params={"month": month}).json()
        cls = _get_or_create_class(kc, "gymnastic")
        r = kc.post(f"{API}/students", json={
            "name": "TEST_RepSiswa", "parent_name": "P", "parent_phone": "628000777666",
            "class_ids": [cls["id"]],
        })
        assert r.status_code == 200, r.text
        stu_id = r.json()["id"]
        inv_r = kc.post(f"{API}/invoices", json={"student_id": stu_id, "program": "gymnastic", "package": 4})
        assert inv_r.status_code == 200, inv_r.text
        inv = inv_r.json()
        p = kc.post(f"{API}/invoices/{inv['id']}/pay", json={"method": "tunai"})
        assert p.status_code == 200
        after = kc.get(f"{API}/reports/monthly", params={"month": month}).json()
        assert after["income_total"] >= before["income_total"] + 350000
        assert after["income_count"] >= before["income_count"] + 1
        kc.delete(f"{API}/students/{stu_id}")
