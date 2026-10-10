import { Linking } from "react-native";

import type { InvoiceOut, Program } from "@/src/types";

export const PROGRAMS: Program[] = ["gymnastic", "english"];

export const programLabel = (p: string) => (p === "english" ? "English" : "Gymnastic");

export const rupiah = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID").replace(/,/g, ".");

export function todayISO(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${`${dt.getMonth() + 1}`.padStart(2, "0")}-${`${dt.getDate()}`.padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export function prettyDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DAYS[dt.getDay()]}, ${d} ${MONTHS[m - 1]} ${y}`;
}

export function shortDateTime(iso: string): string {
  const dt = new Date(iso);
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

export function normalizePhone(phone: string): string {
  let p = phone.replace(/\D/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  return p;
}

export function invoiceMessage(inv: InvoiceOut): string {
  return [
    `Yth. ${inv.parent_name || "Orang Tua/Wali"} dari ${inv.student_name},`,
    "",
    `Kredit kelas ${programLabel(inv.program)} ananda telah habis. Berikut tagihan perpanjangan:`,
    `• Paket: ${inv.package} pertemuan`,
    `• Total: ${rupiah(inv.amount)}`,
    "",
    "Mohon konfirmasi setelah melakukan pembayaran. Terima kasih 🙏",
  ].join("\n");
}

export async function sendWhatsApp(phone: string, message: string) {
  const url = `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
  await Linking.openURL(url);
}
