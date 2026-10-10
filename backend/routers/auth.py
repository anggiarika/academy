from fastapi import APIRouter, HTTPException

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
