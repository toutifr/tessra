import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Location from "expo-location";
import { supabase, getCachedUser } from "../../src/lib/supabase";
import { Square, SquareStatus, STATUS_COLORS, Shield } from "../../src/types/square";
import { Publication } from "../../src/types/square";
import ReportButton from "../../src/components/ReportButton";
import IconLabel from "../../src/components/IconLabel";
import PressableScale from "../../src/components/PressableScale";
import Avatar from "../../src/components/Avatar";
import GameButton from "../../src/components/GameButton";
import SectionHeader from "../../src/components/SectionHeader";
import StatChip from "../../src/components/StatChip";
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
import { focusOnMap } from "../../src/lib/mapFocus";
import { useThemeColors, fonts, spacing, radii, palette } from "../../src/theme";

/** Fraîcheur d'une case d'après sa dernière activité */
type Freshness = { icon: keyof typeof Ionicons.glyphMap; label: string; color: string };
const FRESH_ALIVE: Freshness = { icon: "flame", label: "Alive", color: palette.amber };
function freshness(lastActivityAt: string): Freshness {
  const days = (Date.now() - new Date(lastActivityAt).getTime()) / 86_400_000;
  if (days < 3) return FRESH_ALIVE;
  if (days <= 7) return { icon: "flame-outline", label: "Fading", color: palette.amber };
  return { icon: "snow", label: "Cold", color: palette.diamond };
}

/** "3m ago" / "5h ago" / "2d ago" — visuel uniquement */
function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

const STATUS_LABELS: Record<SquareStatus, string> = {
  libre: "Free",
  occupe: "Taken",
  signale: "Reported",
  bloque: "Blocked",
};

const STATUS_ICONS: Record<SquareStatus, keyof typeof Ionicons.glyphMap> = {
  libre: "sparkles",
  occupe: "flag",
  signale: "alert-circle",
  bloque: "ban",
};

// Scrim bas de la photo hero — bandes rgba empilées (faux dégradé)
const SCRIM_BANDS = [
  "rgba(0,0,0,0.06)",
  "rgba(0,0,0,0.16)",
  "rgba(0,0,0,0.30)",
  "rgba(0,0,0,0.44)",
  "rgba(0,0,0,0.55)",
] as const;

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
  const fresh = justRevived ? FRESH_ALIVE : freshness(square.last_activity_at);

  return (
    <>
      {/* Locate — icône dans le header de la modal */}
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => {
                focusOnMap({ lat: square.lat, lng: square.lng });
                router.push("/(tabs)");
              }}
              hitSlop={10}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              accessibilityLabel="Locate on map"
            >
              <Ionicons name="locate" size={22} color={c.text} />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={[styles.container, { backgroundColor: c.bg }]} contentContainerStyle={styles.content}>
        {/* 1. Photo HERO — carte de collection : scrim bas + avatar + badges */}
        {publication?.image_url && (
          <View style={styles.heroWrap}>
            <Image
              source={{ uri: publication.image_url }}
              style={[styles.heroImage, isReported && styles.blurredImage]}
              contentFit="cover"
              transition={150}
              cachePolicy="memory-disk"
              blurRadius={isReported ? 20 : 0}
            />
            {!isReported && (
              <View style={styles.scrim} pointerEvents="none">
                {SCRIM_BANDS.map((band) => (
                  <View key={band} style={[styles.scrimBand, { backgroundColor: band }]} />
                ))}
              </View>
            )}
            {!isReported && (
              <View style={styles.heroRow}>
                <Avatar userId={publication.user_id} size={32} />
                <View style={styles.heroText}>
                  <Text style={styles.heroName} numberOfLines={1}>
                    {isOwner ? "Your tile" : "Current holder"}
                  </Text>
                  <Text style={styles.heroTime}>{timeAgo(publication.created_at)}</Text>
                </View>
              </View>
            )}
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

        {/* 2. Rangée de stats — prix, statut, fraîcheur, secteur */}
        <View style={styles.chipsRow}>
          <StatChip
            icon="pricetag"
            value={square.last_price > 0 ? `${square.last_price} ⬡` : "Free"}
            color={palette.gold}
          />
          <StatChip
            icon={STATUS_ICONS[square.status]}
            value={STATUS_LABELS[square.status]}
            color={STATUS_COLORS[square.status]}
          />
          {square.status === "occupe" && (
            <StatChip icon={fresh.icon} value={fresh.label} color={fresh.color} />
          )}
          {square.cell_id ? (
            <StatChip icon="location" value={sectorLabel(square.cell_id)} color={palette.diamond} />
          ) : null}
        </View>

        {/* Vote + follow — jamais enterrés */}
        {publication && !isReported && (
          <View style={styles.interactionRow}>
            <PressableScale
              style={[
                styles.interactionButton,
                {
                  backgroundColor: hasVoted ? "rgba(228,97,79,0.14)" : c.bgTertiary,
                  borderColor: hasVoted ? palette.redstone : "transparent",
                  borderWidth: hasVoted ? 1 : 0,
                },
              ]}
              onPress={handleVote}
              disabled={voting || hasVoted}
            >
              <Ionicons
                name={hasVoted ? "heart" : "heart-outline"}
                size={18}
                color={hasVoted ? palette.redstone : c.textSecondary}
              />
              <Text style={[styles.interactionLabel, { color: hasVoted ? palette.redstone : c.textSecondary }]}>
                {voteCount}
              </Text>
            </PressableScale>

            {publication.user_id !== currentUserId && (
              <PressableScale
                style={[
                  styles.followChip,
                  {
                    backgroundColor: isFollowingOwner ? c.primary : "transparent",
                    borderColor: c.primary,
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
              </PressableScale>
            )}
          </View>
        )}

        {/* 3. UN SEUL CTA principal, selon qui regarde */}
        {isOwner && square.status === "occupe" ? (
          <View style={styles.ctaBlock}>
            {needsRevive ? (
              <>
                <GameButton
                  icon="flame"
                  label="Revive"
                  sub="Be here in person — +5 ⬡"
                  variant="primary"
                  loading={reviving}
                  onPress={handleRevive}
                />
                <Text style={[styles.ctaNote, { color: c.textTertiary }]}>
                  Being on site resets freshness
                </Text>
              </>
            ) : (
              <View style={[styles.revivedState, { backgroundColor: c.bgTertiary }]}>
                <IconLabel
                  icon="checkmark-circle"
                  label="Revived — your tile is alive"
                  color={c.textSecondary}
                  size={16}
                  textStyle={styles.revivedText}
                />
              </View>
            )}
          </View>
        ) : !isOwner && square.status === "libre" ? (
          <View style={styles.ctaBlock}>
            <GameButton
              icon="camera"
              label="Claim this tile"
              sub="Free — you must be physically here"
              variant="primary"
              onPress={handleAction}
            />
          </View>
        ) : !isOwner && square.status === "occupe" ? (
          <View style={styles.ctaBlock}>
            {activeShield ? (
              <>
                <GameButton
                  icon="shield"
                  label="Tile protected"
                  variant="dark"
                  disabled
                  onPress={handleAction}
                />
                <Text style={[styles.ctaNote, { color: c.textTertiary }]}>
                  Protected until {new Date(activeShield.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </>
            ) : (
              <>
                <GameButton
                  icon="flag"
                  label={`Take over — ${minPrice} ⬡`}
                  sub={`${tesselsToEur(minPrice)}${square.last_price > 0 ? ` · Last price ${square.last_price} ⬡` : ""}`}
                  variant="gold"
                  onPress={handleAction}
                />
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
            <View style={styles.sectionHeader}>
              <SectionHeader title="Defend" color={palette.redstone} />
            </View>

            {/* 🛡 Shield */}
            {activeShield ? (
              <View style={[styles.defendRow, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
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
                  <View style={styles.optionList}>
                    {([
                      { tier: "bronze" as const, label: "Bronze", desc: "1h — Free (1/day)" },
                      { tier: "silver" as const, label: "Silver", desc: "6h — 150 ⬡" },
                      { tier: "gold" as const, label: "Gold", desc: "24h — 500 ⬡" },
                    ]).map((opt) => (
                      <GameButton
                        key={opt.tier}
                        size="md"
                        variant="ghost"
                        label={opt.label}
                        sub={opt.desc}
                        disabled={activating}
                        onPress={() => handleShield(opt.tier)}
                      />
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
                  <View style={styles.optionList}>
                    {[100, 500, 1000].map((amount) => (
                      <GameButton
                        key={amount}
                        size="md"
                        variant="ghost"
                        label={`+${amount} ⬡`}
                        sub={`${tesselsToEur(amount)} — min. takeover ${minTakePrice(Math.min(10000, square.last_price + amount))} ⬡`}
                        disabled={fortifying}
                        onPress={() => handleFortify(amount)}
                      />
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* Publication History — timeline */}
        {history.length > 1 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <SectionHeader title={`History (${history.length})`} color={palette.gold} />
            </View>
            {history.map((pub, i) => (
              <View key={pub.id} style={styles.historyItem}>
                <View style={styles.timelineCol}>
                  <View
                    style={[
                      styles.timelineDot,
                      {
                        backgroundColor:
                          pub.status === "active"
                            ? palette.grass
                            : pub.price_paid
                              ? palette.gold
                              : palette.gray500,
                      },
                    ]}
                  />
                  {i < history.length - 1 && (
                    <View style={[styles.timelineLine, { backgroundColor: c.separator }]} />
                  )}
                </View>
                <Avatar userId={pub.user_id} size={24} />
                <View style={styles.historyInfo}>
                  <Text style={[styles.historyStatus, { color: c.text }]}>
                    {pub.status === "active" ? "Current" : "Replaced"}
                  </Text>
                  <Text style={[styles.historyDate, { color: c.textTertiary }]}>
                    {new Date(pub.created_at).toLocaleDateString("en-US")}
                  </Text>
                </View>
                <Text style={[styles.historyPrice, { color: pub.price_paid ? palette.goldDark : c.textSecondary }]}>
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
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: spacing.md, paddingBottom: 40 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },

  // ─── Hero "carte de collection" ───
  heroWrap: {
    position: "relative",
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
    borderRadius: radii.xl,
    overflow: "hidden",
  },
  heroImage: { width: "100%", aspectRatio: 4 / 3 },
  blurredImage: { opacity: 0.5 },
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 110,
  },
  scrimBand: { flex: 1 },
  heroRow: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    padding: spacing.md,
  },
  heroText: { flex: 1 },
  heroName: {
    color: "#FFFFFF",
    fontSize: fonts.sizes.base,
    fontWeight: fonts.weights.bold,
  },
  heroTime: {
    color: "rgba(255,255,255,0.75)",
    fontSize: fonts.sizes.xs,
    fontWeight: fonts.weights.semibold,
    marginTop: 1,
  },
  reportedOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center", alignItems: "center",
  },
  reportedText: { color: "#fff", fontSize: fonts.sizes.lg, fontWeight: fonts.weights.bold },
  pulseBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.diamondDark,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.diamondLight,
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

  // ─── Stats ───
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.base,
  },

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

  // ─── CTA ───
  ctaBlock: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.xl,
  },
  ctaNote: {
    fontSize: fonts.sizes.xs,
    marginTop: spacing.sm,
    textAlign: "center",
    paddingHorizontal: spacing.base,
  },
  revivedState: {
    borderRadius: radii.lg,
    padding: spacing.base,
    alignItems: "center",
  },
  revivedText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
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
    backgroundColor: palette.amber,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  rushBadgeText: { color: "#fff", fontSize: fonts.sizes.xs, fontWeight: fonts.weights.bold },

  // ─── Sections ───
  section: { paddingHorizontal: spacing.base, marginBottom: spacing.xl },
  sectionHeader: { marginBottom: spacing.md },

  defendRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.base,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  defendIcon: { marginRight: spacing.md },
  optionList: { gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.sm },
  shieldInfo: { flex: 1 },
  shieldOptionTitle: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
  shieldOptionDesc: { fontSize: fonts.sizes.xs, marginTop: 2 },

  // ─── History timeline ───
  historyItem: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  timelineCol: { width: 12, alignItems: "center", alignSelf: "stretch" },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: spacing.md },
  timelineLine: { flex: 1, width: 2, borderRadius: 1, marginTop: 2 },
  historyInfo: { flex: 1 },
  historyStatus: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold },
  historyDate: { fontSize: fonts.sizes.xs, marginTop: 2 },
  historyPrice: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.bold },
});
