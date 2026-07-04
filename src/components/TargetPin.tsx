import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/**
 * Pastille "chunky" façon pin de jeu : cercle coloré bordé de sa version
 * foncée + pointe triangulaire dessous. Utilisée sur la carte (objectifs du
 * jour) et dans la légende — même rendu aux deux endroits.
 */
export default function TargetPin({
  color,
  darkColor,
  icon,
  done = false,
  animated = false,
}: {
  color: string;
  darkColor: string;
  icon: keyof typeof Ionicons.glyphMap;
  done?: boolean;
  /** Scale-in spring au mount (marqueurs carte). */
  animated?: boolean;
}) {
  const scale = useRef(new Animated.Value(animated ? 0 : 1)).current;

  useEffect(() => {
    if (animated) {
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 14,
        bounciness: 10,
      }).start();
    }
  }, [animated, scale]);

  return (
    <Animated.View
      style={[styles.wrap, { opacity: done ? 0.55 : 1, transform: [{ scale }] }]}
    >
      <View style={[styles.circle, { backgroundColor: color, borderColor: darkColor }]}>
        <Ionicons name={done ? "checkmark" : icon} size={16} color="#FFFFFF" />
      </View>
      <View style={[styles.pointer, { borderTopColor: darkColor }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  circle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  // Triangle border trick — pointe de pin sous le cercle
  pointer: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
});
