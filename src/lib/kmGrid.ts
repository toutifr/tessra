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
