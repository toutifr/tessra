/**
 * Tile rendering with REAL photo compositing.
 *
 * - Decodes JPEG photos via jpeg-js (pure JS, no Canvas needed)
 * - Places photos in the right cells within 512×512 PNG tiles
 * - Composes parent tiles from 4 children (pyramid propagation)
 * - All pixel manipulation is done with raw RGBA buffers
 */

import type { TileCoord } from "./types";
import { tileBounds, cellsInTile, cellPixelBounds, type KmCell } from "./tile-math";
import * as jpeg from "jpeg-js";

const TILE_SIZE = 512;

// ─── PNG Encoder ───

async function encodePng(width: number, height: number, rgba: Uint8Array): Promise<ArrayBuffer> {
  const rowLen = width * 4;
  const filtered = new Uint8Array((rowLen + 1) * height);
  for (let y = 0; y < height; y++) {
    filtered[y * (rowLen + 1)] = 0; // filter: None
    filtered.set(rgba.subarray(y * rowLen, y * rowLen + rowLen), y * (rowLen + 1) + 1);
  }
  const compressed = await zlibCompress(filtered);
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = new Uint8Array(13);
  new DataView(ihdrData.buffer).setUint32(0, width);
  new DataView(ihdrData.buffer).setUint32(4, height);
  ihdrData[8] = 8; ihdrData[9] = 6; // 8-bit RGBA
  const ihdr = pngChunk("IHDR", ihdrData);
  const idat = pngChunk("IDAT", new Uint8Array(compressed));
  const iend = pngChunk("IEND", new Uint8Array(0));
  const out = new Uint8Array(sig.length + ihdr.length + idat.length + iend.length);
  let off = 0;
  out.set(sig, off); off += sig.length;
  out.set(ihdr, off); off += ihdr.length;
  out.set(idat, off); off += idat.length;
  out.set(iend, off);
  return out.buffer;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

async function zlibCompress(data: Uint8Array): Promise<ArrayBuffer> {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();
  writer.write(data);
  writer.close();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const result = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { result.set(c, off); off += c.length; }
  return result.buffer;
}

// ─── PNG Decoder (for reading child tiles during propagation) ───

async function zlibDecompress(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  writer.write(data);
  writer.close();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const result = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { result.set(c, off); off += c.length; }
  return result;
}

function decodePng(buffer: ArrayBuffer): { width: number; height: number; rgba: Uint8Array } {
  const view = new DataView(buffer);
  // Skip PNG signature (8 bytes)
  let offset = 8;
  let width = 0, height = 0;
  const idatChunks: Uint8Array[] = [];

  while (offset < buffer.byteLength) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      view.getUint8(offset + 4), view.getUint8(offset + 5),
      view.getUint8(offset + 6), view.getUint8(offset + 7),
    );

    if (type === "IHDR") {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
    } else if (type === "IDAT") {
      idatChunks.push(new Uint8Array(buffer, offset + 8, length));
    } else if (type === "IEND") {
      break;
    }

    offset += 12 + length; // 4 length + 4 type + data + 4 crc
  }

  // Concatenate IDAT chunks
  let totalIdat = 0;
  for (const c of idatChunks) totalIdat += c.length;
  const compressed = new Uint8Array(totalIdat);
  let off = 0;
  for (const c of idatChunks) { compressed.set(c, off); off += c.length; }

  return { width, height, rgba: compressed }; // rgba here is still compressed — decompress async
}

async function decodePngFull(buffer: ArrayBuffer): Promise<{ width: number; height: number; rgba: Uint8Array }> {
  const parsed = decodePng(buffer);
  const decompressed = await zlibDecompress(parsed.rgba);

  // Remove filter bytes (1 per row)
  const rowLen = parsed.width * 4;
  const rgba = new Uint8Array(parsed.width * parsed.height * 4);
  for (let y = 0; y < parsed.height; y++) {
    const srcOff = y * (rowLen + 1) + 1; // skip filter byte
    rgba.set(decompressed.subarray(srcOff, srcOff + rowLen), y * rowLen);
  }

  return { width: parsed.width, height: parsed.height, rgba };
}

// ─── CRC32 ───

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ─── Pixel helpers ───

/** Scale-blit source RGBA into destination RGBA at (dx,dy) with size (dw,dh) */
function blitScaled(
  dst: Uint8Array, dstW: number,
  src: Uint8Array, srcW: number, srcH: number,
  dx: number, dy: number, dw: number, dh: number,
) {
  for (let y = 0; y < dh; y++) {
    const sy = Math.floor((y / dh) * srcH);
    const dstY = dy + y;
    if (dstY < 0 || dstY >= dstW) continue; // dstW is also height for square tiles
    for (let x = 0; x < dw; x++) {
      const sx = Math.floor((x / dw) * srcW);
      const dstX = dx + x;
      if (dstX < 0 || dstX >= dstW) continue;

      const si = (sy * srcW + sx) * 4;
      const di = (dstY * dstW + dstX) * 4;
      const sa = src[si + 3];

      if (sa === 255) {
        dst[di] = src[si]; dst[di + 1] = src[si + 1];
        dst[di + 2] = src[si + 2]; dst[di + 3] = 255;
      } else if (sa > 0) {
        // Alpha blend
        const da = dst[di + 3];
        const outA = sa + da * (255 - sa) / 255;
        if (outA > 0) {
          dst[di] = (src[si] * sa + dst[di] * da * (255 - sa) / 255) / outA;
          dst[di + 1] = (src[si + 1] * sa + dst[di + 1] * da * (255 - sa) / 255) / outA;
          dst[di + 2] = (src[si + 2] * sa + dst[di + 2] * da * (255 - sa) / 255) / outA;
          dst[di + 3] = outA;
        }
      }
    }
  }
}

// ─── Tile renderers ───

interface CellPhoto {
  cellId: string;
  rgba: Uint8Array;
  width: number;
  height: number;
}

/**
 * Render a z14 tile: photos only, no grid (grid is drawn client-side by GridLayer).
 */
export async function renderBaseTile(
  tile: TileCoord,
  photos: CellPhoto[],
): Promise<ArrayBuffer> {
  const rgba = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  // transparent background (zero-initialized)

  if (photos.length === 0) return encodePng(TILE_SIZE, TILE_SIZE, rgba);

  const bounds = tileBounds(tile);
  const tileW = bounds.east - bounds.west;
  const tileH = bounds.north - bounds.south;
  if (tileW === 0 || tileH === 0) return encodePng(TILE_SIZE, TILE_SIZE, rgba);

  // Index photos by cellId
  const photoMap = new Map<string, CellPhoto>();
  for (const p of photos) photoMap.set(p.cellId, p);

  // Get cells and render photos
  const cells = cellsInTile(tile);
  for (const cell of cells) {
    const photo = photoMap.get(cell.id);
    if (!photo) continue;

    const px = cellPixelBounds(cell, tile, TILE_SIZE);
    if (px.w < 2 || px.h < 2) continue;

    blitScaled(rgba, TILE_SIZE, photo.rgba, photo.width, photo.height, px.x, px.y, px.w, px.h);
  }

  return encodePng(TILE_SIZE, TILE_SIZE, rgba);
}

/**
 * Render an empty transparent tile.
 */
export async function renderEmptyTile(): Promise<ArrayBuffer> {
  return encodePng(TILE_SIZE, TILE_SIZE, new Uint8Array(TILE_SIZE * TILE_SIZE * 4));
}

/**
 * Compose 4 child tiles into 1 parent tile.
 * Each child is scaled to 256×256 and placed in its quadrant.
 */
export async function composeTile(
  children: [ArrayBuffer | null, ArrayBuffer | null, ArrayBuffer | null, ArrayBuffer | null],
): Promise<ArrayBuffer> {
  const rgba = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  const half = TILE_SIZE / 2;

  // Positions: [topLeft, topRight, bottomLeft, bottomRight]
  const positions: [number, number][] = [[0, 0], [half, 0], [0, half], [half, half]];

  for (let i = 0; i < 4; i++) {
    const child = children[i];
    if (!child) continue;

    try {
      const decoded = await decodePngFull(child);
      blitScaled(rgba, TILE_SIZE, decoded.rgba, decoded.width, decoded.height,
        positions[i][0], positions[i][1], half, half);
    } catch {
      // Skip corrupt tiles
    }
  }

  return encodePng(TILE_SIZE, TILE_SIZE, rgba);
}

/**
 * Fetch a JPEG image and decode to RGBA pixels.
 */
export async function fetchAndDecodeImage(url: string): Promise<{ rgba: Uint8Array; width: number; height: number }> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const data = jpeg.decode(new Uint8Array(buffer) as any, { useTArray: true, formatAsRGBA: true });
  return { rgba: data.data as Uint8Array, width: data.width, height: data.height };
}
