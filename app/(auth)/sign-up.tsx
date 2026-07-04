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
import { useThemeColors, fonts, spacing, radii } from "../../src/theme";

export default function SignUpScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const c = useThemeColors();

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      console.error("sign up failed:", error.message);
      Alert.alert(
        "Sign up failed",
        /already|registered/i.test(error.message)
          ? "This email is already registered — try signing in instead."
          : "Could not create your account. Please try again.",
      );
    } else {
      Alert.alert("Success", "Check your email to confirm your account.", [
        { text: "OK", onPress: () => router.replace("/(auth)/sign-in") },
      ]);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <Text style={[styles.brand, { color: c.primary }]}>tessra</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>Create your account</Text>

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
          placeholder="Password (min. 8 characters)"
          placeholderTextColor={c.textTertiary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
        />

        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: c.primary, opacity: pressed || loading ? 0.85 : 1 },
          ]}
          onPress={handleSignUp}
          disabled={loading}
        >
          <Text style={[styles.buttonText, { color: c.primaryText }]}>
            {loading ? "Signing up..." : "Sign up"}
          </Text>
        </Pressable>

        <Link href="/(auth)/sign-in" asChild>
          <Pressable style={styles.link}>
            <Text style={[styles.linkText, { color: c.primary }]}>
              Already have an account? <Text style={styles.linkBold}>Sign in</Text>
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
  link: { marginTop: spacing.lg, alignItems: "center" },
  linkText: { fontSize: fonts.sizes.sm },
  linkBold: { fontWeight: fonts.weights.semibold },
});
