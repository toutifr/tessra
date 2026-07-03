// Économie V2 — monnaie unique : le Tessel (⬡)
// IAP = packs de Tessels consommables uniquement.

export interface TesselPack {
  sku: string;
  tessels: number;
  priceLabel: string;
}

export const TESSEL_PACKS: TesselPack[] = [
  { sku: "tessra_tessels_s", tessels: 300, priceLabel: "2,99 €" },
  { sku: "tessra_tessels_m", tessels: 1200, priceLabel: "9,99 €" },
  { sku: "tessra_tessels_l", tessels: 2800, priceLabel: "19,99 €" },
  { sku: "tessra_tessels_xl", tessels: 8000, priceLabel: "49,99 €" },
  { sku: "tessra_tessels_xxl", tessels: 18000, priceLabel: "99,99 €" },
];

export const IAP_SKUS: string[] = TESSEL_PACKS.map((p) => p.sku);

/**
 * Prix minimum (en Tessels) pour prendre une case occupée.
 * lastPrice = squares.last_price (INTEGER, en tessels).
 */
export function minTakePrice(lastPrice: number): number {
  return Math.min(10000, Math.max(100, Math.ceil((lastPrice * 1.5) / 10) * 10));
}
