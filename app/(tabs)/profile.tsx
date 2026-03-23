import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../src/lib/supabase";

interface Profile {
  username: string;
  avatar_url: string | null;
  created_at: string;
}

interface Stats {
  total: number;
  active: number;
}

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0 });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [newUsername, setNewUsername] = useState("");

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

    // Get stats
    const { count: total } = await supabase
      .from("publications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    const { count: active } = await supabase
      .from("publications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "active");

    setStats({ total: total ?? 0, active: active ?? 0 });
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
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ["images"],
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
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
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
    <View style={styles.container}>
      <Text style={styles.title}>Profil</Text>

      <Pressable style={styles.avatarContainer} onPress={handleAvatarUpload}>
        {profile?.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>
              {profile?.username?.charAt(0).toUpperCase() ?? "?"}
            </Text>
          </View>
        )}
        <Text style={styles.changeAvatar}>Changer la photo</Text>
      </Pressable>

      {editing ? (
        <View style={styles.editRow}>
          <TextInput
            style={styles.input}
            value={newUsername}
            onChangeText={setNewUsername}
            autoFocus
          />
          <Pressable style={styles.saveButton} onPress={handleUpdateUsername}>
            <Text style={styles.saveText}>OK</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setEditing(true)}>
          <Text style={styles.username}>{profile?.username}</Text>
          <Text style={styles.editHint}>Appuyer pour modifier</Text>
        </Pressable>
      )}

      <Text style={styles.joinDate}>Membre depuis {joinDate}</Text>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNumber}>{stats.total}</Text>
          <Text style={styles.statLabel}>Publications</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statNumber}>{stats.active}</Text>
          <Text style={styles.statLabel}>Actives</Text>
        </View>
      </View>

      <Pressable style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", alignItems: "center", paddingTop: 60 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 24 },
  avatarContainer: { alignItems: "center", marginBottom: 16 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 36, fontWeight: "bold" },
  changeAvatar: { color: "#007AFF", fontSize: 14, marginTop: 8 },
  username: { fontSize: 22, fontWeight: "600", textAlign: "center" },
  editHint: { fontSize: 12, color: "#999", textAlign: "center", marginTop: 2 },
  editRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    fontSize: 18,
    width: 200,
  },
  saveButton: { backgroundColor: "#007AFF", borderRadius: 8, padding: 10, paddingHorizontal: 16 },
  saveText: { color: "#fff", fontWeight: "600" },
  joinDate: { color: "#999", fontSize: 14, marginTop: 8, marginBottom: 24 },
  statsRow: { flexDirection: "row", gap: 32, marginBottom: 32 },
  stat: { alignItems: "center" },
  statNumber: { fontSize: 28, fontWeight: "bold" },
  statLabel: { fontSize: 14, color: "#666" },
  logoutButton: {
    backgroundColor: "#FF3B30",
    borderRadius: 8,
    padding: 16,
    paddingHorizontal: 32,
    marginTop: "auto",
    marginBottom: 40,
  },
  logoutText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
