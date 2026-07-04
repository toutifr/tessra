import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text } from "react-native";
import { useThemeColors, fonts, spacing, radii, shadows } from "../theme";

const PARTICLE_COUNT = 12;
const AUTO_DISMISS_MS = 1600;

interface Particle {
  progress: Animated.Value;
  angle: number;
  distance: number;
  size: number;
}

interface Props {
  title: string;
  subtitle?: string;
  onDone: () => void;
}

/**
 * Overlay plein écran de célébration : carte centrale en spring,
 * particules ⬡ qui s'éparpillent, auto-dismiss.
 */
export default function ConquestOverlay({ title, subtitle, onDone }: Props) {
  const c = useThemeColors();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.6)).current;
  const particles = useRef<Particle[]>(
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      progress: new Animated.Value(0),
      angle: (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5,
      distance: 90 + Math.random() * 80,
      size: 14 + Math.random() * 12,
    })),
  ).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
      ...particles.map((p, i) =>
        Animated.timing(p.progress, {
          toValue: 1,
          duration: 900,
          delay: 60 + i * 20,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ),
    ]).start();

    const timer = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() =>
        onDoneRef.current(),
      );
    }, AUTO_DISMISS_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[styles.backdrop, { opacity: fade }]} pointerEvents="auto">
      {particles.map((p, i) => (
        <Animated.Text
          key={i}
          style={[
            styles.particle,
            {
              fontSize: p.size,
              color: c.accent,
              opacity: p.progress.interpolate({
                inputRange: [0, 0.15, 1],
                outputRange: [0, 1, 0],
              }),
              transform: [
                {
                  translateX: p.progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, Math.cos(p.angle) * p.distance],
                  }),
                },
                {
                  translateY: p.progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, Math.sin(p.angle) * p.distance],
                  }),
                },
              ],
            },
          ]}
        >
          ⬡
        </Animated.Text>
      ))}

      <Animated.View
        style={[
          styles.card,
          { backgroundColor: c.card, transform: [{ scale }] },
          shadows.lg,
        ]}
      >
        <Text style={[styles.title, { color: c.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: c.primary }]}>{subtitle}</Text>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  particle: { position: "absolute" },
  card: {
    borderRadius: radii.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xxl,
    alignItems: "center",
    maxWidth: "80%",
  },
  title: {
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.heavy,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    marginTop: spacing.sm,
    textAlign: "center",
  },
});
