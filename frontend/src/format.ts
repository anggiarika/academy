import { Linking } from "react-native";

import type { InvoiceOut, MonthlyReport, Program } from "@/src/types";

export const PROGRAMS: Program[] = ["gymnastic", "english"];

// Mirrors backend core.PACKAGES
export const PRICES: Record<Program, Record<4 | 12, number>> = {
  gymnastic: { 4: 350_000, 12: 900_000 },
  english: { 4: 495_000, 12: 1_335_000 },
};

export const upgradeSavings = (p: Program) => PRICES[p][4] * 3 - PRICES[p][12];

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
  const lines = [
    `Yth. ${inv.parent_name || "Orang Tua/Wali"} dari ${inv.student_name},`,
    "",
    `Kredit kelas ${programLabel(inv.program)} ananda telah habis. Berikut tagihan perpanjangan:`,
    `• Paket: ${inv.package} pertemuan`,
    `• Total: ${rupiah(inv.amount)}`,
  ];
  if (inv.package === 4) {
    lines.push(
      "",
      `💡 Penawaran hemat: ambil paket 12 pertemuan cukup ${rupiah(PRICES[inv.program][12])} ` +
        `(hemat ${rupiah(upgradeSavings(inv.program))} dibanding 3x paket 4 pertemuan) + 3 kuota izin dengan kelas pengganti. ` +
        "Balas pesan ini jika ingin beralih paket.",
    );
  }
  lines.push("", "Mohon konfirmasi setelah melakukan pembayaran. Terima kasih 🙏");
  return lines.join("\n");
}

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"][m - 1]} ${y}`;
};

export const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
};

export function reportMessage(r: MonthlyReport): string {
  const lines = [
    `Laporan Bulanan – ${monthLabel(r.month)}`,
    "",
    `Pemasukan: ${rupiah(r.income_total)} (${r.income_count} pembayaran)`,
    `• Gymnastic: ${rupiah(r.income_by_program.gymnastic ?? 0)}`,
    `• English: ${rupiah(r.income_by_program.english ?? 0)}`,
    `Piutang belum dibayar: ${rupiah(r.unpaid_total)}`,
    "",
    "Kehadiran per kelas:",
    ...r.classes.map(
      (c) => `• ${c.name}: ${c.sessions} pertemuan · H ${c.counts.hadir} / I ${c.counts.izin} / A ${c.counts.alpha} / P ${c.counts.pengganti}`,
    ),
  ];
  return lines.join("\n");
}

export async function sendWhatsApp(phone: string, message: string) {
  const url = `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
  await Linking.openURL(url);
}
