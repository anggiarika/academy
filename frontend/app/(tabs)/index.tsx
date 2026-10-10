import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Badge, Card, CenterState, radius, space, Txt } from "@/src/components/ui";
import { prettyDate, programLabel, rupiah, todayISO } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

export default function Beranda() {
  const { user, signOut } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const isFinance = user?.role === "keuangan";
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard });
  const classes = useQuery({ queryKey: ["classes"], queryFn: api.classes });

  const stats = dash.data
    ? [
        { key: "students", label: "Total Siswa", value: `${dash.data.total_students}`, icon: "people-outline" as const, tone: colors.brandSecondary, fg: colors.onBrandSecondary },
        { key: "low", label: "Kredit Tipis (1)", value: `${dash.data.low_credit}`, icon: "alert-outline" as const, tone: colors.warningSoft, fg: colors.onWarning },
        { key: "zero", label: "Kredit Habis", value: `${dash.data.zero_credit}`, icon: "close-circle-outline" as const, tone: colors.errorSoft, fg: colors.error },
        { key: "unpaid", label: "Tagihan Belum Bayar", value: `${dash.data.unpaid_count}`, icon: "receipt-outline" as const, tone: colors.surfaceTertiary, fg: colors.onSurfaceTertiary },
      ]
    : [];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: space.xxl, paddingHorizontal: space.lg }}
      refreshControl={<RefreshControl refreshing={dash.isRefetching} onRefresh={() => { dash.refetch(); classes.refetch(); }} />}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Txt variant="caption">{prettyDate(todayISO())}</Txt>
          <Txt variant="title" testID="home-greeting">Halo, {user?.name}</Txt>
          <View style={{ marginTop: space.xs }}>
            <Badge testID="home-role-badge" label={isFinance ? "Keuangan / Admin" : "Guru"} tone="brand" />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Pressable testID="change-password-nav-button" onPress={() => router.push("/password")} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="key-outline" size={20} color={colors.onSurfaceTertiary} />
          </Pressable>
          <Pressable testID="logout-button" onPress={signOut} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="log-out-outline" size={22} color={colors.onSurfaceTertiary} />
          </Pressable>
        </View>
      </View>

      {dash.isLoading ? (
        <CenterState kind="loading" />
      ) : dash.isError ? (
        <CenterState kind="error" message={dash.error.message} onRetry={dash.refetch} />
      ) : (
        <>
          <View style={styles.grid}>
            {stats.map((s, i) => (
              <Animated.View key={s.key} entering={FadeInDown.delay(i * 60)} style={styles.gridItem}>
                <Card testID={`stat-${s.key}`}>
                  <View style={[styles.statIcon, { backgroundColor: s.tone }]}>
                    <Ionicons name={s.icon} size={18} color={s.fg} />
                  </View>
                  <Txt variant="number" style={{ marginTop: space.md }}>{s.value}</Txt>
                  <Txt variant="caption">{s.label}</Txt>
                </Card>
              </Animated.View>
            ))}
          </View>

          {isFinance && dash.data && (
            <Card style={{ marginTop: space.md, backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse }} testID="stat-unpaid-total">
              <Txt variant="caption" style={{ color: colors.onSurfaceInverse, opacity: 0.7 }}>Total piutang belum dibayar</Txt>
              <Txt variant="number" style={{ color: colors.onSurfaceInverse }}>{rupiah(dash.data.unpaid_total)}</Txt>
            </Card>
          )}

          {isFinance && (
            <View style={styles.actions}>
              {([
                ["report", "Laporan Bulanan", "bar-chart-outline", "/report"],
                ["users", "Kelola Akun", "people-circle-outline", "/users"],
              ] as const).map(([key, label, icon, href]) => (
                <Pressable
                  key={key}
                  testID={`home-action-${key}`}
                  onPress={() => router.push(href)}
                  style={({ pressed }) => [styles.action, pressed && { opacity: 0.8 }]}
                >
                  <Ionicons name={icon} size={20} color={colors.brandPrimary} />
                  <Txt variant="label" style={{ flex: 1 }}>{label}</Txt>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
              ))}
            </View>
          )}

          {dash.data && dash.data.needs_billing.length > 0 && (
            <View style={{ marginTop: space.xl }}>
              <Txt variant="heading">Perlu Ditagih</Txt>
              <Txt variant="caption" style={{ marginBottom: space.md }}>Kredit habis & belum ada tagihan</Txt>
              <Card style={{ padding: 0 }}>
                {dash.data.needs_billing.map((n, i) => (
                  <Pressable
                    key={`${n.student_id}-${n.program}`}
                    testID={`needs-billing-${n.student_id}-${n.program}`}
                    onPress={() =>
                      isFinance
                        ? router.push({ pathname: "/invoice/new", params: { studentId: n.student_id, program: n.program } })
                        : router.push(`/student/${n.student_id}`)
                    }
                    style={[styles.row, i > 0 && styles.rowBorder]}
                  >
                    <View style={{ flex: 1 }}>
                      <Txt variant="label">{n.name}</Txt>
                      <Txt variant="caption">{programLabel(n.program)} · Kredit {n.credits}</Txt>
                    </View>
                    {isFinance && <Badge label="Buat Tagihan" tone="error" />}
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                ))}
              </Card>
            </View>
          )}
        </>
      )}

      <Txt variant="heading" style={{ marginTop: space.xl, marginBottom: space.md }}>Kelas</Txt>
      {classes.data?.map((c) => (
        <Pressable
          key={c.id}
          testID={`home-class-${c.id}`}
          onPress={() => router.push(`/class/${c.id}`)}
          style={({ pressed }) => [styles.classRow, pressed && { opacity: 0.8 }]}
        >
          <View style={[styles.dot, { backgroundColor: c.program === "english" ? colors.warning : colors.brand }]} />
          <View style={{ flex: 1 }}>
            <Txt variant="label">{c.name}</Txt>
            <Txt variant="caption">{c.schedule} · {c.student_count} siswa</Txt>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: space.xl },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  gridItem: { width: "47.8%" },
  statIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.lg, minHeight: 60 },
  rowBorder: { borderTopWidth: 1, borderTopColor: c.divider },
  classRow: {
    flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, minHeight: 60,
    backgroundColor: c.surface, borderRadius: radius.md, marginBottom: space.sm, borderWidth: 1, borderColor: c.border,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  actions: { flexDirection: "row", gap: space.md, marginTop: space.md },
  action: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, minHeight: 52,
    backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border,
  },
}));
