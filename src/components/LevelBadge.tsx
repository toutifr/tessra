/**
 * LevelBadge — carré or à tranche, niveau du joueur.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { palette, radii, fonts } from "../theme";

interface Props {
  level: number;
  /** 34 (défaut) ou 44 */
  size?: 34 | 44;
}

export default function LevelBadge({ level, size = 34 }: Props) {
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          { fontSize: size === 44 ? 18 : 14 },
        ]}
        numberOfLines={1}
      >
        {level}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: palette.gold,
    borderRadius: radii.md,
    borderBottomWidth: 3,
    borderBottomColor: palette.goldDark,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: palette.white,
    fontWeight: fonts.weights.heavy,
  },
});
