import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { confirmAction, notify, ScreenHeader } from "@/src/components/header";
import { QR_PREFIX } from "@/src/components/qr-scanner";
import QRCode from "react-native-qrcode-svg";
import { Badge, Button, Card, CenterState, creditTone, radius, space, Txt, useInputStyle } from "@/src/components/ui";
import { monthLabel, programLabel, rupiah, sendWhatsApp, shiftMonth, shortDateTime, statusLabel, studentRecapMessage, todayISO } from "@/src/format";
import type { Program } from "@/src/types";
import { makeStyles, useTheme } from "@/src/theme";

export default function StudentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const isFinance = user?.role === "keuangan";
  const { colors } = useTheme();
  const styles = useStyles();
  const input = useInputStyle();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [izinFor, setIzinFor] = useState<Program | null>(null);
  const [izinDate, setIzinDate] = useState(todayISO());
  const [izinNote, setIzinNote] = useState("");

  const s = useQuery({ queryKey: ["student", id], queryFn: () => api.student(id) });
  const classes = useQuery({ queryKey: ["classes"], queryFn: api.classes });
  const tx = useQuery({ queryKey: ["transactions", id], queryFn: () => api.transactions(id) });
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const recap = useQuery({ queryKey: ["student-attendance", id, month], queryFn: () => api.studentAttendance(id, month) });
  const payments = useQuery({ queryKey: ["student-invoices", id], queryFn: () => api.invoices(undefined, id) });

  const izin = useMutation({
    mutationFn: (program: Program) => api.recordIzin(id, { program, date: izinDate, note: izinNote }),
    onSuccess: () => {
      setIzinFor(null);
      setIzinNote("");
      qc.invalidateQueries();
      notify("Izin dicatat", "Kuota izin terpakai dan 1 kelas pengganti ditambahkan.");
    },
    onError: (e: Error) => notify("Gagal", e.message),
  });

  const del = useMutation({
    mutationFn: () => api.deleteStudent(id),
    onSuccess: () => {
      qc.invalidateQueries();
      router.back();
    },
    onError: (e: Error) => notify("Gagal", e.message),
  });

  if (s.isLoading) return <View style={styles.root}><ScreenHeader title="Siswa" /><CenterState kind="loading" /></View>;
  if (s.isError || !s.data)
    return <View style={styles.root}><ScreenHeader title="Siswa" /><CenterState kind="error" message={s.error?.message} onRetry={s.refetch} /></View>;

  const st = s.data;
  const classNames = st.class_ids.map((cid) => classes.data?.find((c) => c.id === cid)?.name).filter(Boolean).join(", ");

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={st.name}
        subtitle={classNames || "Belum ada kelas"}
        right={
          isFinance ? (
            <Pressable testID="edit-student-button" style={styles.iconBtn} onPress={() => router.push({ pathname: "/student/form", params: { id } })}>
              <Ionicons name="create-outline" size={20} color={colors.onSurfaceTertiary} />
            </Pressable>
          ) : null
        }
      />
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xxl }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <Card>
          <Txt variant="caption">Orang tua / wali</Txt>
          <Txt variant="label" testID="student-parent-name">{st.parent_name || "-"}</Txt>
          <Txt variant="caption" style={{ marginTop: space.sm }}>No. WhatsApp</Txt>
          <Txt variant="label" testID="student-parent-phone">{st.parent_phone || "-"}</Txt>
          {!!st.parent_phone && (
            <Button
              testID="student-whatsapp-button"
              title="Chat Orang Tua"
              icon="logo-whatsapp"
              variant="whatsapp"
              style={{ marginTop: space.md }}
              onPress={() => sendWhatsApp(st.parent_phone, `Halo ${st.parent_name}, `)}
            />
          )}
        </Card>

        <Card testID="student-qr-card" style={{ alignItems: "center", gap: space.sm }}>
          <Txt variant="label">Kartu QR Presensi</Txt>
          <View style={styles.qrWrap}>
            <QRCode value={`${QR_PREFIX}${st.id}`} size={160} color={colors.onSurface} backgroundColor={colors.surface} />
          </View>
          <Txt variant="caption" style={{ textAlign: "center" }}>
            Cetak atau simpan kartu ini. Guru cukup memindainya dari halaman presensi kelas.
          </Txt>
        </Card>

        {(Object.keys(st.wallets) as Program[]).map((p) => {
          const w = st.wallets[p]!;
          return (
            <Card key={p} testID={`wallet-${p}`}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: space.md }}>
                <Txt variant="heading" style={{ flex: 1 }}>{programLabel(p)}</Txt>
                <Badge label={w.package ? `Paket ${w.package}x` : "Belum ada paket"} tone="neutral" />
              </View>
              <View style={styles.statsRow}>
                <View style={[styles.stat, { backgroundColor: w.credits <= 0 ? colors.errorSoft : colors.brandSecondary }]}>
                  <Txt variant="number" testID={`wallet-${p}-credits`} style={{ color: w.credits <= 0 ? colors.error : colors.onBrandSecondary }}>{w.credits}</Txt>
                  <Txt variant="caption">Sisa Kredit</Txt>
                </View>
                <View style={styles.stat}>
                  <Txt variant="number" testID={`wallet-${p}-izin`}>{w.izin_quota}</Txt>
                  <Txt variant="caption">Kuota Izin</Txt>
                </View>
                <View style={styles.stat}>
                  <Txt variant="number" testID={`wallet-${p}-makeup`}>{w.makeup}</Txt>
                  <Txt variant="caption">Kelas Pengganti</Txt>
                </View>
              </View>
              {w.makeup > 0 && (
                <Txt variant="caption" style={{ marginTop: space.sm, color: colors.onWarning }}>
                  Kelas pengganti hangus jika tidak diambil sebelum paket berikutnya dibayar.
                </Txt>
              )}
              {isFinance && (
                <View style={{ gap: space.sm, marginTop: space.md }}>
                  {izinFor === p ? (
                    <View style={{ gap: space.sm }}>
                      <TextInput testID={`izin-date-input-${p}`} style={input.input} value={izinDate} onChangeText={setIzinDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} />
                      <TextInput testID={`izin-note-input-${p}`} style={input.input} value={izinNote} onChangeText={setIzinNote} placeholder="Alasan (opsional)" placeholderTextColor={colors.muted} />
                      <View style={{ flexDirection: "row", gap: space.sm }}>
                        <Button testID={`izin-cancel-button-${p}`} title="Batal" variant="ghost" style={{ flex: 1 }} onPress={() => setIzinFor(null)} />
                        <Button testID={`izin-submit-button-${p}`} title="Simpan Izin" style={{ flex: 1 }} loading={izin.isPending} onPress={() => izin.mutate(p)} />
                      </View>
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", gap: space.sm }}>
                      <Button
                        testID={`izin-open-button-${p}`}
                        title="Catat Izin"
                        icon="calendar-outline"
                        variant="secondary"
                        style={{ flex: 1 }}
                        disabled={w.izin_quota <= 0 || w.credits <= 0}
                        onPress={() => setIzinFor(p)}
                      />
                      <Button
                        testID={`create-invoice-button-${p}`}
                        title="Buat Tagihan"
                        icon="receipt-outline"
                        variant={w.credits <= 0 ? "primary" : "ghost"}
                        style={{ flex: 1 }}
                        onPress={() => router.push({ pathname: "/invoice/new", params: { studentId: id, program: p } })}
                      />
                    </View>
                  )}
                </View>
              )}
            </Card>
          );
        })}

        <Card testID="student-recap-card" style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Pressable testID="recap-prev-month" style={styles.iconBtn} onPress={() => setMonth(shiftMonth(month, -1))}>
              <Ionicons name="chevron-back" size={18} color={colors.onSurface} />
            </Pressable>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Txt variant="caption">Rekap Kehadiran</Txt>
              <Txt variant="label" testID="recap-month-text">{monthLabel(month)}</Txt>
            </View>
            <Pressable testID="recap-next-month" style={styles.iconBtn} onPress={() => setMonth(shiftMonth(month, 1))}>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurface} />
            </Pressable>
          </View>
          {recap.data && (
            <View style={{ flexDirection: "row", gap: space.xs }}>
              {(["hadir", "izin", "alpha", "pengganti"] as const).map((k) => (
                <View key={k} style={styles.recapCount} testID={`recap-count-${k}`}>
                  <Txt variant="heading">{recap.data.filter((i) => i.status === k).length}</Txt>
                  <Txt variant="caption">{k === "pengganti" ? "Pengganti" : statusLabel(k)}</Txt>
                </View>
              ))}
            </View>
          )}
          {recap.data?.length === 0 && <Txt variant="caption">Belum ada pertemuan di bulan ini.</Txt>}
          {recap.data?.map((i) => (
            <View key={`${i.date}-${i.class_id}`} style={styles.recapRow}>
              <Txt variant="body" style={{ flex: 1 }}>{shortDateTime(i.date)} · {i.class_name}</Txt>
              <Badge label={statusLabel(i.status)} tone={i.status === "hadir" ? "brand" : i.status === "alpha" ? "error" : i.status === "izin" ? "warning" : "neutral"} />
            </View>
          ))}
          {!!st.parent_phone && recap.data && (
            <Button
              testID="send-recap-whatsapp-button"
              title="Kirim Rekap ke Orang Tua"
              icon="logo-whatsapp"
              variant="whatsapp"
              onPress={() => sendWhatsApp(st.parent_phone, studentRecapMessage(st, month, recap.data))}
            />
          )}
        </Card>

        <Txt variant="heading" style={{ marginTop: space.md }}>Riwayat Pembayaran</Txt>
        {payments.isLoading ? (
          <Txt variant="caption">Memuat…</Txt>
        ) : !payments.data?.length ? (
          <Txt variant="caption" testID="payments-empty">Belum ada tagihan untuk siswa ini.</Txt>
        ) : (
          <>
            <Card testID="payments-summary" style={{ flexDirection: "row", gap: space.md }}>
              <View style={{ flex: 1 }}>
                <Txt variant="caption">Total sudah dibayar</Txt>
                <Txt variant="heading" testID="payments-total-paid">
                  {rupiah(payments.data.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.amount, 0))}
                </Txt>
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="caption">Belum dibayar</Txt>
                <Txt variant="heading" testID="payments-total-unpaid" style={{ color: colors.error }}>
                  {rupiah(payments.data.filter((i) => i.status === "unpaid").reduce((sum, i) => sum + i.amount, 0))}
                </Txt>
              </View>
            </Card>
            {payments.data.map((inv) => (
              <Pressable
                key={inv.id}
                testID={`payment-row-${inv.id}`}
                onPress={() => router.push(`/invoice/${inv.id}`)}
                style={({ pressed }) => [styles.txRow, pressed && { opacity: 0.85 }]}
              >
                <View style={{ flex: 1 }}>
                  <Txt variant="label">{rupiah(inv.amount)} · {inv.package}x {programLabel(inv.program)}</Txt>
                  <Txt variant="caption">
                    {shortDateTime(inv.created_at)}
                    {inv.status === "paid" ? ` · Lunas ${inv.paid_at ? shortDateTime(inv.paid_at) : ""}${inv.method ? ` (${inv.method})` : ""}` : " · Belum dibayar"}
                  </Txt>
                </View>
                <Badge label={inv.status === "paid" ? "Lunas" : "Belum"} tone={inv.status === "paid" ? "brand" : "error"} />
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            ))}
          </>
        )}

        <Txt variant="heading" style={{ marginTop: space.md }}>Riwayat</Txt>
        {tx.data?.length === 0 && <Txt variant="caption">Belum ada riwayat</Txt>}
        {tx.data?.map((t) => (
          <View key={t.id} style={styles.txRow} testID={`tx-row-${t.id}`}>
            <View style={{ flex: 1 }}>
              <Txt variant="label">{t.note}</Txt>
              <Txt variant="caption">{programLabel(t.program)} · {shortDateTime(t.created_at)} · {t.by}</Txt>
            </View>
            {t.credit_delta !== 0 && (
              <Badge label={`${t.credit_delta > 0 ? "+" : ""}${t.credit_delta} kredit`} tone={t.credit_delta > 0 ? "brand" : creditTone(1)} />
            )}
            {t.credit_delta === 0 && t.makeup_delta !== 0 && (
              <Badge label={`${t.makeup_delta > 0 ? "+" : ""}${t.makeup_delta} pengganti`} tone="neutral" />
            )}
          </View>
        ))}

        {isFinance && (
          <Button
            testID="delete-student-button"
            title="Hapus Siswa"
            icon="trash-outline"
            variant="danger"
            style={{ marginTop: space.lg }}
            loading={del.isPending}
            onPress={() => confirmAction("Hapus siswa?", `${st.name} akan dihapus dari database.`, () => del.mutate())}
          />
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", gap: space.sm },
  qrWrap: { padding: space.md, backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border },
  recapCount: { flex: 1, alignItems: "center", backgroundColor: c.surfaceTertiary, borderRadius: radius.sm, paddingVertical: space.sm },
  recapRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 4 },
  stat: { flex: 1, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: space.md },
  txRow: {
    flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, backgroundColor: c.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: c.border,
  },
}));
