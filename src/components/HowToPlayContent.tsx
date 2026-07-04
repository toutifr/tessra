import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors, fonts, spacing, radii, shadows } from "../theme";

interface Section {
  /** Nom d'Ionicon — null = glyphe monnaie ⬡ rendu en texte */
  icon: keyof typeof Ionicons.glyphMap | null;
  title: string;
  body: string;
}

const sections: Section[] = [
  {
    icon: "map-outline",
    title: "The mosaic",
    body:
      "Earth is split into 1 km² tiles — land AND ocean. Each tile holds ONE photo. To claim a tile, you must physically be there: cities, summits, or the middle of the sea if you sail it. The world map becomes a living mosaic of everyone's photos.",
  },
  {
    icon: null,
    title: "Reis",
    body:
      "The game currency. Earn by playing: claim a tile +10, discover a new tile +5, receive a vote +2, daily streaks (+20/+50/+200), daily quests & targets, territory income. Or top up with packs. Spend on takeovers, shields, fortifying.",
  },
  {
    icon: "flag",
    title: "Taking over",
    body:
      "Any taken tile can be bought — from anywhere. Min price = last price ×1.5 (from 100 ⬡, capped at 10,000). The previous owner gets 50% back. Physically on the tile? −30% raid discount.",
  },
  {
    icon: "shield",
    title: "Defending",
    body:
      "Shields make your tile untouchable: Bronze 1h (free, 1/day), Silver 6h (150 ⬡), Gold 24h (500 ⬡). Fortify pumps the takeover price (+100/+500/+1000 ⬡). Prices decay −20%/week without attacks; a tile abandoned 60 days becomes free again.",
  },
  {
    icon: "flame",
    title: "Keep tiles alive",
    body:
      "Tiles have freshness: Alive → Fading → Cold. Return physically and revive (1×/20h, +5 ⬡) to stop decay. 3+ connected tiles = a territory: it glows gold and earns +10 ⬡/tile daily while fresh.",
  },
  {
    icon: "locate",
    title: "Daily targets",
    body:
      "Every day, 3 missions near you on the map: scout a virgin tile (+50 ⬡), revive your coldest tile (+30 ⬡), raid the nearest rival tile (−30% on site).",
  },
  {
    icon: "flash",
    title: "Events",
    body:
      "Pulse: once a day, your area gets a random 1-hour window — publications earn ×3 and a permanent lightning frame. Rush Hour: every Saturday, 1 hour at −50% on all takeovers.",
  },
  {
    icon: "trophy",
    title: "Teams",
    body:
      "Join or create a team. A weekly challenge rotates (most photos / most votes / most conquests). Monday podium: +200/+100/+50 ⬡ per member.",
  },
];

export default function HowToPlayContent() {
  const c = useThemeColors();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.bg }]}
      contentContainerStyle={styles.content}
    >
      {sections.map((s) => (
        <View
          key={s.title}
          style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }, shadows.sm]}
        >
          <View style={styles.cardHeader}>
            {s.icon ? (
              <Ionicons name={s.icon} size={20} color={c.primary} />
            ) : (
              <Text style={[styles.cardIcon, { color: c.primary }]}>⬡</Text>
            )}
            <Text style={[styles.cardTitle, { color: c.text }]}>{s.title}</Text>
          </View>
          <Text style={[styles.cardBody, { color: c.textSecondary }]}>{s.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.base, paddingBottom: spacing.xxl, gap: spacing.md },
  card: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.base,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardIcon: { fontSize: 20, fontWeight: fonts.weights.bold },
  cardTitle: { fontSize: fonts.sizes.md, fontWeight: fonts.weights.bold },
  cardBody: {
    fontSize: fonts.sizes.base,
    lineHeight: fonts.sizes.base * fonts.lineHeights.relaxed,
  },
});
