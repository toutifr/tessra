import MapboxGL from "@rnmapbox/maps";
import { TILE_SERVER_URL } from "../constants/config";

/**
 * TileLayer renders the Tessra grid as raster tiles from the Cloudflare Worker.
 *
 * The tiles show the 1km × 1km grid with background and grid lines.
 * Photos are overlaid client-side via ImageSource for instant feedback.
 * Server-side photo compositing will be added later.
 */
export default function TileLayer() {
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
          rasterOpacity: 1,
          rasterFadeDuration: 150,
        }}
      />
    </MapboxGL.RasterSource>
  );
}
