import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { supabase } from "../src/lib/supabase";

export default function UploadScreen() {
  const { squareId } = useLocalSearchParams<{ squareId: string }>();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const pickImage = async (useCamera: boolean) => {
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Permission requise", "Autorisez l'accès pour continuer.");
      return;
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true, aspect: [1, 1] })
      : await ImagePicker.launchImageLibraryAsync({
          quality: 0.8,
          allowsEditing: true,
          aspect: [1, 1],
          mediaTypes: ["images"],
        });

    if (!result.canceled && result.assets[0]) {
      // Compress to max 1024x1024
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 1024, height: 1024 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );
      setImageUri(manipulated.uri);
    }
  };

  const handleUpload = async () => {
    if (!imageUri || !squareId) return;

    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Read the file as blob
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();

      const fileName = `${squareId}/${Date.now()}.jpg`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("publications")
        .upload(fileName, arrayBuffer, { contentType: "image/jpeg" });

      if (uploadError) throw uploadError;

      // Get the public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("publications").getPublicUrl(fileName);

      // Create publication via RPC (handles locking + rate limiting)
      const { data: pubId, error: pubError } = await supabase.rpc("publish_to_square", {
        p_square_id: squareId,
        p_user_id: user.id,
        p_image_url: publicUrl,
      });

      if (pubError) throw pubError;

      Alert.alert("Publié !", "Votre image est maintenant visible pendant 24h.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erreur lors de la publication";
      Alert.alert("Erreur", message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Publier une image</Text>

      {imageUri ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: imageUri }} style={styles.preview} />
          <View style={styles.previewActions}>
            <Pressable
              style={styles.changeButton}
              onPress={() => setImageUri(null)}
            >
              <Text style={styles.changeText}>Changer</Text>
            </Pressable>
            <Pressable
              style={[styles.uploadButton, uploading && styles.disabled]}
              onPress={handleUpload}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.uploadText}>Publier</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.choices}>
          <Pressable style={styles.choiceButton} onPress={() => pickImage(true)}>
            <Text style={styles.choiceText}>Prendre une photo</Text>
          </Pressable>
          <Pressable style={styles.choiceButton} onPress={() => pickImage(false)}>
            <Text style={styles.choiceText}>Choisir dans la galerie</Text>
          </Pressable>
        </View>
      )}

      <Pressable style={styles.cancelButton} onPress={() => router.back()}>
        <Text style={styles.cancelText}>Annuler</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 24, justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "bold", textAlign: "center", marginBottom: 32 },
  choices: { gap: 16 },
  choiceButton: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  choiceText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  previewContainer: { alignItems: "center" },
  preview: { width: 280, height: 280, borderRadius: 12, marginBottom: 24 },
  previewActions: { flexDirection: "row", gap: 16 },
  changeButton: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 16,
    paddingHorizontal: 24,
  },
  changeText: { fontSize: 16, color: "#333" },
  uploadButton: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    padding: 16,
    paddingHorizontal: 32,
  },
  disabled: { opacity: 0.6 },
  uploadText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  cancelButton: { marginTop: 24, alignItems: "center" },
  cancelText: { color: "#999", fontSize: 16 },
});
