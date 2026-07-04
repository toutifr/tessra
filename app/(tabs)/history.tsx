import { memo, useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { supabase } from "../../src/lib/supabase";
import { useSWR } from "../../src/lib/swr";
import { useAuth } from "../../src/providers/AuthProvider";
import { ListSkeleton } from "../../src/components/Skeleton";
import PressableScale from "../../src/components/PressableScale";
import { useThemeColors, fonts, spacing, radii, shadows, ThemeColors } from "../../src/theme";

interface HistoryEntry {
  id: string;
  image_url: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  acquisition_mode: string;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  replaced: "Replaced",
  deleted: "Deleted",
};

const MODE_LABELS: Record<string, string> = {
  free: "Free",
  paid: "Paid",
  replaced: "Replacement",
};

type FilterType = "all" | "active" | "replaced";

async function fetchHistory(uid: string, filter: FilterType): Promise<HistoryEntry[]> {
  // Try publication_history first
  let query = supabase
    .from("publication_history")
    .select("id, image_url, started_at, ended_at, status, acquisition_mode")
    .eq("user_id", uid)
    .order("started_at", { ascending: false });

  if (filter !== "all") {
    query = query.eq("status", filter);
  }

  const { data } = await query;
  if (data && data.length > 0) return data as HistoryEntry[];

  // Fallback: query publications directly
  let pubQuery = supabase
    .from("publications")
    .select("id, image_url, created_at, status")
    .eq("user_id", uid)
    .order("created_at", { ascending: false });

  if (filter !== "all") {
    pubQuery = pubQuery.eq("status", filter);
  }

  const { data: pubData } = await pubQuery;
  if (!pubData) return [];
  return pubData.map((p: any) => ({
    id: p.id,
    image_url: p.image_url,
    started_at: p.created_at,
    ended_at: null,
    status: p.status,
    acquisition_mode: p.price_paid ? "paid" : "free",
  }));
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const HistoryCard = memo(function HistoryCard({
  item,
  c,
}: {
  item: HistoryEntry;
  c: ThemeColors;
}) {
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }, shadows.sm]}>
      <Image
        source={{ uri: item.image_url }}
        style={styles.thumbnail}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
        recyclingKey={item.id}
      />
      <View style={styles.cardInfo}>
        <View style={styles.cardTop}>
          <Text style={[styles.cardStatus, { color: c.text }]}>
            {STATUS_LABELS[item.status] ?? item.status}
          </Text>
          <View style={[
            styles.modeBadge,
            { backgroundColor: item.status === "active" ? c.primarySoft : c.bgTertiary },
          ]}>
            <Text style={[
              styles.modeText,
              { color: item.status === "active" ? c.primary : c.textTertiary },
            ]}>
              {MODE_LABELS[item.acquisition_mode] ?? item.acquisition_mode}
            </Text>
          </View>
        </View>
        <Text style={[styles.cardDate, { color: c.textTertiary }]}>{formatDate(item.started_at)}</Text>
        {item.ended_at && (
          <Text style={[styles.cardDate, { color: c.textTertiary }]}>Ended: {formatDate(item.ended_at)}</Text>
        )}
      </View>
    </View>
  );
});

export default function HistoryScreen() {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [filter, setFilter] = useState<FilterType>("all");
  const [refreshing, setRefreshing] = useState(false);
  const c = useThemeColors();

  const key = uid ? `history:${uid}:${filter}` : null;
  const { data: entries = [], loading, refresh } = useSWR<HistoryEntry[]>(
    key,
    () => fetchHistory(uid!, filter),
    30000,
  );

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const renderItem = useCallback(
    ({ item }: { item: HistoryEntry }) => <HistoryCard item={item} c={c} />,
    [c],
  );

  const filters: { key: FilterType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "replaced", label: "Replaced" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <Text style={[styles.title, { color: c.text }]}>My publications</Text>

      <View style={styles.filterRow}>
        {filters.map((f) => (
          <Pressable
            key={f.key}
            style={[
              styles.filterButton,
              { backgroundColor: filter === f.key ? c.primary : c.bgTertiary },
            ]}
            onPress={() => setFilter(f.key)}
          >
            <Text
              style={[
                styles.filterText,
                { color: filter === f.key ? c.primaryText : c.textSecondary },
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading && entries.length === 0 ? (
        <ListSkeleton rows={6} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={renderItem}
          windowSize={7}
          maxToRenderPerBatch={6}
          initialNumToRender={8}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: c.textTertiary }]}>
                No tiles yet. Go claim your first one on the map 📸
              </Text>
              <PressableScale
                style={[styles.emptyButton, { backgroundColor: c.primary }, shadows.md]}
                onPress={() => router.push("/(tabs)")}
              >
                <Text style={[styles.emptyButtonText, { color: c.primaryText }]}>
                  Open the map
                </Text>
              </PressableScale>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: {
    fontSize: fonts.sizes.xxl,
    fontWeight: fonts.weights.bold,
    paddingHorizontal: spacing.base,
    paddingTop: 60,
    paddingBottom: spacing.base,
    letterSpacing: -0.5,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  filterButton: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.base,
    borderRadius: radii.full,
  },
  filterText: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.medium },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl },
  empty: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingTop: 60, gap: spacing.lg, paddingHorizontal: spacing.xl,
  },
  emptyText: { fontSize: fonts.sizes.base, textAlign: "center" },
  emptyButton: {
    borderRadius: radii.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  emptyButtonText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
  card: {
    flexDirection: "row",
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  thumbnail: { width: 60, height: 60, borderRadius: radii.sm, marginRight: spacing.md },
  cardInfo: { flex: 1, justifyContent: "center" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 2 },
  cardStatus: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
  modeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  modeText: { fontSize: fonts.sizes.xs, fontWeight: fonts.weights.medium },
  cardDate: { fontSize: fonts.sizes.xs, marginTop: 2 },
});
