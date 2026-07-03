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
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useThemeColors, fonts, spacing, radii } from "../theme";

const { width } = Dimensions.get("window");

interface OnboardingPage {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const pages: OnboardingPage[] = [
  {
    icon: "grid-outline",
    title: "The world is a mosaic",
    description: "Every km² on Earth is a tile. One photo per tile.",
  },
  {
    icon: "location-outline",
    title: "Be there, own it",
    description: "Standing in a tile? Publish your photo for free. You have to actually be there.",
  },
  {
    icon: "shield-half-outline",
    title: "Everything can be taken",
    description:
      "Anyone can buy your tile. You get 50% back in Reis ⬡ — and you can take it back from anywhere.",
  },
  {
    icon: "sparkles-outline",
    title: "100 ⬡ free",
    description: "Enough for your first conquest.",
  },
];

interface Props {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const c = useThemeColors();

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setCurrentIndex(index);
  };

  const handleFinish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      // Demande la permission de localisation — un refus ne bloque pas
      await Location.requestForegroundPermissionsAsync();
    } catch {
      // silencieux
    }
    onComplete();
  };

  const isLastPage = currentIndex === pages.length - 1;

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <Pressable style={styles.skipButton} onPress={onComplete}>
        <Text style={[styles.skipText, { color: c.textTertiary }]}>Skip</Text>
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
            <View style={[styles.iconCircle, { backgroundColor: c.primarySoft }]}>
              <Ionicons name={item.icon} size={52} color={c.primary} />
            </View>
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
              { backgroundColor: c.primary, opacity: pressed || finishing ? 0.85 : 1 },
            ]}
            onPress={handleFinish}
            disabled={finishing}
          >
            <Text style={[styles.ctaText, { color: c.primaryText }]}>
              Place my first tile
            </Text>
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
  iconCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.xl,
  },
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
    paddingHorizontal: spacing.xxl,
  },
  ctaText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
});
