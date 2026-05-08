/**
 * Water filter — checks which grid cells are on water using Mapbox's
 * rendered water layer. One native call per viewport, then client-side
 * point-in-polygon for each cell center.
 */

type Point = [number, number]; // [lng, lat]
type Ring = Point[];

/** Ray-casting point-in-polygon */
function pointInRing(pt: Point, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(pt: Point, coords: number[][][]): boolean {
  // Check outer ring
  if (!pointInRing(pt, coords[0] as Ring)) return false;
  // Check holes — if inside a hole, point is NOT in polygon
  for (let i = 1; i < coords.length; i++) {
    if (pointInRing(pt, coords[i] as Ring)) return false;
  }
  return true;
}

/** Check if a point is inside any of the water features */
export function isPointInWater(
  pt: Point,
  waterFeatures: GeoJSON.Feature[],
): boolean {
  for (const f of waterFeatures) {
    const geom = f.geometry;
    if (geom.type === "Polygon") {
      if (pointInPolygon(pt, (geom as GeoJSON.Polygon).coordinates)) return true;
    } else if (geom.type === "MultiPolygon") {
      for (const poly of (geom as GeoJSON.MultiPolygon).coordinates) {
        if (pointInPolygon(pt, poly)) return true;
      }
    }
  }
  return false;
}
