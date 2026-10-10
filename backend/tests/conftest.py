import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

KEUANGAN = {"email": "keuangan@sekolah.id", "password": "keuangan123"}
GURU = {"email": "guru@sekolah.id", "password": "guru1234"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def api_base():
    return API


@pytest.fixture(scope="session")
def keuangan_token():
    return _login(KEUANGAN)


@pytest.fixture(scope="session")
def guru_token():
    return _login(GURU)


@pytest.fixture
def kc(keuangan_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {keuangan_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture
def gc(guru_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {guru_token}", "Content-Type": "application/json"})
    return s
