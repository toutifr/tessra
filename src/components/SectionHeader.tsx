/**
 * SectionHeader — titre de section jeu, barre accent à gauche.
 */
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { palette, fonts, radii, useThemeColors } from "../theme";

interface Props {
  title: string;
  color?: string;
  action?: { label: string; onPress: () => void };
}

export default function SectionHeader({
  title,
  color = palette.grass,
  action,
}: Props) {
  const c = useThemeColors();
  return (
    <View style={styles.row}>
      <View style={[styles.bar, { backgroundColor: color }]} />
      <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
        {title}
      </Text>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <Text style={[styles.action, { color: c.tint }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  bar: {
    width: 4,
    height: 18,
    borderRadius: radii.full,
    marginRight: 8,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: fonts.weights.bold,
    letterSpacing: fonts.letterSpacing.tight,
  },
  action: {
    fontSize: 13,
    fontWeight: fonts.weights.semibold,
  },
});
