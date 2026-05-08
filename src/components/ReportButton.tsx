import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { supabase } from "../lib/supabase";


const REASONS = [
  { key: "spam", label: "Spam" },
  { key: "explicit", label: "Contenu inapproprié" },
  { key: "harassment", label: "Harcèlement / Haine" },
  { key: "other", label: "Fraude / Autre" },
] as const;

interface Props {
  publicationId: string;
  squareId?: string;
}

export default function ReportButton({ publicationId }: Props) {
  const [showReasons, setShowReasons] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleReport = async (reason: string) => {
    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("moderation_flags").insert({
        publication_id: publicationId,
        reporter_id: user.id,
        reason,
      });

      if (error) throw error;

      Alert.alert("Signalement envoyé", "Merci, notre équipe va examiner ce contenu.");
      setShowReasons(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erreur lors du signalement";
      Alert.alert("Erreur", message);
    } finally {
      setSubmitting(false);
    }
  };

  if (showReasons) {
    return (
      <View style={styles.reasonsContainer}>
        <Text style={styles.reasonsTitle}>Raison du signalement</Text>
        {REASONS.map(({ key, label }) => (
          <Pressable
            key={key}
            style={styles.reasonButton}
            onPress={() => handleReport(key)}
            disabled={submitting}
          >
            <Text style={styles.reasonText}>{label}</Text>
          </Pressable>
        ))}
        <Pressable style={styles.cancelButton} onPress={() => setShowReasons(false)}>
          <Text style={styles.cancelText}>Annuler</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable style={styles.reportButton} onPress={() => setShowReasons(true)}>
      <Text style={styles.reportText}>Signaler</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  reportButton: { marginTop: 16, alignItems: "center" },
  reportText: { color: "#FF3B30", fontSize: 14 },
  reasonsContainer: { marginTop: 16, padding: 12, backgroundColor: "#f8f8f8", borderRadius: 8 },
  reasonsTitle: { fontSize: 16, fontWeight: "600", marginBottom: 12 },
  reasonButton: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  reasonText: { fontSize: 15 },
  cancelButton: { padding: 12, alignItems: "center" },
  cancelText: { color: "#999", fontSize: 14 },
});
