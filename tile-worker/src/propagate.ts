/**
 * Pyramid propagation: after a z14 tile is updated,
 * regenerate all ancestor tiles up to z0 by compositing 4 children.
 */

import type { Env, TileCoord } from "./types";
import { parentTile, childTiles, tilePath } from "./tile-math";
import { composeTile } from "./render";

/**
 * Propagate a tile change all the way up: z-1 → z0.
 * At each level, fetches 4 children from R2, composes them into 1 parent.
 */
export async function propagateUp(tile: TileCoord, env: Env): Promise<void> {
  let current = tile;

  while (current.z > 0) {
    const parent = parentTile(current);
    await regenerateFromChildren(parent, env);
    current = parent;
  }
}

/**
 * Regenerate a single tile by compositing its 4 children from R2.
 */
async function regenerateFromChildren(tile: TileCoord, env: Env): Promise<void> {
  const children = childTiles(tile);

  // Fetch all 4 children in parallel as ArrayBuffers
  const childBuffers = await Promise.all(
    children.map(async (child): Promise<ArrayBuffer | null> => {
      const obj = await env.TILES_BUCKET.get(tilePath(child));
      if (!obj) return null;
      return await obj.arrayBuffer();
    }),
  );

  // If all children are empty, delete this tile
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
