import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";

import { useAuth } from "@/src/auth";
import { fonts } from "@/src/components/ui";
import { useTheme } from "@/src/theme";

export default function TabsLayout() {
  const { user, ready } = useAuth();
  const { colors } = useTheme();
  if (ready && !user) return <Redirect href="/login" />;
  const isFinance = user?.role === "keuangan";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Beranda",
          tabBarButtonTestID: "tab-beranda",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="presensi"
        options={{
          title: "Presensi",
          tabBarButtonTestID: "tab-presensi",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "checkbox" : "checkbox-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="siswa"
        options={{
          title: "Siswa",
          tabBarButtonTestID: "tab-siswa",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "people" : "people-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tagihan"
        options={{
          title: "Tagihan",
          href: isFinance ? undefined : null,
          tabBarButtonTestID: "tab-tagihan",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "wallet" : "wallet-outline"} size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
