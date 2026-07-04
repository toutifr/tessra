import { useEffect } from "react";
import { ActivityIndicator, useColorScheme, View } from "react-native";
import { Stack } from "expo-router";
import { AuthProvider, useAuth } from "../src/providers/AuthProvider";
import { useOnboarding } from "../src/hooks/useOnboarding";
import OnboardingScreen from "../src/components/OnboardingScreen";
import { registerForPushNotifications } from "../src/lib/notifications";
import { prefetch } from "../src/lib/swr";
import { getDailyQuests, getFeed, getGameState } from "../src/lib/economy";
import { fetchUserStats } from "../src/hooks/useUserStats";
import { useThemeColors } from "../src/theme";

function RootLayoutInner() {
  const { session, loading } = useAuth();
  const { hasCompletedOnboarding, completeOnboarding } = useOnboarding();
  const c = useThemeColors();
  const scheme = useColorScheme();

  useEffect(() => {
    if (session) {
      registerForPushNotifications().catch(() => {});
      // Préchauffage fire-and-forget : les onglets arrivent déjà chauds
      const uid = session.user.id;
      prefetch(`stats:${uid}`, () => fetchUserStats(uid), 30000);
      prefetch(`quests:${uid}`, () => getDailyQuests(uid), 60000);
      prefetch(`feed:${uid}`, () => getFeed(uid), 30000);
      prefetch("gameState", getGameState, 30000);
    }
  }, [session]);

  if (loading || hasCompletedOnboarding === null) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: c.bg }}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  if (!hasCompletedOnboarding) {
    return <OnboardingScreen onComplete={completeOnboarding} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.bg },
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="(tabs)" redirect={!session} />
      <Stack.Screen name="(auth)" redirect={!!session} />
      <Stack.Screen
        name="square/[id]"
        options={{
          presentation: "modal",
          headerShown: true,
          title: "",
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.text,
        }}
      />
      <Stack.Screen
        name="upload"
        options={{
          presentation: "modal",
          headerShown: true,
          title: "",
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.text,
        }}
      />
      <Stack.Screen
        name="how-to-play"
        options={{
          presentation: "modal",
          headerShown: true,
          title: "How to play",
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.text,
        }}
      />
      <Stack.Screen
        name="paywall"
        options={{
          presentation: "modal",
          headerShown: true,
          title: "Reis",
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.text,
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutInner />
    </AuthProvider>
  );
}
