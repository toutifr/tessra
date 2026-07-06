import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { supabase } from "../../src/lib/supabase";
import {
  claimQuest,
  createTeam,
  DailyQuest,
  FeedItem,
  getDailyQuests,
  getFeed,
  getLeaderboard,
  getTeamChallenge,
  joinTeam,
  leaveTeam,
  LeaderboardKind,
  LeaderboardRow,
  listTeams,
  TeamChallenge,
  TeamRow,
} from "../../src/lib/economy";
import { useSWR, mutate, getCached, invalidate } from "../../src/lib/swr";
import { cellFromId } from "../../src/lib/kmGrid";
import { focusOnMap } from "../../src/lib/mapFocus";
import { useAuth } from "../../src/providers/AuthProvider";
import RushBanner from "../../src/components/RushBanner";
import LinkAccountSheet, { useIsGuest } from "../../src/components/LinkAccountSheet";
import PressableScale from "../../src/components/PressableScale";
import PhotoCard from "../../src/components/PhotoCard";
import Avatar from "../../src/components/Avatar";
import GameButton from "../../src/components/GameButton";
import ProgressBar from "../../src/components/ProgressBar";
import SectionHeader from "../../src/components/SectionHeader";
import StatChip from "../../src/components/StatChip";
import { TAB_BAR_SPACE } from "../../src/components/GameTabBar";
import { FeedSkeleton, ListSkeleton } from "../../src/components/Skeleton";
import { track } from "../../src/lib/track";
import { hapticLight, hapticSelection, hapticSuccess } from "../../src/lib/haptics";
import { useThemeColors, fonts, spacing, radii, edges, shadows, palette, ThemeColors } from "../../src/theme";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const LEADERBOARD_KINDS: { kind: LeaderboardKind; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { kind: "tiles", label: "Tiles", icon: "map" },
  { kind: "votes", label: "Votes", icon: "heart" },
  { kind: "explorer", label: "Explorer", icon: "compass" },
];

// Identités d'équipe : "⬡" (glyphe monnaie, pas un emoji) + noms d'Ionicons.
// Les valeurs legacy en DB (emojis) sont rendues telles quelles par TeamGlyph.
const TEAM_GLYPHS = ["⬡", "flame", "earth", "rocket", "flash", "shield", "paw", "star"];

function TeamGlyph({ value, size, color }: { value: string; size: number; color: string }) {
  if (value in Ionicons.glyphMap) {
    return <Ionicons name={value as keyof typeof Ionicons.glyphMap} size={size} color={color} />;
  }
  return <Text style={{ fontSize: size, color }}>{value}</Text>;
}

function remainingLabel(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "ended";
  const h = Math.floor(diff / 3600000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}

interface TeamData {
  challenge: TeamChallenge;
  teams: TeamRow[];
}

// ─── Quêtes : habillage jeu ───────────────────────────────
const QUEST_TINTS = [palette.grass, palette.diamond, palette.amber];

function questIcon(key: string, label: string): keyof typeof Ionicons.glyphMap {
  const s = `${key} ${label}`.toLowerCase();
  if (/vote|heart|like/.test(s)) return "heart";
  if (/explor|scout|discover|new/.test(s)) return "compass";
  if (/take|raid|conquer|replace|steal/.test(s)) return "flag";
  if (/photo|publish|claim|post|tile/.test(s)) return "camera";
  return "sparkles";
}

function soft(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.16)`;
}

// ─── Carte du feed (memoïsée) ─────────────────────────────
const FeedRow = memo(function FeedRow({
  item,
  onVote,
  onOpen,
  onLocate,
}: {
  item: FeedItem;
  onVote: (item: FeedItem) => void;
  onOpen: (squareId: string) => void;
  onLocate: (cellId: string) => void;
}) {
  return (
    <View style={styles.feedRow}>
      <PhotoCard
        imageUrl={item.image_url}
        userName={item.username}
        userId={item.owner_id}
        timeAgo={relativeTime(item.created_at)}
        priceLabel={item.is_shielded ? undefined : `${item.min_price} ⬡`}
        votes={item.vote_count}
        voted={item.has_voted}
        onVote={() => onVote(item)}
        onLocate={() => onLocate(item.cell_id)}
        onOpen={() => onOpen(item.square_id)}
      />
      {item.is_shielded && (
        <View style={[styles.shieldBadge, { backgroundColor: soft(palette.amber) }]}>
          <Ionicons name="shield" size={11} color={palette.amber} />
          <Text style={[styles.shieldBadgeText, { color: palette.amber }]}>Protected</Text>
        </View>
      )}
    </View>
  );
});

export default function DiscoverScreen() {
  const c = useThemeColors();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [tab, setTab] = useState<"feed" | "leaderboard" | "team">("feed");

  // ─── Feed (SWR page 1 + pages suivantes locales) ────────
  const feedKey = userId ? `feed:${userId}` : null;
  const {
    data: feedPage1,
    loading: feedLoading,
    refresh: refreshFeed,
  } = useSWR<FeedItem[]>(feedKey, () => getFeed(userId!), 30000);
  const [extraPages, setExtraPages] = useState<FeedItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [endReached, setEndReached] = useState(false);

  const feed = useMemo(() => {
    const p1 = feedPage1 ?? [];
    const seen = new Set(p1.map((i) => i.publication_id));
    return [...p1, ...extraPages.filter((i) => !seen.has(i.publication_id))];
  }, [feedPage1, extraPages]);

  useEffect(() => {
    if (feedPage1 && extraPages.length === 0) setEndReached(feedPage1.length < 20);
  }, [feedPage1, extraPages.length]);

  // Préchauffe les dernières images arrivées (cache disque expo-image)
  useEffect(() => {
    if (feed.length === 0) return;
    const urls = feed.slice(-8).map((f) => f.image_url).filter(Boolean);
    try {
      Image.prefetch(urls);
    } catch {
      // silencieux
    }
  }, [feed]);

  // ─── Quêtes ─────────────────────────────────────────────
  const questsKey = userId ? `quests:${userId}` : null;
  const { data: quests = [], refresh: refreshQuests } = useSWR<DailyQuest[]>(
    questsKey,
    () => getDailyQuests(userId!),
    60000,
  );
  const [claiming, setClaiming] = useState<string | null>(null);

  // ─── Classement ─────────────────────────────────────────
  const [lbKind, setLbKind] = useState<LeaderboardKind>("tiles");
  const lbKey = tab === "leaderboard" ? `leaderboard:${lbKind}` : null;
  const { data: lbRows = [], loading: lbLoading } = useSWR<LeaderboardRow[]>(
    lbKey,
    () => getLeaderboard(lbKind),
    60000,
  );

  // ─── Team ───────────────────────────────────────────────
  const teamKey = tab === "team" && userId ? `team:${userId}` : null;
  const {
    data: teamData,
    loading: teamLoading,
    refresh: refreshTeam,
  } = useSWR<TeamData>(
    teamKey,
    async () => {
      const challenge = await getTeamChallenge(userId!);
      const teams = challenge.my_team ? [] : await listTeams();
      return { challenge, teams };
    },
    60000,
  );
  const challenge = teamData?.challenge ?? null;
  const teams = teamData?.teams ?? [];
  const [teamBusy, setTeamBusy] = useState(false);
  const [showLinkSheet, setShowLinkSheet] = useState(false);
  const isGuest = useIsGuest();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamEmoji, setTeamEmoji] = useState(TEAM_GLYPHS[0]);

  useEffect(() => {
    track("feed_open");
  }, []);

  useEffect(() => {
    if (tab === "team") track("team_challenge_view");
  }, [tab]);

  // Retour d'onglet : cache affiché instantanément, refetch silencieux derrière
  useFocusEffect(
    useCallback(() => {
      refreshFeed();
      refreshQuests();
    }, [refreshFeed, refreshQuests]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setExtraPages([]);
    await Promise.all([refreshFeed(), refreshQuests()]);
    setRefreshing(false);
  }, [refreshFeed, refreshQuests]);

  const loadMore = useCallback(async () => {
    if (!userId || loadingMore || endReached || feed.length === 0) return;
    setLoadingMore(true);
    try {
      const last = feed[feed.length - 1];
      const more = await getFeed(userId, last.created_at);
      setExtraPages((prev) => [...prev, ...more]);
      if (more.length < 20) setEndReached(true);
    } catch {
      // silencieux
    } finally {
      setLoadingMore(false);
    }
  }, [userId, loadingMore, endReached, feed]);

  /** Patch un item du feed (cache SWR + pages locales). */
  const patchFeed = useCallback(
    (pubId: string, patch: (f: FeedItem) => FeedItem) => {
      if (feedKey) {
        const cur = getCached<FeedItem[]>(feedKey);
        if (cur) mutate(feedKey, cur.map((f) => (f.publication_id === pubId ? patch(f) : f)));
      }
      setExtraPages((prev) => prev.map((f) => (f.publication_id === pubId ? patch(f) : f)));
    },
    [feedKey],
  );

  const handleVote = useCallback(
    async (item: FeedItem) => {
      if (!userId || item.has_voted || item.owner_id === userId) return;
      hapticLight();
      // Optimiste
      patchFeed(item.publication_id, (f) => ({ ...f, has_voted: true, vote_count: f.vote_count + 1 }));
      track("vote", { publication_id: item.publication_id });
      const { error } = await supabase.rpc("vote_publication", {
        p_user_id: userId,
        p_publication_id: item.publication_id,
      });
      if (error) {
        // rollback
        patchFeed(item.publication_id, (f) => ({ ...f, has_voted: false, vote_count: f.vote_count - 1 }));
      }
    },
    [userId, patchFeed],
  );

  const handleClaim = async (quest: DailyQuest) => {
    if (!userId || claiming) return;
    setClaiming(quest.key);
    try {
      await claimQuest(userId, quest.key);
      hapticSuccess();
      invalidate(`stats:${userId}`);
      invalidate(`balance:${userId}`);
      await refreshQuests();
    } catch {
      // silencieux
    } finally {
      setClaiming(null);
    }
  };

  const openSquare = useCallback((squareId: string) => {
    router.push(`/square/${squareId}`);
  }, []);

  const locateOnMap = useCallback((cellId: string) => {
    const cell = cellFromId(cellId);
    if (!cell) return;
    focusOnMap({ lat: cell.center.lat, lng: cell.center.lng });
    router.push("/(tabs)");
  }, []);

  const renderCard = useCallback(
    ({ item }: { item: FeedItem }) => (
      <FeedRow
        item={item}
        onVote={handleVote}
        onOpen={openSquare}
        onLocate={locateOnMap}
      />
    ),
    [handleVote, openSquare, locateOnMap],
  );

  const handleCreateTeam = async () => {
    const name = teamName.trim();
    if (!userId || !name || teamBusy) return;
    if (isGuest) {
      setShowLinkSheet(true);
      return;
    }
    setTeamBusy(true);
    try {
      await createTeam(userId, name, teamEmoji);
      hapticSuccess();
      track("team_create", { name, emoji: teamEmoji });
      setShowCreateForm(false);
      setTeamName("");
      await refreshTeam();
    } catch (e) {
      console.error("create team failed:", e);
      const msg = e instanceof Error ? e.message : "";
      Alert.alert(
        "Team not created",
        /duplicate|unique|exists/i.test(msg)
          ? "That name is already taken — try another one."
          : "Could not create the team. Please try again.",
      );
    } finally {
      setTeamBusy(false);
    }
  };

  const handleJoinTeam = async (team: TeamRow) => {
    if (!userId || teamBusy) return;
    if (isGuest) {
      setShowLinkSheet(true);
      return;
    }
    setTeamBusy(true);
    try {
      await joinTeam(userId, team.id);
      hapticSuccess();
      track("team_join", { team_id: team.id });
      await refreshTeam();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      Alert.alert(
        "Could not join",
        msg.includes("Already in a team")
          ? "You're already in a team. Leave it first to switch."
          : "Could not join the team. Please try again.",
      );
    } finally {
      setTeamBusy(false);
    }
  };

  const handleLeaveTeam = () => {
    if (!userId) return;
    Alert.alert("Leave team", "You'll lose your contribution to the current challenge. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          try {
            await leaveTeam(userId);
            await refreshTeam();
          } catch {
            // silencieux
          }
        },
      },
    ]);
  };

  const questsBanner =
    quests.length > 0 ? (
      <View style={styles.questsWrap}>
        <SectionHeader
          title="Daily quests"
          color={palette.gold}
          action={{ label: "Rules", onPress: () => router.push("/how-to-play") }}
        />
        <View style={{ height: spacing.md }} />
        {quests.slice(0, 3).map((q, i) => {
          const done = q.progress >= q.target;
          const tint = QUEST_TINTS[i % QUEST_TINTS.length];
          return (
            <View
              key={q.key}
              style={[
                styles.questCard,
                shadows.sm,
                { backgroundColor: c.card, borderColor: c.cardBorder },
              ]}
            >
              <View style={[styles.questPastille, { backgroundColor: soft(tint) }]}>
                <Ionicons name={questIcon(q.key, q.label)} size={20} color={tint} />
              </View>
              <View style={styles.questInfo}>
                <Text style={[styles.questLabel, { color: c.text }]} numberOfLines={1}>
                  {q.label}
                </Text>
                {!q.claimed && (
                  <ProgressBar
                    progress={q.progress / q.target}
                    color={done ? palette.gold : tint}
                    height={6}
                  />
                )}
                {q.claimed && (
                  <Text style={[styles.questDoneText, { color: c.textTertiary }]}>
                    Reward collected
                  </Text>
                )}
              </View>
              {done && !q.claimed ? (
                <GameButton
                  label={`+${q.reward} ⬡`}
                  variant="gold"
                  size="md"
                  loading={claiming === q.key}
                  disabled={!!claiming && claiming !== q.key}
                  onPress={() => handleClaim(q)}
                />
              ) : q.claimed ? (
                <Ionicons name="checkmark-circle" size={24} color={palette.grass} />
              ) : (
                <Text style={[styles.questProgress, { color: c.textSecondary }]}>
                  {`${q.progress}/${q.target}`}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    ) : null;

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      {/* Hero header */}
      <Text style={[styles.heroTitle, { color: c.text }]}>Discover</Text>

      {/* Segments — pills chunky */}
      <View style={styles.segmented}>
        {([
          { key: "feed" as const, label: "Feed" },
          { key: "leaderboard" as const, label: "Rankings" },
          { key: "team" as const, label: "Team" },
        ]).map((s) => {
          const active = tab === s.key;
          return (
            <Pressable
              key={s.key}
              style={({ pressed }) => [
                styles.segment,
                active
                  ? {
                      backgroundColor: palette.grass,
                      borderBottomWidth: pressed ? edges.button - 2 : edges.button,
                      borderBottomColor: palette.grassDark,
                      transform: [{ translateY: pressed ? 2 : 0 }],
                    }
                  : {
                      backgroundColor: c.card,
                      borderWidth: 1,
                      borderColor: c.cardBorder,
                    },
              ]}
              onPress={() => {
                hapticSelection();
                setTab(s.key);
              }}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: active ? palette.white : c.textSecondary },
                ]}
              >
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === "feed" ? (
        feedLoading && feed.length === 0 ? (
          <ScrollView>
            <RushBanner style={{ marginHorizontal: spacing.base, marginBottom: spacing.md }} />
            <FeedSkeleton />
          </ScrollView>
        ) : (
          <FlatList
            data={feed}
            keyExtractor={(item) => item.publication_id}
            renderItem={renderCard}
            windowSize={7}
            maxToRenderPerBatch={6}
            initialNumToRender={4}
            removeClippedSubviews
            ListHeaderComponent={
              <View>
                <RushBanner style={{ marginHorizontal: spacing.base, marginBottom: spacing.md }} />
                {questsBanner}
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyText, { color: c.textTertiary }]}>
                  The world is quiet… be the first to drop a photo today.
                </Text>
                <GameButton
                  label="Open the map"
                  icon="map"
                  onPress={() => router.push("/(tabs)")}
                  style={{ alignSelf: "center" }}
                />
              </View>
            }
            ListFooterComponent={
              loadingMore ? <ActivityIndicator style={{ margin: spacing.lg }} color={c.primary} /> : null
            }
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            contentContainerStyle={styles.feedContent}
          />
        )
      ) : tab === "leaderboard" ? (
        <View style={styles.leaderboardContainer}>
          {/* Sous-segments */}
          <View style={styles.lbSegments}>
            {LEADERBOARD_KINDS.map((k) => {
              const active = lbKind === k.kind;
              return (
                <Pressable
                  key={k.kind}
                  style={[
                    styles.lbSegment,
                    active
                      ? { backgroundColor: palette.grass, borderBottomWidth: 3, borderBottomColor: palette.grassDark }
                      : { backgroundColor: c.card, borderWidth: 1, borderColor: c.cardBorder },
                  ]}
                  onPress={() => {
                    hapticSelection();
                    setLbKind(k.kind);
                  }}
                >
                  <Ionicons
                    name={k.icon}
                    size={13}
                    color={active ? palette.white : c.textTertiary}
                  />
                  <Text
                    style={[
                      styles.lbSegmentText,
                      { color: active ? palette.white : c.textSecondary },
                    ]}
                  >
                    {k.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {lbLoading ? (
            <ListSkeleton rows={6} />
          ) : (
            <FlatList
              data={lbRows.slice(3)}
              keyExtractor={(row) => row.user_id}
              renderItem={({ item: row }) => (
                <LeaderboardLine row={row} isMe={row.user_id === userId} colors={c} />
              )}
              windowSize={7}
              maxToRenderPerBatch={6}
              initialNumToRender={10}
              removeClippedSubviews
              ListHeaderComponent={
                lbRows.length > 0 ? <Podium rows={lbRows} meId={userId} colors={c} /> : null
              }
              ListEmptyComponent={
                lbRows.length === 0 ? (
                  <Text style={[styles.emptyText, { color: c.textTertiary }]}>
                    The throne is still empty — claim a tile and your name starts the list.
                  </Text>
                ) : null
              }
              contentContainerStyle={styles.lbContent}
            />
          )}
        </View>
      ) : teamLoading && !challenge ? (
        <ListSkeleton rows={6} />
      ) : challenge?.my_team ? (
        // ─── Avec team ───
        <ScrollView contentContainerStyle={styles.teamContent}>
          <View
            style={[
              styles.teamCard,
              shadows.md,
              { backgroundColor: c.card, borderColor: c.cardBorder },
            ]}
          >
            <View style={styles.teamCardHeader}>
              <View style={[styles.teamGlyphPastille, { backgroundColor: soft(palette.grass) }]}>
                <TeamGlyph value={challenge.my_team.emoji} size={26} color={palette.grass} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.teamHeaderName, { color: c.text }]} numberOfLines={1}>
                  {challenge.my_team.name}
                </Text>
                <Text style={[styles.teamHeaderMeta, { color: c.textTertiary }]}>
                  {challenge.my_team.member_count} member{challenge.my_team.member_count > 1 ? "s" : ""} · rank #{challenge.my_team.rank}
                </Text>
              </View>
              <MemberStack count={challenge.my_team.member_count} teamId={challenge.my_team.team_id} border={c.card} />
            </View>

            {/* Défi de la semaine */}
            <Text style={[styles.challengeLabel, { color: c.text }]}>{challenge.label}</Text>
            <ProgressBar
              progress={
                challenge.top[0] && challenge.top[0].score > 0
                  ? challenge.my_team.score / challenge.top[0].score
                  : 0
              }
              color={palette.gold}
            />
            <View style={styles.challengeChips}>
              <StatChip icon="trophy" value={challenge.my_team.score} label="pts" color={palette.gold} />
              <StatChip icon="podium" value={`#${challenge.my_team.rank}`} color={palette.grass} />
              <StatChip icon="time" value={remainingLabel(challenge.ends_at)} color={palette.diamond} />
            </View>
            <Text style={[styles.podiumHint, { color: c.textTertiary }]}>
              Podium Monday: +200/+100/+50 ⬡ per member
            </Text>
          </View>

          {/* Top 10 */}
          <SectionHeader title="Top 10" color={palette.gold} />
          <View style={{ height: spacing.sm }} />
          {challenge.top.map((t) => {
            const isMine = t.team_id === challenge.my_team!.team_id;
            return (
              <View
                key={t.team_id}
                style={[
                  styles.teamRow,
                  { borderBottomColor: c.separator },
                  isMine && { backgroundColor: c.primarySoft, borderRadius: radii.sm },
                ]}
              >
                <Text style={[styles.lbRank, { color: t.rank <= 3 ? palette.gold : c.textSecondary }]}>
                  {t.rank}
                </Text>
                <TeamGlyph value={t.emoji} size={22} color={c.text} />
                <Text
                  style={[
                    styles.teamRowName,
                    { color: c.text, fontWeight: isMine ? fonts.weights.bold : fonts.weights.medium },
                  ]}
                  numberOfLines={1}
                >
                  {t.name}
                  {isMine ? " (your team)" : ""}
                </Text>
                <View style={styles.teamRowMembersWrap}>
                  <Text style={[styles.teamRowMembers, { color: c.textTertiary }]}>{t.member_count}</Text>
                  <Ionicons name="person" size={12} color={c.textTertiary} />
                </View>
                <StatChip icon="trophy" value={t.score} color={t.rank <= 3 ? palette.gold : palette.grass} />
              </View>
            );
          })}

          <Pressable style={styles.leaveButton} onPress={handleLeaveTeam}>
            <Text style={[styles.leaveText, { color: c.textTertiary }]}>Leave team</Text>
          </Pressable>
        </ScrollView>
      ) : (
        // ─── Sans team ───
        <ScrollView contentContainerStyle={styles.teamContent}>
          <View
            style={[
              styles.introCard,
              shadows.md,
              { backgroundColor: c.card, borderColor: c.cardBorder },
            ]}
          >
            <View style={[styles.introPastille, { backgroundColor: soft(palette.grass) }]}>
              <Text style={[styles.introGlyph, { color: palette.grass }]}>⬡</Text>
            </View>
            <Text style={[styles.introTitle, { color: c.text }]}>Join forces to fill the mosaic</Text>
            <Text style={[styles.introText, { color: c.textSecondary }]}>
              Every empire needs allies. Join a team, stack your takeovers and climb the
              weekly rankings. Podium Monday: +200/+100/+50 ⬡ per member.
            </Text>
          </View>

          {showCreateForm ? (
            <View style={[styles.createForm, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
              <TextInput
                style={[
                  styles.teamInput,
                  { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text },
                ]}
                value={teamName}
                onChangeText={setTeamName}
                placeholder="Team name"
                placeholderTextColor={c.textTertiary}
                maxLength={24}
                autoFocus
              />
              <View style={styles.emojiRow}>
                {TEAM_GLYPHS.map((e) => (
                  <Pressable
                    key={e}
                    style={[
                      styles.emojiChoice,
                      teamEmoji === e
                        ? { backgroundColor: palette.grass, borderBottomWidth: 3, borderBottomColor: palette.grassDark }
                        : { backgroundColor: c.bgTertiary },
                    ]}
                    onPress={() => setTeamEmoji(e)}
                  >
                    <TeamGlyph value={e} size={20} color={teamEmoji === e ? palette.white : c.text} />
                  </Pressable>
                ))}
              </View>
              <View style={styles.createActions}>
                <GameButton
                  label="Cancel"
                  variant="ghost"
                  size="md"
                  onPress={() => setShowCreateForm(false)}
                  style={{ flex: 1 }}
                />
                <GameButton
                  label="Create"
                  size="md"
                  loading={teamBusy}
                  disabled={teamBusy || !teamName.trim()}
                  onPress={handleCreateTeam}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : (
            <GameButton
              label="Create a team"
              icon="add-circle"
              onPress={() => setShowCreateForm(true)}
              style={{ marginBottom: spacing.lg }}
            />
          )}

          {teams.length > 0 && (
            <>
              <SectionHeader title="Join a team" />
              <View style={{ height: spacing.sm }} />
            </>
          )}
          {teams.map((t) => (
            <View key={t.id} style={[styles.teamRow, { borderBottomColor: c.separator }]}>
              <TeamGlyph value={t.emoji} size={22} color={c.text} />
              <Text style={[styles.teamRowName, { color: c.text }]} numberOfLines={1}>
                {t.name}
              </Text>
              <View style={styles.teamRowMembersWrap}>
                <Text style={[styles.teamRowMembers, { color: c.textTertiary }]}>{t.member_count}</Text>
                <Ionicons name="person" size={12} color={c.textTertiary} />
              </View>
              <GameButton
                label="Join"
                size="md"
                disabled={teamBusy}
                onPress={() => handleJoinTeam(t)}
              />
            </View>
          ))}
        </ScrollView>
      )}

      <LinkAccountSheet
        visible={showLinkSheet}
        title="Link an account to join a team"
        onClose={() => setShowLinkSheet(false)}
      />
    </View>
  );
}

// ─── Membres empilés (visuel — pas de liste membre côté client) ───
const MEMBER_TINTS = [palette.grass, palette.diamond, palette.amber, palette.redstone, palette.gold];

function MemberStack({ count, teamId, border }: { count: number; teamId: string; border: string }) {
  const shown = Math.min(count, 4);
  return (
    <View style={styles.memberStack}>
      {Array.from({ length: shown }).map((_, i) => (
        <View
          key={`${teamId}-${i}`}
          style={[
            styles.memberDot,
            { backgroundColor: MEMBER_TINTS[i % MEMBER_TINTS.length], borderColor: border, marginLeft: i === 0 ? 0 : -10 },
          ]}
        >
          <Ionicons name="person" size={12} color={palette.white} />
        </View>
      ))}
      {count > shown && (
        <Text style={styles.memberMore}>+{count - shown}</Text>
      )}
    </View>
  );
}

// ─── Podium top 3 ─────────────────────────────────────────
const MEDALS = [
  { fill: palette.gold, edge: palette.goldDark },
  { fill: palette.silver, edge: "#9A9A9A" },
  { fill: palette.bronze, edge: "#A5672A" },
] as const;

function PodiumColumn({
  row,
  place,
  isMe,
  colors: c,
}: {
  row?: LeaderboardRow;
  place: 0 | 1 | 2; // index médaille
  isMe: boolean;
  colors: ThemeColors;
}) {
  const avatarSize = place === 0 ? 56 : 44;
  const platformHeight = place === 0 ? 56 : place === 1 ? 40 : 30;
  const medal = MEDALS[place];
  return (
    <View style={styles.podiumCol}>
      {row ? (
        <>
          <Avatar name={row.username} userId={row.user_id} url={row.avatar_url} size={avatarSize} />
          <View style={[styles.medal, { backgroundColor: medal.fill, borderBottomColor: medal.edge }]}>
            <Text style={styles.medalText}>{row.rank}</Text>
          </View>
          <Text
            style={[
              styles.podiumName,
              { color: c.text, fontWeight: isMe ? fonts.weights.heavy : fonts.weights.bold },
            ]}
            numberOfLines={1}
          >
            {row.username}
            {isMe ? " (you)" : ""}
          </Text>
          <Text style={[styles.podiumScore, { color: palette.goldDark }]}>{row.value}</Text>
        </>
      ) : (
        <View style={{ height: avatarSize + 52 }} />
      )}
      <View
        style={[
          styles.platform,
          { height: platformHeight, backgroundColor: soft(medal.fill) },
        ]}
      />
    </View>
  );
}

function Podium({
  rows,
  meId,
  colors: c,
}: {
  rows: LeaderboardRow[];
  meId: string | null;
  colors: ThemeColors;
}) {
  const [first, second, third] = rows;
  return (
    <View style={styles.podium}>
      <PodiumColumn row={second} place={1} isMe={second?.user_id === meId} colors={c} />
      <PodiumColumn row={first} place={0} isMe={first?.user_id === meId} colors={c} />
      <PodiumColumn row={third} place={2} isMe={third?.user_id === meId} colors={c} />
    </View>
  );
}

const LeaderboardLine = memo(function LeaderboardLine({
  row,
  isMe,
  colors: c,
}: {
  row: LeaderboardRow;
  isMe: boolean;
  colors: ThemeColors;
}) {
  return (
    <View
      style={[
        styles.lbRow,
        { borderBottomColor: c.separator },
        isMe && { backgroundColor: c.primarySoft, borderRadius: radii.sm },
      ]}
    >
      <Text style={[styles.lbRank, { color: c.textSecondary }]}>{row.rank}</Text>
      <Avatar name={row.username} userId={row.user_id} url={row.avatar_url} size={32} />
      <Text
        style={[styles.lbUsername, { color: c.text, fontWeight: isMe ? fonts.weights.bold : fonts.weights.medium }]}
        numberOfLines={1}
      >
        {row.username}
        {isMe ? " (you)" : ""}
      </Text>
      <StatChip icon="trophy" value={row.value} color={palette.grass} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  heroTitle: {
    fontSize: fonts.sizes.hero,
    fontWeight: fonts.weights.heavy,
    letterSpacing: fonts.letterSpacing.tight,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  emptyWrap: { alignItems: "center", gap: spacing.lg, marginTop: spacing.xxl },
  emptyText: {
    textAlign: "center",
    fontSize: fonts.sizes.base,
    paddingHorizontal: spacing.xl,
  },

  segmented: {
    flexDirection: "row",
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
    gap: spacing.sm,
  },
  segment: {
    flex: 1,
    height: 40,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: {
    fontSize: fonts.sizes.base,
    fontWeight: fonts.weights.bold,
    letterSpacing: fonts.letterSpacing.tight,
  },

  feedContent: { paddingBottom: TAB_BAR_SPACE + spacing.base },
  feedRow: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
  },
  shieldBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  shieldBadgeText: { fontSize: fonts.sizes.xs, fontWeight: fonts.weights.bold },

  // ─── Quests ───
  questsWrap: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  questCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  questPastille: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  questInfo: { flex: 1, gap: 6 },
  questLabel: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.bold },
  questDoneText: { fontSize: fonts.sizes.xs, fontWeight: fonts.weights.medium },
  questProgress: {
    fontSize: fonts.sizes.sm,
    fontWeight: fonts.weights.bold,
    minWidth: 40,
    textAlign: "right",
  },

  // ─── Rankings ───
  leaderboardContainer: { flex: 1 },
  lbSegments: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  lbSegment: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radii.full,
    paddingHorizontal: spacing.base,
    height: 34,
  },
  lbSegmentText: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.bold },
  lbContent: { paddingHorizontal: spacing.base, paddingBottom: TAB_BAR_SPACE + spacing.base },

  podium: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },
  podiumCol: { flex: 1, alignItems: "center" },
  medal: {
    width: 26,
    height: 26,
    borderRadius: radii.sm,
    borderBottomWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -13,
  },
  medalText: { color: palette.white, fontWeight: fonts.weights.heavy, fontSize: 13 },
  podiumName: { fontSize: fonts.sizes.sm, marginTop: spacing.xs, maxWidth: "100%" },
  podiumScore: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.heavy, marginBottom: spacing.sm },
  platform: {
    alignSelf: "stretch",
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
  },

  lbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lbRank: { width: 28, fontSize: fonts.sizes.base, fontWeight: fonts.weights.heavy, textAlign: "center" },
  lbUsername: { flex: 1, fontSize: fonts.sizes.base },

  // ─── Team ───
  teamContent: { paddingHorizontal: spacing.base, paddingBottom: TAB_BAR_SPACE + spacing.base },
  teamCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.base,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  teamCardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  teamGlyphPastille: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  teamHeaderName: { fontSize: fonts.sizes.lg, fontWeight: fonts.weights.heavy },
  teamHeaderMeta: { fontSize: fonts.sizes.sm, marginTop: 2 },
  challengeLabel: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.bold },
  challengeChips: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  podiumHint: { fontSize: fonts.sizes.xs },
  memberStack: { flexDirection: "row", alignItems: "center" },
  memberDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  memberMore: {
    fontSize: fonts.sizes.xs,
    fontWeight: fonts.weights.bold,
    color: palette.gray500,
    marginLeft: 4,
  },

  introCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: "center",
    marginBottom: spacing.base,
  },
  introPastille: {
    width: 64,
    height: 64,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  introGlyph: { fontSize: 30, fontWeight: fonts.weights.heavy },
  introTitle: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.heavy,
    textAlign: "center",
    marginBottom: spacing.sm,
    letterSpacing: fonts.letterSpacing.tight,
  },
  introText: {
    fontSize: fonts.sizes.sm,
    textAlign: "center",
    lineHeight: fonts.sizes.sm * fonts.lineHeights.relaxed,
  },
  createForm: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.base,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  teamInput: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: fonts.sizes.base,
  },
  emojiRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  emojiChoice: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
  },
  createActions: { flexDirection: "row", gap: spacing.sm },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  teamRowName: { flex: 1, fontSize: fonts.sizes.base, fontWeight: fonts.weights.medium },
  teamRowMembersWrap: { flexDirection: "row", alignItems: "center", gap: 3 },
  teamRowMembers: { fontSize: fonts.sizes.sm },
  leaveButton: { alignItems: "center", marginTop: spacing.lg, padding: spacing.sm },
  leaveText: { fontSize: fonts.sizes.sm },
});
