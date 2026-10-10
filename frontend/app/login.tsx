import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { useState } from "react";
import { TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Button, Field, fonts, radius, space, Txt, useInputStyle } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export default function Login() {
  const { user, signIn } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles();
  const input = useInputStyle();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Redirect href="/(tabs)" />;

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login gagal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
    >
      <View style={styles.logo}>
        <Ionicons name="checkmark-done" size={32} color={colors.onBrandPrimary} />
      </View>
      <Txt variant="title" style={{ marginTop: space.xl }}>Presensi & Kredit</Txt>
      <Txt style={{ marginTop: space.xs, marginBottom: space.xxl }}>
        Masuk sebagai Guru atau Bagian Keuangan untuk mengelola kehadiran dan tagihan siswa.
      </Txt>

      <View style={{ gap: space.lg }}>
        <Field label="Email">
          <TextInput
            testID="login-email-input"
            style={input.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="nama@sekolah.id"
            placeholderTextColor={colors.muted}
            returnKeyType="next"
          />
        </Field>
        <Field label="Password">
          <TextInput
            testID="login-password-input"
            style={input.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={colors.muted}
            returnKeyType="go"
            onSubmitEditing={submit}
          />
        </Field>
        {!!error && <Txt testID="login-error-text" style={{ color: colors.error }}>{error}</Txt>}
        <Button testID="login-submit-button" title="Masuk" onPress={submit} loading={loading} disabled={!email || !password} />
      </View>
    </KeyboardAwareScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: space.xl, flexGrow: 1 },
  logo: {
    width: 64, height: 64, borderRadius: radius.lg, backgroundColor: c.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
  hint: { fontFamily: fonts.regular },
}));
