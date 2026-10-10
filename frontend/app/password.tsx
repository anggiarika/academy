import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { notify, ScreenHeader } from "@/src/components/header";
import { Button, Field, space, Txt, useInputStyle } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export default function ChangePassword() {
  const { colors } = useTheme();
  const styles = useStyles();
  const input = useInputStyle();
  const insets = useSafeAreaInsets();
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");

  const mismatch = !!confirm && confirm !== newPw;
  const tooShort = !!newPw && newPw.length < 8;

  const save = useMutation({
    mutationFn: () => api.changePassword(oldPw, newPw),
    onSuccess: () => {
      notify("Berhasil", "Password Anda sudah diganti.");
      router.back();
    },
    onError: (e: Error) => notify("Gagal", e.message),
  });

  return (
    <View style={styles.root}>
      <ScreenHeader title="Ganti Password" />
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xxl }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <Field label="Password lama">
          <TextInput testID="old-password-input" style={input.input} value={oldPw} onChangeText={setOldPw} secureTextEntry placeholder="••••••••" placeholderTextColor={colors.muted} />
        </Field>
        <Field label="Password baru (min. 8 karakter)">
          <TextInput testID="new-password-input" style={input.input} value={newPw} onChangeText={setNewPw} secureTextEntry placeholder="••••••••" placeholderTextColor={colors.muted} />
        </Field>
        <Field label="Ulangi password baru">
          <TextInput testID="confirm-password-input" style={input.input} value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="••••••••" placeholderTextColor={colors.muted} />
        </Field>
        {(mismatch || tooShort) && (
          <Txt testID="password-error-text" style={{ color: colors.error }}>
            {tooShort ? "Password baru minimal 8 karakter" : "Konfirmasi password tidak sama"}
          </Txt>
        )}
        <Button
          testID="change-password-submit-button"
          title="Simpan Password"
          onPress={() => save.mutate()}
          loading={save.isPending}
          disabled={!oldPw || !newPw || tooShort || confirm !== newPw}
        />
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
}));
