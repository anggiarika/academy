import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { notify, ScreenHeader } from "@/src/components/header";
import { Button, Field, radius, space, Txt, useInputStyle } from "@/src/components/ui";
import { programLabel } from "@/src/format";
import type { StudentIn } from "@/src/types";
import { makeStyles, useTheme } from "@/src/theme";

export default function StudentForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors } = useTheme();
  const styles = useStyles();
  const input = useInputStyle();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [form, setForm] = useState<StudentIn>({ name: "", parent_name: "", parent_phone: "", class_ids: [] });

  const classes = useQuery({ queryKey: ["classes"], queryFn: api.classes });
  const existing = useQuery({ queryKey: ["student", id], queryFn: () => api.student(id!), enabled: !!id });

  useEffect(() => {
    if (existing.data) {
      const { name, parent_name, parent_phone, class_ids } = existing.data;
      setForm({ name, parent_name, parent_phone, class_ids });
    }
  }, [existing.data]);

  const save = useMutation({
    mutationFn: () => (id ? api.updateStudent(id, form) : api.createStudent(form)),
    onSuccess: (s) => {
      qc.invalidateQueries();
      if (id) router.back();
      else router.replace(`/student/${s.id}`);
    },
    onError: (e: Error) => notify("Gagal menyimpan", e.message),
  });

  const toggleClass = (cid: string) =>
    setForm((f) => ({
      ...f,
      class_ids: f.class_ids.includes(cid) ? f.class_ids.filter((x) => x !== cid) : [...f.class_ids, cid],
    }));

  return (
    <View style={styles.root}>
      <ScreenHeader title={id ? "Edit Siswa" : "Tambah Siswa"} />
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xxl }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <Field label="Nama siswa">
          <TextInput testID="student-name-input" style={input.input} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Nama lengkap" placeholderTextColor={colors.muted} />
        </Field>
        <Field label="Nama orang tua / wali">
          <TextInput testID="student-parent-input" style={input.input} value={form.parent_name} onChangeText={(v) => setForm({ ...form, parent_name: v })} placeholder="Ibu/Bapak ..." placeholderTextColor={colors.muted} />
        </Field>
        <Field label="No. WhatsApp orang tua">
          <TextInput testID="student-phone-input" style={input.input} value={form.parent_phone} onChangeText={(v) => setForm({ ...form, parent_phone: v })} placeholder="08xxxxxxxxxx" keyboardType="phone-pad" placeholderTextColor={colors.muted} />
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
        <Txt variant="caption">Kredit awal 0. Tambahkan kredit dengan membuat tagihan lalu tandai lunas.</Txt>
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
}));
