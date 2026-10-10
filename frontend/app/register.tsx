import { Ionicons } from "@expo/vector-icons";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Button, Field, radius, space, Txt, useInputStyle } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export default function Register() {
  const { user, signUp } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles();
  const input = useInputStyle();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Redirect href="/(tabs)" />;

  const localError =
    password && password.length < 8 ? "Password minimal 8 karakter" : confirm && confirm !== password ? "Konfirmasi password tidak sama" : "";
  const valid = name.trim() && email.includes("@") && password.length >= 8 && confirm === password;

  const submit = async () => {
    if (!valid) return;
    setError("");
    setLoading(true);
    try {
      await signUp(name, email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pendaftaran gagal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
    >
      <Pressable testID="register-back-button" onPress={() => (router.canGoBack() ? router.back() : router.replace("/login"))} style={styles.back} hitSlop={8}>
        <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
      </Pressable>
      <Txt variant="title" style={{ marginTop: space.lg }}>Daftar Akun Guru</Txt>
      <Txt style={{ marginTop: space.xs, marginBottom: space.xl }}>
        Buat akun untuk mengisi presensi kelas. Akun Keuangan dibuat oleh admin lewat menu Kelola Akun.
      </Txt>

      <View style={{ gap: space.lg }}>
        <Field label="Nama lengkap">
          <TextInput testID="register-name-input" style={input.input} value={name} onChangeText={setName} placeholder="Nama Anda" placeholderTextColor={colors.muted} returnKeyType="next" />
        </Field>
        <Field label="Email">
          <TextInput testID="register-email-input" style={input.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="nama@sekolah.id" placeholderTextColor={colors.muted} returnKeyType="next" />
        </Field>
        <Field label="Password (min. 8 karakter)">
          <TextInput testID="register-password-input" style={input.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" placeholderTextColor={colors.muted} returnKeyType="next" />
        </Field>
        <Field label="Ulangi password">
          <TextInput testID="register-confirm-input" style={input.input} value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="••••••••" placeholderTextColor={colors.muted} returnKeyType="go" onSubmitEditing={submit} />
        </Field>
        {!!(error || localError) && (
          <Txt testID="register-error-text" style={{ color: colors.error }}>{error || localError}</Txt>
        )}
        <Button testID="register-submit-button" title="Daftar & Masuk" onPress={submit} loading={loading} disabled={!valid} />
        <Pressable testID="go-to-login-button" onPress={() => router.replace("/login")} style={styles.switchLink} hitSlop={8}>
          <Txt>Sudah punya akun? </Txt>
          <Txt variant="label" style={{ color: colors.brandPrimary }}>Masuk</Txt>
        </Pressable>
      </View>
    </KeyboardAwareScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: space.xl, flexGrow: 1 },
  back: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  switchLink: { flexDirection: "row", justifyContent: "center", alignItems: "center", minHeight: 44 },
}));
