"""Iteration 7: School branding (Logo & Nama Lembaga).

Covers:
- GET /api/settings readable by both roles -> {school_name, logo_path}
- PUT /api/settings keuangan sets name; guru -> 403
- POST /api/settings/logo multipart image (keuangan) sets logo_path; non-image -> 400; guru -> 403
- GET /api/files/{logo_path}?token=<guru> -> 200 (logo allowed for guru, needed on printed QR cards)
- GET /api/files/{receipt_path}?token=<guru> -> 403 (receipts stay keuangan-only)
- Unauthenticated access -> 401/403
"""
import io

import pytest
import requests

from .conftest import API


# Tiny valid PNG (1x1)
PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xfc\xff\xff?"
    b"\x03\x00\x08\xfc\x02\xfe\xa7\x9a\xa0\xc8\x00\x00\x00\x00IEND\xaeB`\x82"
)


class TestSettingsRead:
    """GET /api/settings — any logged-in user."""

    def test_keuangan_can_read_settings(self, kc):
        r = kc.get(f"{API}/settings", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "school_name" in data and isinstance(data["school_name"], str)
        assert "logo_path" in data
        assert "_id" not in data

    def test_guru_can_read_settings(self, gc):
        r = gc.get(f"{API}/settings", timeout=30)
        assert r.status_code == 200
        assert "school_name" in r.json()

    def test_unauthenticated_settings_rejected(self):
        r = requests.get(f"{API}/settings", timeout=30)
        assert r.status_code in (401, 403)


class TestSettingsUpdate:
    """PUT /api/settings — keuangan only."""

    def test_keuangan_sets_school_name_and_persists(self, kc):
        payload = {"school_name": "TEST Ganesha Gymnastic & English Club"}
        r = kc.put(f"{API}/settings", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["school_name"] == payload["school_name"]
        # GET to verify persistence
        g = kc.get(f"{API}/settings", timeout=30)
        assert g.status_code == 200
        assert g.json()["school_name"] == payload["school_name"]

    def test_guru_cannot_update_settings(self, gc):
        r = gc.put(f"{API}/settings", json={"school_name": "Hacked School"}, timeout=30)
        assert r.status_code == 403

    def test_school_name_too_long_rejected(self, kc):
        r = kc.put(f"{API}/settings", json={"school_name": "X" * 121}, timeout=30)
        assert r.status_code == 422


class TestLogoUpload:
    """POST /api/settings/logo — keuangan only, image only."""

    def test_keuangan_upload_logo_sets_logo_path(self, kc):
        files = {"file": ("logo.png", io.BytesIO(PNG_BYTES), "image/png")}
        r = kc.post(
            f"{API}/settings/logo",
            files=files,
            headers={"Authorization": kc.headers["Authorization"], "Content-Type": None},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["logo_path"], "logo_path should be set after upload"
        assert data["logo_path"].startswith("presensi-kredit/logo/")
        # GET to verify persistence
        g = kc.get(f"{API}/settings", timeout=30)
        assert g.json()["logo_path"] == data["logo_path"]
        pytest.shared_logo_path = data["logo_path"]

    def test_non_image_logo_rejected_400(self, kc):
        files = {"file": ("evil.txt", io.BytesIO(b"not an image"), "text/plain")}
        r = kc.post(
            f"{API}/settings/logo",
            files=files,
            headers={"Authorization": kc.headers["Authorization"], "Content-Type": None},
            timeout=30,
        )
        assert r.status_code == 400

    def test_guru_cannot_upload_logo(self, gc):
        files = {"file": ("logo.png", io.BytesIO(PNG_BYTES), "image/png")}
        r = gc.post(
            f"{API}/settings/logo",
            files=files,
            headers={"Authorization": gc.headers["Authorization"], "Content-Type": None},
            timeout=30,
        )
        assert r.status_code == 403


class TestFileAccessControl:
    """GET /api/files/{path} — logo readable by guru; receipts keuangan-only."""

    def _logo_path(self, kc) -> str:
        g = kc.get(f"{API}/settings", timeout=30)
        logo = g.json().get("logo_path")
        assert logo, "A logo must exist (uploaded by previous test or seeded)"
        return logo

    def test_guru_can_download_logo_with_query_token(self, kc, guru_token):
        logo = self._logo_path(kc)
        r = requests.get(f"{API}/files/{logo}?token={guru_token}", timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers.get("Content-Type", "").startswith("image/")

    def test_guru_logo_via_bearer_header(self, kc, gc):
        logo = self._logo_path(kc)
        r = gc.get(f"{API}/files/{logo}", timeout=30)
        assert r.status_code == 200

    def test_guru_cannot_download_receipt_403(self, kc, guru_token):
        # Find a paid invoice with a receipt, else upload one as keuangan first
        r = kc.get(f"{API}/invoices?status=paid", timeout=30)
        assert r.status_code == 200
        invoices = r.json()
        receipt_path = next((i.get("receipt_path") for i in invoices if i.get("receipt_path")), None)
        if not receipt_path:
            # Create one: use first paid invoice
            assert invoices, "Need at least one paid invoice for receipt 403 test"
            inv_id = invoices[0]["id"]
            files = {"file": ("bukti.png", io.BytesIO(PNG_BYTES), "image/png")}
            up = kc.post(
                f"{API}/invoices/{inv_id}/receipt",
                files=files,
                headers={"Authorization": kc.headers["Authorization"], "Content-Type": None},
                timeout=60,
            )
            assert up.status_code == 200, up.text
            receipt_path = up.json()["receipt_path"]
        r = requests.get(f"{API}/files/{receipt_path}?token={guru_token}", timeout=30)
        assert r.status_code == 403

    def test_keuangan_can_download_receipt(self, kc):
        r = kc.get(f"{API}/invoices?status=paid", timeout=30)
        receipt_path = next((i.get("receipt_path") for i in r.json() if i.get("receipt_path")), None)
        if not receipt_path:
            pytest.skip("No receipt exists yet")
        g = kc.get(f"{API}/files/{receipt_path}", timeout=30)
        assert g.status_code == 200

    def test_files_without_token_401(self, kc):
        logo = self._logo_path(kc)
        r = requests.get(f"{API}/files/{logo}", timeout=30)
        assert r.status_code == 401

    def test_cleanup_restore_school_name(self, kc):
        """Restore original school name (was 'Ganesha Gymnastic & English Club')."""
        r = kc.put(f"{API}/settings", json={"school_name": "Ganesha Gymnastic & English Club"}, timeout=30)
        assert r.status_code == 200
        g = kc.get(f"{API}/settings", timeout=30)
        assert g.json()["school_name"] == "Ganesha Gymnastic & English Club"
