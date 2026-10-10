import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { confirmAction, notify, ScreenHeader } from "@/src/components/header";
import { Badge, Button, Card, CenterState, Segmented, space, Txt } from "@/src/components/ui";
import { invoiceMessage, programLabel, rupiah, sendWhatsApp, shortDateTime } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [method, setMethod] = useState<"transfer" | "tunai">("transfer");
  const q = useQuery({ queryKey: ["invoice", id], queryFn: () => api.invoice(id) });

  const pay = useMutation({
    mutationFn: () => api.payInvoice(id, method),
    onSuccess: (inv) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      qc.invalidateQueries();
      notify("Lunas", `${inv.package} kredit ${programLabel(inv.program)} ditambahkan ke ${inv.student_name}.`);
    },
    onError: (e: Error) => notify("Gagal", e.message),
  });

  const del = useMutation({
    mutationFn: () => api.deleteInvoice(id),
    onSuccess: () => { qc.invalidateQueries(); router.back(); },
    onError: (e: Error) => notify("Gagal", e.message),
  });

  if (q.isLoading) return <View style={styles.root}><ScreenHeader title="Tagihan" /><CenterState kind="loading" /></View>;
  if (q.isError || !q.data)
    return <View style={styles.root}><ScreenHeader title="Tagihan" /><CenterState kind="error" message={q.error?.message} onRetry={q.refetch} /></View>;

  const inv = q.data;
  const paid = inv.status === "paid";
  const rows: [string, string][] = [
    ["Siswa", inv.student_name],
    ["Orang tua", inv.parent_name || "-"],
    ["No. WhatsApp", inv.parent_phone || "-"],
    ["Program", programLabel(inv.program)],
    ["Paket", `${inv.package} pertemuan`],
    ["Dibuat", shortDateTime(inv.created_at)],
    ...(paid ? ([["Dibayar", `${inv.paid_at ? shortDateTime(inv.paid_at) : "-"} · ${inv.method ?? ""}`]] as [string, string][]) : []),
  ];

  return (
    <View style={styles.root}>
      <ScreenHeader title="Detail Tagihan" subtitle={inv.student_name} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 220 }}>
        <Card style={{ backgroundColor: paid ? colors.brandSecondary : colors.surface }}>
          <Badge testID="invoice-status-badge" label={paid ? "Lunas" : "Belum Dibayar"} tone={paid ? "brand" : "error"} />
          <Txt variant="number" style={{ marginTop: space.md, fontSize: 32 }} testID="invoice-amount-text">{rupiah(inv.amount)}</Txt>
          <Txt variant="caption">Paket {inv.package} pertemuan {programLabel(inv.program)}</Txt>
        </Card>
        <Card style={{ paddingVertical: space.sm }}>
          {rows.map(([k, v], i) => (
            <View key={k} style={[styles.row, i > 0 && styles.rowBorder]}>
              <Txt variant="caption" style={{ flex: 1 }}>{k}</Txt>
              <Txt variant="label">{v}</Txt>
            </View>
          ))}
        </Card>
        {!paid && (
          <>
            <Txt variant="label">Metode pembayaran</Txt>
            <Segmented
              testIDPrefix="pay-method"
              value={method}
              onChange={setMethod}
              options={[{ value: "transfer", label: "Transfer" }, { value: "tunai", label: "Tunai" }]}
            />
            <Txt variant="caption">
              Saat ditandai lunas: kredit +{inv.package}, kuota izin diatur ulang, dan sisa kelas pengganti lama hangus.
            </Txt>
            <Button
              testID="delete-invoice-button"
              title="Batalkan Tagihan"
              variant="danger"
              icon="trash-outline"
              loading={del.isPending}
              onPress={() => confirmAction("Batalkan tagihan?", "Tagihan ini akan dihapus.", () => del.mutate())}
            />
          </>
        )}
      </ScrollView>

      <View style={[styles.sticky, { paddingBottom: insets.bottom + space.md }]}>
        <Button
          testID="send-whatsapp-invoice-button"
          title="Kirim Tagihan via WA"
          icon="logo-whatsapp"
          variant="whatsapp"
          disabled={!inv.parent_phone || paid}
          onPress={() => sendWhatsApp(inv.parent_phone, invoiceMessage(inv)).catch(() => notify("Gagal", "Tidak bisa membuka WhatsApp"))}
        />
        {!paid && (
          <Button
            testID="mark-paid-button"
            title="Tandai Lunas"
            icon="checkmark-circle-outline"
            loading={pay.isPending}
            onPress={() => confirmAction("Tandai lunas?", `Tambahkan ${inv.package} kredit untuk ${inv.student_name}.`, () => pay.mutate())}
          />
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: space.md, gap: space.md },
  rowBorder: { borderTopWidth: 1, borderTopColor: c.divider },
  sticky: {
    position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm,
    backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border,
  },
}));
