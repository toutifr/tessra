import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Location from "expo-location";
import { supabase, getCachedUser } from "../src/lib/supabase";
import { cellAt, cellFromId, GridCell } from "../src/lib/kmGrid";
import { emitOptimisticUpload } from "../src/lib/tileEvents";
import { friendlyGameError, getGameState, GameState, takeSquare, InsufficientTesselsError } from "../src/lib/economy";
import { useSWR, invalidate } from "../src/lib/swr";
import { rushPrice, tesselsToEur } from "../src/constants/iap";
import { track } from "../src/lib/track";
import { hapticHeavy, hapticSuccess } from "../src/lib/haptics";
import { sectorLabel } from "../src/lib/sector";
import ConquestOverlay from "../src/components/ConquestOverlay";
import LinkAccountSheet, { useIsGuest } from "../src/components/LinkAccountSheet";
import GameButton from "../src/components/GameButton";
import StatChip from "../src/components/StatChip";
import { palette, useThemeColors, fonts, spacing, radii } from "../src/theme";

// Une seule invite de liaison de compte par lancement d'app.
let linkPromptShown = false;

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
  const baseMinPrice = Number(minPriceParam ?? 0);
  const [rushActive, setRushActive] = useState(false);
  const [raidApplied, setRaidApplied] = useState(false);
  const [takeCell, setTakeCell] = useState<GridCell | null>(null);
  // Game state depuis le cache partagé (instantané si déjà chaud)
  const { data: gameState } = useSWR<GameState>(isTake ? "gameState" : null, getGameState, 30000);
  // Prix effectif — remisé pendant le Rush Hour (le serveur valide de toute façon)
  const minPrice = rushActive ? rushPrice(baseMinPrice) : baseMinPrice;
  const [priceInput, setPriceInput] = useState(String(baseMinPrice));
  const [priceError, setPriceError] = useState<string | null>(null);
  const [successOverlay, setSuccessOverlay] = useState<{ title: string; subtitle?: string } | null>(
    null,
  );
  const [showLinkSheet, setShowLinkSheet] = useState(false);
  const isGuest = useIsGuest();
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

  // Prise : position silencieuse (aucun prompt, non bloquant) pour la remise
  // raid sur place — le serveur revalide de toute façon.
  useEffect(() => {
    if (!isTake) return;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch {
        // silencieux — pas de remise, c'est tout
      }
    })();
  }, [isTake]);

  // Cellule de la case visée — check "sur place" côté client + label secteur
  useEffect(() => {
    if (!squareId) return;
    (async () => {
      const { data } = await supabase
        .from("squares")
        .select("cell_id, lat, lng")
        .eq("id", squareId)
        .single();
      if (!data) return;
      const cell =
        (data.cell_id ? cellFromId(data.cell_id) : null) ?? cellAt(data.lat, data.lng);
      setTakeCell(cell);
    })();
  }, [squareId]);

  // Secteur affiché sous le titre — connu direct en claim (cellId), fetché en take
  const sectorCellId = cellId ?? takeCell?.id ?? null;

  // Sur place = dans les bornes de la cellule visée → −30% (appliqué serveur)
  const onSiteRaid =
    isTake &&
    !!userCoords &&
    !!takeCell &&
    userCoords.lat >= takeCell.sw.lat &&
    userCoords.lat < takeCell.ne.lat &&
    userCoords.lng >= takeCell.sw.lng &&
    userCoords.lng < takeCell.ne.lng;

  const effectiveMin = onSiteRaid
    ? Math.max(100, Math.ceil((minPrice * 0.7) / 10) * 10)
    : minPrice;

  useEffect(() => {
    if (!onSiteRaid || raidApplied) return;
    setRaidApplied(true);
    setPriceInput(String(effectiveMin));
  }, [onSiteRaid, raidApplied, effectiveMin]);

  useEffect(() => {
    if (!isTake || !gameState?.rush_active || rushActive) return;
    setRushActive(true);
    setPriceInput(String(rushPrice(baseMinPrice)));
  }, [isTake, gameState?.rush_active, rushActive, baseMinPrice]);

  const pickImage = async (useCamera: boolean) => {
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert("Permission required", "Please allow access to continue.");
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
      console.error("image pick failed:", e instanceof Error ? e.message : JSON.stringify(e));
      Alert.alert("Image error", "Could not load that image. Please try another one.");
    }
  };

  const validateBid = (): number | null => {
    const price = Number(priceInput);
    if (isNaN(price) || !Number.isInteger(price) || price < effectiveMin) {
      setPriceError(`Minimum price is ${effectiveMin} ⬡`);
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
      } = await getCachedUser();
      if (!user) throw new Error("Sign in to publish");

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
        // Prise payée en Tessels — coords passées si connues (remise raid serveur)
        await takeSquare(
          squareId,
          user.id,
          publicUrl,
          bid ?? undefined,
          userCoords?.lat,
          userCoords?.lng,
        );
        track("take_square", { square_id: squareId, bid, on_site: onSiteRaid });
      } else if (squareId) {
        // Case libre existante : passe par publish_new_square (GPS vérifié serveur)
        const { data: sq, error: sqError } = await supabase
          .from("squares")
          .select("cell_id, geohash, lat, lng")
          .eq("id", squareId)
          .single();
        if (sqError || !sq) throw sqError ?? new Error("Tile not found");

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
        if (!cell) throw new Error("Invalid cell ID");

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

      // Rafraîchit les caches concernés (feed, solde, stats) en arrière-plan
      invalidate(`feed:${user.id}`);
      invalidate(`stats:${user.id}`);
      invalidate(`balance:${user.id}`);
      invalidate(`history:${user.id}:all`);
      invalidate(`history:${user.id}:active`);

      if (isTake) {
        hapticHeavy();
        setTimeout(hapticSuccess, 150);
        setSuccessOverlay({ title: "Tile conquered!", subtitle: `−${bid} ⬡` });
      } else {
        hapticSuccess();
        setSuccessOverlay({ title: "Tile placed!" });
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

      // Détail technique en console uniquement — message clair pour l'utilisateur
      console.error("upload failed:", message);
      if (typeof message === "string" && message.includes("Price too low")) {
        Alert.alert(
          "Price updated",
          "The minimum price has changed. Please try again.",
          [{ text: "OK" }],
        );
      } else {
        Alert.alert(
          isTake ? "Takeover failed" : "Claim failed",
          friendlyGameError(message, isTake ? "take" : "claim"),
        );
      }
    } finally {
      setUploading(false);
    }
  };

  // Publication libre sans position : bloquant
  const needsLocation = !isTake && !userCoords;

  // Chips contextuelles — secteur, GPS ok, remise raid
  const infoChips = (
    <View style={styles.chipsRow}>
      {sectorCellId ? (
        <StatChip icon="location" value={sectorLabel(sectorCellId)} color={palette.diamond} />
      ) : null}
      {userCoords && !isTake && (
        <StatChip icon="checkmark-circle" value="GPS locked" color={palette.grass} />
      )}
      {onSiteRaid && (
        <StatChip icon="flag" value="On-site raid −30%" color={palette.redstone} />
      )}
      {rushActive && isTake && (
        <StatChip icon="flame" value="Rush −50%" color={palette.amber} />
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      {needsLocation && (locationError || locating) ? (
        <View style={styles.choices}>
          <Text style={[styles.title, { color: c.text }]}>Location required</Text>
          {locating ? (
            <ActivityIndicator size="large" color={c.primary} />
          ) : (
            <>
              <Text style={[styles.locationText, { color: c.textSecondary }]}>
                Piri needs your location: you must be inside the tile to claim it
              </Text>
              <GameButton
                icon="navigate"
                label="Retry"
                variant="primary"
                onPress={requestLocation}
              />
            </>
          )}
        </View>
      ) : imageUri ? (
        <View style={styles.previewContainer}>
          <Text style={[styles.previewTitle, { color: c.text }]}>
            {isTake ? "Take over" : "Claim this tile"}
          </Text>

          <Image
            source={{ uri: imageUri }}
            style={styles.preview}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
          />

          {infoChips}

          {isTake && (
            <View style={styles.priceSection}>
              <Text style={[styles.priceLabel, { color: c.textSecondary }]}>
                Minimum price: {effectiveMin} ⬡ ({tesselsToEur(effectiveMin)})
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
            <GameButton
              label="Change"
              variant="ghost"
              onPress={() => setImageUri(null)}
              style={styles.changeButton}
            />
            <GameButton
              label={isTake ? "Take over" : "Claim"}
              sub={
                isTake
                  ? `${priceInput} ⬡ · ${tesselsToEur(Number(priceInput) || effectiveMin)}`
                  : "Free — you're on the tile"
              }
              icon={isTake ? "flag" : "camera"}
              variant={isTake ? "gold" : "primary"}
              loading={uploading}
              onPress={handleUpload}
              style={styles.uploadButton}
            />
          </View>
        </View>
      ) : (
        <View style={styles.choices}>
          <Text style={[styles.title, { color: c.text }]}>
            {isTake ? "Take over" : "Claim this tile"}
          </Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            {isTake
              ? `Outshoot the current holder — ${effectiveMin} ⬡`
              : "This square is yours for a photo"}
          </Text>

          {infoChips}

          <GameButton
            icon="camera-outline"
            label="Take a photo"
            variant="primary"
            onPress={() => pickImage(true)}
          />
          <GameButton
            icon="images-outline"
            label="Choose from gallery"
            variant="ghost"
            onPress={() => pickImage(false)}
          />
        </View>
      )}

      <Pressable style={styles.cancelButton} onPress={() => router.back()}>
        <Text style={[styles.cancelText, { color: c.textTertiary }]}>Cancel</Text>
      </Pressable>

      {successOverlay && (
        <ConquestOverlay
          title={successOverlay.title}
          subtitle={successOverlay.subtitle}
          onDone={() => {
            // Invité + publication libre : proposer de sauvegarder le compte
            if (!isTake && isGuest && !linkPromptShown) {
              linkPromptShown = true;
              setShowLinkSheet(true);
            } else {
              router.back();
            }
          }}
        />
      )}

      <LinkAccountSheet
        visible={showLinkSheet}
        title="Don't lose your tile!"
        onClose={() => {
          setShowLinkSheet(false);
          router.back();
        }}
      />
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
    borderRadius: radii.lg,
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
    borderRadius: radii.lg,
    padding: spacing.base,
    paddingHorizontal: spacing.xl,
    flexShrink: 1,
  },
  primaryText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
  cancelButton: { marginTop: spacing.xl, alignItems: "center" },
  cancelText: { fontSize: fonts.sizes.base },
  priceSection: { marginBottom: spacing.base, width: "100%" },
  priceLabel: { fontSize: fonts.sizes.sm, marginBottom: spacing.sm, textAlign: "center" },
  raidNote: {
    fontSize: fonts.sizes.sm,
    fontWeight: fonts.weights.semibold,
  },
  raidNoteRow: { marginBottom: spacing.sm },
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
