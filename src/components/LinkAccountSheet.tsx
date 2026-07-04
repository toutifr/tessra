import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import { useAuth } from "../providers/AuthProvider";
import { hapticSuccess } from "../lib/haptics";
import PressableScale from "./PressableScale";
import { useThemeColors, fonts, spacing, radii, shadows } from "../theme";

/** True when the current session belongs to an anonymous (guest) user. */
export function useIsGuest(): boolean {
  const { session } = useAuth();
  return !!session?.user?.is_anonymous;
}

interface LinkAccountSheetProps {
  visible: boolean;
  title?: string;
  onClose: () => void;
  /** Called after the account is successfully linked (before dismiss). */
  onLinked?: () => void;
}

async function linkWithProvider(provider: "google" | "apple"): Promise<void> {
  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: {
      redirectTo: "tessra://auth/callback",
      ...(provider === "google"
        ? { queryParams: { access_type: "offline", prompt: "consent" } }
        : {}),
    },
  });
  if (error) throw error;
  // In React Native the OAuth URL must be opened manually.
  if (data?.url) {
    Linking.openURL(data.url).catch(() => {});
  }
}

export default function LinkAccountSheet({
  visible,
  title = "Save your progress",
  onClose,
  onLinked,
}: LinkAccountSheetProps) {
  const [busy, setBusy] = useState(false);
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState("");
  const c = useThemeColors();
  const linkedRef = useRef(false);

  // Detect the OAuth link completing (deep link → session update).
  useEffect(() => {
    if (!visible) return;
    linkedRef.current = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && session.user.is_anonymous === false && !linkedRef.current) {
        linkedRef.current = true;
        hapticSuccess();
        supabase.auth.refreshSession().catch(() => {});
        Alert.alert("Account saved!", "Your progress is now safely linked.");
        onLinked?.();
        onClose();
      }
    });
    return () => subscription.unsubscribe();
  }, [visible, onLinked, onClose]);

  const handleProvider = async (provider: "google" | "apple") => {
    if (busy) return;
    setBusy(true);
    try {
      await linkWithProvider(provider);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not link the account";
      Alert.alert("Error", msg);
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) throw error;
      hapticSuccess();
      Alert.alert("Check your inbox", "We sent a confirmation link to finish saving your account.");
      onLinked?.();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not send the confirmation email";
      Alert.alert("Error", msg);
    } finally {
      setBusy(false);
      setEmailMode(false);
      setEmail("");
    }
  };

  const handleEmail = () => {
    if (busy) return;
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Save with email",
        "Enter your email address — we'll send you a confirmation link.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Send", onPress: (value?: string) => submitEmail(value ?? "") },
        ],
        "plain-text",
        "",
        "email-address",
      );
    } else {
      setEmailMode(true);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: c.bg }, shadows.md]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: c.separator }]} />
          <Text style={[styles.title, { color: c.text }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            Your tiles, Reis and streak are tied to this device. Link an account so you never lose
            them.
          </Text>

          {Platform.OS === "ios" && (
            <PressableScale
              style={[styles.button, { backgroundColor: c.text, opacity: busy ? 0.7 : 1 }]}
              onPress={() => handleProvider("apple")}
              disabled={busy}
            >
              <Text style={[styles.buttonText, { color: c.bg }]}> Continue with Apple</Text>
            </PressableScale>
          )}

          <PressableScale
            style={[
              styles.button,
              {
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: c.border,
                opacity: busy ? 0.7 : 1,
              },
            ]}
            onPress={() => handleProvider("google")}
            disabled={busy}
          >
            <Text style={[styles.buttonText, { color: c.text }]}>Continue with Google</Text>
          </PressableScale>

          {emailMode ? (
            <View style={styles.emailRow}>
              <TextInput
                style={[
                  styles.emailInput,
                  { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text },
                ]}
                placeholder="you@email.com"
                placeholderTextColor={c.textTertiary}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoFocus
              />
              <PressableScale
                style={[styles.emailSend, { backgroundColor: c.primary, opacity: busy ? 0.7 : 1 }]}
                onPress={() => submitEmail(email)}
                disabled={busy}
              >
                <Text style={[styles.buttonText, { color: c.primaryText }]}>Send</Text>
              </PressableScale>
            </View>
          ) : (
            <Pressable style={styles.smallLink} onPress={handleEmail} disabled={busy}>
              <Text style={[styles.smallLinkText, { color: c.primary }]}>Use email instead</Text>
            </Pressable>
          )}

          <Pressable style={styles.notNow} onPress={onClose}>
            <Text style={[styles.notNowText, { color: c.textTertiary }]}>Not now</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xl + 16,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    textAlign: "center",
    marginBottom: spacing.sm,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: fonts.sizes.sm,
    textAlign: "center",
    marginBottom: spacing.xl,
    lineHeight: fonts.sizes.sm * fonts.lineHeights.normal,
  },
  button: {
    borderRadius: radii.md,
    padding: spacing.base,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  buttonText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
  smallLink: { alignItems: "center", marginTop: spacing.sm },
  smallLinkText: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.medium },
  emailRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  emailInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: fonts.sizes.base,
  },
  emailSend: {
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
  },
  notNow: { alignItems: "center", marginTop: spacing.lg },
  notNowText: { fontSize: fonts.sizes.base },
});
