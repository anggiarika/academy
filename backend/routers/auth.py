from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from core import AnyUser, db, make_token, passwords
from models import LoginIn, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])
_DUMMY_HASH = passwords.hash("dummy-password-ignored")


def public_user(u: dict) -> UserOut:
    return UserOut(id=u["id"], email=u["email"], name=u.get("name", ""), role=u["role"])


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    valid = passwords.verify(body.password, user["password_hash"] if user else _DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(status_code=401, detail="Email atau password salah")
    return TokenOut(access_token=make_token(user), user=public_user(user))


@router.get("/me", response_model=UserOut)
async def me(user: AnyUser):
    return public_user(user)


class ChangePasswordIn(BaseModel):
    old_password: str = Field(min_length=1, max_length=1024)
    new_password: str = Field(min_length=8, max_length=1024)


@router.post("/change-password")
async def change_password(body: ChangePasswordIn, user: AnyUser):
    # Identity comes from the verified JWT; never from the client.
    stored = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 1})
    ok = stored and await run_in_threadpool(passwords.verify, body.old_password, stored["password_hash"])
    if not ok:
        raise HTTPException(status_code=400, detail="Password lama salah")
    if body.new_password == body.old_password:
        raise HTTPException(status_code=400, detail="Password baru harus berbeda")
    new_hash = await run_in_threadpool(passwords.hash, body.new_password)
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": new_hash}})
    return {"ok": True}
