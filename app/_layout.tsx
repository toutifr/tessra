import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { AuthProvider, useAuth } from "../src/providers/AuthProvider";
import { useOnboarding } from "../src/hooks/useOnboarding";
import OnboardingScreen from "../src/components/OnboardingScreen";
import { registerForPushNotifications } from "../src/lib/notifications";

function RootLayoutInner() {
  const { session, loading } = useAuth();
  const { hasCompletedOnboarding, completeOnboarding } = useOnboarding();

  // Register push notifications when user is authenticated
  useEffect(() => {
    if (session) {
      registerForPushNotifications().catch(() => {});
    }
  }, [session]);

  if (loading || hasCompletedOnboarding === null) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!hasCompletedOnboarding) {
    return <OnboardingScreen onComplete={completeOnboarding} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" redirect={!session} />
      <Stack.Screen name="(auth)" redirect={!!session} />
      <Stack.Screen
        name="square/[id]"
        options={{ presentation: "modal", headerShown: true, title: "" }}
      />
      <Stack.Screen
        name="upload"
        options={{ presentation: "modal", headerShown: true, title: "Publier" }}
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
