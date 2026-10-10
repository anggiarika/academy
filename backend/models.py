from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field

Role = Literal["guru", "keuangan"]
Program = Literal["gymnastic", "english"]
AttendanceStatus = Literal["hadir", "izin", "alpha", "pengganti"]


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: Role


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ClassOut(BaseModel):
    id: str
    name: str
    program: Program
    schedule: str = ""
    student_count: int = 0


class ClassUpdate(BaseModel):
    name: str = Field(min_length=1)
    schedule: str = ""


class Wallet(BaseModel):
    credits: int = 0
    izin_quota: int = 0
    makeup: int = 0
    package: int = 0


class StudentIn(BaseModel):
    name: str = Field(min_length=1)
    parent_name: str = ""
    parent_phone: str = ""
    class_ids: List[str] = []


class StudentOut(BaseModel):
    id: str
    name: str
    parent_name: str
    parent_phone: str
    class_ids: List[str]
    wallets: Dict[str, Wallet]
    created_at: datetime


class IzinIn(BaseModel):
    program: Program
    date: str
    note: str = ""


class TransactionOut(BaseModel):
    id: str
    student_id: str
    program: str
    kind: str
    credit_delta: int
    makeup_delta: int
    note: str
    by: str
    created_at: datetime


class AttendanceRecord(BaseModel):
    student_id: str
    status: AttendanceStatus


class AttendanceIn(BaseModel):
    date: str  # YYYY-MM-DD
    records: List[AttendanceRecord]


class AttendanceOut(BaseModel):
    id: str
    class_id: str
    date: str
    records: List[AttendanceRecord]
    updated_by: str
    updated_at: datetime


class InvoiceIn(BaseModel):
    student_id: str
    program: Program
    package: Literal[4, 12]


class InvoicePay(BaseModel):
    method: str = "transfer"


class InvoiceOut(BaseModel):
    id: str
    student_id: str
    student_name: str
    parent_name: str
    parent_phone: str
    program: Program
    package: int
    amount: int
    status: Literal["unpaid", "paid"]
    method: Optional[str] = None
    created_at: datetime
    paid_at: Optional[datetime] = None
    receipt_path: Optional[str] = None
    reminded_at: Optional[datetime] = None
    reminder_count: int = 0


class PackageOut(BaseModel):
    program: Program
    package: int
    amount: int
    izin_quota: int


class DashboardOut(BaseModel):
    total_students: int
    total_classes: int
    low_credit: int
    zero_credit: int
    unpaid_count: int
    unpaid_total: int
    needs_billing: List[dict]
