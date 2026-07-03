import { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useThemeColors, fonts, spacing, radii } from "../theme";

const { width } = Dimensions.get("window");

interface OnboardingPage {
  title: string;
  description: string;
  emoji: string;
}

const pages: OnboardingPage[] = [
  {
    emoji: "🗺️",
    title: "Le monde est votre toile",
    description:
      "Tessra divise le monde en carrés géographiques. Chaque carré peut contenir une seule image, visible par tous tant que personne ne la remplace.",
  },
  {
    emoji: "📸",
    title: "Publiez, explorez, remplacez",
    description:
      "Trouvez un carré libre, publiez votre photo gratuitement. Quelqu'un veut prendre votre place ? Il devra payer. Plus un carré change de main, plus le prix monte.",
  },
  {
    emoji: "🚀",
    title: "Prêt à marquer votre territoire ?",
    description: "Explorez la carte autour de vous et publiez votre première image.",
  },
];

interface Props {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const c = useThemeColors();

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setCurrentIndex(index);
  };

  const isLastPage = currentIndex === pages.length - 1;

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <Pressable style={styles.skipButton} onPress={onComplete}>
        <Text style={[styles.skipText, { color: c.textTertiary }]}>Passer</Text>
      </Pressable>

      <FlatList
        ref={flatListRef}
        data={pages}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={styles.page}>
            <Text style={styles.emoji}>{item.emoji}</Text>
            <Text style={[styles.title, { color: c.text }]}>{item.title}</Text>
            <Text style={[styles.description, { color: c.textSecondary }]}>{item.description}</Text>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {pages.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === currentIndex ? c.primary : c.border },
                i === currentIndex && styles.activeDot,
              ]}
            />
          ))}
        </View>

        {isLastPage && (
          <Pressable
            style={({ pressed }) => [
              styles.ctaButton,
              { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={onComplete}
          >
            <Text style={[styles.ctaText, { color: c.primaryText }]}>Commencer</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  skipButton: { position: "absolute", top: 60, right: spacing.xl, zIndex: 1 },
  skipText: { fontSize: fonts.sizes.base },
  page: {
    width,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xxxl,
  },
  emoji: { fontSize: 56, marginBottom: spacing.lg },
  title: {
    fontSize: fonts.sizes.xxl,
    fontWeight: fonts.weights.bold,
    textAlign: "center",
    marginBottom: spacing.base,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: fonts.sizes.base,
    textAlign: "center",
    lineHeight: fonts.sizes.base * fonts.lineHeights.relaxed,
  },
  footer: { paddingBottom: 60, alignItems: "center" },
  dots: { flexDirection: "row", marginBottom: spacing.xl },
  dot: {
    width: 8, height: 8, borderRadius: 4, marginHorizontal: spacing.xs,
  },
  activeDot: { width: 24, borderRadius: 12 },
  ctaButton: {
    borderRadius: radii.md,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.xxxl + spacing.base,
  },
  ctaText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
});
