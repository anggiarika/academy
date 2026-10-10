import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import QRCode from "qrcode";
import { Platform } from "react-native";

import { QR_PREFIX } from "@/src/components/qr-scanner";
import { programLabel } from "@/src/format";
import type { ClassOut, StudentOut } from "@/src/types";

/** Web: browser print dialog. Native: render PDF file and open share sheet. */
export async function exportPdf(html: string, title: string) {
  if (Platform.OS === "web") {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: title, UTI: "com.adobe.pdf" });
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

export async function qrSheetHtml(cls: ClassOut, students: StudentOut[]): Promise<string> {
  const cards = await Promise.all(
    students.map(async (s) => {
      const svg = await QRCode.toString(`${QR_PREFIX}${s.id}`, { type: "svg", margin: 1, width: 150 });
      return `<div class="card"><div class="qr">${svg}</div><div class="name">${esc(s.name)}</div><div class="cls">${esc(cls.name)} · ${programLabel(cls.program)}</div></div>`;
    }),
  );
  return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"/><style>
  @page{margin:12mm} body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111827;margin:0}
  h1{font-size:18px;margin:0 0 4px} .muted{color:#6B7280;font-size:12px;margin-bottom:12px}
  .grid{display:flex;flex-wrap:wrap;gap:10px}
  .card{width:31%;box-sizing:border-box;border:1.5px dashed #16A34A;border-radius:12px;padding:10px;text-align:center;page-break-inside:avoid}
  .qr svg{width:130px;height:130px} .name{font-weight:600;font-size:14px;margin-top:6px} .cls{font-size:11px;color:#6B7280}
  </style></head><body>
  <h1>Kartu QR Presensi – ${esc(cls.name)}</h1><div class="muted">${esc(cls.schedule)} · ${students.length} siswa · Gunting sesuai garis</div>
  <div class="grid">${cards.join("")}</div></body></html>`;
}
