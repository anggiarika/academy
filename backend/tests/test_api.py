"""Backend API tests for Presensi Kredit app.
Covers: auth, classes, students, attendance, izin, invoices, dashboard, packages.
"""
import os
import time
import pytest
import requests

API = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"


# ---------------- Auth ----------------
class TestAuth:
    def test_health(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200

    def test_login_keuangan(self):
        r = requests.post(f"{API}/auth/login", json={"email": "keuangan@sekolah.id", "password": "keuangan123"})
        assert r.status_code == 200
        j = r.json()
        assert "access_token" in j
        assert j["user"]["role"] == "keuangan"

    def test_login_guru(self):
        r = requests.post(f"{API}/auth/login", json={"email": "guru@sekolah.id", "password": "guru1234"})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "guru"

    def test_login_bad_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": "keuangan@sekolah.id", "password": "wrongpass"})
        assert r.status_code == 401

    def test_me(self, kc):
        r = kc.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == "keuangan@sekolah.id"

    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------------- Role gating ----------------
class TestRoles:
    def test_guru_cannot_list_invoices(self, gc):
        r = gc.get(f"{API}/invoices")
        assert r.status_code == 403

    def test_guru_cannot_create_student(self, gc):
        r = gc.post(f"{API}/students", json={
            "name": "TEST x", "parent_name": "p", "parent_phone": "0811", "class_ids": []
        })
        assert r.status_code == 403

    def test_guru_cannot_izin(self, gc, kc):
        s = kc.get(f"{API}/students").json()[0]
        r = gc.post(f"{API}/students/{s['id']}/izin", json={"program": "gymnastic", "date": "2026-01-15"})
        assert r.status_code == 403

    def test_guru_cannot_rename_class(self, gc, kc):
        c = kc.get(f"{API}/classes").json()[0]
        r = gc.put(f"{API}/classes/{c['id']}", json={"name": "x", "program": c["program"], "schedule": c["schedule"]})
        assert r.status_code == 403


# ---------------- Classes ----------------
class TestClasses:
    def test_list_classes(self, kc):
        r = kc.get(f"{API}/classes")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 8
        assert all("student_count" in c for c in data)
        progs = {c["program"] for c in data}
        assert progs == {"gymnastic", "english"}

    def test_rename_class(self, kc):
        classes = kc.get(f"{API}/classes").json()
        c = classes[0]
        new_name = c["name"] + " (TEST)"
        r = kc.put(f"{API}/classes/{c['id']}", json={"name": new_name, "program": c["program"], "schedule": c["schedule"]})
        assert r.status_code == 200
        assert r.json()["name"] == new_name
        # restore
        kc.put(f"{API}/classes/{c['id']}", json={"name": c["name"], "program": c["program"], "schedule": c["schedule"]})


# ---------------- Students CRUD ----------------
@pytest.fixture
def test_student(kc):
    """Create a student in Gymnastic A and English A with wallets."""
    classes = kc.get(f"{API}/classes").json()
    gym = next(c for c in classes if c["program"] == "gymnastic")
    eng = next(c for c in classes if c["program"] == "english")
    r = kc.post(f"{API}/students", json={
        "name": "TEST Student", "parent_name": "TEST Parent", "parent_phone": "6281111111111",
        "class_ids": [gym["id"], eng["id"]]
    })
    assert r.status_code == 200
    s = r.json()
    yield {"student": s, "gym_class": gym, "eng_class": eng}
    kc.delete(f"{API}/students/{s['id']}")


class TestStudents:
    def test_create_has_wallets(self, test_student):
        s = test_student["student"]
        assert set(s["wallets"].keys()) == {"gymnastic", "english"}
        for w in s["wallets"].values():
            assert w["credits"] == 0
            assert w["izin_quota"] == 0
            assert w["makeup"] == 0

    def test_list_by_class(self, kc, test_student):
        cid = test_student["gym_class"]["id"]
        r = kc.get(f"{API}/students", params={"class_id": cid})
        assert r.status_code == 200
        assert any(x["id"] == test_student["student"]["id"] for x in r.json())

    def test_update_student(self, kc, test_student):
        s = test_student["student"]
        r = kc.put(f"{API}/students/{s['id']}", json={
            "name": "TEST Renamed", "parent_name": "TEST Parent",
            "parent_phone": "6281111111111", "class_ids": [test_student["gym_class"]["id"]]
        })
        assert r.status_code == 200
        assert r.json()["name"] == "TEST Renamed"

    def test_delete_student(self, kc):
        classes = kc.get(f"{API}/classes").json()
        r = kc.post(f"{API}/students", json={
            "name": "TEST ToDelete", "parent_name": "p", "parent_phone": "0811",
            "class_ids": [classes[0]["id"]]
        })
        sid = r.json()["id"]
        d = kc.delete(f"{API}/students/{sid}")
        assert d.status_code == 200
        g = kc.get(f"{API}/students/{sid}")
        assert g.status_code == 404


# ---------------- Invoices ----------------
class TestInvoices:
    def test_packages(self, kc):
        r = kc.get(f"{API}/packages")
        assert r.status_code == 200
        pkgs = {(p["program"], p["package"]): p for p in r.json()}
        assert pkgs[("gymnastic", 4)]["amount"] == 350000
        assert pkgs[("gymnastic", 12)]["amount"] == 900000
        assert pkgs[("english", 4)]["amount"] == 495000
        assert pkgs[("english", 12)]["amount"] == 1335000
        assert pkgs[("gymnastic", 4)]["izin_quota"] == 1
        assert pkgs[("gymnastic", 12)]["izin_quota"] == 3

    def test_create_invoice_price_and_duplicate(self, kc, test_student):
        sid = test_student["student"]["id"]
        r = kc.post(f"{API}/invoices", json={"student_id": sid, "program": "english", "package": 12})
        assert r.status_code == 200
        inv = r.json()
        assert inv["amount"] == 1335000
        assert inv["status"] == "unpaid"
        # Duplicate 409
        dup = kc.post(f"{API}/invoices", json={"student_id": sid, "program": "english", "package": 4})
        assert dup.status_code == 409
        # Cleanup
        kc.delete(f"{API}/invoices/{inv['id']}")

    def test_pay_invoice_adds_credits_resets_izin(self, kc, test_student):
        sid = test_student["student"]["id"]
        inv = kc.post(f"{API}/invoices", json={"student_id": sid, "program": "gymnastic", "package": 4}).json()
        r = kc.post(f"{API}/invoices/{inv['id']}/pay", json={"method": "transfer"})
        assert r.status_code == 200
        assert r.json()["status"] == "paid"
        s = kc.get(f"{API}/students/{sid}").json()
        assert s["wallets"]["gymnastic"]["credits"] == 4
        assert s["wallets"]["gymnastic"]["izin_quota"] == 1
        assert s["wallets"]["gymnastic"]["makeup"] == 0
        # paying twice
        r2 = kc.post(f"{API}/invoices/{inv['id']}/pay", json={"method": "cash"})
        assert r2.status_code == 400

    def test_delete_unpaid_only(self, kc, test_student):
        sid = test_student["student"]["id"]
        inv = kc.post(f"{API}/invoices", json={"student_id": sid, "program": "english", "package": 4}).json()
        d = kc.delete(f"{API}/invoices/{inv['id']}")
        assert d.status_code == 200
        # pay a new one -> can't delete
        inv2 = kc.post(f"{API}/invoices", json={"student_id": sid, "program": "english", "package": 4}).json()
        kc.post(f"{API}/invoices/{inv2['id']}/pay", json={"method": "cash"})
        d2 = kc.delete(f"{API}/invoices/{inv2['id']}")
        assert d2.status_code == 404

    def test_list_filter_status(self, kc):
        r = kc.get(f"{API}/invoices", params={"status": "paid"})
        assert r.status_code == 200
        assert all(i["status"] == "paid" for i in r.json())


# ---------------- Attendance ----------------
class TestAttendance:
    def _pay(self, kc, sid, program, pkg):
        inv = kc.post(f"{API}/invoices", json={"student_id": sid, "program": program, "package": pkg}).json()
        kc.post(f"{API}/invoices/{inv['id']}/pay", json={"method": "cash"})

    def test_attendance_credit_deduction_and_no_double(self, kc, test_student):
        sid = test_student["student"]["id"]
        cid = test_student["gym_class"]["id"]
        self._pay(kc, sid, "gymnastic", 12)  # 12 credits, 3 izin
        date = "2026-01-10"
        r = kc.post(f"{API}/classes/{cid}/attendance", json={
            "date": date, "records": [{"student_id": sid, "status": "hadir"}]
        })
        assert r.status_code == 200
        s = kc.get(f"{API}/students/{sid}").json()
        assert s["wallets"]["gymnastic"]["credits"] == 11
        # Re-save same date -> should NOT double deduct
        r2 = kc.post(f"{API}/classes/{cid}/attendance", json={
            "date": date, "records": [{"student_id": sid, "status": "hadir"}]
        })
        assert r2.status_code == 200
        s2 = kc.get(f"{API}/students/{sid}").json()
        assert s2["wallets"]["gymnastic"]["credits"] == 11
        # Change to izin -> credit should be refunded (11 -> 12)
        r3 = kc.post(f"{API}/classes/{cid}/attendance", json={
            "date": date, "records": [{"student_id": sid, "status": "izin"}]
        })
        assert r3.status_code == 200
        s3 = kc.get(f"{API}/students/{sid}").json()
        assert s3["wallets"]["gymnastic"]["credits"] == 12

    def test_attendance_pengganti_requires_makeup(self, kc, test_student):
        sid = test_student["student"]["id"]
        cid = test_student["gym_class"]["id"]
        self._pay(kc, sid, "gymnastic", 4)
        # No makeup yet
        r = kc.post(f"{API}/classes/{cid}/attendance", json={
            "date": "2026-01-11", "records": [{"student_id": sid, "status": "pengganti"}]
        })
        assert r.status_code == 400

    def test_get_attendance(self, kc, test_student):
        cid = test_student["gym_class"]["id"]
        r = kc.get(f"{API}/classes/{cid}/attendance", params={"date": "2026-01-99"})
        assert r.status_code == 200


# ---------------- Izin ----------------
class TestIzin:
    def test_izin_flow(self, kc, test_student):
        sid = test_student["student"]["id"]
        # Pay 4-pack gym -> 4 credits, 1 izin
        inv = kc.post(f"{API}/invoices", json={"student_id": sid, "program": "gymnastic", "package": 4}).json()
        kc.post(f"{API}/invoices/{inv['id']}/pay", json={"method": "cash"})
        r = kc.post(f"{API}/students/{sid}/izin", json={"program": "gymnastic", "date": "2026-01-15"})
        assert r.status_code == 200
        s = r.json()
        assert s["wallets"]["gymnastic"]["izin_quota"] == 0
        assert s["wallets"]["gymnastic"]["credits"] == 3
        assert s["wallets"]["gymnastic"]["makeup"] == 1
        # Quota 0 -> 400
        r2 = kc.post(f"{API}/students/{sid}/izin", json={"program": "gymnastic", "date": "2026-01-16"})
        assert r2.status_code == 400

    def test_izin_hangus_on_new_payment(self, kc, test_student):
        sid = test_student["student"]["id"]
        inv = kc.post(f"{API}/invoices", json={"student_id": sid, "program": "english", "package": 4}).json()
        kc.post(f"{API}/invoices/{inv['id']}/pay", json={"method": "cash"})
        kc.post(f"{API}/students/{sid}/izin", json={"program": "english", "date": "2026-01-15"})
        s = kc.get(f"{API}/students/{sid}").json()
        assert s["wallets"]["english"]["makeup"] == 1
        # pay new package -> makeup resets 0
        inv2 = kc.post(f"{API}/invoices", json={"student_id": sid, "program": "english", "package": 12}).json()
        kc.post(f"{API}/invoices/{inv2['id']}/pay", json={"method": "cash"})
        s2 = kc.get(f"{API}/students/{sid}").json()
        assert s2["wallets"]["english"]["makeup"] == 0
        assert s2["wallets"]["english"]["izin_quota"] == 3


# ---------------- Dashboard & Transactions ----------------
class TestDashboard:
    def test_dashboard(self, kc):
        r = kc.get(f"{API}/dashboard")
        assert r.status_code == 200
        j = r.json()
        for key in ["total_students", "total_classes", "low_credit", "zero_credit", "unpaid_count", "unpaid_total", "needs_billing"]:
            assert key in j
        assert j["total_classes"] == 8

    def test_transactions(self, kc, test_student):
        sid = test_student["student"]["id"]
        inv = kc.post(f"{API}/invoices", json={"student_id": sid, "program": "english", "package": 4}).json()
        kc.post(f"{API}/invoices/{inv['id']}/pay", json={"method": "cash"})
        r = kc.get(f"{API}/students/{sid}/transactions")
        assert r.status_code == 200
        assert len(r.json()) >= 1
