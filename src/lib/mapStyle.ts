/**
 * Style carte "monde ludique" — dark-v11 sans aucun layer symbol
 * (noms de rues, villes, pays, POI supprimés).
 * Fetch une fois, cache module.
 */
import { MAPBOX_ACCESS_TOKEN } from "../constants/config";

const STYLE_URL = `https://api.mapbox.com/styles/v1/mapbox/dark-v11?access_token=${MAPBOX_ACCESS_TOKEN}`;

let cached: string | null = null;
let pending: Promise<string | null> | null = null;

export async function getPlayfulMapStyle(): Promise<string | null> {
  if (cached) return cached;
  if (pending) return pending;

  pending = (async () => {
    try {
      const res = await fetch(STYLE_URL);
      if (!res.ok) return null;
      const style = (await res.json()) as { layers?: { type?: string }[] };
      style.layers = (style.layers ?? []).filter((l) => l.type !== "symbol");
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
