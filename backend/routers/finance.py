from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException

from core import IZIN_QUOTA, PACKAGES, AnyUser, FinanceUser, db, log_tx, new_id, now_utc
from models import DashboardOut, InvoiceIn, InvoiceOut, InvoicePay, PackageOut

router = APIRouter(tags=["finance"])


@router.get("/packages", response_model=List[PackageOut])
async def list_packages(_: AnyUser):
    return [
        PackageOut(program=p, package=n, amount=a, izin_quota=IZIN_QUOTA[n])
        for p, pk in PACKAGES.items() for n, a in pk.items()
    ]


@router.get("/invoices", response_model=List[InvoiceOut])
async def list_invoices(_: FinanceUser, status: Optional[Literal["unpaid", "paid"]] = None, student_id: Optional[str] = None):
    q: dict = {}
    if status:
        q["status"] = status
    if student_id:
        q["student_id"] = student_id
    return await db.invoices.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.get("/invoices/{invoice_id}", response_model=InvoiceOut)
async def get_invoice(invoice_id: str, _: FinanceUser):
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Tagihan tidak ditemukan")
    return inv


@router.post("/invoices", response_model=InvoiceOut)
async def create_invoice(body: InvoiceIn, _: FinanceUser):
    s = await db.students.find_one({"id": body.student_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Siswa tidak ditemukan")
    if body.program not in s["wallets"]:
        raise HTTPException(400, "Siswa tidak terdaftar di program ini")
    dup = await db.invoices.find_one({"student_id": body.student_id, "program": body.program, "status": "unpaid"})
    if dup:
        raise HTTPException(409, "Masih ada tagihan belum dibayar untuk program ini")
    doc = {
        "id": new_id(),
        "student_id": s["id"],
        "student_name": s["name"],
        "parent_name": s.get("parent_name", ""),
        "parent_phone": s.get("parent_phone", ""),
        "program": body.program,
        "package": body.package,
        "amount": PACKAGES[body.program][body.package],
        "status": "unpaid",
        "method": None,
        "created_at": now_utc(),
        "paid_at": None,
    }
    await db.invoices.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.post("/invoices/{invoice_id}/pay", response_model=InvoiceOut)
async def pay_invoice(invoice_id: str, body: InvoicePay, user: FinanceUser):
    inv = await get_invoice(invoice_id, user)
    if inv["status"] == "paid":
        raise HTTPException(400, "Tagihan sudah lunas")
    s = await db.students.find_one({"id": inv["student_id"]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Siswa tidak ditemukan")
    p, n = inv["program"], inv["package"]
    w = s["wallets"].get(p, {"credits": 0, "makeup": 0})
    expired_makeup = w.get("makeup", 0)
    # New package: add credits, reset izin quota, unused makeup classes expire (hangus)
    new_wallet = {
        "credits": w.get("credits", 0) + n,
        "izin_quota": IZIN_QUOTA[n],
        "makeup": 0,
        "package": n,
    }
    await db.students.update_one({"id": s["id"]}, {"$set": {f"wallets.{p}": new_wallet}})
    if expired_makeup:
        await log_tx(s["id"], p, "hangus", 0, f"{expired_makeup} kelas pengganti hangus", user["name"], makeup_delta=-expired_makeup)
    await log_tx(s["id"], p, "pembayaran", n, f"Paket {n} pertemuan ({body.method})", user["name"])
    await db.invoices.update_one(
        {"id": invoice_id}, {"$set": {"status": "paid", "method": body.method, "paid_at": now_utc()}}
    )
    return await get_invoice(invoice_id, user)


@router.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str, _: FinanceUser):
    res = await db.invoices.delete_one({"id": invoice_id, "status": "unpaid"})
    if not res.deleted_count:
        raise HTTPException(404, "Tagihan tidak ditemukan atau sudah lunas")
    return {"ok": True}


@router.get("/dashboard", response_model=DashboardOut)
async def dashboard(_: AnyUser):
    students = await db.students.find({}, {"_id": 0}).to_list(5000)
    unpaid = await db.invoices.find({"status": "unpaid"}, {"_id": 0}).to_list(5000)
    unpaid_keys = {(i["student_id"], i["program"]) for i in unpaid}
    low = zero = 0
    needs: list = []
    for s in students:
        for p, w in s["wallets"].items():
            c = w.get("credits", 0)
            if c <= 0:
                zero += 1
                if (s["id"], p) not in unpaid_keys:
                    needs.append({"student_id": s["id"], "name": s["name"], "program": p, "credits": c})
            elif c <= 1:
                low += 1
    return DashboardOut(
        total_students=len(students),
        total_classes=await db.classes.count_documents({}),
        low_credit=low,
        zero_credit=zero,
        unpaid_count=len(unpaid),
        unpaid_total=sum(i["amount"] for i in unpaid),
        needs_billing=needs,
    )
