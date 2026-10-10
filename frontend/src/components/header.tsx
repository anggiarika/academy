import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ReactNode } from "react";
import { Alert, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { space, Txt } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + space.sm }]}>
      <Pressable
        testID="header-back-button"
        hitSlop={8}
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
        style={styles.back}
      >
        <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Txt variant="heading" numberOfLines={1} testID="header-title">{title}</Txt>
        {!!subtitle && <Txt variant="caption" numberOfLines={1}>{subtitle}</Txt>}
      </View>
      {right}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md,
    backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
}));

export function confirmAction(title: string, message: string, onOk: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) onOk();
    return;
  }
  Alert.alert(title, message, [
    { text: "Batal", style: "cancel" },
    { text: "Ya", onPress: onOk },
  ]);
}

export function notify(title: string, message: string) {
  if (Platform.OS === "web") window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}
