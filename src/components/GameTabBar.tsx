/**
 * GameTabBar — barre flottante de jeu, bouton caméra central surélevé.
 * La barre est absolute : les écrans doivent réserver TAB_BAR_SPACE en paddingBottom.
 */
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { palette, radii, fonts, shadows, useThemeColors } from "../theme";
import { hapticSelection, hapticMedium } from "../lib/haptics";

/** Espace à réserver sous les écrans (barre flottante absolute). */
export const TAB_BAR_SPACE = 88;

type IconName = keyof typeof Ionicons.glyphMap;

const ICONS: Record<string, { filled: IconName; outline: IconName; label: string }> = {
  index:    { filled: "map",     outline: "map-outline",     label: "Map" },
  discover: { filled: "compass", outline: "compass-outline", label: "Discover" },
  history:  { filled: "time",    outline: "time-outline",    label: "History" },
  profile:  { filled: "person",  outline: "person-outline",  label: "Profile" },
};

export default function GameTabBar({ state, navigation }: BottomTabBarProps) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const renderTab = (route: (typeof state.routes)[number], index: number) => {
    const meta = ICONS[route.name];
    if (!meta) return null;
    const focused = state.index === index;

    const onPress = () => {
      hapticSelection();
      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      });
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    return (
      <Pressable key={route.key} onPress={onPress} style={styles.tab} hitSlop={4}>
        <Ionicons
          name={focused ? meta.filled : meta.outline}
          size={24}
          color={focused ? c.tint : c.textTertiary}
        />
        <Text
          style={[
            styles.label,
            { color: focused ? c.tint : c.textTertiary },
          ]}
        >
          {meta.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.bar,
        shadows.lg,
        {
          bottom: insets.bottom + 10,
          backgroundColor: c.card,
          borderColor: c.cardBorder,
        },
      ]}
    >
      {state.routes.slice(0, 2).map((r) => renderTab(r, state.routes.indexOf(r)))}

      {/* Bouton caméra central surélevé */}
      <Pressable
        onPress={() => {
          hapticMedium();
          router.push("/upload");
        }}
        style={({ pressed }) => [
          styles.camera,
          shadows.lg,
          {
            borderBottomWidth: pressed ? 2 : 4,
            transform: [{ translateY: pressed ? 2 : 0 }],
          },
        ]}
      >
        <Ionicons name="camera" size={26} color={palette.white} />
      </Pressable>

      {state.routes.slice(2, 4).map((r) => renderTab(r, state.routes.indexOf(r)))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    marginHorizontal: 14,
    height: 64,
    borderRadius: radii.xxl,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    height: "100%",
  },
  label: {
    fontSize: 10,
    fontWeight: fonts.weights.semibold,
  },
  camera: {
    width: 58,
    height: 58,
    borderRadius: 29,
    marginTop: -26,
    backgroundColor: palette.grass,
    borderBottomColor: palette.grassDark,
    alignItems: "center",
    justifyContent: "center",
  },
});
