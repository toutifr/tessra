import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import { useAuth } from "../../src/providers/AuthProvider";
import RushBanner from "../../src/components/RushBanner";
import LinkAccountSheet, { useIsGuest } from "../../src/components/LinkAccountSheet";
import PressableScale from "../../src/components/PressableScale";
import { FeedSkeleton, ListSkeleton } from "../../src/components/Skeleton";
import { track } from "../../src/lib/track";
import { hapticLight, hapticSuccess } from "../../src/lib/haptics";
import { useThemeColors, fonts, spacing, radii, shadows, palette, ThemeColors } from "../../src/theme";

const IMAGE_SIZE = Dimensions.get("window").width;

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

const LEADERBOARD_KINDS: { kind: LeaderboardKind; label: string }[] = [
  { kind: "tiles", label: "Tiles" },
  { kind: "votes", label: "Votes" },
  { kind: "explorer", label: "Explorer" },
];

const TEAM_EMOJIS = ["⬡", "🔥", "🌍", "🚀", "🦅", "🐺", "🌊", "⚡"];

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

// ─── Carte du feed (memoïsée) ─────────────────────────────
const FeedCard = memo(function FeedCard({
  item,
  userId,
  c,
  onVote,
  onOpen,
}: {
  item: FeedItem;
  userId: string | null;
  c: ThemeColors;
  onVote: (item: FeedItem) => void;
  onOpen: (squareId: string) => void;
}) {
  const canVote = !item.has_voted && item.owner_id !== userId;
  return (
    <View style={[styles.card, { backgroundColor: c.bgSecondary }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        {item.avatar_url ? (
          <Image
            source={{ uri: item.avatar_url }}
            style={styles.cardAvatar}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            recyclingKey={item.publication_id}
          />
        ) : (
          <View style={[styles.cardAvatar, styles.avatarFallback, { backgroundColor: c.primary }]}>
            <Text style={styles.avatarInitial}>
              {item.username?.charAt(0).toUpperCase() ?? "?"}
            </Text>
          </View>
        )}
        <View style={styles.cardHeaderText}>
          <Text style={[styles.cardUsername, { color: c.text }]} numberOfLines={1}>
            {item.username}
          </Text>
          <Text style={[styles.cardTime, { color: c.textTertiary }]}>
            {relativeTime(item.created_at)}
          </Text>
        </View>
        {item.is_shielded && (
          <View style={[styles.shieldBadge, { backgroundColor: `${palette.warning}20` }]}>
            <Text style={[styles.shieldBadgeText, { color: palette.warning }]}>🛡️ Protected</Text>
          </View>
        )}
      </View>

      {/* Image */}
      <Pressable onPress={() => onOpen(item.square_id)}>
        <Image
          source={{ uri: item.image_url }}
          style={styles.cardImage}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          recyclingKey={item.publication_id}
        />
      </Pressable>

      {/* Footer */}
      <View style={styles.cardFooter}>
        <Pressable
          style={({ pressed }) => [
            styles.voteButton,
            {
              backgroundColor: item.has_voted ? c.primarySoft : c.bgTertiary,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          onPress={() => onVote(item)}
          disabled={!canVote}
        >
          <Text style={styles.voteIcon}>{item.has_voted ? "❤️" : "🤍"}</Text>
          <Text style={[styles.voteCount, { color: item.has_voted ? c.primary : c.textSecondary }]}>
            {item.vote_count}
          </Text>
        </Pressable>

        {!item.is_shielded && item.owner_id !== userId && (
          <PressableScale
            style={[styles.takeButton, { backgroundColor: c.primary }, shadows.sm]}
            onPress={() => onOpen(item.square_id)}
          >
            <Text style={[styles.takeText, { color: c.primaryText }]}>
              Take over — {item.min_price} ⬡
            </Text>
          </PressableScale>
        )}
      </View>
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
  const [teamEmoji, setTeamEmoji] = useState(TEAM_EMOJIS[0]);

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

  const renderCard = useCallback(
    ({ item }: { item: FeedItem }) => (
      <FeedCard item={item} userId={userId} c={c} onVote={handleVote} onOpen={openSquare} />
    ),
    [userId, c, handleVote, openSquare],
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
      Alert.alert("Error", e instanceof Error ? e.message : "Could not create the team");
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
        "Error",
        msg.includes("Already in a team") ? "You're already in a team." : "Could not join the team",
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
      <View style={[styles.questsBanner, { backgroundColor: c.bgSecondary, borderColor: c.cardBorder }]}>
        <Text style={[styles.questsTitle, { color: c.text }]}>Daily quests</Text>
        {quests.slice(0, 3).map((q) => {
          const done = q.progress >= q.target;
          return (
            <View key={q.key} style={styles.questRow}>
              <View style={styles.questInfo}>
                <Text style={[styles.questLabel, { color: c.text }]} numberOfLines={1}>
                  {q.label}
                </Text>
                <View style={[styles.progressTrack, { backgroundColor: c.bgTertiary }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: done ? c.success : c.primary,
                        width: `${Math.min(100, (q.progress / q.target) * 100)}%`,
                      },
                    ]}
                  />
                </View>
              </View>
              {done && !q.claimed ? (
                <PressableScale
                  style={[
                    styles.claimButton,
                    { backgroundColor: c.primary, opacity: claiming === q.key ? 0.8 : 1 },
                  ]}
                  onPress={() => handleClaim(q)}
                  disabled={!!claiming}
                >
                  <Text style={[styles.claimText, { color: c.primaryText }]}>
                    Claim +{q.reward} ⬡
                  </Text>
                </PressableScale>
              ) : (
                <Text style={[styles.questProgress, { color: q.claimed ? c.success : c.textTertiary }]}>
                  {q.claimed ? "✓" : `${q.progress}/${q.target}`}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    ) : null;

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      {/* Segmented control */}
      <View style={[styles.segmented, { backgroundColor: c.bgTertiary }]}>
        {([
          { key: "feed" as const, label: "Feed" },
          { key: "leaderboard" as const, label: "Rankings" },
          { key: "team" as const, label: "Team" },
        ]).map((s) => (
          <Pressable
            key={s.key}
            style={[
              styles.segment,
              tab === s.key && [{ backgroundColor: c.card }, shadows.sm],
            ]}
            onPress={() => setTab(s.key)}
          >
            <Text
              style={[
                styles.segmentText,
                { color: tab === s.key ? c.text : c.textTertiary },
              ]}
            >
              {s.label}
            </Text>
          </Pressable>
        ))}
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
              <Text style={[styles.emptyText, { color: c.textTertiary }]}>
                Nothing to discover yet. Come back later!
              </Text>
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
            {LEADERBOARD_KINDS.map((k) => (
              <Pressable
                key={k.kind}
                style={[
                  styles.lbSegment,
                  {
                    backgroundColor: lbKind === k.kind ? c.primary : c.bgTertiary,
                  },
                ]}
                onPress={() => setLbKind(k.kind)}
              >
                <Text
                  style={[
                    styles.lbSegmentText,
                    { color: lbKind === k.kind ? c.primaryText : c.textSecondary },
                  ]}
                >
                  {k.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {lbLoading ? (
            <ListSkeleton rows={6} />
          ) : (
            <FlatList
              data={lbRows}
              keyExtractor={(row) => row.user_id}
              renderItem={({ item: row }) => (
                <LeaderboardLine row={row} isMe={row.user_id === userId} colors={c} />
              )}
              windowSize={7}
              maxToRenderPerBatch={6}
              initialNumToRender={10}
              removeClippedSubviews
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: c.textTertiary }]}>
                  No rankings yet.
                </Text>
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
          <View style={[styles.teamHeader, { backgroundColor: c.bgSecondary, borderColor: c.cardBorder }]}>
            <Text style={styles.teamHeaderEmoji}>{challenge.my_team.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.teamHeaderName, { color: c.text }]} numberOfLines={1}>
                {challenge.my_team.name}
              </Text>
              <Text style={[styles.teamHeaderMeta, { color: c.textTertiary }]}>
                {challenge.my_team.member_count} member{challenge.my_team.member_count > 1 ? "s" : ""} · rank #{challenge.my_team.rank}
              </Text>
            </View>
          </View>

          {/* Défi de la semaine */}
          <View style={[styles.challengeCard, { backgroundColor: c.primarySoft }]}>
            <Text style={[styles.challengeLabel, { color: c.text }]}>{challenge.label}</Text>
            <View style={styles.challengeStats}>
              <View style={styles.challengeStat}>
                <Text style={[styles.challengeValue, { color: c.primary }]}>{challenge.my_team.score}</Text>
                <Text style={[styles.challengeStatLabel, { color: c.textSecondary }]}>Score</Text>
              </View>
              <View style={styles.challengeStat}>
                <Text style={[styles.challengeValue, { color: c.primary }]}>#{challenge.my_team.rank}</Text>
                <Text style={[styles.challengeStatLabel, { color: c.textSecondary }]}>Rank</Text>
              </View>
              <View style={styles.challengeStat}>
                <Text style={[styles.challengeValue, { color: c.primary }]}>{remainingLabel(challenge.ends_at)}</Text>
                <Text style={[styles.challengeStatLabel, { color: c.textSecondary }]}>Remaining</Text>
              </View>
            </View>
            <Text style={[styles.podiumHint, { color: c.textSecondary }]}>
              Podium Monday: +200/+100/+50 ⬡ per member
            </Text>
          </View>

          {/* Top 10 */}
          <Text style={[styles.teamSectionTitle, { color: c.text }]}>Top 10</Text>
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
                <Text style={styles.teamRowEmoji}>{t.emoji}</Text>
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
                <Text style={[styles.teamRowMembers, { color: c.textTertiary }]}>{t.member_count} 👤</Text>
                <Text style={[styles.lbValue, { color: c.primary }]}>{t.score}</Text>
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
          <View style={[styles.introCard, { backgroundColor: c.primarySoft }]}>
            <Text style={styles.introEmoji}>⬡</Text>
            <Text style={[styles.introTitle, { color: c.text }]}>Join forces to fill the mosaic</Text>
            <Text style={[styles.introText, { color: c.textSecondary }]}>
              Join a team, stack your takeovers and climb the weekly rankings. Podium Monday:
              +200/+100/+50 ⬡ per member.
            </Text>
          </View>

          {showCreateForm ? (
            <View style={[styles.createForm, { backgroundColor: c.bgSecondary, borderColor: c.cardBorder }]}>
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
                {TEAM_EMOJIS.map((e) => (
                  <Pressable
                    key={e}
                    style={[
                      styles.emojiChoice,
                      { backgroundColor: teamEmoji === e ? c.primary : c.bgTertiary },
                    ]}
                    onPress={() => setTeamEmoji(e)}
                  >
                    <Text style={styles.emojiChoiceText}>{e}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.createActions}>
                <Pressable
                  style={[styles.createCancel, { borderColor: c.border }]}
                  onPress={() => setShowCreateForm(false)}
                >
                  <Text style={{ color: c.textSecondary, fontWeight: fonts.weights.medium }}>Cancel</Text>
                </Pressable>
                <PressableScale
                  style={[
                    styles.createConfirm,
                    {
                      backgroundColor: c.primary,
                      opacity: teamBusy || !teamName.trim() ? 0.6 : 1,
                    },
                  ]}
                  onPress={handleCreateTeam}
                  disabled={teamBusy || !teamName.trim()}
                >
                  <Text style={{ color: c.primaryText, fontWeight: fonts.weights.bold }}>Create</Text>
                </PressableScale>
              </View>
            </View>
          ) : (
            <PressableScale
              style={[
                styles.createTeamButton,
                { backgroundColor: c.primary },
                shadows.md,
              ]}
              onPress={() => setShowCreateForm(true)}
            >
              <Text style={[styles.createTeamText, { color: c.primaryText }]}>Create a team</Text>
            </PressableScale>
          )}

          {teams.length > 0 && (
            <Text style={[styles.teamSectionTitle, { color: c.text }]}>Join a team</Text>
          )}
          {teams.map((t) => (
            <View key={t.id} style={[styles.teamRow, { borderBottomColor: c.separator }]}>
              <Text style={styles.teamRowEmoji}>{t.emoji}</Text>
              <Text style={[styles.teamRowName, { color: c.text }]} numberOfLines={1}>
                {t.name}
              </Text>
              <Text style={[styles.teamRowMembers, { color: c.textTertiary }]}>{t.member_count} 👤</Text>
              <PressableScale
                style={[
                  styles.joinButton,
                  { backgroundColor: c.primary, opacity: teamBusy ? 0.7 : 1 },
                ]}
                onPress={() => handleJoinTeam(t)}
                disabled={teamBusy}
              >
                <Text style={[styles.joinText, { color: c.primaryText }]}>Join</Text>
              </PressableScale>
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
      <Text style={[styles.lbRank, { color: row.rank <= 3 ? palette.gold : c.textSecondary }]}>
        {row.rank}
      </Text>
      {row.avatar_url ? (
        <Image
          source={{ uri: row.avatar_url }}
          style={styles.lbAvatar}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          recyclingKey={row.user_id}
        />
      ) : (
        <View style={[styles.lbAvatar, styles.avatarFallback, { backgroundColor: c.primary }]}>
          <Text style={styles.lbAvatarInitial}>
            {row.username?.charAt(0).toUpperCase() ?? "?"}
          </Text>
        </View>
      )}
      <Text
        style={[styles.lbUsername, { color: c.text, fontWeight: isMe ? fonts.weights.bold : fonts.weights.medium }]}
        numberOfLines={1}
      >
        {row.username}
        {isMe ? " (you)" : ""}
      </Text>
      <Text style={[styles.lbValue, { color: c.primary }]}>{row.value}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  emptyText: {
    textAlign: "center",
    marginTop: spacing.xxl,
    fontSize: fonts.sizes.base,
    paddingHorizontal: spacing.xl,
  },

  segmented: {
    flexDirection: "row",
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    borderRadius: radii.md,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.md - 3,
    alignItems: "center",
  },
  segmentText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },

  feedContent: { paddingBottom: 40 },

  questsBanner: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  questsTitle: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.bold, marginBottom: spacing.sm },
  questRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  questInfo: { flex: 1 },
  questLabel: { fontSize: fonts.sizes.sm, marginBottom: spacing.xs },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  questProgress: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold, minWidth: 40, textAlign: "right" },
  claimButton: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  claimText: { fontSize: fonts.sizes.xs, fontWeight: fonts.weights.bold },

  card: { marginBottom: spacing.lg },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  cardAvatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { justifyContent: "center", alignItems: "center" },
  avatarInitial: { color: "#fff", fontSize: fonts.sizes.base, fontWeight: fonts.weights.bold },
  cardHeaderText: { flex: 1 },
  cardUsername: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold },
  cardTime: { fontSize: fonts.sizes.xs, marginTop: 1 },
  shieldBadge: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  shieldBadgeText: { fontSize: fonts.sizes.xs, fontWeight: fonts.weights.semibold },
  cardImage: { width: IMAGE_SIZE, height: IMAGE_SIZE },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
  },
  voteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
  },
  voteIcon: { fontSize: 16 },
  voteCount: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold },
  takeButton: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  takeText: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold },

  leaderboardContainer: { flex: 1 },
  lbSegments: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  lbSegment: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs + 2,
  },
  lbSegmentText: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold },
  lbContent: { paddingHorizontal: spacing.base, paddingBottom: 40 },
  lbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lbRank: { width: 28, fontSize: fonts.sizes.base, fontWeight: fonts.weights.bold, textAlign: "center" },
  lbAvatar: { width: 32, height: 32, borderRadius: 16 },
  lbAvatarInitial: { color: "#fff", fontSize: fonts.sizes.sm, fontWeight: fonts.weights.bold },
  lbUsername: { flex: 1, fontSize: fonts.sizes.base },
  lbValue: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.bold },

  // ─── Team ───
  teamContent: { paddingHorizontal: spacing.base, paddingBottom: 40 },
  introCard: {
    borderRadius: radii.lg, padding: spacing.lg, alignItems: "center",
    marginBottom: spacing.base,
  },
  introEmoji: { fontSize: 40, marginBottom: spacing.sm },
  introTitle: {
    fontSize: fonts.sizes.lg, fontWeight: fonts.weights.bold,
    textAlign: "center", marginBottom: spacing.sm,
  },
  introText: {
    fontSize: fonts.sizes.sm, textAlign: "center",
    lineHeight: fonts.sizes.sm * fonts.lineHeights.relaxed,
  },
  createTeamButton: {
    borderRadius: radii.full, padding: spacing.base, alignItems: "center",
    marginBottom: spacing.lg,
  },
  createTeamText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
  createForm: {
    borderRadius: radii.md, borderWidth: 1, padding: spacing.md,
    marginBottom: spacing.lg, gap: spacing.md,
  },
  teamInput: {
    borderWidth: 1, borderRadius: radii.sm, padding: spacing.md,
    fontSize: fonts.sizes.base,
  },
  emojiRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  emojiChoice: {
    width: 40, height: 40, borderRadius: radii.sm,
    justifyContent: "center", alignItems: "center",
  },
  emojiChoiceText: { fontSize: 20 },
  createActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm },
  createCancel: {
    borderWidth: 1, borderRadius: radii.sm,
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
  },
  createConfirm: {
    borderRadius: radii.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  teamSectionTitle: {
    fontSize: fonts.sizes.md, fontWeight: fonts.weights.bold,
    marginBottom: spacing.sm,
  },
  teamRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  teamRowEmoji: { fontSize: 22 },
  teamRowName: { flex: 1, fontSize: fonts.sizes.base, fontWeight: fonts.weights.medium },
  teamRowMembers: { fontSize: fonts.sizes.sm },
  joinButton: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
  },
  joinText: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold },
  teamHeader: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    borderRadius: radii.md, borderWidth: 1, padding: spacing.md,
    marginBottom: spacing.md,
  },
  teamHeaderEmoji: { fontSize: 32 },
  teamHeaderName: { fontSize: fonts.sizes.lg, fontWeight: fonts.weights.bold },
  teamHeaderMeta: { fontSize: fonts.sizes.sm, marginTop: 2 },
  challengeCard: {
    borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg,
  },
  challengeLabel: {
    fontSize: fonts.sizes.base, fontWeight: fonts.weights.bold,
    textAlign: "center", marginBottom: spacing.md,
  },
  challengeStats: { flexDirection: "row", justifyContent: "space-around", marginBottom: spacing.md },
  challengeStat: { alignItems: "center" },
  challengeValue: { fontSize: fonts.sizes.lg, fontWeight: fonts.weights.heavy },
  challengeStatLabel: { fontSize: fonts.sizes.xs, marginTop: 2 },
  podiumHint: { fontSize: fonts.sizes.xs, textAlign: "center" },
  leaveButton: { alignItems: "center", marginTop: spacing.lg, padding: spacing.sm },
  leaveText: { fontSize: fonts.sizes.sm },
});
