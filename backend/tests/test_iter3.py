"""Iteration 3 backend tests: change-password, student attendance recap, invoice remind."""
import os
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

KEU = {"email": "keuangan@sekolah.id", "password": "keuangan123"}
GURU = {"email": "guru@sekolah.id", "password": "guru1234"}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def keu_token():
    return _login(KEU["email"], KEU["password"])


@pytest.fixture(scope="module")
def guru_token():
    return _login(GURU["email"], GURU["password"])


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


# ---------- Change Password ----------
class TestChangePassword:
    def test_wrong_old_password_400(self, guru_token):
        r = requests.post(f"{API}/auth/change-password", headers=_h(guru_token),
                          json={"old_password": "WRONG_PW", "new_password": "newpass123"}, timeout=15)
        assert r.status_code == 400, r.text

    def test_short_new_password_422(self, guru_token):
        r = requests.post(f"{API}/auth/change-password", headers=_h(guru_token),
                          json={"old_password": GURU["password"], "new_password": "short1"}, timeout=15)
        assert r.status_code == 422, r.text

    def test_same_password_400(self, guru_token):
        r = requests.post(f"{API}/auth/change-password", headers=_h(guru_token),
                          json={"old_password": GURU["password"], "new_password": GURU["password"]}, timeout=15)
        assert r.status_code == 400, r.text

    def test_success_and_restore(self, guru_token):
        new_pw = "TEST_newpw_9988"
        # change
        r = requests.post(f"{API}/auth/change-password", headers=_h(guru_token),
                          json={"old_password": GURU["password"], "new_password": new_pw}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}
        # old no longer works
        r_old = requests.post(f"{API}/auth/login", json={"email": GURU["email"], "password": GURU["password"]}, timeout=15)
        assert r_old.status_code == 401
        # new works
        r_new = requests.post(f"{API}/auth/login", json={"email": GURU["email"], "password": new_pw}, timeout=15)
        assert r_new.status_code == 200
        # RESTORE
        new_tok = r_new.json()["access_token"]
        r_restore = requests.post(f"{API}/auth/change-password", headers=_h(new_tok),
                                  json={"old_password": new_pw, "new_password": GURU["password"]}, timeout=15)
        assert r_restore.status_code == 200
        # verify restore
        r_final = requests.post(f"{API}/auth/login", json=GURU, timeout=15)
        assert r_final.status_code == 200


# ---------- Student Attendance Recap ----------
class TestStudentAttendance:
    created_ids = {"student": None, "attendance_dates": [], "class_id": None}

    def test_setup_create_student_and_attendance(self, keu_token):
        # get a class
        rc = requests.get(f"{API}/classes", headers=_h(keu_token), timeout=15)
        assert rc.status_code == 200
        classes = rc.json()
        assert classes, "No classes seeded"
        cid = classes[0]["id"]
        TestStudentAttendance.created_ids["class_id"] = cid

        # create student
        rs = requests.post(f"{API}/students", headers=_h(keu_token), json={
            "name": "TEST_RecapStudent", "parent_name": "TEST_Parent",
            "parent_phone": "08123456789", "class_ids": [cid]
        }, timeout=15)
        assert rs.status_code == 200, rs.text
        sid = rs.json()["id"]
        TestStudentAttendance.created_ids["student"] = sid

        # Add credits to student so attendance can be recorded (via invoice paid or direct)
        # Simpler: create a paid invoice to give credits
        inv = requests.post(f"{API}/invoices", headers=_h(keu_token), json={
            "student_id": sid, "program": classes[0]["program"], "package": 4
        }, timeout=15)
        assert inv.status_code == 200, inv.text
        inv_id = inv.json()["id"]
        pay = requests.post(f"{API}/invoices/{inv_id}/pay", headers=_h(keu_token), json={"method": "cash"}, timeout=15)
        assert pay.status_code == 200, pay.text

        # record attendance for current month
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        ra = requests.post(f"{API}/classes/{cid}/attendance", headers=_h(keu_token), json={
            "date": today,
            "records": [{"student_id": sid, "status": "hadir"}]
        }, timeout=15)
        assert ra.status_code == 200, ra.text
        TestStudentAttendance.created_ids["attendance_dates"].append(today)

    def test_get_recap_success(self, keu_token):
        sid = TestStudentAttendance.created_ids["student"]
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        r = requests.get(f"{API}/students/{sid}/attendance?month={month}", headers=_h(keu_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        item = data[0]
        for k in ["date", "class_id", "class_name", "program", "status"]:
            assert k in item
        assert item["status"] == "hadir"

    def test_bad_month_422(self, keu_token):
        sid = TestStudentAttendance.created_ids["student"]
        r = requests.get(f"{API}/students/{sid}/attendance?month=bad-month", headers=_h(keu_token), timeout=15)
        assert r.status_code == 422

    def test_cleanup(self, keu_token):
        sid = TestStudentAttendance.created_ids["student"]
        if sid:
            requests.delete(f"{API}/students/{sid}", headers=_h(keu_token), timeout=15)


# ---------- Invoice Remind ----------
class TestInvoiceRemind:
    def test_remind_unpaid_success_and_increment(self, keu_token, mongo):
        # create student
        rc = requests.get(f"{API}/classes", headers=_h(keu_token), timeout=15)
        cid = rc.json()[0]["id"]
        program = rc.json()[0]["program"]
        rs = requests.post(f"{API}/students", headers=_h(keu_token), json={
            "name": "TEST_RemindStudent", "parent_name": "TEST_Parent2",
            "parent_phone": "08199999999", "class_ids": [cid]
        }, timeout=15)
        sid = rs.json()["id"]
        inv = requests.post(f"{API}/invoices", headers=_h(keu_token), json={
            "student_id": sid, "program": program, "package": 4
        }, timeout=15)
        assert inv.status_code == 200, inv.text
        inv_id = inv.json()["id"]

        # InvoiceOut should include reminded_at and reminder_count
        payload = inv.json()
        assert "reminded_at" in payload
        assert "reminder_count" in payload
        assert payload["reminder_count"] == 0
        assert payload["reminded_at"] is None

        # First remind
        r1 = requests.post(f"{API}/invoices/{inv_id}/remind", headers=_h(keu_token), timeout=15)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["reminder_count"] == 1
        assert d1["reminded_at"] is not None

        # Second remind
        r2 = requests.post(f"{API}/invoices/{inv_id}/remind", headers=_h(keu_token), timeout=15)
        assert r2.status_code == 200
        assert r2.json()["reminder_count"] == 2

        # cleanup
        requests.delete(f"{API}/invoices/{inv_id}", headers=_h(keu_token), timeout=15)
        requests.delete(f"{API}/students/{sid}", headers=_h(keu_token), timeout=15)

    def test_remind_unknown_404(self, keu_token):
        r = requests.post(f"{API}/invoices/does-not-exist-xyz/remind", headers=_h(keu_token), timeout=15)
        assert r.status_code == 404

    def test_remind_paid_404(self, keu_token):
        rc = requests.get(f"{API}/classes", headers=_h(keu_token), timeout=15)
        cid = rc.json()[0]["id"]
        program = rc.json()[0]["program"]
        rs = requests.post(f"{API}/students", headers=_h(keu_token), json={
            "name": "TEST_RemindPaidStudent", "parent_name": "TEST_P",
            "parent_phone": "08188888888", "class_ids": [cid]
        }, timeout=15)
        sid = rs.json()["id"]
        inv = requests.post(f"{API}/invoices", headers=_h(keu_token), json={
            "student_id": sid, "program": program, "package": 4
        }, timeout=15)
        inv_id = inv.json()["id"]
        pay = requests.post(f"{API}/invoices/{inv_id}/pay", headers=_h(keu_token), json={"method": "cash"}, timeout=15)
        assert pay.status_code == 200

        r = requests.post(f"{API}/invoices/{inv_id}/remind", headers=_h(keu_token), timeout=15)
        assert r.status_code == 404

        # cleanup
        requests.delete(f"{API}/invoices/{inv_id}", headers=_h(keu_token), timeout=15)
        requests.delete(f"{API}/students/{sid}", headers=_h(keu_token), timeout=15)

    def test_remind_guru_403(self, keu_token, guru_token):
        rc = requests.get(f"{API}/classes", headers=_h(keu_token), timeout=15)
        cid = rc.json()[0]["id"]
        program = rc.json()[0]["program"]
        rs = requests.post(f"{API}/students", headers=_h(keu_token), json={
            "name": "TEST_RemindGuruStudent", "parent_name": "TEST_P",
            "parent_phone": "08177777777", "class_ids": [cid]
        }, timeout=15)
        sid = rs.json()["id"]
        inv = requests.post(f"{API}/invoices", headers=_h(keu_token), json={
            "student_id": sid, "program": program, "package": 4
        }, timeout=15)
        inv_id = inv.json()["id"]

        r = requests.post(f"{API}/invoices/{inv_id}/remind", headers=_h(guru_token), timeout=15)
        assert r.status_code == 403, r.text

        # cleanup
        requests.delete(f"{API}/invoices/{inv_id}", headers=_h(keu_token), timeout=15)
        requests.delete(f"{API}/students/{sid}", headers=_h(keu_token), timeout=15)
