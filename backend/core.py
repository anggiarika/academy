import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from motor.motor_asyncio import AsyncIOMotorClient
from pwdlib import PasswordHash

load_dotenv(Path(__file__).parent / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
JWT_MINUTES = int(os.environ.get("JWT_MINUTES", "10080"))
passwords = PasswordHash.recommended()
oauth2 = OAuth2PasswordBearer(tokenUrl="api/auth/login")

PROGRAMS = ["gymnastic", "english"]
# program -> package size -> price (Rupiah)
PACKAGES = {
    "gymnastic": {4: 350_000, 12: 900_000},
    "english": {4: 495_000, 12: 1_335_000},
}
# izin quota per package: 1 per 4 meetings, 3 for 12 meetings
IZIN_QUOTA = {4: 1, 12: 3}


def new_id() -> str:
    return str(uuid.uuid4())


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def make_token(user: dict) -> str:
    now = now_utc()
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "role": user["role"],
        "iat": now,
        "exp": now + timedelta(minutes=JWT_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def current_user(token: Annotated[str, Depends(oauth2)]) -> dict:
    return await user_from_token(token)


async def user_from_token(token: str) -> dict:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sesi tidak valid atau kedaluwarsa",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except InvalidTokenError:
        raise unauthorized
    user = await db.users.find_one({"id": claims.get("sub")}, {"_id": 0})
    if not user or user.get("role") != claims.get("role"):
        raise unauthorized
    return user


def require_roles(*allowed: str):
    async def dependency(user: Annotated[dict, Depends(current_user)]) -> dict:
        if user["role"] not in allowed:
            raise HTTPException(status_code=403, detail="Akses ditolak untuk peran ini")
        return user

    return dependency


AnyUser = Annotated[dict, Depends(current_user)]
FinanceUser = Annotated[dict, Depends(require_roles("keuangan"))]


async def log_tx(student_id: str, program: str, kind: str, credit_delta: int, note: str, by: str, makeup_delta: int = 0):
    await db.transactions.insert_one({
        "id": new_id(),
        "student_id": student_id,
        "program": program,
        "kind": kind,
        "credit_delta": credit_delta,
        "makeup_delta": makeup_delta,
        "note": note,
        "by": by,
        "created_at": now_utc(),
    })
