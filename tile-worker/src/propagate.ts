/**
 * Pyramid propagation.
 *
 * V2 (scalabilité) :
 * - Propagation "live" limitée : z13 → MIN_LIVE_ZOOM (9) à chaque publication.
 * - Les zooms bas (z8 → z0) sont marqués "dirty" et régénérés par le cron
 *   (voir scheduled() dans index.ts) — évite le hot-spot z0 (chaque publication
 *   du monde touche la même tuile) et les lost-updates concurrents.
 * - propagateLevels() dédoublonne les parents par niveau (seed + cron).
 */

import type { Env, TileCoord } from "./types";
import { parentTile, childTiles, tilePath, tileKey } from "./tile-math";
import { composeTile } from "./render";

/** En dessous de ce zoom (exclu), la régénération passe par le cron. */
export const MIN_LIVE_ZOOM = 9;

const DIRTY_PREFIX = "dirty/";

/**
 * Propagation immédiate : z-1 → minZ (inclus), puis marque l'ancêtre
 * de niveau minZ-1 comme dirty pour le cron.
 */
export async function propagateUp(
  tile: TileCoord,
  env: Env,
  minZ: number = MIN_LIVE_ZOOM,
): Promise<void> {
  let current = tile;

  while (current.z > minZ) {
    const parent = parentTile(current);
    await regenerateFromChildren(parent, env);
    current = parent;
  }

  // Marque le niveau suivant pour le cron (si on n'est pas déjà à z0)
  if (current.z > 0) {
    const dirty = parentTile(current);
    await markDirty(dirty, env);
  }
}

/** Marqueur R2 léger : dirty/{z}/{x}/{y} */
export async function markDirty(tile: TileCoord, env: Env): Promise<void> {
  await env.TILES_BUCKET.put(`${DIRTY_PREFIX}${tileKey(tile)}`, new Uint8Array(0));
}

/**
 * Cron : traite tous les marqueurs dirty.
 * 1. Liste les tuiles dirty (normalement toutes à z = MIN_LIVE_ZOOM - 1)
 * 2. Régénère niveau par niveau jusqu'à z0, en dédoublonnant les parents.
 * 3. Supprime les marqueurs.
 * Retourne le nombre de tuiles régénérées.
 */
export async function processDirtyTiles(env: Env, maxMarkers = 1000): Promise<number> {
  const markers: string[] = [];
  let cursor: string | undefined;

  do {
    const list = await env.TILES_BUCKET.list({ prefix: DIRTY_PREFIX, cursor, limit: 500 });
    for (const obj of list.objects) markers.push(obj.key);
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor && markers.length < maxMarkers);

  if (markers.length === 0) return 0;

  const tiles: TileCoord[] = [];
  for (const key of markers) {
    const [z, x, y] = key.slice(DIRTY_PREFIX.length).split("/").map(Number);
    if (!Number.isNaN(z)) tiles.push({ z, x, y });
  }

  const regenerated = await propagateLevels(tiles, env);

  // Marqueurs traités → suppression (par lots)
  for (let i = 0; i < markers.length; i += 100) {
    await Promise.all(markers.slice(i, i + 100).map((k) => env.TILES_BUCKET.delete(k)));
  }

  return regenerated;
}

/**
 * Régénère un ensemble de tuiles puis tous leurs ancêtres jusqu'à z0,
 * en ne régénérant chaque tuile qu'UNE fois par niveau (dédoublonnage).
 */
export async function propagateLevels(tiles: TileCoord[], env: Env): Promise<number> {
  if (tiles.length === 0) return 0;
  let count = 0;

  const maxZ = Math.max(...tiles.map((t) => t.z));
  let currentLevel = new Map<string, TileCoord>();
  const pending = tiles.filter((t) => t.z !== maxZ);
  for (const t of tiles) {
    if (t.z === maxZ) currentLevel.set(tileKey(t), t);
  }

  let z = maxZ;
  while (z >= 0) {
    for (const t of pending) {
      if (t.z === z) currentLevel.set(tileKey(t), t);
    }

    // Régénère ce niveau (petits lots parallèles)
    const batch = [...currentLevel.values()];
    for (let i = 0; i < batch.length; i += 6) {
      await Promise.all(batch.slice(i, i + 6).map((t) => regenerateFromChildren(t, env)));
    }
    count += batch.length;

    if (z === 0) break;

    // Prépare le niveau parent (dédoublonné)
    const parents = new Map<string, TileCoord>();
    for (const t of currentLevel.values()) {
      const p = parentTile(t);
      parents.set(tileKey(p), p);
    }
    currentLevel = parents;
    z--;
  }

  return count;
}

/**
 * Regenerate a single tile by compositing its 4 children from R2.
 */
export async function regenerateFromChildren(tile: TileCoord, env: Env): Promise<void> {
  const children = childTiles(tile);

  const childBuffers = await Promise.all(
    children.map(async (child): Promise<ArrayBuffer | null> => {
      const obj = await env.TILES_BUCKET.get(tilePath(child));
      if (!obj) return null;
      return await obj.arrayBuffer();
    }),
  );

  const allEmpty = childBuffers.every((b) => b === null);
  if (allEmpty) {
    await env.TILES_BUCKET.delete(tilePath(tile));
    return;
  }

  const composed = await composeTile(
    childBuffers as [ArrayBuffer | null, ArrayBuffer | null, ArrayBuffer | null, ArrayBuffer | null],
  );

  const maxAge = tile.z <= 5 ? 3600 : tile.z <= 10 ? 600 : 120;

  await env.TILES_BUCKET.put(tilePath(tile), composed, {
    httpMetadata: {
      contentType: "image/png",
      cacheControl: `public, max-age=${maxAge}`,
    },
  });
}
