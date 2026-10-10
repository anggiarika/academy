import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { notify, ScreenHeader } from "@/src/components/header";
import { Button, Card, Field, radius, space, Txt } from "@/src/components/ui";
import { programLabel, rupiah } from "@/src/format";
import type { Program } from "@/src/types";
import { makeStyles, useTheme } from "@/src/theme";

export default function NewInvoice() {
  const params = useLocalSearchParams<{ studentId?: string; program?: Program }>();
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [studentId, setStudentId] = useState(params.studentId ?? "");
  const [program, setProgram] = useState<Program | "">(params.program ?? "");
  const [pkg, setPkg] = useState<4 | 12>(4);

  const students = useQuery({ queryKey: ["students"], queryFn: () => api.students() });
  const packages = useQuery({ queryKey: ["packages"], queryFn: api.packages });
  const student = students.data?.find((s) => s.id === studentId);
  const programs = student ? (Object.keys(student.wallets) as Program[]) : [];
  const price = packages.data?.find((p) => p.program === program && p.package === pkg);

  const create = useMutation({
    mutationFn: () => api.createInvoice({ student_id: studentId, program: program as Program, package: pkg }),
    onSuccess: (inv) => {
      qc.invalidateQueries();
      router.replace(`/invoice/${inv.id}`);
    },
    onError: (e: Error) => notify("Gagal membuat tagihan", e.message),
  });

  const chip = (active: boolean) => [styles.chip, active && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }];
  const chipText = (active: boolean) => ({ color: active ? colors.onBrandPrimary : colors.onSurface });

  return (
    <View style={styles.root}>
      <ScreenHeader title="Buat Tagihan" />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xxl }}>
        <Field label="Siswa">
          <View style={styles.chips}>
            {students.data?.map((s) => (
              <Pressable
                key={s.id}
                testID={`invoice-student-chip-${s.id}`}
                onPress={() => { setStudentId(s.id); setProgram(Object.keys(s.wallets)[0] as Program); }}
                style={chip(s.id === studentId)}
              >
                <Txt variant="label" style={chipText(s.id === studentId)}>{s.name}</Txt>
              </Pressable>
            ))}
          </View>
        </Field>

        {student && (
          <Field label="Program">
            <View style={styles.chips}>
              {programs.map((p) => (
                <Pressable key={p} testID={`invoice-program-${p}`} onPress={() => setProgram(p)} style={chip(p === program)}>
                  <Txt variant="label" style={chipText(p === program)}>{programLabel(p)} · Kredit {student.wallets[p]?.credits ?? 0}</Txt>
                </Pressable>
              ))}
            </View>
          </Field>
        )}

        {!!program && (
          <Field label="Paket">
            <View style={{ flexDirection: "row", gap: space.sm }}>
              {([4, 12] as const).map((n) => {
                const p = packages.data?.find((x) => x.program === program && x.package === n);
                const active = pkg === n;
                return (
                  <Pressable key={n} testID={`invoice-package-${n}`} onPress={() => setPkg(n)} style={[styles.pkg, active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandSecondary }]}>
                    <Txt variant="heading">{n} Pertemuan</Txt>
                    <Txt variant="label" style={{ color: colors.onBrandSecondary }}>{p ? rupiah(p.amount) : "-"}</Txt>
                    <Txt variant="caption">{p?.izin_quota ?? 0}x kuota izin</Txt>
                  </Pressable>
                );
              })}
            </View>
          </Field>
        )}

        {price && student && (
          <Card testID="invoice-summary">
            <Txt variant="caption">Total tagihan untuk {student.name}</Txt>
            <Txt variant="number" testID="invoice-total-text">{rupiah(price.amount)}</Txt>
          </Card>
        )}

        <Button
          testID="invoice-create-submit-button"
          title="Buat Tagihan"
          icon="receipt-outline"
          onPress={() => create.mutate()}
          loading={create.isPending}
          disabled={!studentId || !program}
        />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    paddingHorizontal: 14, minHeight: 40, justifyContent: "center", borderRadius: radius.pill,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  pkg: { flex: 1, padding: space.lg, gap: 4, borderRadius: radius.lg, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface },
}));
