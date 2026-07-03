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
import { Square, SquareStatus, STATUS_COLORS, Shield } from "../../src/types/square";
import { Publication } from "../../src/types/square";
import ReportButton from "../../src/components/ReportButton";
import { useVote } from "../../src/hooks/useVote";
import { useShield } from "../../src/hooks/useShield";
import { useFollow } from "../../src/hooks/useFollow";
import { minTakePrice, tesselsToEur } from "../../src/constants/iap";
import { hapticLight } from "../../src/lib/haptics";
import { sectorLabel } from "../../src/lib/sector";
import { useThemeColors, fonts, spacing, radii, shadows, palette } from "../../src/theme";

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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [voteCount, setVoteCount] = useState(0);
  const [activeShield, setActiveShield] = useState<Shield | null>(null);
  const [isFollowingOwner, setIsFollowingOwner] = useState(false);
  const [history, setHistory] = useState<Publication[]>([]);
  const c = useThemeColors();

  const { vote, voting } = useVote();
  const { activateShield, getActiveShield, activating } = useShield();
  const { follow, unfollow, isFollowing, loading: followLoading } = useFollow();

  useEffect(() => {
    loadSquare();
    loadCurrentUser();
  }, [id]);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);
  };

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

    const shield = await getActiveShield(id!);
    setActiveShield(shield);

    if (squareData.current_publication_id) {
      const { data: pubData } = await supabase
        .from("publications")
        .select("*")
        .eq("id", squareData.current_publication_id)
        .single();

      if (pubData) {
        setPublication(pubData as Publication);
        setVoteCount(pubData.vote_count ?? 0);

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: voteData } = await supabase
            .from("votes")
            .select("id")
            .eq("user_id", user.id)
            .eq("publication_id", pubData.id)
            .maybeSingle();
          setHasVoted(!!voteData);

          if (pubData.user_id && pubData.user_id !== user.id) {
            const following = await isFollowing(pubData.user_id);
            setIsFollowingOwner(following);
          }
        }
      }
    }

    const { data: histData } = await supabase
      .from("publications")
      .select("*")
      .eq("square_id", id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (histData) setHistory(histData as Publication[]);

    setLoading(false);
  };

  const getMinPrice = (sq: Square): number => {
    return minTakePrice(sq.last_price ?? 0);
  };

  const handleAction = () => {
    if (!square) return;
    if (activeShield) {
      Alert.alert("Protégée", `Cette case est protégée jusqu'à ${new Date(activeShield.expires_at).toLocaleTimeString()}`);
      return;
    }
    if (square.status === "libre") {
      router.push(`/upload?squareId=${square.id}`);
    } else if (square.status === "occupe") {
      const minPrice = getMinPrice(square);
      router.push(`/upload?squareId=${square.id}&replace=true&minPrice=${minPrice}`);
    }
  };

  const handleVote = async () => {
    if (!publication || hasVoted) return;
    hapticLight();
    const success = await vote(publication.id);
    if (success) {
      setHasVoted(true);
      setVoteCount((prev) => prev + 1);
    }
  };

  const handleShield = async (tier: "bronze" | "silver" | "gold") => {
    if (!square) return;
    const result = await activateShield(square.id, tier);
    if (result) {
      Alert.alert("Bouclier activé !", `Votre case est protégée.`);
      const shield = await getActiveShield(square.id);
      setActiveShield(shield);
    } else {
      Alert.alert("Erreur", "Impossible d'activer le bouclier.");
    }
  };

  const handleFollow = async () => {
    if (!publication) return;
    if (isFollowingOwner) {
      await unfollow(publication.user_id);
      setIsFollowingOwner(false);
    } else {
      await follow(publication.user_id);
      setIsFollowingOwner(true);
    }
  };

  const getActionLabel = (sq: Square): string | null => {
    if (activeShield) return "Case protégée";
    switch (sq.status) {
      case "libre":
        return "Publier gratuitement";
      case "occupe": {
        const price = getMinPrice(sq);
        return `Prendre cette place — ${price} ⬡`;
      }
      default:
        return null;
    }
  };

  const isOwner = publication && currentUserId && publication.user_id === currentUserId;

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  if (!square) {
    return (
      <View style={[styles.loading, { backgroundColor: c.bg }]}>
        <Text style={{ color: c.textSecondary }}>Case introuvable</Text>
      </View>
    );
  }

  const actionLabel = getActionLabel(square);
  const isReported = square.status === "signale";
  const minPrice = getMinPrice(square);

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.bg }]} contentContainerStyle={styles.content}>
      {/* Hero Image */}
      {publication?.image_url && (
        <View style={styles.imageWrapper}>
          <Image
            source={{ uri: publication.image_url }}
            style={[styles.image, isReported && styles.blurredImage]}
            resizeMode="cover"
            blurRadius={isReported ? 20 : 0}
          />
          {isReported && (
            <View style={[styles.reportedOverlay, { backgroundColor: c.overlay }]}>
              <Text style={styles.reportedText}>Contenu signalé</Text>
            </View>
          )}
        </View>
      )}

      {/* Secteur */}
      {square.cell_id ? (
        <Text style={[styles.sectorText, { color: c.textTertiary }]}>
          {sectorLabel(square.cell_id)}
        </Text>
      ) : null}

      {/* Status + Shield */}
      <View style={styles.statusRow}>
        <View style={[styles.statusBadge, { backgroundColor: c.bgTertiary }]}>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[square.status] }]} />
          <Text style={[styles.statusText, { color: c.text }]}>
            {STATUS_LABELS[square.status]}
          </Text>
        </View>
        {activeShield && (
          <View style={[styles.shieldBadge, { backgroundColor: `${palette.warning}20` }]}>
            <Text style={styles.shieldEmoji}>
              {activeShield.tier === "gold" ? "🥇" : activeShield.tier === "silver" ? "🥈" : "🥉"}
            </Text>
            <Text style={[styles.shieldText, { color: palette.warning }]}>
              {activeShield.tier === "gold" ? "Or" : activeShield.tier === "silver" ? "Argent" : "Bronze"}
            </Text>
          </View>
        )}
      </View>

      {/* Interactions: vote + follow */}
      {publication && !isReported && (
        <View style={styles.interactionRow}>
          <Pressable
            style={({ pressed }) => [
              styles.interactionButton,
              {
                backgroundColor: hasVoted ? c.primarySoft : c.bgTertiary,
                borderColor: hasVoted ? c.primary : "transparent",
                borderWidth: hasVoted ? 1 : 0,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            onPress={handleVote}
            disabled={voting || hasVoted}
          >
            <Text style={styles.interactionIcon}>{hasVoted ? "❤️" : "🤍"}</Text>
            <Text style={[styles.interactionLabel, { color: hasVoted ? c.primary : c.textSecondary }]}>
              {voteCount}
            </Text>
          </Pressable>

          {publication.user_id !== currentUserId && (
            <Pressable
              style={({ pressed }) => [
                styles.followChip,
                {
                  backgroundColor: isFollowingOwner ? c.primary : "transparent",
                  borderColor: c.primary,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              onPress={handleFollow}
              disabled={followLoading}
            >
              <Text style={[
                styles.followLabel,
                { color: isFollowingOwner ? c.primaryText : c.primary },
              ]}>
                {isFollowingOwner ? "Suivi" : "Suivre"}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Price Card */}
      <View style={[styles.priceCard, { backgroundColor: c.bgSecondary, borderColor: c.cardBorder }, shadows.sm]}>
        <Text style={[styles.priceLabel, { color: c.textSecondary }]}>
          {square.status === "libre" ? "Publication" : "Prix minimum"}
        </Text>
        <Text style={[styles.price, { color: c.text }]}>
          {square.status === "libre" ? "Gratuit" : `${minPrice} ⬡`}
        </Text>
        {square.status !== "libre" && (
          <Text style={[styles.priceDetail, { color: c.textTertiary }]}>
            {tesselsToEur(minPrice)}
          </Text>
        )}
        {square.last_price > 0 && (
          <Text style={[styles.priceDetail, { color: c.textTertiary }]}>
            Dernier prix : {square.last_price} ⬡
          </Text>
        )}
      </View>

      {/* Action Button */}
      {actionLabel && (
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: activeShield ? c.bgTertiary : c.primary,
              opacity: pressed ? 0.85 : 1,
            },
            !activeShield && shadows.md,
          ]}
          onPress={handleAction}
          disabled={!!activeShield}
        >
          <Text style={[
            styles.actionText,
            { color: activeShield ? c.textTertiary : c.primaryText },
          ]}>
            {actionLabel}
          </Text>
        </Pressable>
      )}

      {/* Shield Activation (owner) */}
      {isOwner && !activeShield && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Protéger cette case</Text>
          <View style={styles.shieldOptions}>
            {([
              { tier: "bronze" as const, label: "Bronze", desc: "1h — Gratuit (1/jour)", color: palette.bronze },
              { tier: "silver" as const, label: "Argent", desc: "6h — 150 ⬡", color: palette.silver },
              { tier: "gold" as const, label: "Or", desc: "24h — 500 ⬡", color: palette.gold },
            ]).map((opt) => (
              <Pressable
                key={opt.tier}
                style={({ pressed }) => [
                  styles.shieldOption,
                  { backgroundColor: c.card, borderColor: c.cardBorder, opacity: pressed ? 0.85 : 1 },
                  shadows.sm,
                ]}
                onPress={() => handleShield(opt.tier)}
                disabled={activating}
              >
                <View style={[styles.shieldDot, { backgroundColor: opt.color }]} />
                <View style={styles.shieldInfo}>
                  <Text style={[styles.shieldOptionTitle, { color: c.text }]}>{opt.label}</Text>
                  <Text style={[styles.shieldOptionDesc, { color: c.textTertiary }]}>{opt.desc}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Publication History */}
      {history.length > 1 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>
            Historique ({history.length})
          </Text>
          {history.map((pub) => (
            <View
              key={pub.id}
              style={[styles.historyItem, { borderBottomColor: c.separator }]}
            >
              {pub.image_url && (
                <Image source={{ uri: pub.image_url }} style={styles.historyThumb} />
              )}
              <View style={styles.historyInfo}>
                <Text style={[styles.historyStatus, { color: c.text }]}>
                  {pub.status === "active" ? "Actuelle" : "Remplacée"}
                </Text>
                <Text style={[styles.historyDate, { color: c.textTertiary }]}>
                  {new Date(pub.created_at).toLocaleDateString("fr-FR")}
                </Text>
              </View>
              <Text style={[styles.historyPrice, { color: c.primary }]}>
                {pub.price_paid ? `${pub.price_paid} ⬡` : "Gratuit"}
              </Text>
            </View>
          ))}
        </View>
      )}

      {publication && !isReported && (
        <ReportButton publicationId={publication.id} squareId={square.id} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 40 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },

  imageWrapper: { position: "relative" },
  image: { width: "100%", height: 320, marginBottom: spacing.base },
  blurredImage: { opacity: 0.5 },
  reportedOverlay: {
    ...StyleSheet.absoluteFillObject,
    marginBottom: spacing.base,
    justifyContent: "center", alignItems: "center",
    borderRadius: 0,
  },
  reportedText: { color: "#fff", fontSize: fonts.sizes.lg, fontWeight: fonts.weights.bold },

  sectorText: {
    fontSize: fonts.sizes.sm,
    fontWeight: fonts.weights.semibold,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  statusRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.base, marginBottom: spacing.md,
  },
  statusBadge: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    borderRadius: radii.full,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.sm },
  statusText: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold },
  shieldBadge: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    borderRadius: radii.full,
  },
  shieldEmoji: { fontSize: 14, marginRight: spacing.xs },
  shieldText: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold },

  interactionRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.base, marginBottom: spacing.base,
  },
  interactionButton: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderRadius: radii.full,
  },
  interactionIcon: { fontSize: 18 },
  interactionLabel: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold },
  followChip: {
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderRadius: radii.full, borderWidth: 1.5,
  },
  followLabel: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold },

  priceCard: {
    marginHorizontal: spacing.base, borderRadius: radii.md,
    padding: spacing.base, alignItems: "center",
    marginBottom: spacing.base, borderWidth: 1,
  },
  priceLabel: { fontSize: fonts.sizes.xs, marginBottom: spacing.xs },
  price: { fontSize: fonts.sizes.xxl, fontWeight: fonts.weights.heavy },
  priceDetail: { fontSize: fonts.sizes.xs, marginTop: spacing.xs },

  actionButton: {
    marginHorizontal: spacing.base, borderRadius: radii.md,
    padding: spacing.base, alignItems: "center",
    marginBottom: spacing.lg,
  },
  actionText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },

  section: { paddingHorizontal: spacing.base, marginBottom: spacing.lg },
  sectionTitle: {
    fontSize: fonts.sizes.lg, fontWeight: fonts.weights.bold,
    marginBottom: spacing.md,
  },

  shieldOptions: { gap: spacing.sm },
  shieldOption: {
    flexDirection: "row", alignItems: "center",
    padding: spacing.md, borderRadius: radii.md, borderWidth: 1,
  },
  shieldDot: { width: 12, height: 12, borderRadius: 6, marginRight: spacing.md },
  shieldInfo: { flex: 1 },
  shieldOptionTitle: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
  shieldOptionDesc: { fontSize: fonts.sizes.xs, marginTop: 2 },

  historyItem: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyThumb: { width: 44, height: 44, borderRadius: radii.sm },
  historyInfo: { flex: 1 },
  historyStatus: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold },
  historyDate: { fontSize: fonts.sizes.xs, marginTop: 2 },
  historyPrice: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold },
});
