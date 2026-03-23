import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

interface Props {
  expiresAt: string;
}

function formatTime(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function CountdownTimer({ expiresAt }: Props) {
  const [remaining, setRemaining] = useState(() => new Date(expiresAt).getTime() - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(new Date(expiresAt).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const isExpiring = remaining > 0 && remaining < 3600000; // last hour

  return (
    <View style={[styles.container, isExpiring && styles.expiring]}>
      <Text style={[styles.label, isExpiring && styles.expiringText]}>
        {remaining <= 0 ? "Expiré" : "Expire dans"}
      </Text>
      {remaining > 0 && (
        <Text style={[styles.time, isExpiring && styles.expiringText]}>
          {formatTime(remaining)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  expiring: { backgroundColor: "#FFF3E0" },
  label: { fontSize: 12, color: "#666", marginBottom: 4 },
  time: { fontSize: 24, fontWeight: "bold", fontVariant: ["tabular-nums"] },
  expiringText: { color: "#FF9800" },
});
