import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Badge, CenterState, creditTone, fonts, radius, space, Txt } from "@/src/components/ui";
import { programLabel } from "@/src/format";
import type { Program } from "@/src/types";
import { makeStyles, useTheme } from "@/src/theme";

export default function Siswa() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState<string>("");
  const students = useQuery({ queryKey: ["students"], queryFn: () => api.students() });
  const classes = useQuery({ queryKey: ["classes"], queryFn: api.classes });
  const isFinance = user?.role === "keuangan";

  const filtered = useMemo(
    () =>
      (students.data ?? []).filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) && (!classId || s.class_ids.includes(classId)),
      ),
    [students.data, search, classId],
  );
  const className = (id: string) => classes.data?.find((c) => c.id === id)?.name ?? "";

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + space.lg }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Txt variant="title" style={{ flex: 1 }}>Siswa</Txt>
          {isFinance && (
            <Pressable testID="add-student-button" onPress={() => router.push("/student/form")} style={styles.addBtn}>
              <Ionicons name="add" size={24} color={colors.onBrandPrimary} />
            </Pressable>
          )}
        </View>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="student-search-input"
            value={search}
            onChangeText={setSearch}
            placeholder="Cari nama siswa"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {[{ id: "", name: "Semua" }, ...(classes.data ?? [])].map((c) => {
            const active = classId === c.id;
            return (
              <Pressable
                key={c.id || "all"}
                testID={`student-filter-${c.id || "all"}`}
                onPress={() => setClassId(c.id)}
                style={[styles.chip, active && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
              >
                <Txt variant="label" style={{ fontSize: 13, color: active ? colors.onBrandPrimary : colors.onSurfaceTertiary }}>{c.name}</Txt>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {students.isLoading ? (
        <CenterState kind="loading" />
      ) : students.isError ? (
        <CenterState kind="error" message={students.error.message} onRetry={students.refetch} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: space.lg, gap: space.sm }}
          ListEmptyComponent={<CenterState kind="empty" message="Siswa tidak ditemukan" />}
          renderItem={({ item }) => (
            <Pressable
              testID={`student-row-${item.id}`}
              onPress={() => router.push(`/student/${item.id}`)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.avatar}>
                <Txt variant="label" style={{ color: colors.onBrandSecondary }}>{item.name.slice(0, 1)}</Txt>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="label">{item.name}</Txt>
                <Txt variant="caption" numberOfLines={1}>{item.class_ids.map(className).join(", ") || "Belum ada kelas"}</Txt>
                <View style={{ flexDirection: "row", gap: space.xs, marginTop: 4, flexWrap: "wrap" }}>
                  {(Object.keys(item.wallets) as Program[]).map((p) => (
                    <Badge key={p} label={`${programLabel(p)}: ${item.wallets[p]?.credits ?? 0}`} tone={creditTone(item.wallets[p]?.credits ?? 0)} />
                  ))}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
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
  search: {
    flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: c.surface, borderRadius: radius.md,
    paddingHorizontal: space.md, borderWidth: 1, borderColor: c.border, minHeight: 46,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: c.onSurface, minHeight: 44 },
  chip: {
    paddingHorizontal: 14, minHeight: 36, justifyContent: "center", borderRadius: radius.pill,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, backgroundColor: c.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: c.border,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
}));
