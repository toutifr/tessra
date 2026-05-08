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

const { width } = Dimensions.get("window");

interface OnboardingPage {
  title: string;
  description: string;
}

const pages: OnboardingPage[] = [
  {
    title: "Le monde est votre toile",
    description:
      "Tessra divise le monde en carrés géographiques. Chaque carré peut contenir une seule image, visible par tous tant que personne ne la remplace.",
  },
  {
    title: "Publiez, explorez, remplacez",
    description:
      "Trouvez un carré libre, publiez votre photo gratuitement. Quelqu'un veut prendre votre place ? Il devra payer. Plus un carré change de main, plus le prix monte.",
  },
  {
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

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setCurrentIndex(index);
  };

  const isLastPage = currentIndex === pages.length - 1;

  return (
    <View style={styles.container}>
      <Pressable style={styles.skipButton} onPress={onComplete}>
        <Text style={styles.skipText}>Passer</Text>
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
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {pages.map((_, i) => (
            <View key={i} style={[styles.dot, i === currentIndex && styles.activeDot]} />
          ))}
        </View>

        {isLastPage && (
          <Pressable style={styles.ctaButton} onPress={onComplete}>
            <Text style={styles.ctaText}>Commencer</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  skipButton: { position: "absolute", top: 60, right: 24, zIndex: 1 },
  skipText: { color: "#999", fontSize: 16 },
  page: { width, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 },
  title: { fontSize: 28, fontWeight: "bold", textAlign: "center", marginBottom: 16 },
  description: { fontSize: 16, color: "#666", textAlign: "center", lineHeight: 24 },
  footer: { paddingBottom: 60, alignItems: "center" },
  dots: { flexDirection: "row", marginBottom: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ddd", marginHorizontal: 4 },
  activeDot: { backgroundColor: "#007AFF", width: 24 },
  ctaButton: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 48,
  },
  ctaText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
