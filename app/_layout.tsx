import { useEffect } from "react";
import { ActivityIndicator, useColorScheme, View } from "react-native";
import { Stack } from "expo-router";
import { AuthProvider, useAuth } from "../src/providers/AuthProvider";
import { useOnboarding } from "../src/hooks/useOnboarding";
import OnboardingScreen from "../src/components/OnboardingScreen";
import { registerForPushNotifications } from "../src/lib/notifications";
import { useThemeColors } from "../src/theme";

function RootLayoutInner() {
  const { session, loading } = useAuth();
  const { hasCompletedOnboarding, completeOnboarding } = useOnboarding();
  const c = useThemeColors();
  const scheme = useColorScheme();

  useEffect(() => {
    if (session) {
      registerForPushNotifications().catch(() => {});
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
          title: "Publier",
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
