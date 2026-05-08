import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import ReportButton from "../../src/components/ReportButton";

const STATUS_LABELS: Record<SquareStatus, string> = {
  libre: "Libre",
  occupe: "Occupé",
  signale: "Signalé",
  bloque: "Bloqué",
};

export default function SquareDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [square, setSquare] = useState<Square | null>(null);
  const [publication, setPublication] = useState<Publication | null>(null);
  const [loading, setLoading] = useState(true);

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

    setLoading(false);
  };

  const getMinPrice = (sq: Square): number => {
    return sq.replacement_count;
  };

  const handleAction = () => {
    if (!square) return;

    if (square.status === "libre") {
      router.push(`/upload?squareId=${square.id}`);
    } else if (square.status === "occupe") {
      const minPrice = getMinPrice(square);
      router.push(`/upload?squareId=${square.id}&replace=true&minPrice=${minPrice}`);
    }
  };

  const getActionLabel = (sq: Square): string | null => {
    switch (sq.status) {
      case "libre":
        return "Publier gratuitement";
      case "occupe": {
        const minPrice = getMinPrice(sq);
        return `Prendre cette place — ${minPrice}€ minimum`;
      }
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

  const actionLabel = getActionLabel(square);
  const isReported = square.status === "signale";
  const minPrice = getMinPrice(square);

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

      <View style={styles.priceContainer}>
        <Text style={styles.priceLabel}>
          {square.status === "libre" ? "Publication" : "Prix minimum pour remplacer"}
        </Text>
        <Text style={styles.price}>
          {square.status === "libre" ? "Gratuit" : `${minPrice}€`}
        </Text>
        {square.last_price > 0 && (
          <Text style={styles.lastPrice}>Dernier prix payé : {square.last_price}€</Text>
        )}
      </View>

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
  priceContainer: {
    backgroundColor: "#f8f8f8",
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    alignItems: "center",
  },
  priceLabel: { fontSize: 12, color: "#666", marginBottom: 4 },
  price: { fontSize: 24, fontWeight: "bold" },
  lastPrice: { fontSize: 12, color: "#999", marginTop: 4 },
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
