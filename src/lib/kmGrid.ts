/**
 * 1km × 1km global grid system.
 *
 * - Each cell is exactly 1km tall (in latitude).
 * - Each cell is exactly 1km wide (in longitude, adjusted for latitude).
 * - On Mercator projection, cells appear visually square.
 * - Cell IDs are stable: "r{row}c{col}" based on integer row/col indices.
 */

/** 1 km expressed in degrees of latitude (constant everywhere on Earth) */
const KM_LAT = 1 / 111.32; // ≈ 0.008983°

/** 1 km expressed in degrees of longitude at a given latitude */
function kmLng(latDeg: number): number {
  const cosLat = Math.cos((Math.abs(latDeg) * Math.PI) / 180);
  if (cosLat < 0.01) return 360; // poles — single cell wraps around
  return KM_LAT / cosLat;
}

export interface GridCell {
  /** Stable identifier: "r{row}c{col}" */
  id: string;
  row: number;
  col: number;
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
  center: { lat: number; lng: number };
}

/** Return the grid cell that contains a given point */
export function cellAt(lat: number, lng: number): GridCell {
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

/** Decode a cell ID back into a GridCell */
export function cellFromId(id: string): GridCell | null {
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

/** Bloc LOD : `factor` × `factor` cellules 1km, aligné sur les multiples de factor */
export interface GridBlock {
  /** Base (south-west) cell row — multiple of factor */
  row: number;
  /** Base (south-west) cell col — multiple of factor */
  col: number;
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
  center: { lat: number; lng: number };
}

/**
 * Bounds of a LOD block spanning `factor` cells per side, anchored at (rowStart, colStart).
 * The column step of the BASE row is used for the whole block: all blocks of the same
 * block-row band share the same base row, so they tile seamlessly in longitude.
 */
export function blockBounds(rowStart: number, colStart: number, factor: number): GridBlock {
  const baseLat = rowStart * KM_LAT;
  const step = kmLng(baseLat);
  const swLat = baseLat;
  const swLng = colStart * step;
  const h = factor * KM_LAT;
  const w = factor * step;
  return {
    row: rowStart,
    col: colStart,
    sw: { lat: swLat, lng: swLng },
    ne: { lat: swLat + h, lng: swLng + w },
    center: { lat: swLat + h / 2, lng: swLng + w / 2 },
  };
}

/**
 * Enumerate all LOD blocks (factor × factor cells) intersecting a bounding box.
 * Blocks are aligned on row/col multiples of factor. Returns [] if the count
 * would exceed maxBlocks (perf safeguard — caller can retry with a bigger factor).
 */
export function blocksInBounds(
  sw: { lat: number; lng: number },
  ne: { lat: number; lng: number },
  factor: number,
  maxBlocks: number = 1200,
): GridBlock[] {
  const mod = (n: number, m: number) => ((n % m) + m) % m;

  const minRowRaw = Math.floor(sw.lat / KM_LAT);
  const minRow = minRowRaw - mod(minRowRaw, factor);
  const maxRow = Math.floor(ne.lat / KM_LAT);
  if (maxRow < minRow) return [];

  // Quick estimate before generating anything
  const midLat = (sw.lat + ne.lat) / 2;
  const midStep = kmLng(midLat) * factor;
  const estCols = Math.ceil((ne.lng - sw.lng) / midStep) + 2;
  const estRows = Math.ceil((maxRow - minRow + 1) / factor) + 1;
  if (estRows * estCols > maxBlocks) return [];

  const blocks: GridBlock[] = [];
  for (let r = minRow; r <= maxRow; r += factor) {
    const step = kmLng(r * KM_LAT);
    const minColRaw = Math.floor(sw.lng / step);
    const minCol = minColRaw - mod(minColRaw, factor);
    const maxCol = Math.floor(ne.lng / step);
    for (let c = minCol; c <= maxCol; c += factor) {
      blocks.push(blockBounds(r, c, factor));
      // Hard stop: mid-lat estimate can undershoot on tall viewports
      if (blocks.length > maxBlocks) return [];
    }
  }
  return blocks;
}

/**
 * Generate all 1km × 1km cells that intersect a bounding box.
 * Returns empty array if cell count would exceed maxCells (perf safeguard).
 */
export function cellsInBounds(
  sw: { lat: number; lng: number },
  ne: { lat: number; lng: number },
  maxCells: number = 3000,
): GridCell[] {
  const minRow = Math.floor(sw.lat / KM_LAT);
  const maxRow = Math.floor(ne.lat / KM_LAT);

  // Quick estimate to avoid generating millions of cells
  const midLat = (sw.lat + ne.lat) / 2;
  const midStep = kmLng(midLat);
  const estCols = Math.ceil((ne.lng - sw.lng) / midStep) + 2;
  const estRows = maxRow - minRow + 2;
  if (estRows * estCols > maxCells) {
    return [];
  }

  const cells: GridCell[] = [];

  for (let r = minRow; r <= maxRow; r++) {
    const baseLat = r * KM_LAT;
    const step = kmLng(baseLat);
    const minCol = Math.floor(sw.lng / step);
    const maxCol = Math.floor(ne.lng / step);

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
