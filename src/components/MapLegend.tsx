import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import GameButton from "./GameButton";
import TargetPin from "./TargetPin";
import { fonts, palette, radii, spacing } from "../theme";

/**
 * Légende de la carte — bottom sheet sombre ouverte via le FAB "help".
 * Chaque ligne reprend EXACTEMENT le rendu carte (mêmes couleurs/formes)
 * pour que la correspondance soit immédiate.
 */
export default function MapLegend({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdropWrap}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close legend" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.base }]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={styles.title}>Reading the map</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
            </Pressable>
          </View>

          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            <Row swatch={<UserDotSwatch />} text="You are here" />
            <Row
              swatch={<View style={styles.tileMine} />}
              text="Your tiles"
            />
            <Row
              swatch={<View style={styles.tileTerritory} />}
              text="Your territory (3+ connected)"
            />
            <Row
              swatch={<View style={styles.tileHot} />}
              text="Hot tile — taken over in the last 24h"
            />
            <Row
              swatch={<TargetPin color={palette.grass} darkColor={palette.grassDark} icon="camera" />}
              text="Scout target: claim this virgin tile for bonus Reis"
            />
            <Row
              swatch={<TargetPin color={palette.amber} darkColor={palette.amberDark} icon="flame" />}
              text="Revive target: refresh your tile for bonus"
            />
            <Row
              swatch={<TargetPin color={palette.redstone} darkColor={palette.redstoneDark} icon="flag" />}
              text="Raid target: −30% takeover on site"
            />
            <Row
              swatch={<TargetPin color={palette.grass} darkColor={palette.grassDark} icon="camera" done />}
              text="Target completed — reward earned, come back tomorrow"
            />
            <Row
              swatch={
                <View style={styles.fabSwatch}>
                  <Ionicons name="eye" size={15} color="#FFFFFF" />
                </View>
              }
              text="Dim photos to see the ground"
            />
            <Row swatch={<GridSwatch />} text="1 tile = 1 km² — one photo each" />
          </ScrollView>

          <GameButton
            icon="book-outline"
            label="How to play"
            variant="dark"
            size="md"
            style={styles.howToButton}
            onPress={() => {
              onClose();
              router.push("/how-to-play");
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

function Row({ swatch, text }: { swatch: ReactNode; text: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.swatchBox}>{swatch}</View>
      <Text style={styles.rowText}>{text}</Text>
    </View>
  );
}

/** Point bleu cerclé blanc — copie du puck de position de la carte. */
function UserDotSwatch() {
  return (
    <View style={styles.userDotHalo}>
      <View style={styles.userDot} />
    </View>
  );
}

/** Mini-grille — évoque le quadrillage 1 km². */
function GridSwatch() {
  return (
    <View style={styles.gridSwatch}>
      <View style={styles.gridLineH} />
      <View style={styles.gridLineV} />
    </View>
  );
}

const styles = StyleSheet.create({
  backdropWrap: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: palette.dark100,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: palette.darkBorder,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: "78%",
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  title: { color: "#FFFFFF", fontSize: fonts.sizes.md, fontWeight: fonts.weights.bold },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  swatchBox: { width: 44, alignItems: "center" },
  rowText: {
    flex: 1,
    color: "rgba(255,255,255,0.88)",
    fontSize: fonts.sizes.sm,
    lineHeight: fonts.sizes.sm * fonts.lineHeights.normal,
  },

  // ─── Swatches identiques au rendu carte ───
  userDotHalo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(95, 179, 190, 0.25)", // palette.diamond @ 25%
    alignItems: "center",
    justifyContent: "center",
  },
  userDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: palette.diamond,
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
  },
  tileMine: {
    width: 26,
    height: 26,
    borderWidth: 2,
    borderColor: palette.gold,
    borderRadius: 3,
  },
  tileTerritory: {
    width: 26,
    height: 26,
    borderWidth: 3,
    borderColor: palette.gold,
    backgroundColor: "rgba(242, 180, 65, 0.12)", // palette.gold @ 12%
    borderRadius: 3,
  },
  tileHot: {
    width: 26,
    height: 26,
    borderWidth: 1.5,
    borderColor: palette.redstone,
    borderRadius: 3,
  },
  fabSwatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(17,22,26,0.92)",
    borderWidth: 1,
    borderColor: palette.darkBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  gridSwatch: {
    width: 26,
    height: 26,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 2,
    overflow: "hidden",
  },
  gridLineH: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 12,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  gridLineV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 12,
    width: 1,
    backgroundColor: "rgba(255,255,255,0.3)",
  },

  howToButton: { marginTop: spacing.md },
});
