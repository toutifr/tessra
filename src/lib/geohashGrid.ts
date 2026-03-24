import { encode, bounds } from "./geohash";

/**
 * Generate all geohash cells of a given precision that fall within a bounding box.
 * Used to render the full grid on the map regardless of database content.
 */
export function geohashesInBounds(
  sw: { lat: number; lng: number },
  ne: { lat: number; lng: number },
  precision: number = 6
): string[] {
  // Get a reference cell to determine cell size
  const refHash = encode(sw.lat, sw.lng, precision);
  const refBounds = bounds(refHash);
  const latStep = refBounds.ne.lat - refBounds.sw.lat;
  const lngStep = refBounds.ne.lng - refBounds.sw.lng;

  // Safety: limit the number of cells to avoid performance issues
  const maxCells = 2000;
  const estimatedCols = Math.ceil((ne.lng - sw.lng) / lngStep) + 2;
  const estimatedRows = Math.ceil((ne.lat - sw.lat) / latStep) + 2;
  if (estimatedCols * estimatedRows > maxCells) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  // Iterate through the bounding box with small overlap
  let lat = sw.lat - latStep;
  while (lat <= ne.lat + latStep) {
    let lng = sw.lng - lngStep;
    while (lng <= ne.lng + lngStep) {
      const hash = encode(lat, lng, precision);
      if (!seen.has(hash)) {
        seen.add(hash);
        // Verify the cell actually overlaps with viewport
        const b = bounds(hash);
        if (
          b.ne.lat >= sw.lat &&
          b.sw.lat <= ne.lat &&
          b.ne.lng >= sw.lng &&
          b.sw.lng <= ne.lng
        ) {
          result.push(hash);
        }
      }
      lng += lngStep * 0.5; // half-step to avoid skipping cells
    }
    lat += latStep * 0.5;
  }

  return result;
}
