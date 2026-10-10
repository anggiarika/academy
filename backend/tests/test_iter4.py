"""Iteration 4: income trend endpoint tests."""
from datetime import datetime, timezone


class TestIncomeTrend:
    """GET /api/reports/trend?months=N (keuangan)"""

    def test_trend_default_6_points(self, kc, api_base):
        r = kc.get(f"{api_base}/reports/trend")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 6
        now = datetime.now(timezone.utc)
        last_expected = f"{now.year}-{now.month:02d}"
        assert data[-1]["month"] == last_expected
        for p in data:
            assert "month" in p and "income" in p and "count" in p
            assert isinstance(p["income"], int) and isinstance(p["count"], int)

    def test_trend_months_param(self, kc, api_base):
        r = kc.get(f"{api_base}/reports/trend?months=3")
        assert r.status_code == 200
        assert len(r.json()) == 3

    def test_trend_months_0_422(self, kc, api_base):
        r = kc.get(f"{api_base}/reports/trend?months=0")
        assert r.status_code == 422

    def test_trend_months_25_422(self, kc, api_base):
        r = kc.get(f"{api_base}/reports/trend?months=25")
        assert r.status_code == 422

    def test_trend_guru_forbidden(self, gc, api_base):
        r = gc.get(f"{api_base}/reports/trend?months=6")
        assert r.status_code == 403

    def test_trend_unauth(self, api_base):
        import requests
        r = requests.get(f"{api_base}/reports/trend?months=6")
        assert r.status_code in (401, 403)
