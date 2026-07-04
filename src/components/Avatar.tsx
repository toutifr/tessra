/**
 * Avatar — cercle initiales (couleur dérivée du userId) ou photo.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { palette, fonts } from "../theme";

interface Props {
  name?: string;
  userId: string;
  url?: string | null;
  size?: number;
}

const COLORS = [
  palette.grass,
  palette.gold,
  palette.redstone,
  palette.diamond,
  palette.amber,
  palette.diamondDark,
] as const;

function hashColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return COLORS[h % COLORS.length];
}

function initials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

export default function Avatar({ name, userId, url, size = 36 }: Props) {
  const radius = size / 2;

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="cover"
        transition={150}
      />
    );
  }

  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: hashColor(userId),
        },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.38 }]}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: palette.white,
    fontWeight: fonts.weights.bold,
  },
});
