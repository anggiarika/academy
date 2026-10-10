from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field
from pymongo.errors import DuplicateKeyError

from core import FinanceUser, db, new_id, now_utc, passwords
from models import Role, UserOut

router = APIRouter(prefix="/users", tags=["users"])


class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1)
    password: str = Field(min_length=8, max_length=128)
    role: Role = "guru"


@router.get("", response_model=List[UserOut])
async def list_users(_: FinanceUser):
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).sort([("role", 1), ("name", 1)]).to_list(500)


@router.post("", response_model=UserOut, status_code=201)
async def create_user(body: UserCreate, _: FinanceUser):
    doc = {
        "id": new_id(), "email": body.email.lower(), "name": body.name.strip(), "role": body.role,
        "password_hash": passwords.hash(body.password), "created_at": now_utc(),
    }
    try:
        await db.users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(409, "Email sudah terdaftar")
    return UserOut(id=doc["id"], email=doc["email"], name=doc["name"], role=doc["role"])


@router.delete("/{user_id}")
async def delete_user(user_id: str, admin: FinanceUser):
    if user_id == admin["id"]:
        raise HTTPException(400, "Tidak bisa menghapus akun sendiri")
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "Akun tidak ditemukan")
    if target["role"] == "keuangan" and await db.users.count_documents({"role": "keuangan"}) <= 1:
        raise HTTPException(400, "Minimal harus ada satu akun keuangan")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}
