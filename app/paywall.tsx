import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { getBalance } from "../src/lib/economy";
import { purchaseTesselPack } from "../src/lib/purchases";
import { TESSEL_PACKS, TesselPack } from "../src/constants/iap";
import { useSWR, mutate, invalidate } from "../src/lib/swr";
import { useAuth } from "../src/providers/AuthProvider";
import { track } from "../src/lib/track";
import { hapticSuccess } from "../src/lib/haptics";
import AnimatedNumber from "../src/components/AnimatedNumber";
import LinkAccountSheet, { useIsGuest } from "../src/components/LinkAccountSheet";
import PressableScale from "../src/components/PressableScale";
import { useThemeColors, fonts, spacing, radii, shadows } from "../src/theme";

function priceEur(pack: TesselPack): number {
  return Number(pack.priceLabel.replace(",", ".").replace(/[^\d.]/g, ""));
}

// Bonus (%) vs pack S au même taux ⬡/€
function bonusPercent(pack: TesselPack): number {
  const base = TESSEL_PACKS[0];
  const baseRate = base.tessels / priceEur(base);
  const rate = pack.tessels / priceEur(pack);
  return Math.round((rate / baseRate - 1) * 100);
}

export default function PaywallScreen() {
  const { need } = useLocalSearchParams<{ need?: string }>();
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [buying, setBuying] = useState<string | null>(null);
  const [showLinkSheet, setShowLinkSheet] = useState(false);
  const [pendingSku, setPendingSku] = useState<string | null>(null);
  const isGuest = useIsGuest();
  const c = useThemeColors();

  const needAmount = Number(need ?? 0);

  // Solde depuis le cache — affiché instantanément, refetch en fond
  const { data: balance } = useSWR<number>(
    uid ? `balance:${uid}` : null,
    () => getBalance(uid!),
    15000,
  );

  useEffect(() => {
    track("paywall_open", { need: needAmount || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doBuy = async (sku: string) => {
    setBuying(sku);
    try {
      const newBalance = await purchaseTesselPack(sku);
      hapticSuccess();
      if (uid) {
        mutate(`balance:${uid}`, newBalance);
        invalidate(`stats:${uid}`);
      }
      track("purchase_success", { sku });
      Alert.alert(
        "Reis added!",
        `New balance: ${newBalance} ⬡`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Purchase failed";
      // Annulation utilisateur : silencieux
      if (!/cancel|annul/i.test(msg)) {
        console.error("purchase failed:", msg);
        Alert.alert("Purchase failed", "The payment didn't go through. You were not charged — please try again.");
      }
    } finally {
      setBuying(null);
    }
  };

  const handleBuy = (sku: string) => {
    if (buying) return;
    if (isGuest) {
      // Invité : lier un compte avant tout achat
      setPendingSku(sku);
      setShowLinkSheet(true);
      return;
    }
    doBuy(sku);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.bg }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: c.text }]}>Top up your Reis</Text>

      <View style={[styles.balanceCard, { backgroundColor: c.primarySoft }]}>
        <Text style={[styles.balanceLabel, { color: c.textSecondary }]}>Current balance</Text>
        {balance == null ? (
          <Text style={[styles.balanceValue, { color: c.primary }]}>…</Text>
        ) : (
          <AnimatedNumber
            value={balance}
            suffix=" ⬡"
            style={[styles.balanceValue, { color: c.primary }]}
          />
        )}
        {needAmount > 0 && (
          <Text style={[styles.needText, { color: c.error }]}>
            You need {needAmount} more ⬡
          </Text>
        )}
      </View>

      <View style={styles.packs}>
        {TESSEL_PACKS.map((pack) => {
          const bonus = bonusPercent(pack);
          const isBuying = buying === pack.sku;
          return (
            <PressableScale
              key={pack.sku}
              style={[
                styles.packCard,
                { backgroundColor: c.card, borderColor: c.cardBorder, opacity: isBuying ? 0.8 : 1 },
                shadows.sm,
              ]}
              onPress={() => handleBuy(pack.sku)}
              disabled={!!buying}
            >
              <View style={styles.packLeft}>
                <Text style={[styles.packTessels, { color: c.text }]}>
                  {pack.tessels} ⬡
                </Text>
                {bonus > 0 && (
                  <View style={[styles.bonusBadge, { backgroundColor: c.primary }]}>
                    <Text style={[styles.bonusText, { color: c.primaryText }]}>+{bonus}%</Text>
                  </View>
                )}
              </View>
              {isBuying ? (
                <ActivityIndicator color={c.primary} />
              ) : (
                <View style={[styles.priceChip, { backgroundColor: c.bgTertiary }]}>
                  <Text style={[styles.priceText, { color: c.text }]}>{pack.priceLabel}</Text>
                </View>
              )}
            </PressableScale>
          );
        })}
      </View>

      <Pressable style={styles.cancelButton} onPress={() => router.back()}>
        <Text style={[styles.cancelText, { color: c.textTertiary }]}>Maybe later</Text>
      </Pressable>

      <LinkAccountSheet
        visible={showLinkSheet}
        title="Link an account to buy Reis"
        onClose={() => setShowLinkSheet(false)}
        onLinked={() => {
          const sku = pendingSku;
          setPendingSku(null);
          // Reprend l'achat après liaison (léger délai pour laisser la sheet se fermer)
          if (sku) setTimeout(() => doBuy(sku), 400);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: 40 },
  title: {
    fontSize: fonts.sizes.xxl,
    fontWeight: fonts.weights.bold,
    textAlign: "center",
    marginBottom: spacing.lg,
    letterSpacing: -0.5,
  },
  balanceCard: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  balanceLabel: { fontSize: fonts.sizes.sm },
  balanceValue: { fontSize: 34, fontWeight: fonts.weights.heavy, marginTop: spacing.xs },
  needText: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold, marginTop: spacing.sm },
  packs: { gap: spacing.md },
  packCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.base,
  },
  packLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  packTessels: { fontSize: fonts.sizes.xl, fontWeight: fonts.weights.bold },
  bonusBadge: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  bonusText: { fontSize: fonts.sizes.xs, fontWeight: fonts.weights.bold },
  priceChip: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  priceText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
  cancelButton: { marginTop: spacing.xl, alignItems: "center" },
  cancelText: { fontSize: fonts.sizes.base },
});
