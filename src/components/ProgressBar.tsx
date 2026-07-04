/**
 * ProgressBar — barre de progression jeu, fill animé.
 */
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { palette, radii, useThemeColors } from "../theme";

interface Props {
  /** 0 → 1 */
  progress: number;
  color?: string;
  height?: number;
}

export default function ProgressBar({
  progress,
  color = palette.gold,
  height = 8,
}: Props) {
  const c = useThemeColors();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: Math.min(Math.max(progress, 0), 1),
      duration: 500,
      useNativeDriver: false, // width n'est pas animable en natif
    }).start();
  }, [progress, anim]);

  return (
    <View
      style={[
        styles.track,
        { height, borderRadius: radii.full, backgroundColor: c.bgTertiary },
      ]}
    >
      <Animated.View
        style={{
          height,
          borderRadius: radii.full,
          backgroundColor: color,
          width: anim.interpolate({
            inputRange: [0, 1],
            outputRange: ["0%", "100%"],
          }),
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    overflow: "hidden",
    width: "100%",
  },
});
