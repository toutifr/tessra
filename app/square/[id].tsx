import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Location from "expo-location";
import { supabase, getCachedUser } from "../../src/lib/supabase";
import { Square, SquareStatus, STATUS_COLORS, Shield } from "../../src/types/square";
import { Publication } from "../../src/types/square";
import ReportButton from "../../src/components/ReportButton";
import IconLabel from "../../src/components/IconLabel";
import PressableScale from "../../src/components/PressableScale";
import { DetailSkeleton } from "../../src/components/Skeleton";
import { useVote } from "../../src/hooks/useVote";
import { useShield } from "../../src/hooks/useShield";
import { useFollow } from "../../src/hooks/useFollow";
import { minTakePrice, rushPrice, tesselsToEur } from "../../src/constants/iap";
import { fortifySquare, friendlyGameError, getGameState, GameState, InsufficientTesselsError, reviveSquare } from "../../src/lib/economy";
import { useSWR } from "../../src/lib/swr";
import { track } from "../../src/lib/track";
import { hapticLight, hapticSuccess } from "../../src/lib/haptics";
import { sectorLabel } from "../../src/lib/sector";
import { useThemeColors, fonts, spacing, radii, shadows, palette } from "../../src/theme";

/** Fraîcheur d'une case d'après sa dernière activité */
type Freshness = { icon: keyof typeof Ionicons.glyphMap; label: string };
const FRESH_ALIVE: Freshness = { icon: "flame", label: "Alive" };
function freshness(lastActivityAt: string): Freshness {
  const days = (Date.now() - new Date(lastActivityAt).getTime()) / 86_400_000;
  if (days < 3) return FRESH_ALIVE;
  if (days <= 7) return { icon: "flame-outline", label: "Fading" };
  return { icon: "snow", label: "Cold" };
}

const STATUS_LABELS: Record<SquareStatus, string> = {
  libre: "Free",
  occupe: "Taken",
  signale: "Reported",
  bloque: "Blocked",
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
  const [fortifying, setFortifying] = useState(false);
  const [reviving, setReviving] = useState(false);
  const [justRevived, setJustRevived] = useState(false);
  const [shieldOpen, setShieldOpen] = useState(false);
  const [fortifyOpen, setFortifyOpen] = useState(false);
  const c = useThemeColors();

  // Game state partagé en cache — pas de round-trip si déjà chaud
  const { data: gameState } = useSWR<GameState>("gameState", getGameState, 30000);
  const rushActive = gameState?.rush_active ?? false;

  const { vote, voting } = useVote();
  const { activateShield, getActiveShield, activating } = useShield();
  const { follow, unfollow, isFollowing, loading: followLoading } = useFollow();

  useEffect(() => {
    loadSquare();
    loadCurrentUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadCurrentUser = async () => {
    const { data: { user } } = await getCachedUser();
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

        const { data: { user } } = await getCachedUser();
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

  const getBasePrice = (sq: Square): number => {
    return minTakePrice(sq.last_price ?? 0);
  };

  /** Prix effectif — remisé pendant le Rush Hour */
  const getMinPrice = (sq: Square): number => {
    const base = getBasePrice(sq);
    return rushActive ? rushPrice(base) : base;
  };

  const handleAction = () => {
    if (!square) return;
    if (activeShield) {
      Alert.alert("Protected", `This tile is protected until ${new Date(activeShield.expires_at).toLocaleTimeString()}`);
      return;
    }
    if (square.status === "libre") {
      router.push(`/upload?squareId=${square.id}`);
    } else if (square.status === "occupe") {
      // On passe le prix de base : upload.tsx applique lui-même la remise rush
      router.push(`/upload?squareId=${square.id}&replace=true&minPrice=${getBasePrice(square)}`);
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
      Alert.alert("Shield activated!", `Your tile is protected.`);
      const shield = await getActiveShield(square.id);
      setActiveShield(shield);
      setShieldOpen(false);
    } else {
      Alert.alert("Shield unavailable", "Could not activate the shield. Please try again.");
    }
  };

  const handleFortify = async (amount: number) => {
    if (!square || !currentUserId) return;
    setFortifying(true);
    try {
      const newPrice = await fortifySquare(square.id, currentUserId, amount);
      hapticSuccess();
      setSquare({ ...square, last_price: newPrice });
      track("fortify", { square_id: square.id, amount });
    } catch (e) {
      if (e instanceof InsufficientTesselsError) {
        router.push(`/paywall?need=${e.need - e.have}`);
      } else {
        console.error("fortify failed:", e);
        Alert.alert("Fortify failed", friendlyGameError(e, "fortify"));
      }
    } finally {
      setFortifying(false);
    }
  };

  const handleRevive = async () => {
    if (!square || !currentUserId || reviving) return;
    setReviving(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location required", "Enable location to revive your tile on site.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const res = await reviveSquare(
        currentUserId,
        square.id,
        loc.coords.latitude,
        loc.coords.longitude,
      );
      hapticSuccess();
      const nowIso = new Date().toISOString();
      setSquare({
        ...square,
        last_revived_at: res.revived_at ?? nowIso,
        last_activity_at: nowIso,
      });
      track("revive", { square_id: square.id, reward: res.reward });
      setJustRevived(true);
      Alert.alert("Revived", `+${res.reward} ⬡ — tile revived!`);
    } catch (e) {
      console.error("revive failed:", e);
      Alert.alert("Revive failed", friendlyGameError(e, "revive"));
    } finally {
      setReviving(false);
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

  const isOwner = publication && currentUserId && publication.user_id === currentUserId;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <DetailSkeleton />
      </View>
    );
  }

  if (!square) {
    return (
      <View style={[styles.loading, { backgroundColor: c.bg }]}>
        <Text style={{ color: c.textSecondary }}>Tile not found</Text>
      </View>
    );
  }

  const isReported = square.status === "signale";
  const minPrice = getMinPrice(square);
  const freshDays =
    (Date.now() - new Date(square.last_activity_at).getTime()) / 86_400_000;
  const needsRevive = !justRevived && freshDays >= 3;

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.bg }]} contentContainerStyle={styles.content}>
      {/* 1. Photo — avec badges ⚡ / bouclier */}
      {publication?.image_url && (
        <View style={styles.imageWrapper}>
          <Image
            source={{ uri: publication.image_url }}
            style={[styles.image, isReported && styles.blurredImage]}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            blurRadius={isReported ? 20 : 0}
          />
          {isReported && (
            <View style={[styles.reportedOverlay, { backgroundColor: c.overlay }]}>
              <Text style={styles.reportedText}>Reported content</Text>
            </View>
          )}
          {publication.is_pulse && (
            <View style={styles.pulseBadge}>
              <Ionicons name="flash" size={14} color="#FFFFFF" />
            </View>
          )}
          {activeShield && (
            <View style={styles.shieldPhotoBadge}>
              <Ionicons
                name="shield"
                size={14}
                color={
                  activeShield.tier === "gold"
                    ? palette.gold
                    : activeShield.tier === "silver"
                      ? palette.silver
                      : palette.bronze
                }
              />
            </View>
          )}
        </View>
      )}

      {/* Vote + follow — juste sous la photo, jamais enterrés */}
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
            <Ionicons
              name={hasVoted ? "heart" : "heart-outline"}
              size={18}
              color={hasVoted ? c.primary : c.textSecondary}
            />
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
                {isFollowingOwner ? "Following" : "Follow"}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/* 2. Secteur + statut + fraîcheur */}
      {square.cell_id ? (
        <Text style={[styles.sectorText, { color: c.textTertiary }]}>
          {sectorLabel(square.cell_id)}
        </Text>
      ) : null}
      <View style={styles.statusRow}>
        <View style={[styles.statusBadge, { backgroundColor: c.bgTertiary }]}>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[square.status] }]} />
          <Text style={[styles.statusText, { color: c.text }]}>
            {STATUS_LABELS[square.status]}
          </Text>
        </View>
        {square.status === "occupe" && (() => {
          const f = justRevived ? FRESH_ALIVE : freshness(square.last_activity_at);
          return (
            <IconLabel
              icon={f.icon}
              label={f.label}
              color={c.textSecondary}
              size={14}
              gap={4}
              textStyle={styles.freshnessLine}
            />
          );
        })()}
      </View>

      {/* 3. UN SEUL CTA principal, selon qui regarde */}
      {isOwner && square.status === "occupe" ? (
        <View style={styles.ctaBlock}>
          {needsRevive ? (
            <>
              <PressableScale
                style={[
                  styles.actionButton,
                  { backgroundColor: palette.warning, opacity: reviving ? 0.7 : 1 },
                  shadows.md,
                ]}
                onPress={handleRevive}
                disabled={reviving}
              >
                <IconLabel
                  icon="flame"
                  label={reviving ? "Reviving…" : "Revive"}
                  color="#FFFFFF"
                  size={16}
                  textStyle={styles.actionText}
                />
              </PressableScale>
              <Text style={[styles.ctaNote, { color: c.textTertiary }]}>
                Be here in person to reset freshness (+5 ⬡)
              </Text>
            </>
          ) : (
            <View style={[styles.actionButton, styles.revivedState, { backgroundColor: c.bgTertiary }]}>
              <IconLabel
                icon="checkmark-circle"
                label="Revived — your tile is alive"
                color={c.textSecondary}
                size={16}
                textStyle={styles.actionText}
              />
            </View>
          )}
        </View>
      ) : !isOwner && square.status === "libre" ? (
        <View style={styles.ctaBlock}>
          <PressableScale
            style={[styles.actionButton, { backgroundColor: c.primary }, shadows.md]}
            onPress={handleAction}
          >
            <IconLabel
              icon="camera"
              label="Claim this tile — Free"
              color={c.primaryText}
              size={16}
              textStyle={styles.actionText}
            />
          </PressableScale>
          <Text style={[styles.ctaNote, { color: c.textTertiary }]}>
            You must be physically here
          </Text>
        </View>
      ) : !isOwner && square.status === "occupe" ? (
        <View style={styles.ctaBlock}>
          <PressableScale
            style={[
              styles.actionButton,
              { backgroundColor: activeShield ? c.bgTertiary : c.primary },
              !activeShield && shadows.md,
            ]}
            onPress={handleAction}
            disabled={!!activeShield}
          >
            {activeShield ? (
              <IconLabel
                icon="shield"
                label="Tile protected"
                color={c.textTertiary}
                size={16}
                textStyle={styles.actionText}
              />
            ) : (
              <Text style={[styles.actionText, { color: c.primaryText }]}>
                {`Take over — ${minPrice} ⬡`}
              </Text>
            )}
          </PressableScale>
          {activeShield ? (
            <Text style={[styles.ctaNote, { color: c.textTertiary }]}>
              Protected until {new Date(activeShield.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          ) : (
            <>
              <Text style={[styles.ctaNote, { color: c.textTertiary }]}>
                {tesselsToEur(minPrice)}
                {square.last_price > 0 ? ` · Last price: ${square.last_price} ⬡` : ""}
              </Text>
              {rushActive && (
                <View style={styles.rushPriceRow}>
                  <Text style={[styles.oldPrice, { color: c.textTertiary }]}>
                    {getBasePrice(square)} ⬡
                  </Text>
                  <View style={styles.rushBadge}>
                    <Ionicons name="flame" size={11} color="#fff" />
                    <Text style={styles.rushBadgeText}>Rush Hour −50%</Text>
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      ) : null}

      {/* 4. Défense (owner) — Shield + Fortify, repliés derrière des accordéons */}
      {isOwner && square.status === "occupe" && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Defend</Text>

          {/* 🛡 Shield */}
          {activeShield ? (
            <View style={[styles.defendRow, { backgroundColor: c.card, borderColor: c.cardBorder }, shadows.sm]}>
              <Ionicons name="shield" size={18} color={c.text} style={styles.defendIcon} />
              <View style={styles.shieldInfo}>
                <Text style={[styles.shieldOptionTitle, { color: c.text }]}>
                  Shield active ({activeShield.tier === "gold" ? "Gold" : activeShield.tier === "silver" ? "Silver" : "Bronze"})
                </Text>
                <Text style={[styles.shieldOptionDesc, { color: c.textTertiary }]}>
                  Untouchable until {new Date(activeShield.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            </View>
          ) : (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.defendRow,
                  { backgroundColor: c.card, borderColor: c.cardBorder, opacity: pressed ? 0.85 : 1 },
                  shadows.sm,
                ]}
                onPress={() => { hapticLight(); setShieldOpen((v) => !v); }}
              >
                <Ionicons name="shield-outline" size={18} color={c.text} style={styles.defendIcon} />
                <View style={styles.shieldInfo}>
                  <Text style={[styles.shieldOptionTitle, { color: c.text }]}>Shield</Text>
                  <Text style={[styles.shieldOptionDesc, { color: c.textTertiary }]}>
                    Block takeovers for a few hours
                  </Text>
                </View>
                <Ionicons
                  name={shieldOpen ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={c.textTertiary}
                />
              </Pressable>
              {shieldOpen && (
                <View style={[styles.shieldOptions, { marginTop: spacing.sm, marginBottom: spacing.sm }]}>
                  {([
                    { tier: "bronze" as const, label: "Bronze", desc: "1h — Free (1/day)", color: palette.bronze },
                    { tier: "silver" as const, label: "Silver", desc: "6h — 150 ⬡", color: palette.silver },
                    { tier: "gold" as const, label: "Gold", desc: "24h — 500 ⬡", color: palette.gold },
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
              )}
            </>
          )}

          {/* 💪 Fortify */}
          {square.last_price < 10000 && (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.defendRow,
                  { backgroundColor: c.card, borderColor: c.cardBorder, opacity: pressed ? 0.85 : 1, marginTop: spacing.sm },
                  shadows.sm,
                ]}
                onPress={() => { hapticLight(); setFortifyOpen((v) => !v); }}
              >
                <Ionicons name="trending-up" size={18} color={c.text} style={styles.defendIcon} />
                <View style={styles.shieldInfo}>
                  <Text style={[styles.shieldOptionTitle, { color: c.text }]}>Fortify</Text>
                  <Text style={[styles.shieldOptionDesc, { color: c.textTertiary }]}>
                    Raise the takeover price — now {square.last_price} ⬡, attackers pay ≥ {minTakePrice(square.last_price)} ⬡
                  </Text>
                </View>
                <Ionicons
                  name={fortifyOpen ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={c.textTertiary}
                />
              </Pressable>
              {fortifyOpen && (
                <View style={[styles.shieldOptions, { marginTop: spacing.sm }]}>
                  {[100, 500, 1000].map((amount) => (
                    <Pressable
                      key={amount}
                      style={({ pressed }) => [
                        styles.shieldOption,
                        { backgroundColor: c.card, borderColor: c.cardBorder, opacity: pressed || fortifying ? 0.85 : 1 },
                        shadows.sm,
                      ]}
                      onPress={() => handleFortify(amount)}
                      disabled={fortifying}
                    >
                      <View style={[styles.shieldDot, { backgroundColor: palette.gold }]} />
                      <View style={styles.shieldInfo}>
                        <Text style={[styles.shieldOptionTitle, { color: c.text }]}>+{amount} ⬡</Text>
                        <Text style={[styles.shieldOptionDesc, { color: c.textTertiary }]}>
                          {tesselsToEur(amount)} — min. takeover {minTakePrice(Math.min(10000, square.last_price + amount))} ⬡
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      )}

      {/* Publication History */}
      {history.length > 1 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>
            History ({history.length})
          </Text>
          {history.map((pub) => (
            <View
              key={pub.id}
              style={[styles.historyItem, { borderBottomColor: c.separator }]}
            >
              {pub.image_url && (
                <Image
                  source={{ uri: pub.image_url }}
                  style={styles.historyThumb}
                  contentFit="cover"
                  transition={150}
                  cachePolicy="memory-disk"
                  recyclingKey={pub.id}
                />
              )}
              <View style={styles.historyInfo}>
                <Text style={[styles.historyStatus, { color: c.text }]}>
                  {pub.status === "active" ? "Current" : "Replaced"}
                </Text>
                <Text style={[styles.historyDate, { color: c.textTertiary }]}>
                  {new Date(pub.created_at).toLocaleDateString("en-US")}
                </Text>
              </View>
              <Text style={[styles.historyPrice, { color: c.primary }]}>
                {pub.price_paid ? `${pub.price_paid} ⬡` : "Free"}
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
  pulseBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#4F46E5",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#818CF8",
  },
  shieldPhotoBadge: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },

  ctaBlock: {
    marginBottom: spacing.lg,
    alignItems: "center",
  },
  ctaNote: {
    fontSize: fonts.sizes.xs,
    marginTop: spacing.sm,
    textAlign: "center",
    paddingHorizontal: spacing.base,
  },
  revivedState: { marginBottom: 0 },

  defendRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  defendIcon: { marginRight: spacing.md },
  freshnessLine: {
    fontSize: fonts.sizes.sm,
    fontWeight: fonts.weights.semibold,
  },
  reviveButton: {
    borderRadius: radii.full,
    padding: spacing.base,
    alignItems: "center",
  },

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
  rushPriceRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, marginTop: spacing.sm,
  },
  oldPrice: {
    fontSize: fonts.sizes.md,
    fontWeight: fonts.weights.semibold,
    textDecorationLine: "line-through",
  },
  rushBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FF6B35",
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  rushBadgeText: { color: "#fff", fontSize: fonts.sizes.xs, fontWeight: fonts.weights.bold },
  priceDetail: { fontSize: fonts.sizes.xs, marginTop: spacing.xs },

  actionButton: {
    alignSelf: "stretch",
    marginHorizontal: spacing.base, borderRadius: radii.full,
    padding: spacing.base, alignItems: "center",
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
