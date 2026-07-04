/**
 * Style carte "monde de tuiles" — silhouette plate à deux couleurs.
 * Depuis dark-v11, on ne garde QUE :
 *  - le layer background → couleur terre (vert herbe désaturé),
 *  - les layers fill "water" → couleur océan plate.
 * Tout le reste (routes, bâtiments, landuse, relief, admin, symboles)
 * est supprimé. La géométrie water de Mapbox donne des continents
 * précis à tous les zooms, gratuitement.
 * Fetch une fois, cache module. Fallback: null → StyleURL.Dark côté appelant.
 */
import { MAPBOX_ACCESS_TOKEN } from "../constants/config";

const STYLE_URL = `https://api.mapbox.com/styles/v1/mapbox/dark-v11?access_token=${MAPBOX_ACCESS_TOKEN}`;

// ─── Couleurs du monde de tuiles ─────────────────────────
/** Terre de base (fond) — herbe désaturée pour laisser respirer or/redstone */
export const LAND_BASE = "#44634A";
/** Variations subtiles par cellule (shade 0/1/2) */
export const LAND_SHADES = ["#405D46", "#486850", "#4C6D53"] as const;
/** Jointures de blocs (seams) */
export const LAND_SEAM = "rgba(0, 0, 0, 0.15)";
/** Océan plat — deepslate profond */
export const OCEAN = "#10171C";

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
        // Tout le reste (roads, buildings, landuse, hillshade, admin…) : supprimé
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
