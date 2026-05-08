/**
 * Tessra Tile Worker — Full tile pyramid with photo compositing
 */

import type { Env, TileCoord, WebhookPayload } from "./types";
import { latLngToTile, tilePath, cellsInTile, tileKey } from "./tile-math";
import { renderBaseTile, composeTile, fetchAndDecodeImage } from "./render";
import { propagateUp } from "./propagate";

const MAX_ZOOM = 14;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (request.method === "POST" && url.pathname === "/webhook/publication") {
        return handleWebhook(request, env);
      }

      const tileMatch = url.pathname.match(/^\/tiles\/(\d+)\/(\d+)\/(\d+)\.(png|webp)$/);
      if (tileMatch && request.method === "GET") {
        const z = parseInt(tileMatch[1]);
        const x = parseInt(tileMatch[2]);
        const y = parseInt(tileMatch[3]);
        return serveTile({ z, x, y }, env);
      }

      if (request.method === "POST" && url.pathname === "/seed") {
        return handleSeed(env);
      }

      if (request.method === "POST" && url.pathname === "/clear") {
        return handleClear(env);
      }

      if (url.pathname === "/health") {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("Not found", { status: 404 });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }
  },
};

// ─── Webhook: regenerate tile when a photo is published ───

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get("Authorization");
  if (env.WEBHOOK_SECRET && authHeader !== `Bearer ${env.WEBHOOK_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = (await request.json()) as WebhookPayload;
  console.log("[webhook] received:", payload.type, "on", payload.table);

  const record = payload.record ?? payload.old_record;
  if (!record) return new Response("No record", { status: 400 });

  console.log("[webhook] square_id:", record.square_id);
  const square = await fetchSquare(record.square_id, env);
  if (!square) {
    console.error("[webhook] square not found for id:", record.square_id);
    return new Response("Square not found", { status: 404 });
  }

  console.log("[webhook] square:", square.lat, square.lng, "cell:", square.cellId);
  const tile = latLngToTile(square.lat, square.lng, MAX_ZOOM);
  console.log("[webhook] z14 tile:", tileKey(tile));

  // Regenerate z14 tile with ALL photos in its bounds
  await regenerateBaseTile(tile, env);

  // Propagate up the pyramid: z13 → z0
  await propagateUp(tile, env);
  console.log("[webhook] done — tile regenerated and propagated to z0");

  return new Response(JSON.stringify({ ok: true, tile: tileKey(tile) }), {
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Seed: regenerate ALL tiles from scratch ───

async function handleSeed(env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return new Response("Missing Supabase config", { status: 500 });
  }

  try {
    // Fetch all active publications
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/squares?current_publication_id=not.is.null&select=id,lat,lng,cell_id,current_publication_id`,
      { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } },
    );
    const body = await res.json() as any;
    if (!Array.isArray(body)) {
      return new Response(JSON.stringify({ error: "Supabase error", body }), { status: 500 });
    }

    if (body.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No publications", tilesGenerated: 0 }));
    }

    // Group by z14 tile
    const tileMap = new Map<string, typeof body>();
    for (const sq of body) {
      const tile = latLngToTile(sq.lat, sq.lng, MAX_ZOOM);
      const key = tileKey(tile);
      if (!tileMap.has(key)) tileMap.set(key, []);
      tileMap.get(key)!.push(sq);
    }

    // Regenerate each z14 tile
    let tilesGenerated = 0;
    const z14tiles: TileCoord[] = [];

    for (const [key] of tileMap) {
      const [z, x, y] = key.split("/").map(Number);
      const tile: TileCoord = { z, x, y };
      await regenerateBaseTile(tile, env);
      z14tiles.push(tile);
      tilesGenerated++;
    }

    // Propagate ALL z14 tiles up the pyramid
    for (const tile of z14tiles) {
      await propagateUp(tile, env);
    }

    return new Response(JSON.stringify({
      ok: true,
      publications: body.length,
      tilesGenerated,
      pyramidPropagated: true,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}

// ─── Clear: delete ALL tiles from R2 (wipe stale data) ───

async function handleClear(env: Env): Promise<Response> {
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const list = await env.TILES_BUCKET.list({ prefix: "tiles/", cursor, limit: 500 });
    if (list.objects.length > 0) {
      await Promise.all(list.objects.map((obj) => env.TILES_BUCKET.delete(obj.key)));
      deleted += list.objects.length;
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);

  return new Response(JSON.stringify({ ok: true, deleted }), {
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Serve tile from R2 — only tiles with photos exist ───

async function serveTile(tile: TileCoord, env: Env): Promise<Response> {
  const obj = await env.TILES_BUCKET.get(tilePath(tile));
  if (obj) {
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("etag", obj.httpEtag);
    return new Response(obj.body, { headers });
  }

  // No tile = no photos here → transparent 1x1 PNG (tiny, fast)
  return emptyTileResponse();
}

// Valid 1x1 transparent RGBA PNG (generated with zlib deflate)
const EMPTY_1x1_PNG = new Uint8Array([
  137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,11,73,68,65,84,120,156,99,96,0,2,0,0,5,0,1,122,94,171,63,0,0,0,0,73,69,78,68,174,66,96,130
]);

function emptyTileResponse(): Response {
  return new Response(EMPTY_1x1_PNG, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
      "X-Tile-Empty": "true",
    },
  });
}

// ─── Regenerate a z14 tile with all photos ───

async function regenerateBaseTile(tile: TileCoord, env: Env): Promise<void> {
  const cells = cellsInTile(tile);
  const cellIds = cells.map((c) => c.id);
  console.log(`[render] tile ${tileKey(tile)}: ${cells.length} cells in bounds`);

  const publications = await fetchPublicationsForCells(cellIds, env);
  console.log(`[render] tile ${tileKey(tile)}: ${publications.length} publications found`);

  // Fetch and decode all photos in parallel
  const photos: { cellId: string; rgba: Uint8Array; width: number; height: number }[] = [];

  await Promise.all(
    publications.map(async (pub) => {
      try {
        console.log(`[render] fetching image for cell ${pub.cellId}: ${pub.imageUrl.slice(0, 80)}...`);
        const img = await fetchAndDecodeImage(pub.imageUrl);
        console.log(`[render] decoded ${pub.cellId}: ${img.width}×${img.height}`);
        photos.push({ cellId: pub.cellId, ...img });
      } catch (err: any) {
        console.error(`[render] failed to decode image for cell ${pub.cellId}:`, err.message);
      }
    }),
  );

  if (photos.length === 0) {
    // No photos → delete tile from R2 (serveTile returns transparent PNG by default)
    await env.TILES_BUCKET.delete(tilePath(tile));
    console.log(`[render] tile ${tileKey(tile)}: no photos, deleted from R2`);
    return;
  }

  const blob = await renderBaseTile(tile, photos);
  console.log(`[render] tile ${tileKey(tile)}: rendered ${photos.length} photos, ${blob.byteLength} bytes`);

  await env.TILES_BUCKET.put(tilePath(tile), blob, {
    httpMetadata: { contentType: "image/png", cacheControl: "public, max-age=60" },
  });
}

// ─── Supabase helpers ───

interface SquareInfo { lat: number; lng: number; cellId: string; }

async function fetchSquare(squareId: string, env: Env): Promise<SquareInfo | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return null;
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/squares?id=eq.${squareId}&select=lat,lng,cell_id`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } },
  );
  const data = await res.json() as any[];
  if (!data || data.length === 0) return null;
  return { lat: data[0].lat, lng: data[0].lng, cellId: data[0].cell_id };
}

interface CellPublication { cellId: string; imageUrl: string; }

async function fetchPublicationsForCells(cellIds: string[], env: Env): Promise<CellPublication[]> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY || cellIds.length === 0) return [];

  const cellIdList = cellIds.map((id) => `"${id}"`).join(",");
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/squares?cell_id=in.(${cellIdList})&current_publication_id=not.is.null&select=cell_id,current_publication_id`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } },
  );
  const squares = await res.json() as any[];
  if (!squares || squares.length === 0) return [];

  const pubIds = squares.map((s: any) => s.current_publication_id);
  const pubIdList = pubIds.map((id: string) => `"${id}"`).join(",");
  const pubRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/publications?id=in.(${pubIdList})&select=id,image_url`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } },
  );
  const pubs = await pubRes.json() as any[];
  if (!pubs) return [];

  const pubMap = new Map<string, string>();
  for (const pub of pubs) pubMap.set(pub.id, pub.image_url);

  return squares
    .filter((sq: any) => pubMap.has(sq.current_publication_id))
    .map((sq: any) => ({ cellId: sq.cell_id, imageUrl: pubMap.get(sq.current_publication_id)! }));
}
