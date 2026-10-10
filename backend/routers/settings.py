import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from core import AnyUser, FinanceUser, db
from storage import APP_NAME, put_object

router = APIRouter(prefix="/settings", tags=["settings"])
MAX_LOGO_BYTES = 8 * 1024 * 1024


class SettingsOut(BaseModel):
    school_name: str = ""
    logo_path: str | None = None


class SettingsIn(BaseModel):
    school_name: str = Field(max_length=120)


async def get_settings() -> dict:
    doc = await db.settings.find_one({"id": "school"}, {"_id": 0})
    return doc or {"id": "school", "school_name": "", "logo_path": None}


@router.get("", response_model=SettingsOut)
async def read_settings(_: AnyUser):
    return await get_settings()


@router.put("", response_model=SettingsOut)
async def update_settings(body: SettingsIn, _: FinanceUser):
    await db.settings.update_one({"id": "school"}, {"$set": {"school_name": body.school_name.strip()}}, upsert=True)
    return await get_settings()


@router.post("/logo", response_model=SettingsOut)
async def upload_logo(user: FinanceUser, file: UploadFile = File(...)):
    ctype = file.content_type or "image/png"
    if not ctype.startswith("image/"):
        raise HTTPException(400, "Logo harus berupa gambar")
    data = await file.read()
    if len(data) > MAX_LOGO_BYTES:
        raise HTTPException(400, "Ukuran logo maksimal 8 MB")
    ext = (file.filename or "logo.png").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "png"
    path = f"{APP_NAME}/logo/{uuid.uuid4()}.{ext}"
    try:
        result = await run_in_threadpool(put_object, path, data, ctype)
    except Exception as exc:
        status = getattr(getattr(exc, "response", None), "status_code", 500)
        if status == 402:
            raise HTTPException(402, "Kuota penyimpanan habis, coba lagi nanti")
        raise HTTPException(502, "Gagal mengunggah logo")
    await db.files.insert_one({"path": result["path"], "kind": "logo", "content_type": ctype, "uploaded_by": user["id"]})
    await db.settings.update_one({"id": "school"}, {"$set": {"logo_path": result["path"]}}, upsert=True)
    return await get_settings()
