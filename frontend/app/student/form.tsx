import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { notify, ScreenHeader } from "@/src/components/header";
import { Badge, Button, Field, radius, space, Txt, useInputStyle } from "@/src/components/ui";
import { programLabel, rupiah } from "@/src/format";
import type { Program, StudentIn } from "@/src/types";
import { makeStyles, useTheme } from "@/src/theme";

export default function StudentForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors } = useTheme();
  const styles = useStyles();
  const input = useInputStyle();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [form, setForm] = useState<StudentIn>({ name: "", parent_name: "", parent_phone: "", class_ids: [] });
  // Prefill edit mode exactly once — otherwise the async query overwrites what the user is typing.
  const prefilled = useRef(false);

  const classes = useQuery({ queryKey: ["classes"], queryFn: api.classes });
  const packages = useQuery({ queryKey: ["packages"], queryFn: api.packages });
  const existing = useQuery({ queryKey: ["student", id], queryFn: () => api.student(id!), enabled: !!id });

  // Optional first payment while registering: program chips come from the selected classes.
  const [payProgram, setPayProgram] = useState<Program | "">("");
  const [payPkg, setPayPkg] = useState<4 | 12>(4);
  const [paidNow, setPaidNow] = useState(true);
  const programs = useMemo(
    () => [...new Set(form.class_ids.map((cid) => classes.data?.find((c) => c.id === cid)?.program).filter((p): p is Program => !!p))],
    [form.class_ids, classes.data],
  );
  const effPayProgram = payProgram && programs.includes(payProgram) ? payProgram : "";
  const price = packages.data?.find((p) => p.program === effPayProgram && p.package === payPkg);

  useEffect(() => {
    if (existing.data && !prefilled.current) {
      prefilled.current = true;
      const { name, parent_name, parent_phone, class_ids } = existing.data;
      setForm({ name, parent_name, parent_phone, class_ids });
    }
  }, [existing.data]);
  const save = useMutation({
    mutationFn: async () => {
      if (id) return api.updateStudent(id, form);
      const s = await api.createStudent(form);
      // First payment chosen → create the bill right away; "sudah dibayar" marks it paid, adding the credits.
      if (effPayProgram && price) {
        const inv = await api.createInvoice({ student_id: s.id, program: effPayProgram, package: payPkg });
        if (paidNow) await api.payInvoice(inv.id, "tunai");
      }
      return s;
    },
    onSuccess: (s) => {
      qc.invalidateQueries();
      if (id && router.canGoBack()) router.back();
      else router.replace(`/student/${s.id}`);
    },
    onError: (e: Error) => notify("Gagal menyimpan", e.message),
  });

  // First user edit marks the form dirty so a late prefill never overwrites typed text.
  const markDirty = () => {
    prefilled.current = true;
  };

  // Functional updates: a stale closure on slow devices can swallow keystrokes mid-type.
  const setField = (key: keyof StudentIn) => (v: string) => {
    markDirty();
    setForm((f) => ({ ...f, [key]: v }));
  };

  const toggleClass = (cid: string) => {
    markDirty();
    setForm((f) => ({
      ...f,
      class_ids: f.class_ids.includes(cid) ? f.class_ids.filter((x) => x !== cid) : [...f.class_ids, cid],
    }));
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title={id ? "Edit Siswa" : "Tambah Siswa"} />
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xxl }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <Field label="Nama siswa">
          <TextInput testID="student-name-input" style={input.input} value={form.name} onChangeText={setField("name")} placeholder="Nama lengkap" placeholderTextColor={colors.muted} autoComplete="off" />
        </Field>
        <Field label="Nama orang tua / wali">
          <TextInput testID="student-parent-input" style={input.input} value={form.parent_name} onChangeText={setField("parent_name")} placeholder="Ibu/Bapak ..." placeholderTextColor={colors.muted} autoComplete="off" />
        </Field>
        <Field label="No. WhatsApp orang tua">
          <TextInput testID="student-phone-input" style={input.input} value={form.parent_phone} onChangeText={setField("parent_phone")} placeholder="08xxxxxxxxxx" keyboardType="phone-pad" placeholderTextColor={colors.muted} autoComplete="off" />
        </Field>
        <Field label="Kelas (boleh lebih dari satu program)">
          <View style={styles.chips}>
            {classes.data?.map((c) => {
              const active = form.class_ids.includes(c.id);
              return (
                <Pressable
                  key={c.id}
                  testID={`student-class-chip-${c.id}`}
                  onPress={() => toggleClass(c.id)}
                  style={[styles.chip, active && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
                >
                  <Txt variant="label" style={{ fontSize: 13, color: active ? colors.onBrandPrimary : colors.onSurface }}>{c.name}</Txt>
                  <Txt variant="caption" style={{ color: active ? colors.onBrandPrimary : colors.muted }}>{programLabel(c.program)}</Txt>
                </Pressable>
              );
            })}
          </View>
        </Field>
        {!id && form.class_ids.length > 0 && (
          <Field label="Pembayaran awal (opsional)">
            <View style={styles.chips}>
              {programs.map((p) => {
                const active = effPayProgram === p;
                return (
                  <Pressable
                    key={p}
                    testID={`pay-program-${p}`}
                    onPress={() => setPayProgram(active ? "" : p)}
                    style={[styles.chip, active && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
                  >
                    <Txt variant="label" style={{ fontSize: 13, color: active ? colors.onBrandPrimary : colors.onSurface }}>{programLabel(p)}</Txt>
                  </Pressable>
                );
              })}
            </View>
            {!!effPayProgram && (
              <View style={{ gap: space.sm, marginTop: space.sm }}>
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  {([4, 12] as const).map((n) => {
                    const p = packages.data?.find((x) => x.program === effPayProgram && x.package === n);
                    const active = payPkg === n;
                    return (
                      <Pressable
                        key={n}
                        testID={`pay-package-${n}`}
                        onPress={() => setPayPkg(n)}
                        style={[styles.pkg, active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandSecondary }]}
                      >
                        <Txt variant="heading">{n} Pertemuan</Txt>
                        <Txt variant="label" style={{ color: colors.onBrandSecondary }}>{p ? rupiah(p.amount) : "-"}</Txt>
                        <Txt variant="caption">{p?.izin_quota ?? 0}x kuota izin</Txt>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable testID="pay-paid-now-toggle" onPress={() => setPaidNow(!paidNow)} style={styles.checkRow}>
                  <Ionicons name={paidNow ? "checkbox" : "square-outline"} size={24} color={paidNow ? colors.brandPrimary : colors.muted} />
                  <Txt variant="label" style={{ flex: 1 }}>Sudah dibayar — kredit langsung masuk</Txt>
                </Pressable>
                {price && (
                  <Badge
                    testID="pay-summary-badge"
                    tone={paidNow ? "brand" : "warning"}
                    label={
                      paidNow
                        ? `Kredit +${payPkg} & tercatat lunas ${rupiah(price.amount)}`
                        : `Tagihan ${rupiah(price.amount)} dibuat untuk dikirim ke orang tua`
                    }
                  />
                )}
              </View>
            )}
          </Field>
        )}

        <Txt variant="caption">Tanpa pembayaran awal, kredit dimulai dari 0. Bisa ditagih kapan saja dari halaman siswa.</Txt>
        <Button testID="student-save-button" title="Simpan" onPress={() => save.mutate()} loading={save.isPending} disabled={!form.name.trim()} />
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, minHeight: 44,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  pkg: { flex: 1, padding: space.md, gap: 2, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface },
  checkRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44 },
}));
