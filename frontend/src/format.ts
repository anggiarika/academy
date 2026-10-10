import { Linking } from "react-native";

import type { InvoiceOut, MonthlyReport, Program, StudentAttendanceItem, StudentOut } from "@/src/types";

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

export const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export function reminderMessage(inv: InvoiceOut): string {
  return [
    `Yth. ${inv.parent_name || "Orang Tua/Wali"} dari ${inv.student_name},`,
    "",
    `Kami mengingatkan kembali tagihan kelas ${programLabel(inv.program)} (${inv.package} pertemuan) sebesar ${rupiah(inv.amount)} ` +
      `yang diterbitkan ${shortDateTime(inv.created_at)} dan belum kami terima.`,
    "Mohon dapat segera melakukan pembayaran agar ananda tetap bisa mengikuti kelas. Terima kasih 🙏",
  ].join("\n");
}

const STATUS_LABEL: Record<string, string> = { hadir: "Hadir", izin: "Izin", alpha: "Alpha", pengganti: "Kelas Pengganti" };
export const statusLabel = (s: string) => STATUS_LABEL[s] ?? s;

export function studentRecapMessage(s: StudentOut, month: string, items: StudentAttendanceItem[]): string {
  const credits = (Object.keys(s.wallets) as Program[])
    .map((p) => `• ${programLabel(p)}: sisa ${s.wallets[p]?.credits ?? 0} kredit, ${s.wallets[p]?.makeup ?? 0} kelas pengganti`);
  return [
    `Rekap kehadiran ${s.name} – ${monthLabel(month)}`,
    "",
    ...(items.length ? items.map((i) => `• ${prettyDate(i.date)} · ${i.class_name}: ${statusLabel(i.status)}`) : ["Belum ada pertemuan bulan ini."]),
    "",
    "Sisa kredit:",
    ...credits,
  ].join("\n");
}

export function reportHtml(r: MonthlyReport): string {
  const rows = r.classes
    .map((c) => `<tr><td>${c.name}</td><td>${programLabel(c.program)}</td><td>${c.sessions}</td><td>${c.counts.hadir}</td><td>${c.counts.izin}</td><td>${c.counts.alpha}</td><td>${c.counts.pengganti}</td></tr>`)
    .join("");
  return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"/><style>
  body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111827;padding:24px}
  h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;margin:24px 0 8px} .muted{color:#6B7280}
  .box{display:inline-block;border:1px solid #E5E7EB;border-radius:12px;padding:12px 16px;margin:0 8px 8px 0}
  .big{font-size:20px;font-weight:600} table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{border-bottom:1px solid #E5E7EB;padding:8px;text-align:left} th{background:#DCFCE7;color:#166534}
  </style></head><body>
  <h1>Laporan Bulanan</h1><div class="muted">${monthLabel(r.month)}</div>
  <h2>Pemasukan</h2>
  <div class="box"><div class="muted">Total (${r.income_count} pembayaran)</div><div class="big">${rupiah(r.income_total)}</div></div>
  <div class="box"><div class="muted">Gymnastic</div><div class="big">${rupiah(r.income_by_program.gymnastic ?? 0)}</div></div>
  <div class="box"><div class="muted">English</div><div class="big">${rupiah(r.income_by_program.english ?? 0)}</div></div>
  <div class="box"><div class="muted">Piutang belum dibayar</div><div class="big">${rupiah(r.unpaid_total)}</div></div>
  <h2>Kehadiran per Kelas</h2>
  <table><tr><th>Kelas</th><th>Program</th><th>Pertemuan</th><th>Hadir</th><th>Izin</th><th>Alpha</th><th>Pengganti</th></tr>${rows}</table>
  </body></html>`;
}

/** True if a free-text schedule like "Senin & Rabu 15:00" mentions today's weekday. */
export function isScheduledToday(schedule: string): boolean {
  const today = DAYS[new Date().getDay()].toLowerCase();
  return schedule.toLowerCase().includes(today);
}
