/**
 * Style carte "monde de tuiles" — silhouette plate par biomes.
 * Depuis dark-v11, on garde :
 *  - le layer background → couleur terre (vert herbe désaturé),
 *  - les layers fill des source-layers `landcover`/`landuse` → repeints à plat
 *    par classe (palette biomes : neige, sable, forêt, urbain, roche, herbe),
 *  - les layers fill "water" → couleur océan plate.
 * Tout le reste (routes, bâtiments, relief, admin, symboles) est supprimé.
 * Ordre relatif d'origine conservé (water au-dessus de landuse comme dark-v11).
 * Fetch une fois, cache module. Fallback: null → StyleURL.Dark côté appelant.
 */
import { MAPBOX_ACCESS_TOKEN } from "../constants/config";

const STYLE_URL = `https://api.mapbox.com/styles/v1/mapbox/dark-v11?access_token=${MAPBOX_ACCESS_TOKEN}`;

// ─── Couleurs du monde de tuiles ─────────────────────────
/** Terre de base (fond) — herbe désaturée pour laisser respirer or/redstone */
export const LAND_BASE = "#44634A";
/** Variations subtiles par cellule (shade 0/1/2) — herbe */
export const LAND_SHADES = ["#405D46", "#486850", "#4C6D53"] as const;
/** Jointures de blocs (seams) */
export const LAND_SEAM = "rgba(0, 0, 0, 0.15)";
/** Océan plat — deepslate profond */
export const OCEAN = "#10171C";

// ─── Palette biomes — 3 nuances par biome (sobre, désaturé, Minecraft-doux) ──
export type BiomeKey = "grass" | "forest" | "sand" | "snow" | "urban" | "rock";

export const BIOMES: Record<BiomeKey, readonly [string, string, string]> = {
  grass: LAND_SHADES as unknown as readonly [string, string, string],
  forest: ["#37503C", "#3C5741", "#415D46"],
  sand: ["#C3AB77", "#CBB37E", "#D3BC86"],
  snow: ["#CDD2CE", "#D5D9D4", "#DDE0DC"],
  urban: ["#4F555B", "#565C63", "#5D646B"],
  rock: ["#63605A", "#6B6862", "#73706A"],
};

/** Classes Mapbox (landcover/landuse) → biome. null = classe inconnue. */
const CLASS_TO_BIOME: Record<string, BiomeKey> = {
  // landcover
  wood: "forest",
  snow: "snow",
  sand: "sand",
  grass: "grass",
  scrub: "grass",
  crop: "grass",
  rock: "rock",
  bare: "rock",
  // landuse
  glacier: "snow",
  desert: "sand",
  beach: "sand",
  residential: "urban",
  commercial_area: "urban",
  industrial: "urban",
  airport: "urban",
  parking: "urban",
  park: "grass",
};

export function classToBiome(clazz: string): BiomeKey | null {
  return CLASS_TO_BIOME[clazz] ?? null;
}

/** Fill data-driven pour les layers landcover/landuse du style far-zoom. */
const TRANSPARENT = "rgba(0,0,0,0)";
const BIOME_FILL_MATCH: unknown[] = [
  "match",
  ["get", "class"],
  "wood", BIOMES.forest[1],
  ["snow", "glacier"], BIOMES.snow[1],
  ["sand", "desert", "beach"], BIOMES.sand[1],
  ["grass", "scrub", "crop", "park"], LAND_BASE,
  ["residential", "commercial_area", "industrial", "airport", "parking"], BIOMES.urban[1],
  ["rock", "bare"], BIOMES.rock[1],
  TRANSPARENT, // classe inconnue → laisse le fond terre visible
];

/** IDs des layers water conservés dans le style (pour queryRenderedFeaturesInRect) */
let waterLayerIds: string[] = ["water"];
export function getWaterLayerIds(): string[] {
  return waterLayerIds;
}

let cached: string | null = null;
let pending: Promise<string | null> | null = null;

interface StyleLayer {
  id?: string;
  type?: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  "source-layer"?: string;
  [key: string]: unknown;
}

export async function getPlayfulMapStyle(): Promise<string | null> {
  if (cached) return cached;
  if (pending) return pending;

  pending = (async () => {
    try {
      const res = await fetch(STYLE_URL);
      if (!res.ok) return null;
      const style = (await res.json()) as { layers?: StyleLayer[] };

      const kept: StyleLayer[] = [];
      const keptWaterIds: string[] = [];

      for (const l of style.layers ?? []) {
        if (l.type === "background") {
          kept.push({ ...l, layout: undefined, paint: { "background-color": LAND_BASE } });
        } else if (
          l.type === "fill" &&
          (l["source-layer"] === "landcover" || l["source-layer"] === "landuse")
        ) {
          // Biomes plats far-zoom : repaint par classe, sans outline ni pattern.
          // On drop le filter d'origine pour couvrir toutes les classes connues ;
          // les inconnues tombent en transparent (fond terre).
          kept.push({
            ...l,
            layout: undefined,
            filter: undefined,
            paint: {
              "fill-color": BIOME_FILL_MATCH,
              "fill-opacity": 1,
              "fill-antialias": false,
            },
          });
        } else if (
          l.type === "fill" &&
          typeof l.id === "string" &&
          l.id.toLowerCase().includes("water")
        ) {
          // Eau plate : pas de pattern, pas d'outline, opacité pleine
          kept.push({
            ...l,
            layout: undefined,
            paint: { "fill-color": OCEAN, "fill-opacity": 1 },
          });
          keptWaterIds.push(l.id);
        }
        // Tout le reste (roads, buildings, hillshade, admin…) : supprimé
      }

      // Sécurité : garantir un fond terre même si dark-v11 change
      if (!kept.some((l) => l.type === "background")) {
        kept.unshift({
          id: "background",
          type: "background",
          paint: { "background-color": LAND_BASE },
        });
      }

      if (keptWaterIds.length > 0) waterLayerIds = keptWaterIds;
      style.layers = kept;
      cached = JSON.stringify(style);
      return cached;
    } catch {
      return null;
    } finally {
      pending = null;
    }
  })();

  return pending;
}
