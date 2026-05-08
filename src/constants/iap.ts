import { Platform } from "react-native";

// Tiered consumable products for square replacement
// Each SKU corresponds to a price tier
export const REPLACE_SKUS = Platform.select({
  ios: [
    "tessra_replace_1",
    "tessra_replace_2",
    "tessra_replace_3",
    "tessra_replace_5",
    "tessra_replace_10",
    "tessra_replace_20",
    "tessra_replace_50",
  ],
  android: [
    "tessra_replace_1",
    "tessra_replace_2",
    "tessra_replace_3",
    "tessra_replace_5",
    "tessra_replace_10",
    "tessra_replace_20",
    "tessra_replace_50",
  ],
  default: [],
}) as string[];

// Map SKU to price value
export const SKU_PRICES: Record<string, number> = {
  tessra_replace_1: 1,
  tessra_replace_2: 2,
  tessra_replace_3: 3,
  tessra_replace_5: 5,
  tessra_replace_10: 10,
  tessra_replace_20: 20,
  tessra_replace_50: 50,
};

// Find the best SKU for a given price (nearest tier >= price)
export function skuForPrice(price: number): string | null {
  const tiers = [1, 2, 3, 5, 10, 20, 50];
  const tier = tiers.find((t) => t >= price);
  if (!tier) return null;
  return `tessra_replace_${tier}`;
}

export const IAP_SKUS = REPLACE_SKUS;
