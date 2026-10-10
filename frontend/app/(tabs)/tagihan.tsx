import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Badge, CenterState, radius, Segmented, space, Txt } from "@/src/components/ui";
import { programLabel, rupiah, shortDateTime } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

export default function Tagihan() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<"unpaid" | "paid">("unpaid");
  const q = useQuery({ queryKey: ["invoices", status], queryFn: () => api.invoices(status) });

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
          ListEmptyComponent={
            <CenterState kind="empty" message={status === "unpaid" ? "Semua tagihan sudah lunas" : "Belum ada pembayaran"} />
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`invoice-row-${item.id}`}
              onPress={() => router.push(`/invoice/${item.id}`)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="label">{item.student_name}</Txt>
                <Txt variant="caption">
                  {programLabel(item.program)} · {item.package} pertemuan · {shortDateTime(item.created_at)}
                </Txt>
                <Txt variant="heading" style={{ marginTop: 4 }}>{rupiah(item.amount)}</Txt>
              </View>
              <Badge label={item.status === "paid" ? "Lunas" : "Belum Bayar"} tone={item.status === "paid" ? "brand" : "error"} />
            </Pressable>
          )}
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
}));
