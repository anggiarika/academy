import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { confirmAction, notify, ScreenHeader } from "@/src/components/header";
import { Badge, Button, Card, CenterState, Field, radius, Segmented, space, Txt, useInputStyle } from "@/src/components/ui";
import type { Role, UserCreate } from "@/src/types";
import { makeStyles, useTheme } from "@/src/theme";

const EMPTY: UserCreate = { email: "", name: "", password: "", role: "guru" };

export default function Users() {
  const { user: me } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles();
  const input = useInputStyle();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [form, setForm] = useState<UserCreate>(EMPTY);
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["users"], queryFn: api.users });

  const create = useMutation({
    mutationFn: () => api.createUser(form),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setForm(EMPTY);
      setOpen(false);
      notify("Akun dibuat", `${u.name} bisa login dengan ${u.email}.`);
    },
    onError: (e: Error) => notify("Gagal", e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
    onError: (e: Error) => notify("Gagal", e.message),
  });

  const valid = form.name.trim() && form.email.includes("@") && form.password.length >= 8;

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Kelola Akun"
        subtitle="Guru & Keuangan"
        right={
          <Pressable testID="toggle-add-user-button" style={styles.addBtn} onPress={() => setOpen((o) => !o)}>
            <Ionicons name={open ? "close" : "person-add-outline"} size={20} color={colors.onBrandPrimary} />
          </Pressable>
        }
      />
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xxl }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        {open && (
          <Card testID="add-user-form" style={{ gap: space.md }}>
            <Txt variant="heading">Akun Baru</Txt>
            <Segmented<Role>
              testIDPrefix="new-user-role"
              value={form.role}
              onChange={(role) => setForm({ ...form, role })}
              options={[{ value: "guru", label: "Guru" }, { value: "keuangan", label: "Keuangan" }]}
            />
            <Field label="Nama">
              <TextInput testID="new-user-name-input" style={input.input} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Nama lengkap" placeholderTextColor={colors.muted} />
            </Field>
            <Field label="Email">
              <TextInput testID="new-user-email-input" style={input.input} value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} autoCapitalize="none" keyboardType="email-address" placeholder="nama@sekolah.id" placeholderTextColor={colors.muted} />
            </Field>
            <Field label="Password (min. 8 karakter)">
              <TextInput testID="new-user-password-input" style={input.input} value={form.password} onChangeText={(v) => setForm({ ...form, password: v })} secureTextEntry placeholder="••••••••" placeholderTextColor={colors.muted} />
            </Field>
            <Button testID="create-user-submit-button" title="Buat Akun" onPress={() => create.mutate()} loading={create.isPending} disabled={!valid} />
          </Card>
        )}

        {q.isLoading ? (
          <CenterState kind="loading" />
        ) : q.isError ? (
          <CenterState kind="error" message={q.error.message} onRetry={q.refetch} />
        ) : (
          q.data?.map((u) => (
            <View key={u.id} style={styles.row} testID={`user-row-${u.id}`}>
              <View style={styles.avatar}>
                <Ionicons name={u.role === "guru" ? "school-outline" : "wallet-outline"} size={18} color={colors.onBrandSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="label">{u.name}{u.id === me?.id ? " (Anda)" : ""}</Txt>
                <Txt variant="caption">{u.email}</Txt>
              </View>
              <Badge label={u.role === "guru" ? "Guru" : "Keuangan"} tone={u.role === "guru" ? "neutral" : "brand"} />
              {u.id !== me?.id && (
                <Pressable
                  testID={`delete-user-${u.id}`}
                  hitSlop={8}
                  style={styles.delBtn}
                  onPress={() => confirmAction("Hapus akun?", `${u.name} tidak akan bisa login lagi.`, () => del.mutate(u.id))}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </Pressable>
              )}
            </View>
          ))
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, backgroundColor: c.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: c.border,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  delBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.errorSoft, alignItems: "center", justifyContent: "center" },
}));
