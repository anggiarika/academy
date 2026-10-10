from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, EmailStr, Field
from pymongo.errors import DuplicateKeyError

from core import AnyUser, db, make_token, new_id, now_utc, passwords
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


class RegisterIn(BaseModel):
    # No role field: self sign-up always creates a "guru" account.
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)


@router.post("/register", response_model=TokenOut, status_code=201)
async def register(body: RegisterIn):
    user = {
        "id": new_id(),
        "email": body.email.lower(),
        "name": body.name.strip(),
        "role": "guru",
        "password_hash": await run_in_threadpool(passwords.hash, body.password),
        "created_at": now_utc(),
    }
    try:
        await db.users.insert_one(user)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Email sudah terdaftar, silakan masuk")
    user.pop("_id", None)
    return TokenOut(access_token=make_token(user), user=public_user(user))


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


class DeleteAccountIn(BaseModel):
    password: str = Field(min_length=1, max_length=256)


@router.delete("/me")
async def delete_my_account(body: DeleteAccountIn, user: AnyUser):
    """Self account deletion (App Store requirement). Identity from JWT only."""
    stored = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 1})
    ok = stored and await run_in_threadpool(passwords.verify, body.password, stored["password_hash"])
    if not ok:
        raise HTTPException(status_code=400, detail="Konfirmasi password salah")
    if user["role"] == "keuangan":
        others = await db.users.count_documents({"role": "keuangan", "id": {"$ne": user["id"]}})
        if others < 1:
            raise HTTPException(status_code=409, detail="Akun keuangan terakhir tidak bisa dihapus")
    await db.users.delete_one({"id": user["id"]})
    return {"ok": True}
