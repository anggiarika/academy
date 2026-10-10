import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { notify, ScreenHeader } from "@/src/components/header";
import { Button, Card, CenterState, radius, space, Txt } from "@/src/components/ui";
import { monthLabel, programLabel, reportHtml, reportMessage, rupiah, shiftMonth, todayISO } from "@/src/format";
import { exportPdf as savePdf } from "@/src/pdf";
import { makeStyles, useTheme } from "@/src/theme";

export default function Report() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const q = useQuery({ queryKey: ["report", month], queryFn: () => api.monthlyReport(month) });

  const share = () => q.data && Share.share({ message: reportMessage(q.data) }).catch(() => {});
  const [exporting, setExporting] = useState(false);
  const exportPdf = async () => {
    if (!q.data) return;
    setExporting(true);
    try {
      const html = reportHtml(q.data);
      await savePdf(html, `Laporan ${monthLabel(month)}`);
    } catch (e) {
      notify("Gagal ekspor", e instanceof Error ? e.message : "Coba lagi");
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Laporan Bulanan" subtitle="Pemasukan & kehadiran" />
      <View style={styles.monthBar}>
        <Pressable testID="report-prev-month" style={styles.iconBtn} onPress={() => setMonth(shiftMonth(month, -1))}>
          <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
        </Pressable>
        <Txt variant="heading" style={{ flex: 1, textAlign: "center" }} testID="report-month-text">{monthLabel(month)}</Txt>
        <Pressable testID="report-next-month" style={styles.iconBtn} onPress={() => setMonth(shiftMonth(month, 1))}>
          <Ionicons name="chevron-forward" size={20} color={colors.onSurface} />
        </Pressable>
      </View>

      {q.isLoading ? (
        <CenterState kind="loading" />
      ) : q.isError || !q.data ? (
        <CenterState kind="error" message={q.error?.message} onRetry={q.refetch} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xxl }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} />}
        >
          <Card style={{ backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse }} testID="report-income-card">
            <Txt variant="caption" style={{ color: colors.onSurfaceInverse, opacity: 0.7 }}>Total pemasukan</Txt>
            <Txt variant="number" style={{ color: colors.onSurfaceInverse }} testID="report-income-total">{rupiah(q.data.income_total)}</Txt>
            <Txt variant="caption" style={{ color: colors.onSurfaceInverse, opacity: 0.7 }}>{q.data.income_count} pembayaran lunas</Txt>
          </Card>
          <View style={{ flexDirection: "row", gap: space.md }}>
            {(["gymnastic", "english"] as const).map((p) => (
              <Card key={p} style={{ flex: 1 }} testID={`report-income-${p}`}>
                <Txt variant="caption">{programLabel(p)}</Txt>
                <Txt variant="heading">{rupiah(q.data.income_by_program[p] ?? 0)}</Txt>
              </Card>
            ))}
          </View>
          <Card testID="report-unpaid-card">
            <Txt variant="caption">Piutang belum dibayar (saat ini)</Txt>
            <Txt variant="heading" style={{ color: colors.error }}>{rupiah(q.data.unpaid_total)}</Txt>
          </Card>

          <Txt variant="heading" style={{ marginTop: space.sm }}>Kehadiran per Kelas</Txt>
          {q.data.classes.map((c) => (
            <View key={c.class_id} style={styles.classRow} testID={`report-class-${c.class_id}`}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Txt variant="label" style={{ flex: 1 }}>{c.name}</Txt>
                <Txt variant="caption">{c.sessions} pertemuan</Txt>
              </View>
              <View style={styles.counts}>
                {([
                  ["Hadir", c.counts.hadir, colors.brandSecondary, colors.onBrandSecondary],
                  ["Izin", c.counts.izin, colors.warningSoft, colors.onWarning],
                  ["Alpha", c.counts.alpha, colors.errorSoft, colors.error],
                  ["Pengganti", c.counts.pengganti, colors.surfaceTertiary, colors.onSurfaceTertiary],
                ] as const).map(([label, n, bg, fg]) => (
                  <View key={label} style={[styles.count, { backgroundColor: bg }]}>
                    <Txt variant="heading" style={{ color: fg }}>{n}</Txt>
                    <Txt variant="caption" style={{ color: fg }}>{label}</Txt>
                  </View>
                ))}
              </View>
            </View>
          ))}

          <Button testID="export-pdf-button" title="Ekspor PDF" icon="document-text-outline" onPress={exportPdf} loading={exporting} style={{ marginTop: space.sm }} />
          <Button testID="share-report-button" title="Bagikan sebagai Teks" icon="share-outline" variant="secondary" onPress={share} />
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  monthBar: {
    flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md,
    backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  classRow: { backgroundColor: c.surface, borderRadius: radius.md, padding: space.md, gap: space.sm, borderWidth: 1, borderColor: c.border },
  counts: { flexDirection: "row", gap: space.xs },
  count: { flex: 1, borderRadius: radius.sm, paddingVertical: space.sm, alignItems: "center" },
}));
