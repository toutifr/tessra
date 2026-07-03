import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { supabase, getCachedUser } from "../lib/supabase";
import { useThemeColors, fonts, spacing, radii } from "../theme";

const REASONS = [
  { key: "spam", label: "Spam" },
  { key: "explicit", label: "Inappropriate content" },
  { key: "harassment", label: "Harassment / Hate" },
  { key: "other", label: "Fraud / Other" },
] as const;

interface Props {
  publicationId: string;
  squareId?: string;
}

export default function ReportButton({ publicationId }: Props) {
  const [showReasons, setShowReasons] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const c = useThemeColors();

  const handleReport = async (reason: string) => {
    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await getCachedUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("moderation_flags").insert({
        publication_id: publicationId,
        reporter_id: user.id,
        reason,
      });

      if (error) throw error;

      Alert.alert("Report sent", "Thanks, our team will review this content.");
      setShowReasons(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to send report";
      Alert.alert("Error", message);
    } finally {
      setSubmitting(false);
    }
  };

  if (showReasons) {
    return (
      <View style={[styles.reasonsContainer, { backgroundColor: c.bgTertiary }]}>
        <Text style={[styles.reasonsTitle, { color: c.text }]}>Report reason</Text>
        {REASONS.map(({ key, label }) => (
          <Pressable
            key={key}
            style={({ pressed }) => [
              styles.reasonButton,
              { borderBottomColor: c.separator, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={() => handleReport(key)}
            disabled={submitting}
          >
            <Text style={[styles.reasonText, { color: c.text }]}>{label}</Text>
          </Pressable>
        ))}
        <Pressable style={styles.cancelButton} onPress={() => setShowReasons(false)}>
          <Text style={[styles.cancelText, { color: c.textTertiary }]}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.reportButton, { opacity: pressed ? 0.7 : 1 }]}
      onPress={() => setShowReasons(true)}
    >
      <Text style={[styles.reportText, { color: c.textTertiary }]}>Report</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  reportButton: { marginTop: spacing.lg, alignItems: "center", paddingHorizontal: spacing.base },
  reportText: { fontSize: fonts.sizes.sm },
  reasonsContainer: {
    marginTop: spacing.base, marginHorizontal: spacing.base,
    padding: spacing.base, borderRadius: radii.md,
  },
  reasonsTitle: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold, marginBottom: spacing.md },
  reasonButton: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reasonText: { fontSize: fonts.sizes.base },
  cancelButton: { paddingVertical: spacing.md, alignItems: "center" },
  cancelText: { fontSize: fonts.sizes.sm },
});
