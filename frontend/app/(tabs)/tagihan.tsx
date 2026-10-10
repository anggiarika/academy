import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { notify } from "@/src/components/header";
import { Badge, CenterState, radius, Segmented, space, Txt } from "@/src/components/ui";
import { daysSince, programLabel, reminderMessage, rupiah, sendWhatsApp, shortDateTime } from "@/src/format";
import type { InvoiceOut } from "@/src/types";
import { makeStyles, useTheme } from "@/src/theme";

export default function Tagihan() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<"unpaid" | "paid">("unpaid");
  const q = useQuery({ queryKey: ["invoices", status], queryFn: () => api.invoices(status) });
  const qc = useQueryClient();
  // Overdue (>=3 days), has phone, not yet reminded today → bulk queue
  const pending = (q.data ?? []).filter(
    (i) =>
      i.status === "unpaid" && daysSince(i.created_at) >= 3 && !!i.parent_phone &&
      (!i.reminded_at || new Date(i.reminded_at).toDateString() !== new Date().toDateString()),
  );
  const remind = async (inv: InvoiceOut) => {
    try {
      await sendWhatsApp(inv.parent_phone, reminderMessage(inv));
      await api.remindInvoice(inv.id);
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e) {
      notify("Gagal", e instanceof Error ? e.message : "Tidak bisa membuka WhatsApp");
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + space.lg }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Txt variant="title" style={{ flex: 1 }}>Tagihan</Txt>
          <Pressable testID="new-invoice-button" onPress={() => router.push("/invoice/new")} style={styles.addBtn}>
            <Ionicons name="add" size={24} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
        <Segmented
          testIDPrefix="invoice-status"
          value={status}
          onChange={setStatus}
          options={[{ value: "unpaid", label: "Belum Dibayar" }, { value: "paid", label: "Lunas" }]}
        />
      </View>
      {q.isLoading ? (
        <CenterState kind="loading" />
      ) : q.isError ? (
        <CenterState kind="error" message={q.error.message} onRetry={q.refetch} />
      ) : (
        <FlatList
          data={q.data}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: space.lg, gap: space.sm }}
          ListHeaderComponent={
            status === "unpaid" && pending.length > 0 ? (
              <View style={styles.bulk} testID="bulk-reminder-banner">
                <View style={{ flex: 1 }}>
                  <Txt variant="label">{pending.length} tagihan lewat 3 hari belum diingatkan hari ini</Txt>
                  <Txt variant="caption">Berikutnya: {pending[0].student_name}</Txt>
                </View>
                <Pressable testID="bulk-remind-next-button" onPress={() => remind(pending[0])} style={styles.remindBtn} hitSlop={6}>
                  <Ionicons name="logo-whatsapp" size={16} color={colors.onWhatsapp} />
                  <Txt variant="label" style={{ color: colors.onWhatsapp, fontSize: 13 }}>Ingatkan Berikutnya</Txt>
                </Pressable>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <CenterState kind="empty" message={status === "unpaid" ? "Semua tagihan sudah lunas" : "Belum ada pembayaran"} />
          }
          renderItem={({ item }) => {
            const age = daysSince(item.created_at);
            const overdue = item.status === "unpaid" && age >= 3;
            return (
            <Pressable
              testID={`invoice-row-${item.id}`}
              onPress={() => router.push(`/invoice/${item.id}`)}
              style={({ pressed }) => [styles.row, overdue && { borderColor: colors.error }, pressed && { opacity: 0.85 }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="label">{item.student_name}</Txt>
                <Txt variant="caption">
                  {programLabel(item.program)} · {item.package} pertemuan · {shortDateTime(item.created_at)}
                </Txt>
                <Txt variant="heading" style={{ marginTop: 4 }}>{rupiah(item.amount)}</Txt>
                {item.status === "unpaid" && (
                  <Txt variant="caption" testID={`invoice-age-${item.id}`} style={overdue ? { color: colors.error } : undefined}>
                    {age} hari{item.reminder_count ? ` · diingatkan ${item.reminder_count}x (${shortDateTime(item.reminded_at!)})` : ""}
                  </Txt>
                )}
              </View>
              <View style={{ alignItems: "flex-end", gap: space.sm }}>
                <Badge label={item.status === "paid" ? "Lunas" : overdue ? "Lewat 3 hari" : "Belum Bayar"} tone={item.status === "paid" ? "brand" : overdue ? "error" : "warning"} />
                {overdue && !!item.parent_phone && (
                  <Pressable testID={`remind-invoice-${item.id}`} onPress={() => remind(item)} style={styles.remindBtn} hitSlop={6}>
                    <Ionicons name="logo-whatsapp" size={16} color={colors.onWhatsapp} />
                    <Txt variant="label" style={{ color: colors.onWhatsapp, fontSize: 13 }}>Ingatkan</Txt>
                  </Pressable>
                )}
              </View>
            </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: { paddingHorizontal: space.lg, gap: space.md, paddingBottom: space.sm },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, backgroundColor: c.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: c.border,
  },
  remindBtn: {
    flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.whatsapp, borderRadius: radius.pill,
    paddingHorizontal: space.md, minHeight: 36,
  },
  bulk: {
    flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, marginBottom: space.xs,
    backgroundColor: c.errorSoft, borderRadius: radius.md,
  },
}));
