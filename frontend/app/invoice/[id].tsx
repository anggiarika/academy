import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, fileSource } from "@/src/api";
import { useBranding } from "@/src/branding";
import { confirmAction, notify, ScreenHeader } from "@/src/components/header";
import { Badge, Button, Card, CenterState, radius, Segmented, space, Txt } from "@/src/components/ui";
import { invoiceMessage, PRICES, programLabel, receiptMessage, rupiah, sendWhatsApp, shortDateTime, upgradeSavings } from "@/src/format";
import type { InvoiceOut } from "@/src/types";
import { makeStyles, useTheme } from "@/src/theme";

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [method, setMethod] = useState<"transfer" | "tunai">("transfer");
  const brand = useBranding();
  const q = useQuery({ queryKey: ["invoice", id], queryFn: () => api.invoice(id) });

  const pay = useMutation({
    mutationFn: () => api.payInvoice(id, method),
    onSuccess: async (inv) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      qc.invalidateQueries();
      if (inv.parent_phone) {
        // Auto-open WhatsApp with a thank-you receipt (user taps Send in WhatsApp).
        await sendReceipt(inv);
      } else {
        notify("Lunas", `${inv.package} kredit ${programLabel(inv.program)} ditambahkan ke ${inv.student_name}.`);
      }
    },
    onError: (e: Error) => notify("Gagal", e.message),
  });

  const sendReceipt = async (inv: InvoiceOut) => {
    try {
      const student = await api.student(inv.student_id);
      await sendWhatsApp(inv.parent_phone, receiptMessage(inv, student.wallets[inv.program]?.credits ?? inv.package, brand.name));
    } catch {
      notify("Lunas", "Pembayaran tercatat. Tekan 'Kirim Tanda Terima via WA' untuk mengirim ke orang tua.");
    }
  };

  const del = useMutation({
    mutationFn: () => api.deleteInvoice(id),
    onSuccess: () => { qc.invalidateQueries(); router.back(); },
    onError: (e: Error) => notify("Gagal", e.message),
  });

  const [permBlocked, setPermBlocked] = useState(false);
  const changePkg = useMutation({
    mutationFn: (pkg: 4 | 12) => api.changePackage(id, pkg),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e: Error) => notify("Gagal", e.message),
  });
  const upload = useMutation({
    mutationFn: (a: ImagePicker.ImagePickerAsset) =>
      api.uploadReceipt(id, a.uri, a.fileName ?? "bukti.jpg", a.mimeType ?? "image/jpeg"),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e: Error) => notify("Gagal mengunggah", e.message),
  });

  const pickReceipt = async () => {
    let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setPermBlocked(!perm.canAskAgain);
      if (perm.canAskAgain) notify("Izin galeri dibutuhkan", "Izinkan akses foto untuk melampirkan bukti transfer.");
      return;
    }
    setPermBlocked(false);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (!res.canceled && res.assets[0]) upload.mutate(res.assets[0]);
  };

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

        <Card testID="receipt-card" style={{ gap: space.md }}>
          <Txt variant="label">Bukti Transfer</Txt>
          {inv.receipt_path ? (
            <Image testID="receipt-image" source={fileSource(inv.receipt_path)} style={styles.receipt} contentFit="contain" transition={200} />
          ) : (
            <Txt variant="caption">Belum ada bukti transfer dilampirkan.</Txt>
          )}
          <Button
            testID="upload-receipt-button"
            title={inv.receipt_path ? "Ganti Bukti Transfer" : "Lampirkan Bukti Transfer"}
            icon="image-outline"
            variant="secondary"
            loading={upload.isPending}
            onPress={pickReceipt}
          />
          {permBlocked && (
            <View style={{ gap: space.sm }}>
              <Txt variant="caption" style={{ color: colors.error }}>Akses galeri ditolak. Aktifkan di pengaturan untuk melampirkan foto.</Txt>
              <Button testID="open-settings-button" title="Buka Pengaturan" variant="ghost" icon="settings-outline" onPress={() => Linking.openSettings()} />
            </View>
          )}
        </Card>

        {!paid && (
          <>
            <Txt variant="label">Paket</Txt>
            <Segmented
              testIDPrefix="invoice-package-switch"
              value={String(inv.package) as "4" | "12"}
              onChange={(v) => changePkg.mutate(Number(v) as 4 | 12)}
              options={[
                { value: "4", label: `4x · ${rupiah(PRICES[inv.program][4])}` },
                { value: "12", label: `12x · ${rupiah(PRICES[inv.program][12])}` },
              ]}
            />
            {inv.package === 4 && (
              <View style={styles.offer} testID="upgrade-offer-banner">
                <Txt variant="label" style={{ color: colors.onBrandSecondary }}>
                  Tawarkan paket 12x: hemat {rupiah(upgradeSavings(inv.program))} + 3 kuota izin
                </Txt>
                <Txt variant="caption">Penawaran ini otomatis disertakan di pesan WhatsApp.</Txt>
              </View>
            )}
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
          testID={paid ? "send-receipt-whatsapp-button" : "send-whatsapp-invoice-button"}
          title={paid ? "Kirim Tanda Terima via WA" : "Kirim Tagihan via WA"}
          icon="logo-whatsapp"
          variant="whatsapp"
          disabled={!inv.parent_phone}
          onPress={() =>
            paid
              ? sendReceipt(inv)
              : sendWhatsApp(inv.parent_phone, invoiceMessage(inv)).catch(() => notify("Gagal", "Tidak bisa membuka WhatsApp"))
          }
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
  receipt: { width: "100%", height: 260, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  offer: { backgroundColor: c.brandSecondary, borderRadius: radius.md, padding: space.md, gap: 2 },
  sticky: {
    position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm,
    backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border,
  },
}));
