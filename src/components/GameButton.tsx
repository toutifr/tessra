/**
 * GameButton — LE bouton signature du jeu.
 * Chunky, tranche 3D-soft (borderBottom), press physique (translateY).
 */
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette, radii, edges, fonts, useThemeColors } from "../theme";
import { hapticLight } from "../lib/haptics";

type Variant = "primary" | "gold" | "danger" | "ghost" | "dark";
type Size = "lg" | "md";

interface Props {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: Variant;
  size?: Size;
  sub?: string;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  style?: ViewStyle;
}

const FILLS: Record<Exclude<Variant, "ghost">, { fill: string; edge: string }> = {
  primary: { fill: palette.grass,    edge: palette.grassDark },
  gold:    { fill: palette.gold,     edge: palette.goldDark },
  danger:  { fill: palette.redstone, edge: palette.redstoneDark },
  dark:    { fill: palette.dark200,  edge: palette.darkDeep },
};

export default function GameButton({
  label,
  icon,
  variant = "primary",
  size = "lg",
  sub,
  disabled,
  loading,
  onPress,
  style,
}: Props) {
  const c = useThemeColors();
  const ghost = variant === "ghost";
  const height = size === "lg" ? 52 : 42;
  const inactive = disabled || loading;

  const fill = ghost ? "transparent" : FILLS[variant].fill;
  const edge = ghost ? "transparent" : FILLS[variant].edge;
  const ghostColor = c.primary;
  const textColor = ghost ? ghostColor : palette.white;

  return (
    <Pressable
      disabled={inactive}
      onPress={() => {
        hapticLight();
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          backgroundColor: fill,
          opacity: inactive ? 0.5 : 1,
        },
        ghost
          ? { borderWidth: 1.5, borderColor: ghostColor }
          : {
              borderBottomWidth: pressed ? edges.button - 2 : edges.button,
              borderBottomColor: edge,
              transform: [{ translateY: pressed ? 2 : 0 }],
            },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <View style={styles.row}>
          {icon ? (
            <Ionicons
              name={icon}
              size={size === "lg" ? 20 : 17}
              color={textColor}
              style={styles.icon}
            />
          ) : null}
          <View style={styles.labels}>
            <Text
              style={[
                styles.label,
                { color: textColor, fontSize: size === "lg" ? 16 : 14 },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
            {sub ? (
              <Text style={[styles.sub, { color: textColor }]} numberOfLines={1}>
                {sub}
              </Text>
            ) : null}
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    marginRight: 8,
  },
  labels: {
    alignItems: "center",
  },
  label: {
    fontWeight: fonts.weights.bold,
    letterSpacing: fonts.letterSpacing.tight,
  },
  sub: {
    fontSize: 11,
    fontWeight: fonts.weights.semibold,
    opacity: 0.85,
    marginTop: 1,
  },
});
