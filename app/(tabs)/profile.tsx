import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../src/lib/supabase";
import { useUserStats } from "../../src/hooks/useUserStats";
import { useThemeColors, fonts, spacing, radii, shadows, palette, ThemeColors } from "../../src/theme";
import type { UserStats } from "../../src/types/square";

interface Profile {
  username: string;
  avatar_url: string | null;
  created_at: string;
}

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const { stats, loading: statsLoading, refetch: refetchStats } = useUserStats();
  const c = useThemeColors();

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileData } = await supabase
      .from("profiles")
      .select("username, avatar_url, created_at")
      .eq("user_id", user.id)
      .single();

    if (profileData) {
      setProfile(profileData as Profile);
      setNewUsername(profileData.username);
    }

    setLoading(false);
  };

  const handleUpdateUsername = async () => {
    if (!newUsername.trim()) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("profiles")
      .update({ username: newUsername.trim(), updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    if (error) {
      Alert.alert("Erreur", error.message);
    } else {
      setProfile((prev) => (prev ? { ...prev, username: newUsername.trim() } : null));
      setEditing(false);
    }
  };

  const handleAvatarUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7,
      allowsEditing: false,
      mediaTypes: ["images"],
      exif: false,
    });

    if (result.canceled || !result.assets[0]) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const response = await fetch(result.assets[0].uri);
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();
    const fileName = `avatars/${user.id}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("publications")
      .upload(fileName, arrayBuffer, { contentType: "image/jpeg", upsert: true });

    if (uploadError) {
      Alert.alert("Erreur", uploadError.message);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("publications").getPublicUrl(fileName);

    await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    setProfile((prev) => (prev ? { ...prev, avatar_url: publicUrl } : null));
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert("Erreur", error.message);
    } else {
      router.replace("/(auth)/sign-in");
    }
  };

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  const joinDate = profile
    ? new Date(profile.created_at).toLocaleDateString("fr-FR", {
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
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
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

        <Text style={[styles.joinDate, { color: c.textTertiary }]}>Membre depuis {joinDate}</Text>
      </View>

      {/* Solde Tessels */}
      <View style={[styles.creditsCard, { backgroundColor: c.primarySoft }, shadows.md]}>
        <View style={styles.creditsMain}>
          <Text style={[styles.creditsNumber, { color: c.primary }]}>{stats.credits} ⬡</Text>
          <Text style={[styles.creditsLabel, { color: c.textSecondary }]}>Tessels</Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={() => router.push("/paywall")}
        >
          <Text style={[styles.addButtonText, { color: c.primaryText }]}>+</Text>
        </Pressable>
        {stats.streak_days > 0 && (
          <View style={[styles.streakBadge, { backgroundColor: palette.warning }]}>
            <Text style={styles.streakText}>{stats.streak_days}j</Text>
          </View>
        )}
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <StatCard value={stats.active_squares} label="Actives" colors={c} />
        <StatCard value={stats.total_publications} label="Publications" colors={c} />
        <StatCard value={stats.total_replacements} label="Conquêtes" colors={c} />
        <StatCard value={stats.cells_explored} label="Explorées" colors={c} />
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

      {/* Logout */}
      <Pressable
        style={({ pressed }) => [
          styles.logoutButton,
          { backgroundColor: c.bgTertiary, opacity: pressed ? 0.8 : 1 },
        ]}
        onPress={handleLogout}
      >
        <Text style={[styles.logoutText, { color: c.error }]}>Se déconnecter</Text>
      </Pressable>
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
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },

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

  creditsCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: radii.lg, paddingVertical: spacing.lg, paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg, gap: spacing.base,
  },
  creditsMain: { alignItems: "center" },
  creditsNumber: { fontSize: 36, fontWeight: fonts.weights.heavy },
  creditsLabel: { fontSize: fonts.sizes.sm },
  addButton: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: "center", alignItems: "center",
  },
  addButtonText: { fontSize: fonts.sizes.xl, fontWeight: fonts.weights.bold, lineHeight: 26 },
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

  logoutButton: {
    borderRadius: radii.md, padding: spacing.base, alignItems: "center", marginTop: spacing.sm,
  },
  logoutText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
});
