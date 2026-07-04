import MapboxGL from "@rnmapbox/maps";
import { TILE_SERVER_URL } from "../constants/config";

/**
 * TileLayer renders the Tessra grid as raster tiles from the Cloudflare Worker.
 *
 * The tiles show the 1km × 1km grid with background and grid lines.
 * Photos are overlaid client-side via ImageSource for instant feedback.
 * `dimmed` → opacité 10% pour voir la carte derrière les photos (FAB œil).
 */
export default function TileLayer({ dimmed = false }: { dimmed?: boolean }) {
  return (
    <MapboxGL.RasterSource
      id="tessra-tiles"
      tileUrlTemplates={[`${TILE_SERVER_URL}/tiles/{z}/{x}/{y}.png`]}
      tileSize={512}
      minZoomLevel={0}
      maxZoomLevel={14}
    >
      <MapboxGL.RasterLayer
        id="tessra-photo-layer"
        style={{
          rasterOpacity: dimmed ? 0.1 : 1,
          rasterFadeDuration: 150,
        }}
      />
    </MapboxGL.RasterSource>
  );
}
