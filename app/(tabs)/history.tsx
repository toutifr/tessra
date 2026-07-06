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
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { supabase } from "../../src/lib/supabase";
import { useSWR } from "../../src/lib/swr";
import { cellFromId } from "../../src/lib/kmGrid";
import { focusOnMap } from "../../src/lib/mapFocus";
import { useAuth } from "../../src/providers/AuthProvider";
import { ListSkeleton } from "../../src/components/Skeleton";
import GameButton from "../../src/components/GameButton";
import { TAB_BAR_SPACE } from "../../src/components/GameTabBar";
import { hapticSelection } from "../../src/lib/haptics";
import { useThemeColors, fonts, spacing, radii, edges, shadows, palette, ThemeColors } from "../../src/theme";

interface HistoryEntry {
  id: string;
  image_url: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  acquisition_mode: string;
  cell_id: string | null;
}

type FilterType = "all" | "active" | "replaced";

async function fetchHistory(uid: string, filter: FilterType): Promise<HistoryEntry[]> {
  // Try publication_history first
  let query = supabase
    .from("publication_history")
    .select("id, image_url, started_at, ended_at, status, acquisition_mode, squares(cell_id)")
    .eq("user_id", uid)
    .order("started_at", { ascending: false });

  if (filter !== "all") {
    query = query.eq("status", filter);
  }

  const { data } = await query;
  if (data && data.length > 0) {
    return (data as any[]).map((r) => ({
      id: r.id,
      image_url: r.image_url,
      started_at: r.started_at,
      ended_at: r.ended_at,
      status: r.status,
      acquisition_mode: r.acquisition_mode,
      cell_id: r.squares?.cell_id ?? null,
    }));
  }

  // Fallback: query publications directly
  let pubQuery = supabase
    .from("publications")
    .select("id, image_url, created_at, status, price_paid, squares(cell_id)")
    .eq("user_id", uid)
    .order("created_at", { ascending: false });

  if (filter !== "all") {
    pubQuery = pubQuery.eq("status", filter);
  }

  const { data: pubData } = await pubQuery;
  if (!pubData) return [];
  return (pubData as any[]).map((p) => ({
    id: p.id,
    image_url: p.image_url,
    started_at: p.created_at,
    ended_at: null,
    status: p.status,
    acquisition_mode: p.price_paid ? "paid" : "free",
    cell_id: p.squares?.cell_id ?? null,
  }));
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

/** Habillage narratif par type d'événement — purement visuel. */
function eventMeta(item: HistoryEntry): {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  title: string;
} {
  if (item.status === "replaced") {
    return {
      icon: "flash",
      tint: palette.redstone,
      title: "A rival took your tile",
    };
  }
  if (item.status === "deleted") {
    return { icon: "trash", tint: palette.gray500, title: "Photo removed" };
  }
  if (item.acquisition_mode === "paid" || item.acquisition_mode === "replaced") {
    return { icon: "flag", tint: palette.gold, title: "You conquered a tile" };
  }
  return { icon: "camera", tint: palette.grass, title: "You claimed a tile" };
}

function soft(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.16)`;
}

const HistoryCard = memo(function HistoryCard({
  item,
  c,
  onLocate,
}: {
  item: HistoryEntry;
  c: ThemeColors;
  onLocate: (cellId: string) => void;
}) {
  const meta = eventMeta(item);
  const lost = item.status === "replaced";
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }, shadows.sm]}>
      <View style={styles.cardMain}>
        <View style={[styles.pastille, { backgroundColor: soft(meta.tint) }]}>
          <Ionicons name={meta.icon} size={18} color={meta.tint} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardTitle, { color: c.text }]} numberOfLines={1}>
            {meta.title}
          </Text>
          <Text style={[styles.cardTime, { color: c.textTertiary }]}>
            {timeAgo(lost && item.ended_at ? item.ended_at : item.started_at)}
          </Text>
        </View>
        <Image
          source={{ uri: item.image_url }}
          style={styles.thumbnail}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          recyclingKey={item.id}
        />
        {!!item.cell_id && (
          <Pressable
            onPress={() => onLocate(item.cell_id!)}
            hitSlop={8}
            style={({ pressed }) => [styles.locateButton, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityLabel="Locate on map"
          >
            <Ionicons name="location-outline" size={18} color={c.textTertiary} />
          </Pressable>
        )}
      </View>
      {lost && !!item.cell_id && (
        <GameButton
          label="Strike back"
          icon="flash"
          variant="danger"
          size="md"
          onPress={() => onLocate(item.cell_id!)}
          style={styles.strikeButton}
        />
      )}
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

  const locateOnMap = useCallback((cellId: string) => {
    const cell = cellFromId(cellId);
    if (!cell) return;
    focusOnMap({ lat: cell.center.lat, lng: cell.center.lng });
    router.push("/(tabs)");
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: HistoryEntry }) => (
      <HistoryCard item={item} c={c} onLocate={locateOnMap} />
    ),
    [c, locateOnMap],
  );

  const filters: { key: FilterType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "replaced", label: "Replaced" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <Text style={[styles.title, { color: c.text }]}>History</Text>

      <View style={styles.filterRow}>
        {filters.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              style={[
                styles.filterButton,
                active
                  ? {
                      backgroundColor: palette.grass,
                      borderBottomWidth: edges.button - 1,
                      borderBottomColor: palette.grassDark,
                    }
                  : { backgroundColor: c.card, borderWidth: 1, borderColor: c.cardBorder },
              ]}
              onPress={() => {
                hapticSelection();
                setFilter(f.key);
              }}
            >
              <Text
                style={[
                  styles.filterText,
                  { color: active ? palette.white : c.textSecondary },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
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
                No tiles yet. Go claim your first one on the map
              </Text>
              <GameButton
                label="Open the map"
                icon="map"
                onPress={() => router.push("/(tabs)")}
              />
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
    fontSize: fonts.sizes.hero,
    fontWeight: fonts.weights.heavy,
    paddingHorizontal: spacing.base,
    paddingTop: 60,
    paddingBottom: spacing.base,
    letterSpacing: fonts.letterSpacing.tight,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  filterButton: {
    height: 34,
    paddingHorizontal: spacing.base,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
  },
  filterText: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.bold },
  list: { paddingHorizontal: spacing.base, paddingBottom: TAB_BAR_SPACE + spacing.base },
  empty: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingTop: 60, gap: spacing.lg, paddingHorizontal: spacing.xl,
  },
  emptyText: { fontSize: fonts.sizes.base, textAlign: "center" },

  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardMain: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pastille: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.bold },
  cardTime: { fontSize: fonts.sizes.xs, marginTop: 2, fontWeight: fonts.weights.medium },
  thumbnail: { width: 44, height: 44, borderRadius: radii.md },
  locateButton: { padding: spacing.xs },
  strikeButton: { marginTop: spacing.md },
});
