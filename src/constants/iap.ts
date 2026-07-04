// Économie V2 — monnaie unique : le Tessel (⬡)
// IAP = packs de Tessels consommables uniquement.

export interface TesselPack {
  sku: string;
  tessels: number;
  priceLabel: string;
}

export const TESSEL_PACKS: TesselPack[] = [
  { sku: "piri_reis_s", tessels: 300, priceLabel: "€2.99" },
  { sku: "piri_reis_m", tessels: 1200, priceLabel: "€9.99" },
  { sku: "piri_reis_l", tessels: 2800, priceLabel: "€19.99" },
  { sku: "piri_reis_xl", tessels: 8000, priceLabel: "€49.99" },
  { sku: "piri_reis_xxl", tessels: 18000, priceLabel: "€99.99" },
];

export const IAP_SKUS: string[] = TESSEL_PACKS.map((p) => p.sku);

/**
 * Prix minimum (en Tessels) pour prendre une case occupée.
 * lastPrice = squares.last_price (INTEGER, en tessels).
 */
export function minTakePrice(lastPrice: number): number {
  return Math.min(10000, Math.max(100, Math.ceil((lastPrice * 1.5) / 10) * 10));
}

/**
 * Prix pendant le Rush Hour : −50 % (miroir serveur).
 * À appliquer sur le résultat de minTakePrice.
 */
export function rushPrice(minPrice: number): number {
  return Math.max(100, Math.ceil((minPrice * 0.5) / 10) * 10);
}

/**
 * Équivalent € d'un montant en Tessels (conformité UE / principes CPC :
 * prix réel affiché à côté du prix en monnaie virtuelle).
 * Base : taux du plus petit pack (le plus défavorable) = 2,99 € / 300 ⬡.
 */
export const EUR_PER_TESSEL = 2.99 / 300;

export function tesselsToEur(tessels: number): string {
  const eur = tessels * EUR_PER_TESSEL;
  return `≈ €${eur.toFixed(2)}`;
}
