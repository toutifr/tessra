import { useMemo } from "react";
import { Image, Pressable, Text, View } from "react-native";
import MapboxGL from "@rnmapbox/maps";
import { SquareStatus, STATUS_COLORS } from "../types/square";
import { SquareWithImage } from "../hooks/useSquares";
import { GridCell, cellFromId } from "../lib/kmGrid";

interface Props {
  squares: SquareWithImage[];
  gridCells: GridCell[];
  zoom: number;
  onCellTap: (cellId: string, square: SquareWithImage | null) => void;
}

/**
 * Convert 1km to pixels at a given zoom level and latitude.
 * Mapbox tile size = 512px, world = 2^zoom tiles at zoom level.
 * 1px at zoom z at equator = 40075km / (512 * 2^z)
 * At latitude φ: 1px = 40075 * cos(φ) / (512 * 2^z) km
 * So 1km = 512 * 2^z / (40075 * cos(φ)) pixels
 */
function kmToPixels(zoom: number, latDeg: number): number {
  const cosLat = Math.cos((Math.abs(latDeg) * Math.PI) / 180);
  if (cosLat < 0.01) return 1;
  return (512 * Math.pow(2, zoom)) / (40075 * cosLat);
}

export default function SquareLayer({ squares = [], gridCells = [], zoom, onCellTap }: Props) {
  // Index DB squares by cell_id for quick lookup
  const squaresByCellId = useMemo(() => {
    const map = new Map<string, SquareWithImage>();
    for (const sq of squares) {
      map.set(sq.cell_id, sq);
    }
    return map;
  }, [squares]);

  // Squares that have images to display
  const squaresWithImages = useMemo(
    () => squares.filter((sq) => sq.image_url && sq.cell_id),
    [squares],
  );

  // Grid polygon features — every cell rendered, DB squares override color
  const gridCollection = useMemo<GeoJSON.FeatureCollection>(() => {
    if (gridCells.length === 0) {
      return { type: "FeatureCollection", features: [] };
    }

    const features: GeoJSON.Feature[] = gridCells.map((cell, index) => {
      const dbSquare = squaresByCellId.get(cell.id);
      const status: SquareStatus = dbSquare?.status ?? "libre";
      // Don't fill squares that have a publication image — the image will cover them
      const hasImage = dbSquare?.image_url != null;
      const minPrice = dbSquare?.replacement_count ?? 0;
      const priceLabel = status === "occupe" && minPrice > 0 ? `${minPrice}€` : "";
      return {
        type: "Feature",
        id: index,
        properties: {
          cellId: cell.id,
          status,
          color: STATUS_COLORS[status],
          hasImage,
          priceLabel,
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [cell.sw.lng, cell.sw.lat],
              [cell.ne.lng, cell.sw.lat],
              [cell.ne.lng, cell.ne.lat],
              [cell.sw.lng, cell.ne.lat],
              [cell.sw.lng, cell.sw.lat],
            ],
          ],
        },
      };
    });

    return { type: "FeatureCollection", features };
  }, [gridCells, squaresByCellId]);

  // Size of 1km cell in pixels at current zoom
  const cellSizePx = useMemo(() => {
    if (squaresWithImages.length === 0) return 0;
    const firstCell = cellFromId(squaresWithImages[0].cell_id);
    const lat = firstCell?.center.lat ?? 48;
    return kmToPixels(zoom, lat);
  }, [zoom, squaresWithImages]);

  if (gridCells.length === 0) {
    return null;
  }

  return (
    <>
      {/* Grid: 1km × 1km square polygons */}
      <MapboxGL.ShapeSource
        id="squares-source"
        shape={gridCollection}
        onPress={(e) => {
          const feature = e.features?.[0];
          if (feature?.properties?.cellId) {
            const id = feature.properties.cellId as string;
            const square = squaresByCellId.get(id) ?? null;
            onCellTap(id, square);
          }
        }}
      >
        {/* Fill for cells WITHOUT images */}
        <MapboxGL.FillLayer
          id="squares-fill"
          filter={["!=", ["get", "hasImage"], true]}
          style={{
            fillColor: ["get", "color"],
            fillOpacity: [
              "case",
              ["==", ["get", "status"], "libre"],
              0.08,
              0.3,
            ],
          }}
          minZoomLevel={0}
        />
        <MapboxGL.LineLayer
          id="squares-border"
          style={{
            lineColor: [
              "case",
              ["==", ["get", "status"], "libre"],
              "#888888",
              ["get", "color"],
            ],
            lineWidth: [
              "case",
              ["==", ["get", "status"], "libre"],
              0.5,
              2,
            ],
            lineOpacity: 0.5,
          }}
          minZoomLevel={0}
        />
        {/* Price labels on occupied squares */}
        <MapboxGL.SymbolLayer
          id="squares-price"
          filter={["!=", ["get", "priceLabel"], ""]}
          style={{
            textField: ["get", "priceLabel"],
            textSize: 12,
            textColor: "#ffffff",
            textHaloColor: "#000000",
            textHaloWidth: 1,
            textAllowOverlap: true,
          }}
          minZoomLevel={10}
        />
      </MapboxGL.ShapeSource>

      {/* Publication images: fill the exact cell area */}
      {squaresWithImages.map((sq) => {
        const cell = cellFromId(sq.cell_id);
        if (!cell || cellSizePx < 4) return null;
        return (
          <MapboxGL.MarkerView
            key={sq.id}
            coordinate={[cell.center.lng, cell.center.lat]}
            anchor={{ x: 0.5, y: 0.5 }}
            allowOverlap
          >
            <Pressable onPress={() => onCellTap(sq.cell_id, sq)}>
              <View style={{ width: cellSizePx, height: cellSizePx, overflow: "hidden" }}>
                <Image
                  source={{ uri: sq.image_url! }}
                  style={{ width: cellSizePx, height: cellSizePx }}
                  resizeMode="cover"
                />
              </View>
            </Pressable>
          </MapboxGL.MarkerView>
        );
      })}
    </>
  );
}
