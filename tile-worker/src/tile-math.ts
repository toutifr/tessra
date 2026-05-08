import type { TileCoord } from "./types";

/** Convert lat/lng to tile coordinates at a given zoom level (Web Mercator) */
export function latLngToTile(lat: number, lng: number, z: number): TileCoord {
  const n = Math.pow(2, z);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { z, x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

/** Get the lat/lng bounds of a tile */
export function tileBounds(t: TileCoord): { north: number; south: number; west: number; east: number } {
  const n = Math.pow(2, t.z);
  const west = (t.x / n) * 360 - 180;
  const east = ((t.x + 1) / n) * 360 - 180;
  const north = tileToLat(t.y, t.z);
  const south = tileToLat(t.y + 1, t.z);
  return { north, south, west, east };
}

function tileToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Get the parent tile one zoom level up */
export function parentTile(t: TileCoord): TileCoord {
  return {
    z: t.z - 1,
    x: Math.floor(t.x / 2),
    y: Math.floor(t.y / 2),
  };
}

/** Get the 4 children tiles one zoom level down */
export function childTiles(t: TileCoord): [TileCoord, TileCoord, TileCoord, TileCoord] {
  const x2 = t.x * 2;
  const y2 = t.y * 2;
  const z1 = t.z + 1;
  return [
    { z: z1, x: x2, y: y2 },         // top-left
    { z: z1, x: x2 + 1, y: y2 },     // top-right
    { z: z1, x: x2, y: y2 + 1 },     // bottom-left
    { z: z1, x: x2 + 1, y: y2 + 1 }, // bottom-right
  ];
}

/** Get all ancestor tiles from z-1 up to z=0 */
export function ancestorTiles(t: TileCoord): TileCoord[] {
  const ancestors: TileCoord[] = [];
  let current = t;
  while (current.z > 0) {
    current = parentTile(current);
    ancestors.push(current);
  }
  return ancestors;
}

/** Unique string key for a tile */
export function tileKey(t: TileCoord): string {
  return `${t.z}/${t.x}/${t.y}`;
}

/** R2 object path for a tile */
export function tilePath(t: TileCoord): string {
  return `tiles/${t.z}/${t.x}/${t.y}.png`;
}

// --- kmGrid functions (ported from the mobile app) ---

const KM_LAT = 1 / 111.32;

function kmLng(latDeg: number): number {
  const cosLat = Math.cos((Math.abs(latDeg) * Math.PI) / 180);
  if (cosLat < 0.01) return 360;
  return KM_LAT / cosLat;
}

export interface KmCell {
  id: string;
  row: number;
  col: number;
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
  center: { lat: number; lng: number };
}

/** Return the 1km grid cell containing a point */
export function cellAt(lat: number, lng: number): KmCell {
  const row = Math.floor(lat / KM_LAT);
  const baseLat = row * KM_LAT;
  const step = kmLng(baseLat);
  const col = Math.floor(lng / step);
  const swLat = baseLat;
  const swLng = col * step;

  return {
    id: `r${row}c${col}`,
    row,
    col,
    sw: { lat: swLat, lng: swLng },
    ne: { lat: swLat + KM_LAT, lng: swLng + step },
    center: { lat: swLat + KM_LAT / 2, lng: swLng + step / 2 },
  };
}

/** Decode a cell ID back into a KmCell */
export function cellFromId(id: string): KmCell | null {
  const match = id.match(/^r(-?\d+)c(-?\d+)$/);
  if (!match) return null;
  const row = parseInt(match[1], 10);
  const col = parseInt(match[2], 10);
  const baseLat = row * KM_LAT;
  const step = kmLng(baseLat);
  const swLat = baseLat;
  const swLng = col * step;

  return {
    id,
    row,
    col,
    sw: { lat: swLat, lng: swLng },
    ne: { lat: swLat + KM_LAT, lng: swLng + step },
    center: { lat: swLat + KM_LAT / 2, lng: swLng + step / 2 },
  };
}

/** Get all 1km cells that intersect a tile's bounds */
export function cellsInTile(tile: TileCoord): KmCell[] {
  const bounds = tileBounds(tile);
  const cells: KmCell[] = [];

  const minRow = Math.floor(bounds.south / KM_LAT);
  const maxRow = Math.floor(bounds.north / KM_LAT);

  for (let r = minRow; r <= maxRow; r++) {
    const baseLat = r * KM_LAT;
    const step = kmLng(baseLat);
    const minCol = Math.floor(bounds.west / step);
    const maxCol = Math.floor(bounds.east / step);

    for (let c = minCol; c <= maxCol; c++) {
      const swLat = baseLat;
      const swLng = c * step;
      cells.push({
        id: `r${r}c${c}`,
        row: r,
        col: c,
        sw: { lat: swLat, lng: swLng },
        ne: { lat: swLat + KM_LAT, lng: swLng + step },
        center: { lat: swLat + KM_LAT / 2, lng: swLng + step / 2 },
      });
    }
  }

  return cells;
}

/**
 * Convert a cell's lat/lng bounds to pixel coordinates within a tile.
 * Returns { x, y, w, h } in pixels (0-based, tile is TILE_SIZE × TILE_SIZE).
 */
export function cellPixelBounds(
  cell: KmCell,
  tile: TileCoord,
  tileSize: number,
): { x: number; y: number; w: number; h: number } {
  const bounds = tileBounds(tile);
  const tileWidth = bounds.east - bounds.west;
  const tileHeight = bounds.north - bounds.south;

  // Clamp cell bounds to tile bounds
  const cellWest = Math.max(cell.sw.lng, bounds.west);
  const cellEast = Math.min(cell.ne.lng, bounds.east);
  const cellSouth = Math.max(cell.sw.lat, bounds.south);
  const cellNorth = Math.min(cell.ne.lat, bounds.north);

  const x = ((cellWest - bounds.west) / tileWidth) * tileSize;
  const w = ((cellEast - cellWest) / tileWidth) * tileSize;
  // Y is inverted: north = top = 0
  const y = ((bounds.north - cellNorth) / tileHeight) * tileSize;
  const h = ((cellNorth - cellSouth) / tileHeight) * tileSize;

  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
  };
}
