// Mirrors backend/models.py (keep in sync by hand)
export type Role = "guru" | "keuangan";
export type Program = "gymnastic" | "english";
export type AttendanceStatus = "hadir" | "izin" | "alpha" | "pengganti";

export interface UserOut {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface TokenOut {
  access_token: string;
  token_type: string;
  user: UserOut;
}

export interface ClassOut {
  id: string;
  name: string;
  program: Program;
  schedule: string;
  student_count: number;
}

export interface ClassUpdate {
  name: string;
  schedule: string;
}

export interface Wallet {
  credits: number;
  izin_quota: number;
  makeup: number;
  package: number;
}

export interface StudentIn {
  name: string;
  parent_name: string;
  parent_phone: string;
  class_ids: string[];
}

export interface StudentOut extends StudentIn {
  id: string;
  wallets: Partial<Record<Program, Wallet>>;
  created_at: string;
}

export interface IzinIn {
  program: Program;
  date: string;
  note: string;
}

export interface TransactionOut {
  id: string;
  student_id: string;
  program: string;
  kind: string;
  credit_delta: number;
  makeup_delta: number;
  note: string;
  by: string;
  created_at: string;
}

export interface AttendanceRecord {
  student_id: string;
  status: AttendanceStatus;
}

export interface AttendanceIn {
  date: string;
  records: AttendanceRecord[];
}

export interface AttendanceOut extends AttendanceIn {
  id: string;
  class_id: string;
  updated_by: string;
  updated_at: string;
}

export interface InvoiceIn {
  student_id: string;
  program: Program;
  package: 4 | 12;
}

export interface InvoiceOut {
  id: string;
  student_id: string;
  student_name: string;
  parent_name: string;
  parent_phone: string;
  program: Program;
  package: number;
  amount: number;
  status: "unpaid" | "paid";
  method: string | null;
  created_at: string;
  paid_at: string | null;
  receipt_path: string | null;
  reminded_at: string | null;
  reminder_count: number;
}

export interface StudentAttendanceItem {
  date: string;
  class_id: string;
  class_name: string;
  program: Program;
  status: AttendanceStatus;
}

export interface UserCreate {
  email: string;
  name: string;
  password: string;
  role: Role;
}

export interface ClassReport {
  class_id: string;
  name: string;
  program: Program;
  sessions: number;
  counts: Record<AttendanceStatus, number>;
}

export interface MonthlyReport {
  month: string;
  income_total: number;
  income_count: number;
  income_by_program: Record<Program, number>;
  unpaid_total: number;
  classes: ClassReport[];
}

export interface PackageOut {
  program: Program;
  package: number;
  amount: number;
  izin_quota: number;
}

export interface NeedsBilling {
  student_id: string;
  name: string;
  program: Program;
  credits: number;
}

export interface DashboardOut {
  total_students: number;
  total_classes: number;
  low_credit: number;
  zero_credit: number;
  unpaid_count: number;
  unpaid_total: number;
  needs_billing: NeedsBilling[];
}
