import { Platform } from "react-native";

import { storage } from "@/src/utils/storage";
import type {
  AttendanceIn, AttendanceOut, ClassOut, ClassUpdate, DashboardOut, InvoiceIn, InvoiceOut,
  IzinIn, MonthlyReport, PackageOut, SettingsOut, StudentAttendanceItem, StudentIn, StudentOut, TokenOut, TransactionOut, TrendPoint, UserCreate, UserOut,
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
  // After a page reload the token isn't in memory yet — load it from secure storage first.
  if (token === null) await loadToken();
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

// Authenticated image source: native sends header, web <img> needs token in query.
export function fileSource(path: string) {
  const uri = `${BASE}/files/${path}`;
  return Platform.OS === "web"
    ? { uri: `${uri}?token=${encodeURIComponent(token ?? "")}` }
    : { uri, headers: { Authorization: `Bearer ${token ?? ""}` } };
}

// Plain URL with token in the query, for <img> inside generated print/PDF HTML.
export function fileUri(path: string) {
  return `${BASE}/files/${path}?token=${encodeURIComponent(token ?? "")}`;
}

async function uploadImage(path: string, uri: string, name: string, type: string): Promise<Response> {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri, name, type } as unknown as Blob);
  }
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token ?? ""}` },
    body: form,
  });
  if (!res.ok) {
    let msg = `Gagal (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
    } catch {}
    throw new Error(msg);
  }
  return res;
}

async function uploadReceipt(invoiceId: string, uri: string, name: string, type: string): Promise<InvoiceOut> {
  const res = await uploadImage(`/invoices/${invoiceId}/receipt`, uri, name, type);
  return res.json();
}

export const api = {
  login: (email: string, password: string) => post<TokenOut>("/auth/login", { email, password }),
  me: () => request<UserOut>("/auth/me"),
  register: (name: string, email: string, password: string) =>
    post<TokenOut>("/auth/register", { name, email, password }),
  deleteMyAccount: (password: string) =>
    request<{ ok: boolean }>("/auth/me", { method: "DELETE", body: JSON.stringify({ password }) }),
  changePassword: (old_password: string, new_password: string) =>
    post<{ ok: boolean }>("/auth/change-password", { old_password, new_password }),
  studentAttendance: (id: string, month: string) =>
    request<StudentAttendanceItem[]>(`/students/${id}/attendance?month=${month}`),
  remindInvoice: (id: string) => post<InvoiceOut>(`/invoices/${id}/remind`, {}),

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

  invoices: (status?: "unpaid" | "paid", student_id?: string) => {
    const qs = new URLSearchParams(Object.entries({ status, student_id }).filter(([, v]) => !!v) as [string, string][]).toString();
    return request<InvoiceOut[]>(`/invoices${qs ? `?${qs}` : ""}`);
  },
  invoice: (id: string) => request<InvoiceOut>(`/invoices/${id}`),
  createInvoice: (body: InvoiceIn) => post<InvoiceOut>("/invoices", body),
  payInvoice: (id: string, method: string) => post<InvoiceOut>(`/invoices/${id}/pay`, { method }),
  deleteInvoice: (id: string) => request<{ ok: boolean }>(`/invoices/${id}`, { method: "DELETE" }),
  changePackage: (id: string, pkg: 4 | 12) => post<InvoiceOut>(`/invoices/${id}/package`, { package: pkg }),
  uploadReceipt,

  users: () => request<UserOut[]>("/users"),
  createUser: (body: UserCreate) => post<UserOut>("/users", body),
  deleteUser: (id: string) => request<{ ok: boolean }>(`/users/${id}`, { method: "DELETE" }),

  monthlyReport: (month: string) => request<MonthlyReport>(`/reports/monthly?month=${month}`),
  incomeTrend: () => request<TrendPoint[]>("/reports/trend?months=6"),

  settings: () => request<SettingsOut>("/settings"),
  updateSettings: (school_name: string) => put<SettingsOut>("/settings", { school_name }),
  uploadLogo: async (uri: string, name: string, type: string): Promise<SettingsOut> =>
    (await uploadImage("/settings/logo", uri, name, type)).json(),
};
