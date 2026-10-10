from typing import List, Optional

from fastapi import APIRouter, HTTPException

from core import AnyUser, FinanceUser, db, log_tx, new_id, now_utc
from models import (
    AttendanceIn, AttendanceOut, ClassOut, ClassUpdate, IzinIn,
    StudentIn, StudentOut, TransactionOut, Wallet,
)

router = APIRouter(tags=["school"])


# ---------------- Classes ----------------
@router.get("/classes", response_model=List[ClassOut])
async def list_classes(_: AnyUser):
    classes = await db.classes.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    for c in classes:
        c["student_count"] = await db.students.count_documents({"class_ids": c["id"]})
    return classes


@router.get("/classes/{class_id}", response_model=ClassOut)
async def get_class(class_id: str, _: AnyUser):
    c = await db.classes.find_one({"id": class_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Kelas tidak ditemukan")
    c["student_count"] = await db.students.count_documents({"class_ids": class_id})
    return c


@router.put("/classes/{class_id}", response_model=ClassOut)
async def update_class(class_id: str, body: ClassUpdate, _: FinanceUser):
    res = await db.classes.update_one({"id": class_id}, {"$set": body.model_dump()})
    if not res.matched_count:
        raise HTTPException(404, "Kelas tidak ditemukan")
    return await get_class(class_id, _)


# ---------------- Students ----------------
async def _programs_for(class_ids: List[str]) -> List[str]:
    classes = await db.classes.find({"id": {"$in": class_ids}}, {"_id": 0}).to_list(100)
    if len(classes) != len(set(class_ids)):
        raise HTTPException(400, "Kelas tidak valid")
    return list({c["program"] for c in classes})


@router.get("/students", response_model=List[StudentOut])
async def list_students(_: AnyUser, class_id: Optional[str] = None, q: Optional[str] = None):
    query: dict = {}
    if class_id:
        query["class_ids"] = class_id
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    return await db.students.find(query, {"_id": 0}).sort("name", 1).to_list(1000)


@router.get("/students/{student_id}", response_model=StudentOut)
async def get_student(student_id: str, _: AnyUser):
    s = await db.students.find_one({"id": student_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Siswa tidak ditemukan")
    return s


@router.post("/students", response_model=StudentOut)
async def create_student(body: StudentIn, _: FinanceUser):
    programs = await _programs_for(body.class_ids)
    doc = {
        "id": new_id(),
        **body.model_dump(),
        "wallets": {p: Wallet().model_dump() for p in programs},
        "created_at": now_utc(),
    }
    await db.students.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/students/{student_id}", response_model=StudentOut)
async def update_student(student_id: str, body: StudentIn, user: FinanceUser):
    s = await get_student(student_id, user)
    programs = await _programs_for(body.class_ids)
    wallets = s["wallets"]
    for p in programs:
        wallets.setdefault(p, Wallet().model_dump())
    await db.students.update_one({"id": student_id}, {"$set": {**body.model_dump(), "wallets": wallets}})
    return await get_student(student_id, user)


@router.delete("/students/{student_id}")
async def delete_student(student_id: str, _: FinanceUser):
    res = await db.students.delete_one({"id": student_id})
    if not res.deleted_count:
        raise HTTPException(404, "Siswa tidak ditemukan")
    return {"ok": True}


@router.get("/students/{student_id}/transactions", response_model=List[TransactionOut])
async def student_transactions(student_id: str, _: AnyUser):
    return await db.transactions.find({"student_id": student_id}, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.post("/students/{student_id}/izin", response_model=StudentOut)
async def record_izin(student_id: str, body: IzinIn, user: FinanceUser):
    """Izin approved by finance: uses 1 izin quota + 1 credit, grants 1 makeup class."""
    s = await get_student(student_id, user)
    w = s["wallets"].get(body.program)
    if w is None:
        raise HTTPException(400, "Siswa tidak terdaftar di program ini")
    if w["izin_quota"] <= 0:
        raise HTTPException(400, "Kuota izin sudah habis untuk paket ini")
    if w["credits"] <= 0:
        raise HTTPException(400, "Kredit habis, tidak bisa izin")
    p = body.program
    await db.students.update_one(
        {"id": student_id},
        {"$inc": {f"wallets.{p}.izin_quota": -1, f"wallets.{p}.credits": -1, f"wallets.{p}.makeup": 1}},
    )
    note = f"Izin {body.date}" + (f" - {body.note}" if body.note else "")
    await log_tx(student_id, p, "izin", -1, note, user["name"], makeup_delta=1)
    return await get_student(student_id, user)


# ---------------- Attendance ----------------
# Credit effect per status: (credit_delta, makeup_delta)
EFFECT = {"hadir": (-1, 0), "alpha": (-1, 0), "izin": (0, 0), "pengganti": (0, -1)}


@router.get("/classes/{class_id}/attendance", response_model=Optional[AttendanceOut])
async def get_attendance(class_id: str, date: str, _: AnyUser):
    return await db.attendance.find_one({"class_id": class_id, "date": date}, {"_id": 0})


@router.post("/classes/{class_id}/attendance", response_model=AttendanceOut)
async def save_attendance(class_id: str, body: AttendanceIn, user: AnyUser):
    cls = await db.classes.find_one({"id": class_id}, {"_id": 0})
    if not cls:
        raise HTTPException(404, "Kelas tidak ditemukan")
    p = cls["program"]
    existing = await db.attendance.find_one({"class_id": class_id, "date": body.date}, {"_id": 0})
    old = {r["student_id"]: r["status"] for r in (existing or {}).get("records", [])}
    new = {r.student_id: r.status for r in body.records}

    # validate makeup availability for new 'pengganti'
    for sid, st in new.items():
        if st == "pengganti" and old.get(sid) != "pengganti":
            s = await db.students.find_one({"id": sid}, {"_id": 0})
            if not s or s["wallets"].get(p, {}).get("makeup", 0) <= 0:
                name = s["name"] if s else sid
                raise HTTPException(400, f"{name} tidak punya kuota kelas pengganti")

    for sid in set(old) | set(new):
        o_c, o_m = EFFECT.get(old.get(sid, ""), (0, 0))
        n_c, n_m = EFFECT.get(new.get(sid, ""), (0, 0))
        dc, dm = n_c - o_c, n_m - o_m
        if dc == 0 and dm == 0:
            continue
        await db.students.update_one(
            {"id": sid, f"wallets.{p}": {"$exists": True}},
            {"$inc": {f"wallets.{p}.credits": dc, f"wallets.{p}.makeup": dm}},
        )
        label = new.get(sid, "dihapus")
        await log_tx(sid, p, "presensi", dc, f"{cls['name']} {body.date}: {label}", user["name"], makeup_delta=dm)

    doc = {
        "id": existing["id"] if existing else new_id(),
        "class_id": class_id,
        "date": body.date,
        "records": [r.model_dump() for r in body.records],
        "updated_by": user["name"],
        "updated_at": now_utc(),
    }
    await db.attendance.replace_one({"class_id": class_id, "date": body.date}, doc, upsert=True)
    doc.pop("_id", None)
    return doc
