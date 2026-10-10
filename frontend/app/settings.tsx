import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Linking, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, fileSource } from "@/src/api";
import { notify, ScreenHeader } from "@/src/components/header";
import { Button, Card, CenterState, Field, radius, space, Txt, useInputStyle } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export default function SchoolSettings() {
  const { colors } = useTheme();
  const styles = useStyles();
  const input = useInputStyle();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [name, setName] = useState("");
  const [permBlocked, setPermBlocked] = useState(false);

  useEffect(() => {
    if (q.data) setName(q.data.school_name);
  }, [q.data]);

  const saveName = useMutation({
    mutationFn: () => api.updateSettings(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      notify("Tersimpan", "Nama lembaga akan tampil di kartu QR, tanda terima, dan laporan PDF.");
    },
    onError: (e: Error) => notify("Gagal", e.message),
  });

  const upload = useMutation({
    mutationFn: (a: ImagePicker.ImagePickerAsset) =>
      api.uploadLogo(a.uri, a.fileName ?? "logo.png", a.mimeType ?? "image/png"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
    onError: (e: Error) => notify("Gagal mengunggah", e.message),
  });

  const pickLogo = async () => {
    let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setPermBlocked(!perm.canAskAgain);
      if (perm.canAskAgain) notify("Izin galeri dibutuhkan", "Izinkan akses foto untuk memilih logo lembaga.");
      return;
    }
    setPermBlocked(false);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!res.canceled && res.assets[0]) upload.mutate(res.assets[0]);
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Logo & Nama Lembaga" subtitle="Tampil di kartu QR, tanda terima & laporan" />
      {q.isLoading ? (
        <CenterState kind="loading" />
      ) : q.isError ? (
        <CenterState kind="error" message={q.error.message} onRetry={q.refetch} />
      ) : (
        <KeyboardAwareScrollView
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xxl }}
          keyboardShouldPersistTaps="handled"
          bottomOffset={24}
        >
          <Card style={{ alignItems: "center", gap: space.md }} testID="logo-card">
            {q.data?.logo_path ? (
              <Image testID="school-logo-preview" source={fileSource(q.data.logo_path)} style={styles.logo} contentFit="contain" transition={200} />
            ) : (
              <View style={[styles.logo, styles.logoPlaceholder]} testID="school-logo-placeholder">
                <Ionicons name="image-outline" size={36} color={colors.muted} />
                <Txt variant="caption">Belum ada logo</Txt>
              </View>
            )}
            <Button
              testID="upload-logo-button"
              title={q.data?.logo_path ? "Ganti Logo" : "Pilih Logo"}
              icon="image-outline"
              variant="secondary"
              loading={upload.isPending}
              onPress={pickLogo}
            />
            {permBlocked && (
              <View style={{ gap: space.sm, alignItems: "center" }}>
                <Txt variant="caption" style={{ color: colors.error, textAlign: "center" }}>Akses galeri ditolak. Aktifkan di pengaturan untuk memilih logo.</Txt>
                <Button testID="logo-open-settings-button" title="Buka Pengaturan" variant="ghost" icon="settings-outline" onPress={() => Linking.openSettings()} />
              </View>
            )}
          </Card>

          <Card style={{ gap: space.md }}>
            <Field label="Nama lembaga">
              <TextInput
                testID="school-name-input"
                style={input.input}
                value={name}
                onChangeText={setName}
                placeholder="cth. Ganesha Gymnastic & English Club"
                placeholderTextColor={colors.muted}
              />
            </Field>
            <Button
              testID="save-school-name-button"
              title="Simpan Nama"
              onPress={() => saveName.mutate()}
              loading={saveName.isPending}
              disabled={!name.trim()}
            />
          </Card>
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  logo: { width: 160, height: 160, borderRadius: radius.lg },
  logoPlaceholder: { backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center", gap: space.sm },
}));
