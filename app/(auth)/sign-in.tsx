import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link, router } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import {
  signInWithApple,
  signInWithGoogle,
  isAppleSignInAvailable,
} from "../../src/lib/auth-providers";
import { useThemeColors, fonts, spacing, radii } from "../../src/theme";

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const c = useThemeColors();

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      console.error("sign in failed:", error.message);
      Alert.alert(
        "Sign in failed",
        /invalid/i.test(error.message)
          ? "Wrong email or password. Please try again."
          : "Could not sign you in. Please try again.",
      );
    } else {
      router.replace("/(tabs)");
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setLoading(true);
      await signInWithApple();
      router.replace("/(tabs)");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Apple Sign-In failed";
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
    }
  };

  const handleGuestSignIn = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      router.replace("/(tabs)");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Guest sign-in unavailable";
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      await signInWithGoogle();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Google Sign-In failed";
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <Text style={[styles.brand, { color: c.primary }]}>tessra</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>Sign in to your account</Text>

        <TextInput
          style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text }]}
          placeholder="Email"
          placeholderTextColor={c.textTertiary}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <TextInput
          style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text }]}
          placeholder="Password"
          placeholderTextColor={c.textTertiary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
        />

        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: c.primary, opacity: pressed || loading ? 0.85 : 1 },
          ]}
          onPress={handleSignIn}
          disabled={loading}
        >
          <Text style={[styles.buttonText, { color: c.primaryText }]}>
            {loading ? "Signing in..." : "Sign in"}
          </Text>
        </Pressable>

        <View style={styles.divider}>
          <View style={[styles.dividerLine, { backgroundColor: c.separator }]} />
          <Text style={[styles.dividerText, { color: c.textTertiary }]}>or</Text>
          <View style={[styles.dividerLine, { backgroundColor: c.separator }]} />
        </View>

        {isAppleSignInAvailable() && (
          <Pressable
            style={({ pressed }) => [
              styles.socialButton,
              { backgroundColor: c.text, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={handleAppleSignIn}
            disabled={loading}
          >
            <Text style={[styles.socialText, { color: c.bg }]}>Continue with Apple</Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.socialButton,
            { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={handleGoogleSignIn}
          disabled={loading}
        >
          <Text style={[styles.socialText, { color: c.text }]}>Continue with Google</Text>
        </Pressable>

        <Pressable style={styles.link} onPress={handleGuestSignIn} disabled={loading}>
          <Text style={[styles.linkText, { color: c.textTertiary }]}>Continue as guest</Text>
        </Pressable>

        <Link href="/(auth)/sign-up" asChild>
          <Pressable style={styles.link}>
            <Text style={[styles.linkText, { color: c.primary }]}>
              No account yet? <Text style={styles.linkBold}>Sign up</Text>
            </Text>
          </Pressable>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.xl },
  brand: {
    fontSize: fonts.sizes.xxxl,
    fontWeight: fonts.weights.heavy,
    textAlign: "center",
    marginBottom: spacing.xs,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: fonts.sizes.md,
    textAlign: "center",
    marginBottom: spacing.xxxl,
  },
  input: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.base,
    fontSize: fonts.sizes.base,
    marginBottom: spacing.md,
  },
  button: {
    borderRadius: radii.md,
    padding: spacing.base,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  buttonText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.xl,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth * 2 },
  dividerText: { marginHorizontal: spacing.base, fontSize: fonts.sizes.sm },
  socialButton: {
    borderRadius: radii.md,
    padding: spacing.base,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  socialText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
  link: { marginTop: spacing.lg, alignItems: "center" },
  linkText: { fontSize: fonts.sizes.sm },
  linkBold: { fontWeight: fonts.weights.semibold },
});
