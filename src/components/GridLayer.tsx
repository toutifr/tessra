/**
 * GridLayer — 1km × 1km grid drawn directly on the map.
 *
 * Rendered BELOW the Mapbox "water" layer so the grid naturally
 * disappears under oceans and appears only on land.
 *
 * Uses cellsInBounds() — same math as photo placement.
 * Updates in real-time via onCameraChanged.
 */

import { useRef, useMemo } from "react";
import MapboxGL from "@rnmapbox/maps";
import { cellsInBounds } from "../lib/kmGrid";

const KM_LAT = 1 / 111.32;

function kmLng(latDeg: number): number {
  const cosLat = Math.cos((Math.abs(latDeg) * Math.PI) / 180);
  if (cosLat < 0.01) return 360;
  return KM_LAT / cosLat;
}

interface GridLayerProps {
  bounds: {
    sw: { lat: number; lng: number };
    ne: { lat: number; lng: number };
  } | null;
  zoom: number;
}

const MIN_GRID_ZOOM = 6;
const MAX_CELLS = 4000;

export default function GridLayer({ bounds, zoom }: GridLayerProps) {
  const cacheRef = useRef<{
    geojson: GeoJSON.FeatureCollection;
    bufferedBounds: { swLat: number; swLng: number; neLat: number; neLng: number };
    forZoom: number;
  } | null>(null);

  const gridGeoJSON = useMemo(() => {
    if (!bounds || zoom < MIN_GRID_ZOOM) {
      return { type: "FeatureCollection" as const, features: [] };
    }

    // Check cache
    if (cacheRef.current && Math.floor(cacheRef.current.forZoom) === Math.floor(zoom)) {
      const b = cacheRef.current.bufferedBounds;
      if (
        bounds.sw.lat > b.swLat &&
        bounds.sw.lng > b.swLng &&
        bounds.ne.lat < b.neLat &&
        bounds.ne.lng < b.neLng
      ) {
        return cacheRef.current.geojson;
      }
    }

    // 2× viewport buffer
    const latSpan = bounds.ne.lat - bounds.sw.lat;
    const lngSpan = bounds.ne.lng - bounds.sw.lng;
    const sw = { lat: bounds.sw.lat - latSpan * 0.5, lng: bounds.sw.lng - lngSpan * 0.5 };
    const ne = { lat: bounds.ne.lat + latSpan * 0.5, lng: bounds.ne.lng + lngSpan * 0.5 };

    const cells = cellsInBounds(sw, ne, MAX_CELLS);
    if (cells.length === 0) {
      return { type: "FeatureCollection" as const, features: [] };
    }

    // Build LineStrings: horizontal + vertical
    const features: GeoJSON.Feature[] = [];

    // Collect rows for horizontal lines
    const rows = new Map<number, { minLng: number; maxLng: number }>();
    for (const cell of cells) {
      const r = rows.get(cell.row);
      if (r) {
        r.minLng = Math.min(r.minLng, cell.sw.lng);
        r.maxLng = Math.max(r.maxLng, cell.ne.lng);
      } else {
        rows.set(cell.row, { minLng: cell.sw.lng, maxLng: cell.ne.lng });
      }
    }

    // Horizontal lines (one per row boundary)
    for (const [row, ext] of rows) {
      const lat = row * KM_LAT;
      features.push({
        type: "Feature", properties: {},
        geometry: { type: "LineString", coordinates: [[ext.minLng, lat], [ext.maxLng, lat]] },
      });
    }
    // Top edge of last row
    const maxRow = Math.max(...rows.keys());
    const topExt = rows.get(maxRow)!;
    features.push({
      type: "Feature", properties: {},
      geometry: { type: "LineString", coordinates: [[topExt.minLng, (maxRow + 1) * KM_LAT], [topExt.maxLng, (maxRow + 1) * KM_LAT]] },
    });

    // Vertical lines (per-row, since lng step varies with latitude)
    for (const [row, ext] of rows) {
      const baseLat = row * KM_LAT;
      const topLat = baseLat + KM_LAT;
      const step = kmLng(baseLat);
      const minCol = Math.floor(ext.minLng / step);
      const maxCol = Math.ceil(ext.maxLng / step);

      for (let c = minCol; c <= maxCol; c++) {
        const lng = c * step;
        features.push({
          type: "Feature", properties: {},
          geometry: { type: "LineString", coordinates: [[lng, baseLat], [lng, topLat]] },
        });
      }
    }

    const geojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };

    cacheRef.current = {
      geojson,
      bufferedBounds: { swLat: sw.lat, swLng: sw.lng, neLat: ne.lat, neLng: ne.lng },
      forZoom: zoom,
    };

    return geojson;
  }, [bounds?.sw.lat, bounds?.sw.lng, bounds?.ne.lat, bounds?.ne.lng, zoom]);

  return (
    <MapboxGL.ShapeSource id="grid-cells" shape={gridGeoJSON}>
      <MapboxGL.LineLayer
        id="grid-border-layer"
        belowLayerID="water"
        style={{
          lineColor: "rgba(255, 255, 255, 1)",
          lineOpacity: [
            "interpolate", ["linear"], ["zoom"],
            6, 0.1,
            8, 0.2,
            10, 0.3,
            12, 0.4,
            14, 0.5,
            16, 0.6,
          ] as any,
          lineWidth: [
            "interpolate", ["linear"], ["zoom"],
            6, 0.15,
            8, 0.2,
            12, 0.4,
            14, 0.6,
            16, 1,
          ] as any,
        }}
      />
    </MapboxGL.ShapeSource>
  );
}
