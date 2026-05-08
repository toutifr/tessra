import { useState } from "react";
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
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { supabase } from "../src/lib/supabase";
import { cellFromId } from "../src/lib/kmGrid";
import { emitOptimisticUpload } from "../src/lib/tileEvents";

export default function UploadScreen() {
  const { squareId, cellId, replace, minPrice: minPriceParam } = useLocalSearchParams<{
    squareId?: string;
    cellId?: string;
    replace?: string;
    minPrice?: string;
  }>();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const isReplacement = replace === "true";
  const minPrice = Number(minPriceParam ?? 0);
  const [priceInput, setPriceInput] = useState(String(minPrice));
  const [priceError, setPriceError] = useState<string | null>(null);

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
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 1024, height: 1024 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );
      setImageUri(manipulated.uri);
    }
  };

  const validatePrice = (): number | null => {
    const price = Number(priceInput);
    if (isNaN(price) || price < minPrice) {
      setPriceError(`Le prix minimum est ${minPrice}€`);
      return null;
    }
    setPriceError(null);
    return price;
  };

  const handleUpload = async () => {
    if (!imageUri) return;
    if (!squareId && !cellId) return;

    // Validate price for replacements
    if (isReplacement) {
      const price = validatePrice();
      if (price === null) return;
    }

    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Connectez-vous pour publier");

      // Read the file as blob
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();

      const storageKey = squareId ?? cellId!;
      const fileName = `${storageKey}/${Date.now()}.jpg`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("publications")
        .upload(fileName, arrayBuffer, { contentType: "image/jpeg" });

      if (uploadError) throw uploadError;

      // Get the public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("publications").getPublicUrl(fileName);

      let pubError;

      if (isReplacement && squareId) {
        // Paid replacement of occupied square
        const price = Number(priceInput);
        const result = await supabase.rpc("replace_square", {
          p_square_id: squareId,
          p_user_id: user.id,
          p_image_url: publicUrl,
          p_price_paid: price,
        });
        pubError = result.error;
      } else if (squareId) {
        // Free publish to existing libre square
        const result = await supabase.rpc("publish_to_square", {
          p_square_id: squareId,
          p_user_id: user.id,
          p_image_url: publicUrl,
        });
        pubError = result.error;
      } else if (cellId) {
        // New square from cell ID — create square + publish atomically
        const cell = cellFromId(cellId);
        if (!cell) throw new Error("ID de cellule invalide");

        const result = await supabase.rpc("publish_new_square", {
          p_geohash: cellId,
          p_lat: cell.center.lat,
          p_lng: cell.center.lng,
          p_user_id: user.id,
          p_image_url: publicUrl,
        });
        pubError = result.error;
      }

      if (pubError) throw pubError;

      // Emit optimistic update so the map shows the photo immediately
      const effectiveCellId = cellId ?? squareId;
      if (effectiveCellId) {
        const cell = cellFromId(effectiveCellId);
        if (cell) {
          emitOptimisticUpload({
            cellId: effectiveCellId,
            imageUri: imageUri,
            lat: cell.center.lat,
            lng: cell.center.lng,
          });
        }
      }

      const message = isReplacement
        ? "Votre image a remplacé la précédente !"
        : "Votre image est maintenant visible tant que personne ne prend votre place.";

      Alert.alert("Publié !", message, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e !== null && "message" in e
            ? String((e as { message: unknown }).message)
            : JSON.stringify(e);

      // Handle stale price error
      if (typeof message === "string" && message.includes("Price too low")) {
        Alert.alert(
          "Prix mis à jour",
          "Le prix minimum a changé. Veuillez réessayer.",
          [{ text: "OK" }],
        );
      } else {
        Alert.alert("Erreur", message);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {isReplacement ? "Prendre cette place" : "Publier une image"}
      </Text>

      {imageUri ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: imageUri }} style={styles.preview} />

          {isReplacement && (
            <View style={styles.priceSection}>
              <Text style={styles.priceLabel}>Prix minimum : {minPrice}€</Text>
              <TextInput
                style={[styles.priceInput, priceError ? styles.priceInputError : null]}
                value={priceInput}
                onChangeText={(text) => {
                  setPriceInput(text);
                  setPriceError(null);
                }}
                keyboardType="numeric"
                placeholder={`${minPrice}`}
              />
              {priceError && <Text style={styles.errorText}>{priceError}</Text>}
            </View>
          )}

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
                <Text style={styles.uploadText}>
                  {isReplacement
                    ? `Prendre cette place pour ${priceInput}€`
                    : "Publier"}
                </Text>
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
  title: { fontSize: 24, fontWeight: "bold", textAlign: "center", marginBottom: 8 },
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
    flexShrink: 1,
  },
  disabled: { opacity: 0.6 },
  uploadText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  cancelButton: { marginTop: 24, alignItems: "center" },
  cancelText: { color: "#999", fontSize: 16 },
  priceSection: { marginBottom: 16, width: "100%" },
  priceLabel: { fontSize: 14, color: "#666", marginBottom: 8, textAlign: "center" },
  priceInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 20,
    textAlign: "center",
    fontWeight: "bold",
  },
  priceInputError: { borderColor: "#FF3B30" },
  errorText: { color: "#FF3B30", fontSize: 12, marginTop: 4, textAlign: "center" },
});
