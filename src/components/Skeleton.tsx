import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type DimensionValue, type ViewStyle } from "react-native";
import { useThemeColors, radii, spacing } from "../theme";

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: ViewStyle;
}

/** Bloc gris animé (pulse d'opacité) — remplace les ActivityIndicator plein écran. */
export default function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = radii.sm,
  style,
}: SkeletonProps) {
  const c = useThemeColors();
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: c.bgTertiary, opacity },
        style,
      ]}
    />
  );
}

/** Skeleton du feed : 2 cartes fantômes (avatar + image carrée + footer). */
export function FeedSkeleton() {
  return (
    <View>
      {[0, 1].map((i) => (
        <View key={i} style={styles.feedCard}>
          <View style={styles.feedHeader}>
            <Skeleton width={36} height={36} borderRadius={18} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width={120} height={12} />
              <Skeleton width={70} height={10} />
            </View>
          </View>
          <Skeleton width="100%" height={340} borderRadius={0} />
          <View style={styles.feedFooter}>
            <Skeleton width={72} height={32} borderRadius={16} />
            <Skeleton width={110} height={32} borderRadius={16} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Skeleton de classement : 6 lignes. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <View style={styles.listContainer}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.listRow}>
          <Skeleton width={28} height={16} />
          <Skeleton width={32} height={32} borderRadius={16} />
          <Skeleton width="55%" height={14} />
          <View style={{ flex: 1 }} />
          <Skeleton width={36} height={14} />
        </View>
      ))}
    </View>
  );
}

/** Skeleton de fiche case : image + lignes. */
export function DetailSkeleton() {
  return (
    <View>
      <Skeleton width="100%" height={320} borderRadius={0} />
      <View style={styles.detailBody}>
        <Skeleton width={140} height={14} />
        <Skeleton width="100%" height={90} borderRadius={radii.md} />
        <Skeleton width="100%" height={52} borderRadius={radii.md} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  feedCard: { marginBottom: spacing.lg },
  feedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
  },
  feedFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
  },
  listContainer: { paddingHorizontal: spacing.base },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  detailBody: { padding: spacing.base, gap: spacing.md },
});
