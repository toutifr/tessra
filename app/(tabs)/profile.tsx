import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../src/lib/supabase";
import { getTeamChallenge } from "../../src/lib/economy";
import { useSWR, mutate, getCached } from "../../src/lib/swr";
import { useAuth } from "../../src/providers/AuthProvider";
import { useUserStats } from "../../src/hooks/useUserStats";
import AnimatedNumber from "../../src/components/AnimatedNumber";
import LinkAccountSheet, { useIsGuest } from "../../src/components/LinkAccountSheet";
import PressableScale from "../../src/components/PressableScale";
import Skeleton from "../../src/components/Skeleton";
import { useThemeColors, fonts, spacing, radii, shadows, palette, ThemeColors } from "../../src/theme";

interface Profile {
  username: string;
  avatar_url: string | null;
  created_at: string;
}

interface ProfileData {
  profile: Profile | null;
  team: { emoji: string; name: string } | null;
}

async function fetchProfileData(uid: string): Promise<ProfileData> {
  const { data: profileData } = await supabase
    .from("profiles")
    .select("username, avatar_url, created_at")
    .eq("user_id", uid)
    .single();

  let team: ProfileData["team"] = null;
  try {
    const ch = await getTeamChallenge(uid);
    if (ch.my_team) team = { emoji: ch.my_team.emoji, name: ch.my_team.name };
  } catch {
    // silencieux
  }

  return { profile: (profileData as Profile) ?? null, team };
}

export default function ProfileScreen() {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const profileKey = uid ? `profile:${uid}` : null;

  const { data, loading, refresh } = useSWR<ProfileData>(
    profileKey,
    () => fetchProfileData(uid!),
    60000,
  );
  const profile = data?.profile ?? null;
  const team = data?.team ?? null;

  const [editing, setEditing] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [showLinkSheet, setShowLinkSheet] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isGuest = useIsGuest();
  const { stats, refetch: refetchStats } = useUserStats();
  const c = useThemeColors();

  useEffect(() => {
    if (profile) setNewUsername(profile.username);
  }, [profile]);

  // Retour d'onglet : cache instantané + refetch silencieux
  useFocusEffect(
    useCallback(() => {
      refresh();
      refetchStats();
    }, [refresh, refetchStats]),
  );

  const patchProfile = (patch: Partial<Profile>) => {
    if (!profileKey) return;
    const cur = getCached<ProfileData>(profileKey);
    if (cur?.profile) mutate(profileKey, { ...cur, profile: { ...cur.profile, ...patch } });
  };

  const handleUpdateUsername = async () => {
    if (!newUsername.trim() || !uid) return;

    const { error } = await supabase
      .from("profiles")
      .update({ username: newUsername.trim(), updated_at: new Date().toISOString() })
      .eq("user_id", uid);

    if (error) {
      console.error("username update failed:", error.message);
      Alert.alert("Name not saved", "Could not update your username — it may already be taken.");
    } else {
      patchProfile({ username: newUsername.trim() });
      setEditing(false);
    }
  };

  const handleAvatarUpload = async () => {
    if (!uid) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7,
      allowsEditing: false,
      mediaTypes: ["images"],
      exif: false,
    });

    if (result.canceled || !result.assets[0]) return;

    const response = await fetch(result.assets[0].uri);
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();
    const fileName = `avatars/${uid}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("publications")
      .upload(fileName, arrayBuffer, { contentType: "image/jpeg", upsert: true });

    if (uploadError) {
      console.error("avatar upload failed:", uploadError.message);
      Alert.alert("Photo not saved", "Could not upload your photo. Please try again.");
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("publications").getPublicUrl(fileName);

    await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("user_id", uid);

    patchProfile({ avatar_url: publicUrl });
  };

  const doSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("sign out failed:", error.message);
      Alert.alert("Sign out failed", "Please try again.");
    } else {
      router.replace("/(auth)/sign-in");
    }
  };

  const handleLogout = () => {
    if (isGuest) {
      Alert.alert(
        "Guest account",
        "You're on a guest account. Signing out will lose this progress unless you link an account first.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Link account", onPress: () => setShowLinkSheet(true) },
          { text: "Sign out anyway", style: "destructive", onPress: doSignOut },
        ],
      );
      return;
    }
    doSignOut();
  };

  const handleExportData = async () => {
    if (!uid || exporting) return;
    setExporting(true);
    try {
      const { data: exportData, error } = await supabase.rpc("export_my_data", {
        p_user_id: uid,
      });
      if (error) throw error;
      await Share.share({ message: JSON.stringify(exportData, null, 2) });
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not export your data.");
    } finally {
      setExporting(false);
    }
  };

  const doDeleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("delete-account");
      if (error) throw error;
      if (!res?.success) throw new Error("Deletion failed.");
      await supabase.auth.signOut().catch(() => {});
      Alert.alert("Account deleted");
    } catch (e) {
      Alert.alert(
        "Error",
        `${e instanceof Error ? e.message : "Something went wrong."}\n\nIf this persists, contact support@piri.app`,
      );
    } finally {
      setDeleting(false);
    }
  };

  const isAnonymous = session?.user.is_anonymous === true;

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete your account?",
      isAnonymous
        ? "You're on a guest account — this simply erases everything."
        : "Your photos, tiles, Reis and history will be permanently erased. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            if (isAnonymous) {
              doDeleteAccount();
              return;
            }
            Alert.alert(
              "Are you absolutely sure?",
              "Any remaining Reis balance will be lost.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Delete forever", style: "destructive", onPress: doDeleteAccount },
              ],
            );
          },
        },
      ],
    );
  };

  if (loading && !profile) {
    // Skeleton de forme — plus de spinner plein écran
    return (
      <View style={[styles.container, { backgroundColor: c.bg }]}>
        <View style={styles.scrollContent}>
          <View style={styles.header}>
            <Skeleton width={88} height={88} borderRadius={44} />
            <Skeleton width={140} height={20} style={{ marginTop: spacing.md }} />
            <Skeleton width={110} height={12} style={{ marginTop: spacing.sm }} />
          </View>
          <Skeleton width="100%" height={96} borderRadius={radii.lg} style={{ marginBottom: spacing.lg }} />
          <View style={styles.statsGrid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} width="31%" height={72} borderRadius={radii.md} />
            ))}
          </View>
        </View>
      </View>
    );
  }

  const joinDate = profile
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.bg }]} contentContainerStyle={styles.scrollContent}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleAvatarUpload}>
          {profile?.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={styles.avatar}
              contentFit="cover"
              transition={150}
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: c.primary }]}>
              <Text style={styles.avatarInitial}>
                {profile?.username?.charAt(0).toUpperCase() ?? "?"}
              </Text>
            </View>
          )}
        </Pressable>

        {editing ? (
          <View style={styles.editRow}>
            <TextInput
              style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text }]}
              value={newUsername}
              onChangeText={setNewUsername}
              autoFocus
            />
            <Pressable
              style={[styles.saveButton, { backgroundColor: c.primary }]}
              onPress={handleUpdateUsername}
            >
              <Text style={[styles.saveText, { color: c.primaryText }]}>OK</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setEditing(true)}>
            <Text style={[styles.username, { color: c.text }]}>{profile?.username}</Text>
          </Pressable>
        )}

        {team && (
          <View style={[styles.teamBadge, { backgroundColor: c.primarySoft }]}>
            <Text style={[styles.teamBadgeText, { color: c.primary }]}>
              {team.emoji} {team.name}
            </Text>
          </View>
        )}

        <Text style={[styles.joinDate, { color: c.textTertiary }]}>Member since {joinDate}</Text>
      </View>

      {/* Bandeau invité */}
      {isGuest && (
        <View style={[styles.guestBanner, { backgroundColor: c.card, borderColor: c.cardBorder }, shadows.sm]}>
          <Text style={[styles.guestText, { color: c.textSecondary }]}>
            Guest account — your progress lives only on this device
          </Text>
          <PressableScale
            style={[styles.guestButton, { backgroundColor: c.primary }]}
            onPress={() => setShowLinkSheet(true)}
          >
            <Text style={[styles.guestButtonText, { color: c.primaryText }]}>Save my account</Text>
          </PressableScale>
        </View>
      )}

      {/* Solde Reis */}
      <View style={[styles.creditsCard, { backgroundColor: c.primarySoft }, shadows.md]}>
        <View style={styles.creditsMain}>
          <AnimatedNumber
            value={stats.credits}
            suffix=" ⬡"
            style={[styles.creditsNumber, { color: c.primary }]}
          />
          <Text style={[styles.creditsLabel, { color: c.textSecondary }]}>Reis</Text>
        </View>
        <View style={styles.addWrap}>
          <PressableScale
            style={[styles.addButton, { backgroundColor: c.primary }]}
            onPress={() => router.push("/paywall")}
            accessibilityLabel="Top up Reis"
          >
            <Text style={[styles.addButtonText, { color: c.primaryText }]}>+</Text>
          </PressableScale>
          <Text style={[styles.addLabel, { color: c.textSecondary }]}>Top up</Text>
        </View>
        {stats.streak_days >= 2 && (
          <View style={[styles.streakBadge, { backgroundColor: palette.warning }]}>
            <Text style={styles.streakText}>🔥 {stats.streak_days}d</Text>
          </View>
        )}
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <StatCard value={stats.active_squares} label="Active" colors={c} />
        <StatCard value={stats.total_publications} label="Publications" colors={c} />
        <StatCard value={stats.total_replacements} label="Conquests" colors={c} />
        <StatCard value={stats.cells_explored} label="Explored" colors={c} />
        <StatCard value={stats.total_votes_received} label="Votes" colors={c} />
        <StatCard value={stats.follower_count} label="Followers" colors={c} />
      </View>

      {/* Badges */}
      {stats.badges && stats.badges.length > 0 && (
        <View style={styles.badgesSection}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Badges</Text>
          <View style={styles.badgesGrid}>
            {stats.badges.map((badge) => (
              <View
                key={badge.badge_id ?? badge.id}
                style={[styles.badgeItem, { backgroundColor: c.bgTertiary }]}
              >
                <Text style={styles.badgeIcon}>{badge.icon}</Text>
                <Text style={[styles.badgeName, { color: c.textSecondary }]}>{badge.name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* How to play */}
      <View style={[styles.privacyCard, { backgroundColor: c.card, borderColor: c.cardBorder, marginBottom: spacing.xl }, shadows.sm]}>
        <PressableScale style={styles.privacyRow} onPress={() => router.push("/how-to-play")}>
          <Text style={[styles.privacyRowText, { color: c.text }]}>📖 How to play</Text>
          <Text style={[styles.privacyChevron, { color: c.textTertiary }]}>›</Text>
        </PressableScale>
      </View>

      {/* Account & privacy */}
      <View style={styles.privacySection}>
        <Text style={[styles.sectionTitle, { color: c.text }]}>Account & privacy</Text>
        <View style={[styles.privacyCard, { backgroundColor: c.card, borderColor: c.cardBorder }, shadows.sm]}>
          <PressableScale style={styles.privacyRow} onPress={handleExportData}>
            <Text style={[styles.privacyRowText, { color: c.text }]}>Export my data</Text>
            {exporting ? (
              <ActivityIndicator size="small" color={c.primary} />
            ) : (
              <Text style={[styles.privacyChevron, { color: c.textTertiary }]}>›</Text>
            )}
          </PressableScale>
          <View style={[styles.privacyDivider, { backgroundColor: c.cardBorder }]} />
          <PressableScale
            style={styles.privacyRow}
            onPress={() => Linking.openURL("https://piri.app/privacy")}
          >
            <Text style={[styles.privacyRowText, { color: c.text }]}>Privacy policy</Text>
            <Text style={[styles.privacyChevron, { color: c.textTertiary }]}>›</Text>
          </PressableScale>
          <View style={[styles.privacyDivider, { backgroundColor: c.cardBorder }]} />
          <PressableScale style={styles.privacyRow} onPress={handleDeleteAccount}>
            <Text style={[styles.privacyRowText, { color: c.error }]}>Delete my account</Text>
            {deleting ? (
              <ActivityIndicator size="small" color={c.error} />
            ) : (
              <Text style={[styles.privacyChevron, { color: c.textTertiary }]}>›</Text>
            )}
          </PressableScale>
        </View>
      </View>

      {/* Logout */}
      <Pressable
        style={({ pressed }) => [
          styles.logoutButton,
          { backgroundColor: c.bgTertiary, opacity: pressed ? 0.8 : 1 },
        ]}
        onPress={handleLogout}
      >
        <Text style={[styles.logoutText, { color: c.error }]}>Sign out</Text>
      </Pressable>

      <LinkAccountSheet
        visible={showLinkSheet}
        onClose={() => setShowLinkSheet(false)}
        onLinked={() => refresh()}
      />
    </ScrollView>
  );
}

function StatCard({ value, label, colors: c }: { value: number; label: string; colors: ThemeColors }) {
  return (
    <View style={[styles.statBox, { backgroundColor: c.card, borderColor: c.cardBorder }, shadows.sm]}>
      <Text style={[styles.statNumber, { color: c.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: c.textTertiary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingTop: 60, paddingBottom: 40, paddingHorizontal: spacing.base },

  header: { alignItems: "center", marginBottom: spacing.xl },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarPlaceholder: {
    width: 88, height: 88, borderRadius: 44,
    justifyContent: "center", alignItems: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 32, fontWeight: fonts.weights.bold },
  username: { fontSize: fonts.sizes.xl, fontWeight: fonts.weights.bold, marginTop: spacing.md },
  editRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  input: {
    borderWidth: 1, borderRadius: radii.sm,
    padding: spacing.sm, fontSize: fonts.sizes.md, width: 180,
  },
  saveButton: { borderRadius: radii.sm, padding: spacing.sm, paddingHorizontal: spacing.base },
  saveText: { fontWeight: fonts.weights.semibold },
  joinDate: { fontSize: fonts.sizes.sm, marginTop: spacing.xs },
  teamBadge: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  teamBadgeText: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold },

  guestBanner: {
    borderWidth: 1, borderRadius: radii.lg, padding: spacing.base,
    marginBottom: spacing.lg, alignItems: "center", gap: spacing.md,
  },
  guestText: { fontSize: fonts.sizes.sm, textAlign: "center" },
  guestButton: {
    borderRadius: radii.full, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.xl,
  },
  guestButtonText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },

  creditsCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: radii.lg, paddingVertical: spacing.lg, paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg, gap: spacing.base,
  },
  creditsMain: { alignItems: "center" },
  creditsNumber: { fontSize: 36, fontWeight: fonts.weights.heavy },
  creditsLabel: { fontSize: fonts.sizes.sm },
  addWrap: { alignItems: "center", gap: 2 },
  addButton: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: "center", alignItems: "center",
  },
  addButtonText: { fontSize: fonts.sizes.xl, fontWeight: fonts.weights.bold, lineHeight: 26 },
  addLabel: { fontSize: fonts.sizes.xs, fontWeight: fonts.weights.semibold },
  streakBadge: {
    borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  streakText: { color: "#fff", fontWeight: fonts.weights.bold, fontSize: fonts.sizes.base },

  statsGrid: {
    flexDirection: "row", flexWrap: "wrap",
    justifyContent: "space-between", gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  statBox: {
    alignItems: "center",
    borderRadius: radii.md, padding: spacing.md,
    width: "31%", borderWidth: 1,
  },
  statNumber: { fontSize: fonts.sizes.xl, fontWeight: fonts.weights.bold },
  statLabel: { fontSize: fonts.sizes.xs, textAlign: "center", marginTop: 2 },

  badgesSection: { marginBottom: spacing.xl },
  sectionTitle: { fontSize: fonts.sizes.lg, fontWeight: fonts.weights.bold, marginBottom: spacing.md },
  badgesGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  badgeItem: {
    alignItems: "center", borderRadius: radii.md, padding: spacing.md, width: 76,
  },
  badgeIcon: { fontSize: 26, marginBottom: spacing.xs },
  badgeName: { fontSize: fonts.sizes.xs, textAlign: "center" },

  privacySection: { marginBottom: spacing.xl },
  privacyCard: { borderWidth: 1, borderRadius: radii.lg, overflow: "hidden" },
  privacyRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: spacing.base,
  },
  privacyRowText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.medium },
  privacyChevron: { fontSize: fonts.sizes.lg, fontWeight: fonts.weights.semibold },
  privacyDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.base },

  logoutButton: {
    borderRadius: radii.md, padding: spacing.base, alignItems: "center", marginTop: spacing.sm,
  },
  logoutText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
});
