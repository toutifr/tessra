import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../../src/lib/supabase";

interface HistoryEntry {
  id: string;
  image_url: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  acquisition_mode: string;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  expired: "Expiré",
  replaced: "Remplacé",
  deleted: "Supprimé",
};

const MODE_LABELS: Record<string, string> = {
  free: "Gratuit",
  paid: "Payant",
  replaced: "Remplacement",
};

type FilterType = "all" | "active" | "expired" | "replaced";

export default function HistoryScreen() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");

  const loadHistory = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    let query = supabase
      .from("publication_history")
      .select("id, image_url, started_at, ended_at, status, acquisition_mode")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false });

    if (filter !== "all") {
      query = query.eq("status", filter);
    }

    const { data } = await query;
    setEntries((data as HistoryEntry[]) ?? []);
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    loadHistory().finally(() => setLoading(false));
  }, [loadHistory]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filters: { key: FilterType; label: string }[] = [
    { key: "all", label: "Tout" },
    { key: "active", label: "Actif" },
    { key: "expired", label: "Expiré" },
    { key: "replaced", label: "Remplacé" },
  ];

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mes publications</Text>

      <View style={styles.filterRow}>
        {filters.map((f) => (
          <Pressable
            key={f.key}
            style={[styles.filterButton, filter === f.key && styles.filterActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Aucune publication</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Image source={{ uri: item.image_url }} style={styles.thumbnail} />
            <View style={styles.cardInfo}>
              <Text style={styles.cardStatus}>{STATUS_LABELS[item.status] ?? item.status}</Text>
              <Text style={styles.cardMode}>{MODE_LABELS[item.acquisition_mode] ?? item.acquisition_mode}</Text>
              <Text style={styles.cardDate}>{formatDate(item.started_at)}</Text>
              {item.ended_at && (
                <Text style={styles.cardDate}>Fin: {formatDate(item.ended_at)}</Text>
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", padding: 16, paddingTop: 60 },
  filterRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  filterButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#f0f0f0",
  },
  filterActive: { backgroundColor: "#007AFF" },
  filterText: { fontSize: 14, color: "#666" },
  filterTextActive: { color: "#fff" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  emptyText: { color: "#999", fontSize: 16 },
  card: {
    flexDirection: "row",
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: "#f8f8f8",
  },
  thumbnail: { width: 64, height: 64, borderRadius: 8, marginRight: 12 },
  cardInfo: { flex: 1, justifyContent: "center" },
  cardStatus: { fontSize: 16, fontWeight: "600", marginBottom: 2 },
  cardMode: { fontSize: 13, color: "#666", marginBottom: 4 },
  cardDate: { fontSize: 12, color: "#999" },
});
