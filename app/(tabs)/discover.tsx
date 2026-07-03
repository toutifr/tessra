import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
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
import RushBanner from "../../src/components/RushBanner";
import { track } from "../../src/lib/track";
import { hapticLight, hapticSuccess } from "../../src/lib/haptics";
import { useThemeColors, fonts, spacing, radii, shadows, palette, ThemeColors } from "../../src/theme";

const IMAGE_SIZE = Dimensions.get("window").width;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

const LEADERBOARD_KINDS: { kind: LeaderboardKind; label: string }[] = [
  { kind: "tiles", label: "Cases" },
  { kind: "votes", label: "Votes" },
  { kind: "explorer", label: "Explorateur" },
];

const TEAM_EMOJIS = ["⬡", "🔥", "🌍", "🚀", "🦅", "🐺", "🌊", "⚡"];

function remainingLabel(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "terminé";
  const h = Math.floor(diff / 3600000);
  if (h >= 24) return `${Math.floor(h / 24)} j ${h % 24} h`;
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h} h ${m} min`;
}

export default function DiscoverScreen() {
  const c = useThemeColors();
  const [tab, setTab] = useState<"feed" | "leaderboard" | "team">("feed");
  const [userId, setUserId] = useState<string | null>(null);

  // Feed
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [endReached, setEndReached] = useState(false);

  // Quêtes
  const [quests, setQuests] = useState<DailyQuest[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);

  // Classement
  const [lbKind, setLbKind] = useState<LeaderboardKind>("tiles");
  const [lbRows, setLbRows] = useState<LeaderboardRow[]>([]);
  const [lbLoading, setLbLoading] = useState(false);

  // Team
  const [challenge, setChallenge] = useState<TeamChallenge | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamBusy, setTeamBusy] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamEmoji, setTeamEmoji] = useState(TEAM_EMOJIS[0]);

  useEffect(() => {
    track("feed_open");
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      await Promise.all([loadFeed(user.id), loadQuests(user.id)]);
    })();
  }, []);

  const loadFeed = async (uid: string) => {
    setFeedLoading(true);
    try {
      const items = await getFeed(uid);
      setFeed(items);
      setEndReached(items.length < 20);
    } catch {
      // silencieux
    } finally {
      setFeedLoading(false);
    }
  };

  const loadQuests = async (uid: string) => {
    try {
      setQuests(await getDailyQuests(uid));
    } catch {
      // silencieux
    }
  };

  const onRefresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    await Promise.all([loadFeed(userId), loadQuests(userId)]);
    setRefreshing(false);
  }, [userId]);

  const loadMore = async () => {
    if (!userId || loadingMore || endReached || feed.length === 0) return;
    setLoadingMore(true);
    try {
      const last = feed[feed.length - 1];
      const more = await getFeed(userId, last.created_at);
      setFeed((prev) => [...prev, ...more]);
      if (more.length < 20) setEndReached(true);
    } catch {
      // silencieux
    } finally {
      setLoadingMore(false);
    }
  };

  const handleVote = async (item: FeedItem) => {
    if (!userId || item.has_voted || item.owner_id === userId) return;
    hapticLight();
    // Optimiste
    setFeed((prev) =>
      prev.map((f) =>
        f.publication_id === item.publication_id
          ? { ...f, has_voted: true, vote_count: f.vote_count + 1 }
          : f,
      ),
    );
    track("vote", { publication_id: item.publication_id });
    const { error } = await supabase.rpc("vote_publication", {
      p_user_id: userId,
      p_publication_id: item.publication_id,
    });
    if (error) {
      // rollback
      setFeed((prev) =>
        prev.map((f) =>
          f.publication_id === item.publication_id
            ? { ...f, has_voted: false, vote_count: f.vote_count - 1 }
            : f,
        ),
      );
    }
  };

  const handleClaim = async (quest: DailyQuest) => {
    if (!userId || claiming) return;
    setClaiming(quest.key);
    try {
      await claimQuest(userId, quest.key);
      hapticSuccess();
      await loadQuests(userId);
    } catch {
      // silencieux
    } finally {
      setClaiming(null);
    }
  };

  const loadLeaderboard = useCallback(async (kind: LeaderboardKind) => {
    setLbLoading(true);
    try {
      setLbRows(await getLeaderboard(kind));
    } catch {
      setLbRows([]);
    } finally {
      setLbLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "leaderboard") loadLeaderboard(lbKind);
  }, [tab, lbKind, loadLeaderboard]);

  // ─── Team ───────────────────────────────────────────────

  const loadTeam = useCallback(async (uid: string) => {
    setTeamLoading(true);
    try {
      const ch = await getTeamChallenge(uid);
      setChallenge(ch);
      if (!ch.my_team) setTeams(await listTeams());
      track("team_challenge_view");
    } catch {
      // silencieux
    } finally {
      setTeamLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "team" && userId) loadTeam(userId);
  }, [tab, userId, loadTeam]);

  const handleCreateTeam = async () => {
    const name = teamName.trim();
    if (!userId || !name || teamBusy) return;
    setTeamBusy(true);
    try {
      await createTeam(userId, name, teamEmoji);
      hapticSuccess();
      track("team_create", { name, emoji: teamEmoji });
      setShowCreateForm(false);
      setTeamName("");
      await loadTeam(userId);
    } catch (e) {
      Alert.alert("Erreur", e instanceof Error ? e.message : "Impossible de créer la team");
    } finally {
      setTeamBusy(false);
    }
  };

  const handleJoinTeam = async (team: TeamRow) => {
    if (!userId || teamBusy) return;
    setTeamBusy(true);
    try {
      await joinTeam(userId, team.id);
      hapticSuccess();
      track("team_join", { team_id: team.id });
      await loadTeam(userId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      Alert.alert(
        "Erreur",
        msg.includes("Already in a team") ? "Tu es déjà dans une team." : "Impossible de rejoindre la team",
      );
    } finally {
      setTeamBusy(false);
    }
  };

  const handleLeaveTeam = () => {
    if (!userId) return;
    Alert.alert("Quitter la team", "Tu perdras ta contribution au défi en cours. Continuer ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Quitter",
        style: "destructive",
        onPress: async () => {
          try {
            await leaveTeam(userId);
            await loadTeam(userId);
          } catch {
            // silencieux
          }
        },
      },
    ]);
  };

  const renderCard = ({ item }: { item: FeedItem }) => {
    const canVote = !item.has_voted && item.owner_id !== userId;
    return (
      <View style={[styles.card, { backgroundColor: c.bgSecondary }]}>
        {/* Header */}
        <View style={styles.cardHeader}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.cardAvatar} />
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
              <Text style={[styles.shieldBadgeText, { color: palette.warning }]}>🛡️ Protégée</Text>
            </View>
          )}
        </View>

        {/* Image */}
        <Pressable onPress={() => router.push(`/square/${item.square_id}`)}>
          <Image source={{ uri: item.image_url }} style={styles.cardImage} />
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
            onPress={() => handleVote(item)}
            disabled={!canVote}
          >
            <Text style={styles.voteIcon}>{item.has_voted ? "❤️" : "🤍"}</Text>
            <Text style={[styles.voteCount, { color: item.has_voted ? c.primary : c.textSecondary }]}>
              {item.vote_count}
            </Text>
          </Pressable>

          {!item.is_shielded && item.owner_id !== userId && (
            <Pressable
              style={({ pressed }) => [
                styles.takeButton,
                { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={() => router.push(`/square/${item.square_id}`)}
            >
              <Text style={[styles.takeText, { color: c.primaryText }]}>
                Prendre — {item.min_price} ⬡
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  const questsBanner =
    quests.length > 0 ? (
      <View style={[styles.questsBanner, { backgroundColor: c.bgSecondary, borderColor: c.cardBorder }]}>
        <Text style={[styles.questsTitle, { color: c.text }]}>Quêtes du jour</Text>
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
                <Pressable
                  style={({ pressed }) => [
                    styles.claimButton,
                    { backgroundColor: c.primary, opacity: pressed || claiming === q.key ? 0.8 : 1 },
                  ]}
                  onPress={() => handleClaim(q)}
                  disabled={!!claiming}
                >
                  <Text style={[styles.claimText, { color: c.primaryText }]}>
                    Réclamer +{q.reward} ⬡
                  </Text>
                </Pressable>
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
          { key: "leaderboard" as const, label: "Classement" },
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
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={c.primary} />
          </View>
        ) : (
          <FlatList
            data={feed}
            keyExtractor={(item) => item.publication_id}
            renderItem={renderCard}
            ListHeaderComponent={
              <View>
                <RushBanner style={{ marginHorizontal: spacing.base, marginBottom: spacing.md }} />
                {questsBanner}
              </View>
            }
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: c.textTertiary }]}>
                Rien à découvrir pour l'instant. Reviens plus tard !
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
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={c.primary} />
            </View>
          ) : (
            <FlatList
              data={lbRows}
              keyExtractor={(row) => row.user_id}
              renderItem={({ item: row }) => (
                <LeaderboardLine row={row} isMe={row.user_id === userId} colors={c} />
              )}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: c.textTertiary }]}>
                  Pas encore de classement.
                </Text>
              }
              contentContainerStyle={styles.lbContent}
            />
          )}
        </View>
      ) : teamLoading && !challenge ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
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
                {challenge.my_team.member_count} membre{challenge.my_team.member_count > 1 ? "s" : ""} · rang #{challenge.my_team.rank}
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
                <Text style={[styles.challengeStatLabel, { color: c.textSecondary }]}>Rang</Text>
              </View>
              <View style={styles.challengeStat}>
                <Text style={[styles.challengeValue, { color: c.primary }]}>{remainingLabel(challenge.ends_at)}</Text>
                <Text style={[styles.challengeStatLabel, { color: c.textSecondary }]}>Restant</Text>
              </View>
            </View>
            <Text style={[styles.podiumHint, { color: c.textSecondary }]}>
              Podium lundi : +200/+100/+50 ⬡ par membre
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
                  {isMine ? " (ta team)" : ""}
                </Text>
                <Text style={[styles.teamRowMembers, { color: c.textTertiary }]}>{t.member_count} 👤</Text>
                <Text style={[styles.lbValue, { color: c.primary }]}>{t.score}</Text>
              </View>
            );
          })}

          <Pressable style={styles.leaveButton} onPress={handleLeaveTeam}>
            <Text style={[styles.leaveText, { color: c.textTertiary }]}>Quitter la team</Text>
          </Pressable>
        </ScrollView>
      ) : (
        // ─── Sans team ───
        <ScrollView contentContainerStyle={styles.teamContent}>
          <View style={[styles.introCard, { backgroundColor: c.primarySoft }]}>
            <Text style={styles.introEmoji}>⬡</Text>
            <Text style={[styles.introTitle, { color: c.text }]}>Unissez-vous pour remplir la mosaïque</Text>
            <Text style={[styles.introText, { color: c.textSecondary }]}>
              Rejoins une team, cumulez vos prises et grimpez au classement hebdo. Podium lundi :
              +200/+100/+50 ⬡ par membre.
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
                placeholder="Nom de la team"
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
                  <Text style={{ color: c.textSecondary, fontWeight: fonts.weights.medium }}>Annuler</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.createConfirm,
                    {
                      backgroundColor: c.primary,
                      opacity: pressed || teamBusy || !teamName.trim() ? 0.6 : 1,
                    },
                  ]}
                  onPress={handleCreateTeam}
                  disabled={teamBusy || !teamName.trim()}
                >
                  <Text style={{ color: c.primaryText, fontWeight: fonts.weights.bold }}>Créer</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.createTeamButton,
                { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 },
                shadows.md,
              ]}
              onPress={() => setShowCreateForm(true)}
            >
              <Text style={[styles.createTeamText, { color: c.primaryText }]}>Créer une team</Text>
            </Pressable>
          )}

          {teams.length > 0 && (
            <Text style={[styles.teamSectionTitle, { color: c.text }]}>Rejoindre une team</Text>
          )}
          {teams.map((t) => (
            <View key={t.id} style={[styles.teamRow, { borderBottomColor: c.separator }]}>
              <Text style={styles.teamRowEmoji}>{t.emoji}</Text>
              <Text style={[styles.teamRowName, { color: c.text }]} numberOfLines={1}>
                {t.name}
              </Text>
              <Text style={[styles.teamRowMembers, { color: c.textTertiary }]}>{t.member_count} 👤</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.joinButton,
                  { backgroundColor: c.primary, opacity: pressed || teamBusy ? 0.7 : 1 },
                ]}
                onPress={() => handleJoinTeam(t)}
                disabled={teamBusy}
              >
                <Text style={[styles.joinText, { color: c.primaryText }]}>Rejoindre</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function LeaderboardLine({
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
        <Image source={{ uri: row.avatar_url }} style={styles.lbAvatar} />
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
        {isMe ? " (toi)" : ""}
      </Text>
      <Text style={[styles.lbValue, { color: c.primary }]}>{row.value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
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
    borderRadius: radii.md, padding: spacing.base, alignItems: "center",
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
