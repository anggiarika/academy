import { Redirect } from "expo-router";

import { useAuth } from "@/src/auth";
import { CenterState } from "@/src/components/ui";

export default function Index() {
  const { user, ready } = useAuth();
  if (!ready) return <CenterState kind="loading" testID="app-loading" />;
  return <Redirect href={user ? "/(tabs)" : "/login"} />;
}
