import { storage } from "@/src/utils/storage";
import type {
  AttendanceIn, AttendanceOut, ClassOut, ClassUpdate, DashboardOut, InvoiceIn, InvoiceOut,
  IzinIn, PackageOut, StudentIn, StudentOut, TokenOut, TransactionOut, UserOut,
} from "@/src/types";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
export const TOKEN_KEY = "presensi_access_token";

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export async function loadToken(): Promise<string | null> {
  token = (await storage.secureGet(TOKEN_KEY, null)) as string | null;
  return token;
}

export async function setToken(t: string | null) {
  token = t;
  if (t) await storage.secureSet(TOKEN_KEY, t);
  else await storage.secureRemove(TOKEN_KEY);
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401 && token) {
    await setToken(null);
    onUnauthorized?.();
  }
  if (!res.ok) {
    let msg = `Gagal (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
    } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });
const put = <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) });

export const api = {
  login: (email: string, password: string) => post<TokenOut>("/auth/login", { email, password }),
  me: () => request<UserOut>("/auth/me"),

  dashboard: () => request<DashboardOut>("/dashboard"),
  packages: () => request<PackageOut[]>("/packages"),

  classes: () => request<ClassOut[]>("/classes"),
  classDetail: (id: string) => request<ClassOut>(`/classes/${id}`),
  updateClass: (id: string, body: ClassUpdate) => put<ClassOut>(`/classes/${id}`, body),
  attendance: (classId: string, date: string) =>
    request<AttendanceOut | null>(`/classes/${classId}/attendance?date=${date}`),
  saveAttendance: (classId: string, body: AttendanceIn) => post<AttendanceOut>(`/classes/${classId}/attendance`, body),

  students: (params: { class_id?: string; q?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => !!v) as [string, string][]).toString();
    return request<StudentOut[]>(`/students${qs ? `?${qs}` : ""}`);
  },
  student: (id: string) => request<StudentOut>(`/students/${id}`),
  createStudent: (body: StudentIn) => post<StudentOut>("/students", body),
  updateStudent: (id: string, body: StudentIn) => put<StudentOut>(`/students/${id}`, body),
  deleteStudent: (id: string) => request<{ ok: boolean }>(`/students/${id}`, { method: "DELETE" }),
  transactions: (id: string) => request<TransactionOut[]>(`/students/${id}/transactions`),
  recordIzin: (id: string, body: IzinIn) => post<StudentOut>(`/students/${id}/izin`, body),

  invoices: (status?: "unpaid" | "paid") => request<InvoiceOut[]>(`/invoices${status ? `?status=${status}` : ""}`),
  invoice: (id: string) => request<InvoiceOut>(`/invoices/${id}`),
  createInvoice: (body: InvoiceIn) => post<InvoiceOut>("/invoices", body),
  payInvoice: (id: string, method: string) => post<InvoiceOut>(`/invoices/${id}/pay`, { method }),
  deleteInvoice: (id: string) => request<{ ok: boolean }>(`/invoices/${id}`, { method: "DELETE" }),
};
