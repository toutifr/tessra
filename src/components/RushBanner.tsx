import { useEffect, useState } from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { getGameState, GameState } from "../lib/economy";
import { useSWR } from "../lib/swr";
import { useThemeColors, fonts, spacing, radii, shadows } from "../theme";

const RUSH_COLOR = "#FF6B35";

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Bannière Rush Hour compacte.
 * - Rush actif : bandeau chaud + countdown mm:ss.
 * - Prochain rush < 24 h : bandeau discret hh:mm.
 * - Sinon : null.
 */
export default function RushBanner({ style }: { style?: ViewStyle }) {
  const c = useThemeColors();
  // Cache partagé ("gameState") — servi instantanément, refetch en fond
  const { data, refresh } = useSWR<GameState>("gameState", getGameState, 30000);
  const state = data ?? null;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Re-fetch quand le countdown expire (fin ou début de rush)
  const expired =
    !!state &&
    ((state.rush_active && state.rush_ends_at
      ? new Date(state.rush_ends_at).getTime() - now <= 0
      : false) ||
      (!state.rush_active && new Date(state.next_rush_at).getTime() - now <= 0));

  useEffect(() => {
    if (expired) refresh();
  }, [expired, refresh]);

  if (!state) return null;

  if (state.rush_active && state.rush_ends_at) {
    const remaining = new Date(state.rush_ends_at).getTime() - now;
    if (remaining <= 0) return null;
    const mm = Math.floor(remaining / 60000);
    const ss = Math.floor((remaining % 60000) / 1000);
    return (
      <View style={[styles.banner, styles.active, shadows.md, style]}>
        <Text style={styles.activeText} numberOfLines={1}>
          🔥 Rush Hour — −50% on every takeover · ends in {pad(mm)}:{pad(ss)}
        </Text>
      </View>
    );
  }

  const untilNext = new Date(state.next_rush_at).getTime() - now;
  if (untilNext <= 0) return null;
  if (untilNext < 24 * 3600 * 1000) {
    const hh = Math.floor(untilNext / 3600000);
    const mm = Math.floor((untilNext % 3600000) / 60000);
    return (
      <View
        style={[
          styles.banner,
          { backgroundColor: c.bgSecondary, borderColor: c.cardBorder, borderWidth: 1 },
          style,
        ]}
      >
        <Text style={[styles.soonText, { color: c.textSecondary }]} numberOfLines={1}>
          🔥 Rush Hour in {pad(hh)}:{pad(mm)}
        </Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  active: { backgroundColor: RUSH_COLOR },
  activeText: {
    color: "#fff",
    fontSize: fonts.sizes.sm,
    fontWeight: fonts.weights.bold,
  },
  soonText: {
    fontSize: fonts.sizes.sm,
    fontWeight: fonts.weights.semibold,
  },
});
