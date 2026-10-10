import uuid
from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, File, Header, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel

from core import PACKAGES, AnyUser, FinanceUser, db, user_from_token
from models import InvoiceOut
from storage import APP_NAME, get_object, put_object

router = APIRouter(tags=["extras"])
MAX_RECEIPT_BYTES = 8 * 1024 * 1024


class PackageChange(BaseModel):
    package: Literal[4, 12]


@router.post("/invoices/{invoice_id}/remind", response_model=InvoiceOut)
async def remind_invoice(invoice_id: str, _: FinanceUser):
    res = await db.invoices.update_one(
        {"id": invoice_id, "status": "unpaid"},
        {"$set": {"reminded_at": datetime.now(timezone.utc)}, "$inc": {"reminder_count": 1}},
    )
    if not res.matched_count:
        raise HTTPException(404, "Tagihan tidak ditemukan atau sudah lunas")
    return await db.invoices.find_one({"id": invoice_id}, {"_id": 0})


class StudentAttendanceItem(BaseModel):
    date: str
    class_id: str
    class_name: str
    program: str
    status: str


@router.get("/students/{student_id}/attendance", response_model=List[StudentAttendanceItem])
async def student_attendance(student_id: str, _: AnyUser, month: str = Query(..., pattern=r"^\d{4}-\d{2}$")):
    classes = {c["id"]: c for c in await db.classes.find({}, {"_id": 0}).to_list(100)}
    docs = await db.attendance.find(
        {"date": {"$regex": f"^{month}"}, "records.student_id": student_id}, {"_id": 0}
    ).sort("date", 1).to_list(1000)
    items = []
    for d in docs:
        c = classes.get(d["class_id"], {"name": "-", "program": "-"})
        for r in d["records"]:
            if r["student_id"] == student_id:
                items.append(StudentAttendanceItem(
                    date=d["date"], class_id=d["class_id"], class_name=c["name"], program=c["program"], status=r["status"],
                ))
    return items


@router.post("/invoices/{invoice_id}/package", response_model=InvoiceOut)
async def change_package(invoice_id: str, body: PackageChange, _: FinanceUser):
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Tagihan tidak ditemukan")
    if inv["status"] == "paid":
        raise HTTPException(400, "Tagihan sudah lunas")
    amount = PACKAGES[inv["program"]][body.package]
    await db.invoices.update_one({"id": invoice_id}, {"$set": {"package": body.package, "amount": amount}})
    return await db.invoices.find_one({"id": invoice_id}, {"_id": 0})


@router.post("/invoices/{invoice_id}/receipt", response_model=InvoiceOut)
async def upload_receipt(invoice_id: str, user: FinanceUser, file: UploadFile = File(...)):
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Tagihan tidak ditemukan")
    ctype = file.content_type or "image/jpeg"
    if not ctype.startswith("image/"):
        raise HTTPException(400, "File harus berupa gambar")
    data = await file.read()
    if len(data) > MAX_RECEIPT_BYTES:
        raise HTTPException(400, "Ukuran gambar maksimal 8 MB")
    ext = (file.filename or "bukti.jpg").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    path = f"{APP_NAME}/receipts/{invoice_id}/{uuid.uuid4()}.{ext}"
    try:
        result = await run_in_threadpool(put_object, path, data, ctype)
    except Exception as exc:
        status = getattr(getattr(exc, "response", None), "status_code", 500)
        if status == 402:
            raise HTTPException(402, "Kuota penyimpanan habis, coba lagi nanti")
        raise HTTPException(502, "Gagal mengunggah bukti transfer")
    await db.files.insert_one({"path": result["path"], "invoice_id": invoice_id, "content_type": ctype, "uploaded_by": user["id"]})
    await db.invoices.update_one({"id": invoice_id}, {"$set": {"receipt_path": result["path"]}})
    return await db.invoices.find_one({"id": invoice_id}, {"_id": 0})


@router.get("/files/{path:path}")
async def download_file(path: str, token: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
    raw = token or (authorization[7:] if authorization and authorization.lower().startswith("bearer ") else None)
    if not raw:
        raise HTTPException(401, "Butuh login")
    user = await user_from_token(raw)
    # Keuangan can read everything; other roles only the school logo (used on printed QR cards).
    if user["role"] != "keuangan" and not path.startswith(f"{APP_NAME}/logo/"):
        raise HTTPException(403, "Akses ditolak")
    record = await db.files.find_one({"path": path}, {"_id": 0})
    if not record:
        raise HTTPException(404, "File tidak ditemukan")
    data, ctype = await run_in_threadpool(get_object, path)
    return Response(content=data, media_type=record.get("content_type", ctype), headers={"Cache-Control": "private, max-age=86400"})


class ClassReport(BaseModel):
    class_id: str
    name: str
    program: str
    sessions: int
    counts: Dict[str, int]


class MonthlyReport(BaseModel):
    month: str
    income_total: int
    income_count: int
    income_by_program: Dict[str, int]
    unpaid_total: int
    classes: List[ClassReport]


@router.get("/reports/monthly", response_model=MonthlyReport)
async def monthly_report(_: FinanceUser, month: str = Query(..., pattern=r"^\d{4}-\d{2}$")):
    y, m = map(int, month.split("-"))
    start = datetime(y, m, 1, tzinfo=timezone.utc)
    end = datetime(y + (m == 12), 1 if m == 12 else m + 1, 1, tzinfo=timezone.utc)
    paid = await db.invoices.find({"status": "paid", "paid_at": {"$gte": start, "$lt": end}}, {"_id": 0}).to_list(5000)
    by_program: Dict[str, int] = {"gymnastic": 0, "english": 0}
    for i in paid:
        by_program[i["program"]] = by_program.get(i["program"], 0) + i["amount"]
    unpaid = await db.invoices.find({"status": "unpaid"}, {"_id": 0, "amount": 1}).to_list(5000)

    classes = await db.classes.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    sessions = await db.attendance.find({"date": {"$regex": f"^{month}"}}, {"_id": 0}).to_list(5000)
    reports = []
    for c in classes:
        counts = {"hadir": 0, "izin": 0, "alpha": 0, "pengganti": 0}
        n = 0
        for s in sessions:
            if s["class_id"] != c["id"]:
                continue
            n += 1
            for r in s["records"]:
                counts[r["status"]] = counts.get(r["status"], 0) + 1
        reports.append(ClassReport(class_id=c["id"], name=c["name"], program=c["program"], sessions=n, counts=counts))

    return MonthlyReport(
        month=month,
        income_total=sum(i["amount"] for i in paid),
        income_count=len(paid),
        income_by_program=by_program,
        unpaid_total=sum(i["amount"] for i in unpaid),
        classes=reports,
    )


class TrendPoint(BaseModel):
    month: str
    income: int
    count: int


@router.get("/reports/trend", response_model=List[TrendPoint])
async def income_trend(_: FinanceUser, months: int = Query(6, ge=1, le=24)):
    now = datetime.now(timezone.utc)
    points = []
    for back in range(months - 1, -1, -1):
        idx = now.year * 12 + (now.month - 1) - back
        y, m = divmod(idx, 12)
        start = datetime(y, m + 1, 1, tzinfo=timezone.utc)
        ny, nm = divmod(idx + 1, 12)
        end = datetime(ny, nm + 1, 1, tzinfo=timezone.utc)
        paid = await db.invoices.find({"status": "paid", "paid_at": {"$gte": start, "$lt": end}}, {"_id": 0, "amount": 1}).to_list(5000)
        points.append(TrendPoint(month=f"{y}-{m + 1:02d}", income=sum(i["amount"] for i in paid), count=len(paid)))
    return points
