import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Badge, CenterState, radius, space, Txt } from "@/src/components/ui";
import { programLabel } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

const IMAGES = {
  gymnastic: "https://images.unsplash.com/photo-1655842556563-2c28adb3fcc5?w=900&q=70",
  english: "https://images.unsplash.com/photo-1564429238817-393bd4286b2d?w=900&q=70",
};

export default function Presensi() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ["classes"], queryFn: api.classes });

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + space.lg }]}>
        <Txt variant="title">Presensi</Txt>
        <Txt>Pilih kelas untuk mengisi daftar hadir</Txt>
      </View>
      {q.isLoading ? (
        <CenterState kind="loading" />
      ) : q.isError ? (
        <CenterState kind="error" message={q.error.message} onRetry={q.refetch} />
      ) : (
        <FlatList
          data={q.data}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          ListEmptyComponent={<CenterState kind="empty" message="Belum ada kelas" />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 50)}>
              <Pressable
                testID={`class-card-${item.id}`}
                onPress={() => router.push(`/class/${item.id}`)}
                style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.98 }] }]}
              >
                <Image source={{ uri: IMAGES[item.program] }} style={styles.img} contentFit="cover" transition={200} />
                <LinearGradient colors={["transparent", colors.scrim]} style={styles.scrim} />
                <View style={styles.overlay}>
                  <Badge label={programLabel(item.program)} tone={item.program === "english" ? "warning" : "brand"} />
                  <Txt variant="heading" style={{ color: colors.onSurfaceInverse, marginTop: space.sm, fontSize: 20 }}>{item.name}</Txt>
                  <Txt style={{ color: colors.onSurfaceInverse, opacity: 0.85 }}>
                    {item.schedule} · {item.student_count} siswa
                  </Txt>
                </View>
              </Pressable>
            </Animated.View>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: { paddingHorizontal: space.lg, paddingBottom: space.sm, backgroundColor: c.surfaceSecondary },
  card: { height: 150, borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.surfaceInverse },
  img: { ...({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const) },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, top: 0 },
  overlay: { flex: 1, justifyContent: "flex-end", padding: space.lg },
}));
