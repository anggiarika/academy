import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useRef, useState } from "react";
import { Linking, Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, radius, space, Txt } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export const QR_PREFIX = "PRESENSI:";

/** Returns a message to show after scanning (e.g. "Aisyah ditandai hadir"). */
type OnScan = (studentId: string) => string;

export function QrScanner({ visible, onClose, onScan }: { visible: boolean; onClose: () => void; onScan: OnScan }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [message, setMessage] = useState("Arahkan kamera ke kartu QR siswa");
  const lastScan = useRef<{ data: string; at: number }>({ data: "", at: 0 });

  const handle = ({ data }: { data: string }) => {
    const now = Date.now();
    if (data === lastScan.current.data && now - lastScan.current.at < 2500) return;
    lastScan.current = { data, at: now };
    if (!data.startsWith(QR_PREFIX)) {
      setMessage("QR tidak dikenali");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setMessage(onScan(data.slice(QR_PREFIX.length)));
  };

  const renderBody = () => {
    if (!permission) return null;
    if (!permission.granted) {
      return (
        <View style={styles.permBox} testID="camera-permission-box">
          <Ionicons name="camera-outline" size={40} color={colors.brandPrimary} />
          <Txt variant="heading" style={{ textAlign: "center" }}>Akses kamera dibutuhkan</Txt>
          <Txt style={{ textAlign: "center" }}>Kamera dipakai untuk memindai kartu QR siswa agar presensi lebih cepat.</Txt>
          {permission.canAskAgain ? (
            <Button testID="camera-allow-button" title="Izinkan Kamera" onPress={requestPermission} />
          ) : (
            <Button testID="camera-open-settings-button" title="Buka Pengaturan" icon="settings-outline" onPress={() => Linking.openSettings()} />
          )}
        </View>
      );
    }
    return (
      <View style={{ flex: 1 }}>
        <CameraView
          testID="qr-camera-view"
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={handle}
        />
        <View pointerEvents="none" style={styles.frameWrap}>
          <View style={styles.frame} />
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.top}>
          <Txt variant="heading" style={{ flex: 1, color: colors.onSurfaceInverse }}>Scan QR Siswa</Txt>
          <Pressable testID="qr-close-button" onPress={onClose} style={styles.close} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.onSurfaceInverse} />
          </Pressable>
        </View>
        {renderBody()}
        <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]}>
          <Txt variant="label" testID="qr-scan-message" style={{ color: colors.onSurfaceInverse, textAlign: "center" }}>{message}</Txt>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceInverse },
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingVertical: space.md },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.scrim },
  permBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md, backgroundColor: c.surface, margin: space.lg, borderRadius: radius.lg },
  frameWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  frame: { width: 240, height: 240, borderRadius: radius.lg, borderWidth: 3, borderColor: c.brand },
  bottom: { paddingHorizontal: space.lg, paddingTop: space.lg },
}));
