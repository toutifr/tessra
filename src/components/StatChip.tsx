/**
 * StatChip — pill icône + valeur, teinte soft (14%).
 */
import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, radii } from "../theme";

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  value: string | number;
  color: string;
  label?: string;
  style?: ViewStyle;
}

/** Hex #RRGGBB → rgba à 14 %. Fallback : la couleur telle quelle. */
function soft(color: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},0.14)`;
  }
  return color;
}

export default function StatChip({ icon, value, color, label, style }: Props) {
  return (
    <View style={[styles.chip, { backgroundColor: soft(color) }, style]}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.value, { color }]} numberOfLines={1}>
        {value}
        {label ? <Text style={styles.label}> {label}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.full,
    gap: 5,
  },
  value: {
    fontSize: 13,
    fontWeight: fonts.weights.bold,
  },
  label: {
    fontWeight: fonts.weights.medium,
    fontSize: 12,
  },
});
