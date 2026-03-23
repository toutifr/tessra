import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import { Square, SquareStatus, STATUS_COLORS } from "../../src/types/square";
import { Publication } from "../../src/types/square";
import CountdownTimer from "../../src/components/CountdownTimer";
import { getSquarePrice, trackDemand } from "../../src/lib/pricing";
import ReportButton from "../../src/components/ReportButton";

const STATUS_LABELS: Record<SquareStatus, string> = {
  libre: "Libre",
  occupe_gratuit: "Occupé (gratuit)",
  occupe_payant: "Occupé (payant)",
  en_expiration: "En expiration",
  remplacable: "Remplaçable",
  signale: "Signalé",
  en_moderation: "En modération",
  bloque: "Bloqué",
};

export default function SquareDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [square, setSquare] = useState<Square | null>(null);
  const [publication, setPublication] = useState<Publication | null>(null);
  const [loading, setLoading] = useState(true);
  const [dynamicPrice, setDynamicPrice] = useState<number | null>(null);
  const [isHighDemand, setIsHighDemand] = useState(false);

  useEffect(() => {
    loadSquare();
  }, [id]);

  const loadSquare = async () => {
    setLoading(true);
    const { data: squareData, error: squareError } = await supabase
      .from("squares")
      .select("*")
      .eq("id", id)
      .single();

    if (squareError || !squareData) {
      setLoading(false);
      return;
    }

    setSquare(squareData as Square);

    if (squareData.current_publication_id) {
      const { data: pubData } = await supabase
        .from("publications")
        .select("*")
        .eq("id", squareData.current_publication_id)
        .single();

      if (pubData) setPublication(pubData as Publication);
    }

    // Track view demand and fetch dynamic price
    trackDemand(squareData.id, "view").catch(() => {});
    try {
      const priceInfo = await getSquarePrice(squareData.id);
      setDynamicPrice(priceInfo.price);
      setIsHighDemand(priceInfo.is_high_demand);
    } catch {
      // Fall back to base price
    }

    setLoading(false);
  };

  const handleAction = () => {
    if (!square) return;

    switch (square.status) {
      case "libre":
      case "remplacable":
        router.push(`/upload?squareId=${square.id}`);
        break;
      case "occupe_gratuit":
      case "occupe_payant":
      case "en_expiration":
        trackDemand(square.id, "takeover_attempt").catch(() => {});
        Alert.alert("Bientôt", "L'achat in-app sera disponible prochainement.");
        break;
      default:
        break;
    }
  };

  const getActionLabel = (status: SquareStatus): string | null => {
    switch (status) {
      case "libre":
        return "Publier";
      case "remplacable":
        return "Prendre cette place";
      case "en_expiration":
        return "Prolonger";
      case "occupe_gratuit":
      case "occupe_payant":
        return "Prendre cette place";
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!square) {
    return (
      <View style={styles.loading}>
        <Text>Carré introuvable</Text>
      </View>
    );
  }

  const actionLabel = getActionLabel(square.status);
  const displayPrice = dynamicPrice ?? square.base_price;
  const isReported = square.status === "signale" || square.status === "en_moderation";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {publication?.image_url && (
        <View>
          <Image
            source={{ uri: publication.image_url }}
            style={[styles.image, isReported && styles.blurredImage]}
            resizeMode="cover"
            blurRadius={isReported ? 20 : 0}
          />
          {isReported && (
            <View style={styles.reportedOverlay}>
              <Text style={styles.reportedText}>Contenu signalé</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.statusBadge}>
        <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[square.status] }]} />
        <Text style={styles.statusText}>{STATUS_LABELS[square.status]}</Text>
      </View>

      {publication && <CountdownTimer expiresAt={publication.expires_at} />}

      {isHighDemand && (
        <View style={styles.demandBadge}>
          <Text style={styles.demandText}>Ce carré est très demandé</Text>
        </View>
      )}

      {displayPrice > 0 && (
        <View style={styles.priceContainer}>
          <Text style={styles.priceLabel}>Prix actuel</Text>
          <Text style={styles.price}>{displayPrice.toFixed(2)} $</Text>
        </View>
      )}

      {actionLabel && (
        <Pressable style={styles.actionButton} onPress={handleAction}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      )}

      {publication && !isReported && (
        <ReportButton publicationId={publication.id} squareId={square.id} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  image: { width: "100%", height: 300, borderRadius: 12, marginBottom: 16 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  statusText: { fontSize: 16, fontWeight: "600" },
  demandBadge: {
    backgroundColor: "#FFF8E1",
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FFD54F",
  },
  demandText: { color: "#F57F17", fontSize: 14, fontWeight: "600" },
  priceContainer: {
    backgroundColor: "#f8f8f8",
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    alignItems: "center",
  },
  priceLabel: { fontSize: 12, color: "#666", marginBottom: 4 },
  price: { fontSize: 24, fontWeight: "bold" },
  actionButton: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginTop: 20,
  },
  actionText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  blurredImage: { opacity: 0.5 },
  reportedOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  reportedText: { color: "#FF3B30", fontSize: 18, fontWeight: "bold" },
});
