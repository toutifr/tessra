/**
 * PhotoCard — carte feed social photo-first.
 * Photo carrée full-bleed, scrim bas (bandes empilées, zéro lib gradient),
 * rangée auteur dans la photo, rangée actions dessous.
 */
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { palette, radii, fonts, shadows, useThemeColors } from "../theme";
import { hapticLight } from "../lib/haptics";
import Avatar from "./Avatar";
import StatChip from "./StatChip";

interface Props {
  imageUrl: string;
  userName: string;
  userId: string;
  timeAgo: string;
  priceLabel?: string;
  votes: number;
  voted?: boolean;
  onVote: () => void;
  onLocate: () => void;
  onOpen: () => void;
}

export default function PhotoCard({
  imageUrl,
  userName,
  userId,
  timeAgo,
  priceLabel,
  votes,
  voted,
  onVote,
  onLocate,
  onOpen,
}: Props) {
  const c = useThemeColors();

  return (
    <View
      style={[
        styles.card,
        shadows.md,
        { backgroundColor: c.card, borderColor: c.cardBorder },
      ]}
    >
      <Pressable onPress={onOpen}>
        <View style={styles.photoWrap}>
          <Image
            source={{ uri: imageUrl }}
            style={styles.photo}
            contentFit="cover"
            transition={200}
          />
          {/* Scrim bas — dégradé simulé par bandes translucides empilées */}
          <View pointerEvents="none" style={styles.scrim}>
            <View style={[styles.band, { backgroundColor: "rgba(0,0,0,0.12)" }]} />
            <View style={[styles.band, { backgroundColor: "rgba(0,0,0,0.22)" }]} />
            <View style={[styles.bandTall, { backgroundColor: "rgba(0,0,0,0.34)" }]} />
          </View>
          {/* Rangée auteur, ancrée bas */}
          <View style={styles.metaRow}>
            <Avatar name={userName} userId={userId} size={30} />
            <View style={styles.metaText}>
              <Text style={styles.name} numberOfLines={1}>
                {userName}
              </Text>
              <Text style={styles.time} numberOfLines={1}>
                {timeAgo}
              </Text>
            </View>
            {priceLabel ? (
              <StatChip
                icon="cash"
                value={priceLabel}
                color={palette.gold}
                style={styles.price}
              />
            ) : null}
          </View>
        </View>
      </Pressable>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            hapticLight();
            onVote();
          }}
          hitSlop={8}
          style={styles.voteBtn}
        >
          <Ionicons
            name={voted ? "heart" : "heart-outline"}
            size={22}
            color={voted ? palette.redstone : c.textSecondary}
          />
          <Text
            style={[
              styles.voteCount,
              { color: voted ? palette.redstone : c.textSecondary },
            ]}
          >
            {votes}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            hapticLight();
            onLocate();
          }}
          hitSlop={8}
          style={styles.iconBtn}
        >
          <Ionicons name="location" size={20} color={c.textSecondary} />
        </Pressable>
        <View style={styles.spacer} />
        <Pressable onPress={onOpen} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="chevron-forward" size={20} color={c.textTertiary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: "hidden",
  },
  photoWrap: {
    width: "100%",
    aspectRatio: 1,
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  band: {
    height: 22,
  },
  bandTall: {
    height: 56,
  },
  metaRow: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  metaText: {
    flex: 1,
    marginLeft: 8,
  },
  name: {
    color: palette.white,
    fontSize: 14,
    fontWeight: fonts.weights.bold,
  },
  time: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    fontWeight: fonts.weights.medium,
  },
  price: {
    marginLeft: 8,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 14,
  },
  voteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  voteCount: {
    fontSize: 13,
    fontWeight: fonts.weights.bold,
  },
  iconBtn: {
    alignItems: "center",
    justifyContent: "center",
  },
  spacer: {
    flex: 1,
  },
});
