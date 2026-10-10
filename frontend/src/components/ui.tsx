import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleProp, Text, TextProps, View, ViewStyle } from "react-native";

import { makeStyles, ThemeColors, useTheme } from "@/src/theme";

export const fonts = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

type TxtVariant = "title" | "heading" | "body" | "label" | "caption" | "number";

export function Txt({ variant = "body", style, ...rest }: TextProps & { variant?: TxtVariant }) {
  const styles = useTxtStyles();
  return <Text {...rest} style={[styles[variant], style]} />;
}

const useTxtStyles = makeStyles((c) => ({
  title: { fontFamily: fonts.semibold, fontSize: 26, color: c.onSurface, letterSpacing: -0.5 },
  heading: { fontFamily: fonts.semibold, fontSize: 17, color: c.onSurface },
  body: { fontFamily: fonts.regular, fontSize: 14, color: c.onSurfaceSecondary },
  label: { fontFamily: fonts.medium, fontSize: 14, color: c.onSurface },
  caption: { fontFamily: fonts.regular, fontSize: 12, color: c.muted },
  number: { fontFamily: fonts.semibold, fontSize: 28, color: c.onSurface, letterSpacing: -0.5 },
}));

type BtnVariant = "primary" | "secondary" | "whatsapp" | "danger" | "ghost";

export function Button({
  title, onPress, variant = "primary", icon, loading, disabled, testID, style,
}: {
  title: string; onPress: () => void; variant?: BtnVariant; icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean; disabled?: boolean; testID: string; style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useBtnStyles();
  const map: Record<BtnVariant, [keyof ThemeColors, keyof ThemeColors]> = {
    primary: ["brandPrimary", "onBrandPrimary"],
    secondary: ["brandSecondary", "onBrandSecondary"],
    whatsapp: ["whatsapp", "onWhatsapp"],
    danger: ["errorSoft", "error"],
    ghost: ["surfaceTertiary", "onSurfaceTertiary"],
  };
  const [bg, fg] = map[variant];
  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: colors[bg], opacity: disabled ? 0.5 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors[fg]} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={colors[fg]} />}
          <Text style={[styles.text, { color: colors[fg] }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const useBtnStyles = makeStyles(() => ({
  btn: {
    minHeight: 50, borderRadius: radius.md, paddingHorizontal: space.lg,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm,
  },
  text: { fontFamily: fonts.semibold, fontSize: 15 },
}));

export function Card({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const styles = useCardStyles();
  return <View testID={testID} style={[styles.card, style]}>{children}</View>;
}

const useCardStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.surface, borderRadius: radius.lg, padding: space.lg,
    borderWidth: 1, borderColor: c.border,
    shadowColor: c.surfaceInverse, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1,
  },
}));

export type Tone = "brand" | "warning" | "error" | "neutral";

export function Badge({ label, tone = "neutral", testID }: { label: string; tone?: Tone; testID?: string }) {
  const { colors } = useTheme();
  const styles = useBadgeStyles();
  const map: Record<Tone, [keyof ThemeColors, keyof ThemeColors]> = {
    brand: ["brandSecondary", "onBrandSecondary"],
    warning: ["warningSoft", "onWarning"],
    error: ["errorSoft", "error"],
    neutral: ["surfaceTertiary", "onSurfaceTertiary"],
  };
  const [bg, fg] = map[tone];
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: colors[bg] }]}>
      <Text style={[styles.text, { color: colors[fg] }]}>{label}</Text>
    </View>
  );
}

const useBadgeStyles = makeStyles(() => ({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" },
  text: { fontFamily: fonts.medium, fontSize: 12 },
}));

export const creditTone = (c: number): Tone => (c <= 0 ? "error" : c <= 1 ? "warning" : "brand");

export function CenterState({
  kind, message, onRetry, testID,
}: { kind: "loading" | "error" | "empty"; message?: string; onRetry?: () => void; testID?: string }) {
  const { colors } = useTheme();
  const styles = useStateStyles();
  return (
    <View style={styles.wrap} testID={testID}>
      {kind === "loading" ? (
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      ) : (
        <>
          <View style={styles.iconWrap}>
            <Ionicons name={kind === "error" ? "alert-circle-outline" : "clipboard-outline"} size={32} color={kind === "error" ? colors.error : colors.brandPrimary} />
          </View>
          <Txt variant="label" style={styles.msg}>{message ?? (kind === "error" ? "Terjadi kesalahan" : "Belum ada data")}</Txt>
          {onRetry && <Button testID="state-retry-button" title="Coba lagi" variant="secondary" onPress={onRetry} />}
        </>
      )}
    </View>
  );
}

const useStateStyles = makeStyles((c) => ({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md, minHeight: 220 },
  iconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  msg: { textAlign: "center" },
}));

export function Segmented<T extends string>({
  options, value, onChange, testIDPrefix,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; testIDPrefix: string }) {
  const { colors } = useTheme();
  const styles = useSegStyles();
  return (
    <View style={styles.wrap}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={`${testIDPrefix}-${o.value}`}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            style={[styles.item, active && { backgroundColor: colors.surface, shadowOpacity: 0.08 }]}
          >
            <Text style={[styles.text, { color: active ? colors.onSurface : colors.muted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useSegStyles = makeStyles((c) => ({
  wrap: { flexDirection: "row", backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: 3 },
  item: {
    flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 10,
    shadowColor: c.surfaceInverse, shadowOpacity: 0, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
  },
  text: { fontFamily: fonts.medium, fontSize: 13 },
}));

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.xs }}>
      <Txt variant="caption">{label}</Txt>
      {children}
    </View>
  );
}

export const useInputStyle = makeStyles((c) => ({
  input: {
    minHeight: 50, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, paddingHorizontal: space.lg,
    fontFamily: fonts.regular, fontSize: 15, color: c.onSurface, borderWidth: 1, borderColor: c.border,
  },
}));
