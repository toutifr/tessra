import { useCallback, useEffect, useState } from "react";
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
import * as Location from "expo-location";
import { supabase } from "../src/lib/supabase";
import { cellFromId } from "../src/lib/kmGrid";
import { emitOptimisticUpload } from "../src/lib/tileEvents";
import { takeSquare, InsufficientTesselsError } from "../src/lib/economy";
import { tesselsToEur } from "../src/constants/iap";
import { track } from "../src/lib/track";
import { hapticHeavy, hapticSuccess } from "../src/lib/haptics";
import { sectorLabel } from "../src/lib/sector";
import ConquestOverlay from "../src/components/ConquestOverlay";
import { useThemeColors, fonts, spacing, radii, shadows } from "../src/theme";

export default function UploadScreen() {
  const { squareId, cellId, replace, minPrice: minPriceParam } = useLocalSearchParams<{
    squareId?: string;
    cellId?: string;
    replace?: string;
    minPrice?: string;
  }>();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState(false);
  const [locating, setLocating] = useState(false);
  const isTake = replace === "true";
  const minPrice = Number(minPriceParam ?? 0);
  const [priceInput, setPriceInput] = useState(String(minPrice));
  const [priceError, setPriceError] = useState<string | null>(null);
  const [successOverlay, setSuccessOverlay] = useState<{ title: string; subtitle?: string } | null>(
    null,
  );
  const c = useThemeColors();

  const requestLocation = useCallback(async () => {
    setLocating(true);
    setLocationError(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationError(true);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setUserCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch {
      setLocationError(true);
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    // GPS obligatoire uniquement pour la publication libre
    if (!isTake) {
      requestLocation();
    }
  }, [isTake, requestLocation]);

  const pickImage = async (useCamera: boolean) => {
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert("Permission requise", "Autorisez l'accès pour continuer.");
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            quality: 0.7,
            allowsEditing: false,
            exif: false,
          })
        : await ImagePicker.launchImageLibraryAsync({
            quality: 0.7,
            allowsEditing: false,
            mediaTypes: ["images"],
            exif: false,
          });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      const asset = result.assets[0];
      const rawUri = asset.uri;
      const w = asset.width ?? 0;
      const h = asset.height ?? 0;

      const cropActions: ImageManipulator.Action[] = [];
      if (w > 0 && h > 0 && w !== h) {
        const side = Math.min(w, h);
        const originX = Math.floor((w - side) / 2);
        const originY = Math.floor((h - side) / 2);
        cropActions.push({ crop: { originX, originY, width: side, height: side } });
      }
      cropActions.push({ resize: { width: 1024, height: 1024 } });

      try {
        const manipulated = await ImageManipulator.manipulateAsync(
          rawUri,
          cropActions,
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
        );
        setImageUri(manipulated.uri);
        return;
      } catch {
        // Fallback
      }

      try {
        const manipulated = await ImageManipulator.manipulateAsync(
          rawUri,
          [{ resize: { width: 512, height: 512 } }],
          { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG },
        );
        setImageUri(manipulated.uri);
        return;
      } catch {
        // Fallback
      }

      try {
        const manipulated = await ImageManipulator.manipulateAsync(
          rawUri,
          [],
          { compress: 0.4, format: ImageManipulator.SaveFormat.JPEG },
        );
        setImageUri(manipulated.uri);
        return;
      } catch {
        // All failed
      }

      setImageUri(rawUri);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : JSON.stringify(e);
      Alert.alert("Erreur image", msg);
    }
  };

  const validateBid = (): number | null => {
    const price = Number(priceInput);
    if (isNaN(price) || !Number.isInteger(price) || price < minPrice) {
      setPriceError(`Le prix minimum est ${minPrice} ⬡`);
      return null;
    }
    setPriceError(null);
    return price;
  };

  const handleUpload = async () => {
    if (!imageUri) return;
    if (!squareId && !cellId) return;

    let bid: number | null = null;
    if (isTake) {
      bid = validateBid();
      if (bid === null) return;
    } else if (!userCoords) {
      // Publication libre : GPS obligatoire
      setLocationError(true);
      return;
    }

    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Connectez-vous pour publier");

      const response = await fetch(imageUri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();

      const storageKey = squareId ?? cellId!;
      const fileName = `${storageKey}/${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("publications")
        .upload(fileName, arrayBuffer, { contentType: "image/jpeg" });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("publications").getPublicUrl(fileName);

      if (isTake && squareId) {
        // Prise payée en Tessels — à distance, pas de GPS
        await takeSquare(squareId, user.id, publicUrl, bid ?? undefined);
        track("take_square", { square_id: squareId, bid });
      } else if (squareId) {
        // Case libre existante : passe par publish_new_square (GPS vérifié serveur)
        const { data: sq, error: sqError } = await supabase
          .from("squares")
          .select("cell_id, geohash, lat, lng")
          .eq("id", squareId)
          .single();
        if (sqError || !sq) throw sqError ?? new Error("Case introuvable");

        const result = await supabase.rpc("publish_new_square", {
          p_geohash: sq.cell_id ?? sq.geohash,
          p_lat: sq.lat,
          p_lng: sq.lng,
          p_user_id: user.id,
          p_image_url: publicUrl,
          p_user_lat: userCoords!.lat,
          p_user_lng: userCoords!.lng,
        });
        if (result.error) throw result.error;
        track("publish", { square_id: squareId });
      } else if (cellId) {
        const cell = cellFromId(cellId);
        if (!cell) throw new Error("ID de cellule invalide");

        const result = await supabase.rpc("publish_new_square", {
          p_geohash: cellId,
          p_lat: cell.center.lat,
          p_lng: cell.center.lng,
          p_user_id: user.id,
          p_image_url: publicUrl,
          p_user_lat: userCoords!.lat,
          p_user_lng: userCoords!.lng,
        });
        if (result.error) throw result.error;
        track("publish", { cell_id: cellId });
      }

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

      if (isTake) {
        hapticHeavy();
        setTimeout(hapticSuccess, 150);
        setSuccessOverlay({ title: "Case conquise !", subtitle: `−${bid} ⬡` });
      } else {
        hapticSuccess();
        setSuccessOverlay({ title: "Tesselle posée !" });
      }
    } catch (e: unknown) {
      if (e instanceof InsufficientTesselsError) {
        router.push(`/paywall?need=${e.need}`);
        return;
      }

      const message =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e !== null && "message" in e
            ? String((e as { message: unknown }).message)
            : JSON.stringify(e);

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

  // Publication libre sans position : bloquant
  const needsLocation = !isTake && !userCoords;

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      {needsLocation && (locationError || locating) ? (
        <View style={styles.choices}>
          <Text style={[styles.title, { color: c.text }]}>Position requise</Text>
          {locating ? (
            <ActivityIndicator size="large" color={c.primary} />
          ) : (
            <>
              <Text style={[styles.locationText, { color: c.textSecondary }]}>
                Tessra a besoin de ta position : tu dois être dans la case pour publier
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.choiceButton,
                  { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 },
                  shadows.md,
                ]}
                onPress={requestLocation}
              >
                <Text style={[styles.choiceText, { color: c.primaryText }]}>Réessayer</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : imageUri ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: imageUri }} style={styles.preview} />

          {isTake && (
            <View style={styles.priceSection}>
              <Text style={[styles.priceLabel, { color: c.textSecondary }]}>
                Prix minimum : {minPrice} ⬡ ({tesselsToEur(minPrice)})
              </Text>
              <TextInput
                style={[
                  styles.priceInput,
                  {
                    backgroundColor: c.inputBg,
                    borderColor: priceError ? c.error : c.inputBorder,
                    color: c.text,
                  },
                ]}
                value={priceInput}
                onChangeText={(text) => {
                  setPriceInput(text);
                  setPriceError(null);
                }}
                keyboardType="numeric"
                placeholder={`${minPrice}`}
                placeholderTextColor={c.textTertiary}
              />
              {priceError && <Text style={[styles.errorText, { color: c.error }]}>{priceError}</Text>}
            </View>
          )}

          <View style={styles.previewActions}>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                { borderColor: c.border, opacity: pressed ? 0.8 : 1 },
              ]}
              onPress={() => setImageUri(null)}
            >
              <Text style={[styles.secondaryText, { color: c.text }]}>Changer</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: c.primary, opacity: pressed || uploading ? 0.85 : 1 },
              ]}
              onPress={handleUpload}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color={c.primaryText} />
              ) : (
                <Text style={[styles.primaryText, { color: c.primaryText }]}>
                  {isTake ? `Prendre — ${priceInput} ⬡` : "Publier"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.choices}>
          <Text style={[styles.title, { color: c.text }]}>
            {isTake ? "Prendre cette place" : "Publier une image"}
          </Text>
          {cellId ? (
            <Text style={[styles.sectorText, { color: c.textTertiary }]}>
              {sectorLabel(cellId)}
            </Text>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.choiceButton,
              { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 },
              shadows.md,
            ]}
            onPress={() => pickImage(true)}
          >
            <Text style={[styles.choiceText, { color: c.primaryText }]}>Prendre une photo</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.choiceButton,
              { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, opacity: pressed ? 0.85 : 1 },
              shadows.sm,
            ]}
            onPress={() => pickImage(false)}
          >
            <Text style={[styles.choiceText, { color: c.text }]}>Choisir dans la galerie</Text>
          </Pressable>
        </View>
      )}

      <Pressable style={styles.cancelButton} onPress={() => router.back()}>
        <Text style={[styles.cancelText, { color: c.textTertiary }]}>Annuler</Text>
      </Pressable>

      {successOverlay && (
        <ConquestOverlay
          title={successOverlay.title}
          subtitle={successOverlay.subtitle}
          onDone={() => router.back()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.xl, justifyContent: "center" },
  title: {
    fontSize: fonts.sizes.xxl,
    fontWeight: fonts.weights.bold,
    textAlign: "center",
    marginBottom: spacing.xxl,
    letterSpacing: -0.5,
  },
  choices: { gap: spacing.md },
  sectorText: {
    fontSize: fonts.sizes.sm,
    textAlign: "center",
    marginTop: -spacing.xl,
    marginBottom: spacing.md,
  },
  choiceButton: {
    borderRadius: radii.md,
    padding: spacing.base + 2,
    alignItems: "center",
  },
  choiceText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
  locationText: {
    fontSize: fonts.sizes.base,
    textAlign: "center",
    marginBottom: spacing.md,
    lineHeight: fonts.sizes.base * fonts.lineHeights.normal,
  },
  previewContainer: { alignItems: "center" },
  preview: { width: 280, height: 280, borderRadius: radii.lg, marginBottom: spacing.xl },
  previewActions: { flexDirection: "row", gap: spacing.md },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.base,
    paddingHorizontal: spacing.xl,
  },
  secondaryText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.medium },
  primaryButton: {
    borderRadius: radii.md,
    padding: spacing.base,
    paddingHorizontal: spacing.xl,
    flexShrink: 1,
  },
  primaryText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
  cancelButton: { marginTop: spacing.xl, alignItems: "center" },
  cancelText: { fontSize: fonts.sizes.base },
  priceSection: { marginBottom: spacing.base, width: "100%" },
  priceLabel: { fontSize: fonts.sizes.sm, marginBottom: spacing.sm, textAlign: "center" },
  priceInput: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: fonts.sizes.xl,
    textAlign: "center",
    fontWeight: fonts.weights.bold,
  },
  errorText: { fontSize: fonts.sizes.xs, marginTop: spacing.xs, textAlign: "center" },
});
