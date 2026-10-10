import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { notify, ScreenHeader } from "@/src/components/header";
import { QrScanner } from "@/src/components/qr-scanner";
import { useBranding } from "@/src/branding";
import { exportPdf, qrSheetHtml } from "@/src/pdf";
import { Badge, Button, CenterState, creditTone, fonts, radius, space, Txt, useInputStyle } from "@/src/components/ui";
import { prettyDate, programLabel, shiftDate, todayISO } from "@/src/format";
import type { AttendanceStatus } from "@/src/types";
import { makeStyles, ThemeColors, useTheme } from "@/src/theme";

const STATUSES: { value: AttendanceStatus; label: string; bg: keyof ThemeColors; fg: keyof ThemeColors }[] = [
  { value: "hadir", label: "Hadir", bg: "brandPrimary", fg: "onBrandPrimary" },
  { value: "izin", label: "Izin", bg: "warning", fg: "onWarning" },
  { value: "alpha", label: "Alpha", bg: "error", fg: "onError" },
  { value: "pengganti", label: "Pengganti", bg: "surfaceInverse", fg: "onSurfaceInverse" },
];

export default function ClassAttendance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles();
  const input = useInputStyle();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", schedule: "" });

  const cls = useQuery({ queryKey: ["class", id], queryFn: () => api.classDetail(id) });
  const students = useQuery({ queryKey: ["students", { class_id: id }], queryFn: () => api.students({ class_id: id }) });
  const att = useQuery({ queryKey: ["attendance", id, date], queryFn: () => api.attendance(id, date) });

  useEffect(() => {
    const m: Record<string, AttendanceStatus> = {};
    att.data?.records.forEach((r) => (m[r.student_id] = r.status));
    setMarks(m);
  }, [att.data]);

  const save = useMutation({
    mutationFn: () =>
      api.saveAttendance(id, { date, records: Object.entries(marks).map(([student_id, status]) => ({ student_id, status })) }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      qc.invalidateQueries();
      notify("Tersimpan", "Presensi berhasil disimpan dan kredit siswa diperbarui.");
    },
    onError: (e: Error) => notify("Gagal menyimpan", e.message),
  });

  const updateClass = useMutation({
    mutationFn: () => api.updateClass(id, form),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries();
    },
    onError: (e: Error) => notify("Gagal", e.message),
  });

  const program = cls.data?.program;
  const toggle = (sid: string, st: AttendanceStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setMarks((m) => {
      const next = { ...m };
      if (next[sid] === st) delete next[sid];
      else next[sid] = st;
      return next;
    });
  };
  const [scanning, setScanning] = useState(false);
  const [printing, setPrinting] = useState(false);
  const brand = useBranding();
  const printCards = async () => {
    if (!cls.data || !students.data?.length) {
      notify("Belum ada siswa", "Tambahkan siswa ke kelas ini terlebih dahulu.");
      return;
    }
    setPrinting(true);
    try {
      await exportPdf(await qrSheetHtml(cls.data, students.data, brand), `Kartu QR ${cls.data.name}`);
    } catch (e) {
      notify("Gagal mencetak", e instanceof Error ? e.message : "Coba lagi");
    } finally {
      setPrinting(false);
    }
  };
  const onScan = (sid: string) => {
    const s = students.data?.find((x) => x.id === sid);
    if (!s) return "Siswa tidak terdaftar di kelas ini";
    setMarks((m) => ({ ...m, [sid]: "hadir" }));
    return `✓ ${s.name} ditandai hadir`;
  };
  const markAllPresent = () => {
    const m: Record<string, AttendanceStatus> = { ...marks };
    students.data?.forEach((s) => { if (!m[s.id]) m[s.id] = "hadir"; });
    setMarks(m);
  };

  const count = Object.keys(marks).length;

  return (
    <View style={styles.root}>
      <QrScanner visible={scanning} onClose={() => setScanning(false)} onScan={onScan} />
      <ScreenHeader
        title={cls.data?.name ?? "Kelas"}
        subtitle={cls.data ? `${programLabel(cls.data.program)} · ${cls.data.schedule}` : undefined}
        right={
          cls.data ? (
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Pressable testID="print-qr-cards-button" style={styles.iconBtn} onPress={printCards} disabled={printing}>
                {printing ? <ActivityIndicator color={colors.brandPrimary} /> : <Ionicons name="print-outline" size={20} color={colors.onSurfaceTertiary} />}
              </Pressable>
              {user?.role === "keuangan" && (
                <Pressable
                  testID="edit-class-button"
                  style={styles.iconBtn}
                  onPress={() => { setForm({ name: cls.data.name, schedule: cls.data.schedule }); setEditing((e) => !e); }}
                >
                  <Ionicons name={editing ? "close" : "create-outline"} size={20} color={colors.onSurfaceTertiary} />
                </Pressable>
              )}
            </View>
          ) : null
        }
      />

      {editing && (
        <View style={styles.editBox}>
          <TextInput testID="class-name-input" style={input.input} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Nama kelas" placeholderTextColor={colors.muted} />
          <TextInput testID="class-schedule-input" style={input.input} value={form.schedule} onChangeText={(v) => setForm({ ...form, schedule: v })} placeholder="Jadwal" placeholderTextColor={colors.muted} />
          <Button testID="save-class-button" title="Simpan Kelas" onPress={() => updateClass.mutate()} loading={updateClass.isPending} />
        </View>
      )}

      <View style={styles.dateBar}>
        <Pressable testID="date-prev-button" style={styles.iconBtn} onPress={() => setDate(shiftDate(date, -1))}>
          <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Txt variant="label" testID="attendance-date-text">{prettyDate(date)}</Txt>
          <Txt variant="caption">{att.data ? `Tersimpan oleh ${att.data.updated_by}` : "Belum diisi"}</Txt>
        </View>
        <Pressable testID="date-next-button" style={styles.iconBtn} onPress={() => setDate(shiftDate(date, 1))}>
          <Ionicons name="chevron-forward" size={20} color={colors.onSurface} />
        </Pressable>
      </View>

      {students.isLoading || cls.isLoading ? (
        <CenterState kind="loading" />
      ) : students.isError ? (
        <CenterState kind="error" message={students.error.message} onRetry={students.refetch} />
      ) : (
        <FlatList
          data={students.data}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: 140 }}
          ListHeaderComponent={
            (students.data?.length ?? 0) > 0 ? (
              <View style={styles.listHead}>
                <Txt variant="caption" style={{ flex: 1 }}>Hadir/Alpha: −1 kredit · Pengganti: −1 kuota pengganti · Izin dicatat oleh Keuangan</Txt>
                <Pressable testID="mark-all-present-button" onPress={markAllPresent} hitSlop={8}>
                  <Txt variant="label" style={{ color: colors.brandPrimary }}>Semua hadir</Txt>
                </Pressable>
              </View>
            ) : null
          }
          ListEmptyComponent={<CenterState kind="empty" message="Belum ada siswa di kelas ini" />}
          renderItem={({ item }) => {
            const w = program ? item.wallets[program] : undefined;
            const credits = w?.credits ?? 0;
            return (
              <View style={styles.row} testID={`attendance-row-${item.id}`}>
                <View style={styles.rowTop}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="label">{item.name}</Txt>
                    <Txt variant="caption">Pengganti: {w?.makeup ?? 0} · Kuota izin: {w?.izin_quota ?? 0}</Txt>
                  </View>
                  <Badge testID={`attendance-credit-${item.id}`} label={`Kredit ${credits}`} tone={creditTone(credits)} />
                </View>
                <View style={styles.seg}>
                  {STATUSES.map((s) => {
                    const active = marks[item.id] === s.value;
                    return (
                      <Pressable
                        key={s.value}
                        testID={`attendance-${item.id}-${s.value}`}
                        onPress={() => toggle(item.id, s.value)}
                        style={[styles.segItem, active && { backgroundColor: colors[s.bg] }]}
                      >
                        <Text style={[styles.segText, { color: active ? colors[s.fg] : colors.onSurfaceTertiary }]}>{s.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          }}
        />
      )}

      <View style={[styles.sticky, { paddingBottom: insets.bottom + space.md, flexDirection: "row", gap: space.sm }]}>
        <Button
          testID="scan-qr-button"
          title="Scan QR"
          icon="qr-code-outline"
          variant="secondary"
          onPress={() => setScanning(true)}
        />
        <Button
          style={{ flex: 1 }}
          testID="save-attendance-button"
          title={`Simpan Presensi (${count})`}
          icon="checkmark-circle-outline"
          onPress={() => save.mutate()}
          loading={save.isPending}
          disabled={!count && !att.data}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  editBox: { padding: space.lg, gap: space.sm, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  dateBar: {
    flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md,
    backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  listHead: { flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: space.xs },
  row: { backgroundColor: c.surface, borderRadius: radius.md, padding: space.md, gap: space.md, borderWidth: 1, borderColor: c.border },
  rowTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  seg: { flexDirection: "row", backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: 3, gap: 3 },
  segItem: { flex: 1, minHeight: 40, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  segText: { fontFamily: fonts.medium, fontSize: 12 },
  sticky: {
    position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingTop: space.md,
    backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border,
  },
}));
