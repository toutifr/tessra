import { useCallback, useEffect, useMemo, useState } from "react";
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
import MapboxGL from "@rnmapbox/maps";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../src/lib/supabase";
import { getMyTiles, getTeamChallenge, MyTile } from "../../src/lib/economy";
import { cellFromId } from "../../src/lib/kmGrid";
import { focusOnMap } from "../../src/lib/mapFocus";
import { getPlayfulMapStyle } from "../../src/lib/mapStyle";
import { minTakePrice, tesselsToEur } from "../../src/constants/iap";
import { useSWR, mutate, getCached } from "../../src/lib/swr";
import { useAuth } from "../../src/providers/AuthProvider";
import { useUserStats } from "../../src/hooks/useUserStats";
import { levelFromXp } from "../../src/lib/level";
import AnimatedNumber from "../../src/components/AnimatedNumber";
import LinkAccountSheet, { useIsGuest } from "../../src/components/LinkAccountSheet";
import PressableScale from "../../src/components/PressableScale";
import GameButton from "../../src/components/GameButton";
import LevelBadge from "../../src/components/LevelBadge";
import ProgressBar from "../../src/components/ProgressBar";
import SectionHeader from "../../src/components/SectionHeader";
import StatChip from "../../src/components/StatChip";
import { TAB_BAR_SPACE } from "../../src/components/GameTabBar";
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

function soft(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.16)`;
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
            <Skeleton width={72} height={72} borderRadius={36} />
            <Skeleton width={140} height={24} style={{ marginTop: spacing.md }} />
            <Skeleton width={200} height={10} style={{ marginTop: spacing.md }} />
          </View>
          <Skeleton width="100%" height={110} borderRadius={radii.xl} style={{ marginBottom: spacing.lg }} />
          <Skeleton width="100%" height={220} borderRadius={radii.xl} />
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

  const lvl = levelFromXp(stats.total_credits_earned);

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.bg }]} contentContainerStyle={styles.scrollContent}>
      {/* Header joueur */}
      <View style={styles.header}>
        <Pressable onPress={handleAvatarUpload}>
          <View>
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
            <View style={styles.levelBadgeWrap}>
              <LevelBadge level={lvl.level} size={34} />
            </View>
          </View>
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

        {/* XP vers le niveau suivant */}
        <View style={styles.xpWrap}>
          <ProgressBar progress={lvl.progress} color={palette.gold} height={8} />
          <Text style={[styles.xpLabel, { color: c.textSecondary }]}>
            Level {lvl.level} · {lvl.xpInto}/{lvl.xpNeeded} XP
          </Text>
        </View>

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
          <GameButton
            label="Save your progress"
            icon="cloud-upload"
            onPress={() => setShowLinkSheet(true)}
            style={{ alignSelf: "stretch" }}
          />
        </View>
      )}

      {/* Solde Reis + stats chips */}
      <View style={[styles.creditsCard, { backgroundColor: c.card, borderColor: c.cardBorder }, shadows.md]}>
        <View style={styles.creditsRow}>
          <View style={styles.creditsMain}>
            <AnimatedNumber
              value={stats.credits}
              suffix=" ⬡"
              style={[styles.creditsNumber, { color: palette.goldDark }]}
            />
            <Text style={[styles.creditsLabel, { color: c.textSecondary }]}>Reis balance</Text>
          </View>
          <GameButton
            label="Top up"
            icon="add"
            variant="gold"
            size="md"
            onPress={() => router.push("/paywall")}
          />
        </View>
        <View style={styles.chipsRow}>
          {stats.streak_days >= 2 && (
            <StatChip icon="flame" value={stats.streak_days} label="day streak" color={palette.amber} />
          )}
          <StatChip icon="map" value={stats.active_squares} label="tiles" color={palette.grass} />
          <StatChip icon="heart" value={stats.total_votes_received} label="votes" color={palette.redstone} />
        </View>
      </View>

      {/* Mon empire — minimap + valeur du portefeuille */}
      {uid && <EmpireCard uid={uid} colors={c} />}

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <StatCard value={stats.total_publications} label="Publications" colors={c} />
        <StatCard value={stats.total_replacements} label="Conquests" colors={c} />
        <StatCard value={stats.cells_explored} label="Explored" colors={c} />
        <StatCard value={stats.follower_count} label="Followers" colors={c} />
      </View>

      {/* Badges */}
      {stats.badges && stats.badges.length > 0 && (
        <View style={styles.badgesSection}>
          <SectionHeader title="Badges" color={palette.diamond} />
          <View style={{ height: spacing.md }} />
          <View style={styles.badgesGrid}>
            {stats.badges.map((badge) => (
              <View
                key={badge.badge_id ?? badge.id}
                style={[styles.badgeItem, { backgroundColor: c.card, borderColor: c.cardBorder }]}
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
          <View style={styles.rowLeft}>
            <View style={[styles.rowPastille, { backgroundColor: soft(palette.diamond) }]}>
              <Ionicons name="book" size={16} color={palette.diamond} />
            </View>
            <Text style={[styles.privacyRowText, { color: c.text }]}>How to play</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.textTertiary} />
        </PressableScale>
      </View>

      {/* Account & privacy */}
      <View style={styles.privacySection}>
        <SectionHeader title="Account & privacy" color={palette.gray500} />
        <View style={{ height: spacing.md }} />
        <View style={[styles.privacyCard, { backgroundColor: c.card, borderColor: c.cardBorder }, shadows.sm]}>
          <PressableScale style={styles.privacyRow} onPress={handleExportData}>
            <View style={styles.rowLeft}>
              <View style={[styles.rowPastille, { backgroundColor: soft(palette.grass) }]}>
                <Ionicons name="download" size={16} color={palette.grass} />
              </View>
              <Text style={[styles.privacyRowText, { color: c.text }]}>Export my data</Text>
            </View>
            {exporting ? (
              <ActivityIndicator size="small" color={c.primary} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={c.textTertiary} />
            )}
          </PressableScale>
          <View style={[styles.privacyDivider, { backgroundColor: c.cardBorder }]} />
          <PressableScale
            style={styles.privacyRow}
            onPress={() => Linking.openURL("https://piri.app/privacy")}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.rowPastille, { backgroundColor: soft(palette.diamond) }]}>
                <Ionicons name="lock-closed" size={16} color={palette.diamond} />
              </View>
              <Text style={[styles.privacyRowText, { color: c.text }]}>Privacy policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.textTertiary} />
          </PressableScale>
          <View style={[styles.privacyDivider, { backgroundColor: c.cardBorder }]} />
          <PressableScale style={styles.privacyRow} onPress={handleDeleteAccount}>
            <View style={styles.rowLeft}>
              <View style={[styles.rowPastille, { backgroundColor: soft(palette.redstone) }]}>
                <Ionicons name="trash" size={16} color={palette.redstone} />
              </View>
              <Text style={[styles.privacyRowText, { color: c.error }]}>Delete my account</Text>
            </View>
            {deleting ? (
              <ActivityIndicator size="small" color={c.error} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={c.textTertiary} />
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

function EmpireCard({ uid, colors: c }: { uid: string; colors: ThemeColors }) {
  const { data: tiles, refresh } = useSWR<MyTile[]>(
    `myTiles:${uid}`,
    () => getMyTiles(uid),
    60000,
  );
  const [styleJSON, setStyleJSON] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getPlayfulMapStyle().then((json) => {
      if (mounted && json) setStyleJSON(json);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const geo = useMemo(() => {
    if (!tiles || tiles.length === 0) return null;
    const features: GeoJSON.Feature[] = [];
    let minLat = Infinity;
    let minLng = Infinity;
    let maxLat = -Infinity;
    let maxLng = -Infinity;
    let sumLat = 0;
    let sumLng = 0;
    for (const t of tiles) {
      const cell = cellFromId(t.cell_id);
      const centerLat = cell?.center.lat ?? t.lat;
      const centerLng = cell?.center.lng ?? t.lng;
      sumLat += centerLat;
      sumLng += centerLng;
      if (cell) {
        features.push({
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[
              [cell.sw.lng, cell.sw.lat],
              [cell.ne.lng, cell.sw.lat],
              [cell.ne.lng, cell.ne.lat],
              [cell.sw.lng, cell.ne.lat],
              [cell.sw.lng, cell.sw.lat],
            ]],
          },
        });
        minLat = Math.min(minLat, cell.sw.lat);
        maxLat = Math.max(maxLat, cell.ne.lat);
        minLng = Math.min(minLng, cell.sw.lng);
        maxLng = Math.max(maxLng, cell.ne.lng);
      } else {
        minLat = Math.min(minLat, centerLat);
        maxLat = Math.max(maxLat, centerLat);
        minLng = Math.min(minLng, centerLng);
        maxLng = Math.max(maxLng, centerLng);
      }
    }
    const collection: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features,
    };
    return {
      collection,
      bbox: { minLat, maxLat, minLng, maxLng },
      centroid: { lat: sumLat / tiles.length, lng: sumLng / tiles.length },
    };
  }, [tiles]);

  if (!tiles) return null;

  // État vide — léger
  if (tiles.length === 0 || !geo) {
    return (
      <View style={[styles.empireEmptyCard, { backgroundColor: c.card, borderColor: c.cardBorder }, shadows.sm]}>
        <Text style={[styles.empireEmptyText, { color: c.textSecondary }]}>
          Your empire starts with one photo. Go claim your first tile.
        </Text>
        <GameButton
          label="Open the map"
          icon="map"
          size="md"
          onPress={() => router.push("/(tabs)")}
        />
      </View>
    );
  }

  // Ce que ça coûterait à quelqu'un de tout te prendre
  const portfolioValue = tiles.reduce((sum, t) => sum + minTakePrice(t.last_price), 0);
  const span = Math.max(geo.bbox.maxLat - geo.bbox.minLat, geo.bbox.maxLng - geo.bbox.minLng);
  const focusZoom = span > 0.2 ? 9 : span > 0.05 ? 11 : 13;

  const handleOpenOnMap = () => {
    focusOnMap({ lat: geo.centroid.lat, lng: geo.centroid.lng, zoom: focusZoom });
    router.push("/(tabs)");
  };

  return (
    <PressableScale
      style={[styles.empireCard, { backgroundColor: c.card, borderColor: c.cardBorder }, shadows.md]}
      onPress={handleOpenOnMap}
      accessibilityLabel="Open my empire on the map"
    >
      <View style={styles.empireHeader}>
        <View style={{ flex: 1 }}>
          <SectionHeader title="Your empire" color={palette.gold} />
        </View>
        <Text style={styles.empireValueGold}>{portfolioValue} ⬡</Text>
      </View>
      <Text style={[styles.empireCount, { color: c.textTertiary }]}>
        {tiles.length} tile{tiles.length > 1 ? "s" : ""} on the mosaic
      </Text>
      <View style={styles.empireMapWrap} pointerEvents="none">
        <MapboxGL.MapView
          style={styles.empireMap}
          styleURL={styleJSON ? undefined : MapboxGL.StyleURL.Dark}
          styleJSON={styleJSON ?? undefined}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          logoEnabled={false}
          attributionEnabled={false}
          scaleBarEnabled={false}
        >
          {tiles.length === 1 ? (
            <MapboxGL.Camera
              centerCoordinate={[geo.centroid.lng, geo.centroid.lat]}
              zoomLevel={12}
              animationDuration={0}
            />
          ) : (
            <MapboxGL.Camera
              bounds={{
                ne: [geo.bbox.maxLng, geo.bbox.maxLat],
                sw: [geo.bbox.minLng, geo.bbox.minLat],
                paddingLeft: 24,
                paddingRight: 24,
                paddingTop: 24,
                paddingBottom: 24,
              }}
              animationDuration={0}
            />
          )}
          <MapboxGL.ShapeSource id="empire-tiles" shape={geo.collection}>
            <MapboxGL.FillLayer
              id="empire-tiles-fill"
              style={{ fillColor: palette.gold, fillOpacity: 0.25 }}
            />
            <MapboxGL.LineLayer
              id="empire-tiles-outline"
              style={{ lineColor: palette.gold, lineWidth: 1.5 }}
            />
          </MapboxGL.ShapeSource>
        </MapboxGL.MapView>
        <View style={styles.empireValueRow}>
          <Text style={styles.empireValueLabel}>Portfolio value</Text>
          <Text style={styles.empireValueText}>
            {portfolioValue} ⬡ · {tesselsToEur(portfolioValue)}
          </Text>
        </View>
      </View>
    </PressableScale>
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
  scrollContent: {
    paddingTop: 60,
    paddingBottom: TAB_BAR_SPACE + spacing.base,
    paddingHorizontal: spacing.base,
  },

  header: { alignItems: "center", marginBottom: spacing.xl },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarPlaceholder: {
    width: 72, height: 72, borderRadius: 36,
    justifyContent: "center", alignItems: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 28, fontWeight: fonts.weights.bold },
  levelBadgeWrap: { position: "absolute", bottom: -8, right: -12 },
  username: {
    fontSize: fonts.sizes.hero,
    fontWeight: fonts.weights.heavy,
    letterSpacing: fonts.letterSpacing.tight,
    marginTop: spacing.md,
  },
  xpWrap: { alignSelf: "stretch", marginTop: spacing.md, gap: spacing.xs, paddingHorizontal: spacing.xl },
  xpLabel: { fontSize: 11, fontWeight: fonts.weights.semibold, textAlign: "center" },
  editRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  input: {
    borderWidth: 1, borderRadius: radii.sm,
    padding: spacing.sm, fontSize: fonts.sizes.md, width: 180,
  },
  saveButton: { borderRadius: radii.sm, padding: spacing.sm, paddingHorizontal: spacing.base },
  saveText: { fontWeight: fonts.weights.semibold },
  joinDate: { fontSize: fonts.sizes.sm, marginTop: spacing.sm },
  teamBadge: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    marginTop: spacing.md,
  },
  teamBadgeText: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold },

  guestBanner: {
    borderWidth: 1, borderRadius: radii.lg, padding: spacing.base,
    marginBottom: spacing.lg, alignItems: "center", gap: spacing.md,
  },
  guestText: { fontSize: fonts.sizes.sm, textAlign: "center" },

  creditsCard: {
    borderWidth: 1, borderRadius: radii.xl,
    padding: spacing.base,
    marginBottom: spacing.lg, gap: spacing.md,
  },
  creditsRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  creditsMain: { alignItems: "flex-start" },
  creditsNumber: { fontSize: 34, fontWeight: fonts.weights.heavy, letterSpacing: fonts.letterSpacing.tight },
  creditsLabel: { fontSize: fonts.sizes.sm, marginTop: 2 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },

  empireCard: {
    borderWidth: 1, borderRadius: radii.xl, padding: spacing.base,
    marginBottom: spacing.lg,
  },
  empireHeader: {
    flexDirection: "row", alignItems: "center",
  },
  empireValueGold: {
    color: palette.goldDark,
    fontSize: fonts.sizes.md,
    fontWeight: fonts.weights.heavy,
  },
  empireCount: { fontSize: fonts.sizes.sm, marginTop: 2, marginBottom: spacing.md, marginLeft: 12 },
  empireMapWrap: { borderRadius: radii.lg, overflow: "hidden" },
  empireMap: { height: 170 },
  empireValueRow: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "rgba(12, 16, 19, 0.85)",
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  empireValueLabel: {
    color: "rgba(255,255,255,0.7)", fontSize: fonts.sizes.xs,
    fontWeight: fonts.weights.semibold,
  },
  empireValueText: { color: palette.gold, fontSize: fonts.sizes.sm, fontWeight: fonts.weights.bold },
  empireEmptyCard: {
    borderWidth: 1, borderRadius: radii.xl, padding: spacing.base,
    marginBottom: spacing.lg, alignItems: "center", gap: spacing.md,
  },
  empireEmptyText: { fontSize: fonts.sizes.sm, textAlign: "center" },

  statsGrid: {
    flexDirection: "row", flexWrap: "wrap",
    justifyContent: "space-between", gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  statBox: {
    alignItems: "center",
    borderRadius: radii.lg, padding: spacing.md,
    width: "47%", borderWidth: 1, flexGrow: 1,
  },
  statNumber: { fontSize: fonts.sizes.xl, fontWeight: fonts.weights.heavy },
  statLabel: { fontSize: fonts.sizes.xs, textAlign: "center", marginTop: 2 },

  badgesSection: { marginBottom: spacing.xl },
  badgesGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  badgeItem: {
    alignItems: "center", borderRadius: radii.lg, borderWidth: 1,
    padding: spacing.md, width: 76,
  },
  badgeIcon: { fontSize: 26, marginBottom: spacing.xs },
  badgeName: { fontSize: fonts.sizes.xs, textAlign: "center" },

  privacySection: { marginBottom: spacing.xl },
  privacyCard: { borderWidth: 1, borderRadius: radii.lg, overflow: "hidden" },
  privacyRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: spacing.base,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 },
  rowPastille: {
    width: 32, height: 32, borderRadius: radii.sm + 2,
    alignItems: "center", justifyContent: "center",
  },
  privacyRowText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
  privacyDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.base },

  logoutButton: {
    borderRadius: radii.lg, padding: spacing.base, alignItems: "center", marginTop: spacing.sm,
  },
  logoutText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
});
