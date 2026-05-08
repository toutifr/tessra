/**
 * Seed script: generates tiles for all existing active publications.
 * Call POST /seed endpoint to trigger.
 */

import type { Env, TileCoord } from "./types";
import { latLngToTile, tileKey, tilePath, cellsInTile, cellPixelBounds } from "./tile-math";
import { renderEmptyTile, renderBaseTile } from "./render";

export async function handleSeed(env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return new Response("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY", { status: 500 });
  }

  try {
    // 1. Generate and store the empty tile
    const emptyBlob = await renderEmptyTile();
    await env.TILES_BUCKET.put("tiles/empty.png", emptyBlob, {
      httpMetadata: { contentType: "image/png", cacheControl: "public, max-age=86400" },
    });

    // 2. Fetch all squares with active publications
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/squares?current_publication_id=not.is.null&select=id,lat,lng,cell_id,current_publication_id`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      },
    );

    const body = (await res.json()) as any;

    if (!Array.isArray(body)) {
      return new Response(
        JSON.stringify({ error: "Supabase query failed", status: res.status, body }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const squares = body as {
      id: string;
      lat: number;
      lng: number;
      cell_id: string;
      current_publication_id: string;
    }[];

    if (squares.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No active publications", tilesGenerated: 0 }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // 3. Group by z14 tile
    const tileSquares = new Map<string, typeof squares>();

    for (const sq of squares) {
      const tile = latLngToTile(sq.lat, sq.lng, 14);
      const key = tileKey(tile);
      if (!tileSquares.has(key)) {
        tileSquares.set(key, []);
      }
      tileSquares.get(key)!.push(sq);
    }

    // 4. Render each z14 tile
    let tilesGenerated = 0;

    for (const [key, _squaresInTile] of tileSquares) {
      const [z, x, y] = key.split("/").map(Number);
      const tile: TileCoord = { z, x, y };

      // Render the tile with grid (photos will be overlaid client-side)
      const tileBlob = await renderBaseTile(tile, []);
      await env.TILES_BUCKET.put(tilePath(tile), tileBlob, {
        httpMetadata: { contentType: "image/png", cacheControl: "public, max-age=30" },
      });
      tilesGenerated++;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        activePublications: squares.length,
        uniqueTiles: tileSquares.size,
        tilesGenerated,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message, stack: err.stack }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
