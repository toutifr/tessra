import { useMemo } from "react";
import { Image, Pressable, StyleSheet } from "react-native";
import MapboxGL from "@rnmapbox/maps";
import { SquareStatus, STATUS_COLORS } from "../types/square";
import { SquareWithImage } from "../hooks/useSquares";
import { bounds as geohashBounds, decode as geohashDecode } from "../lib/geohash";

interface Props {
  squares: SquareWithImage[];
  gridHashes: string[];
  onSquareTap: (geohash: string, square: SquareWithImage | null) => void;
}

function hashToPolygon(geohash: string): number[][] {
  const b = geohashBounds(geohash);
  return [
    [b.sw.lng, b.sw.lat],
    [b.ne.lng, b.sw.lat],
    [b.ne.lng, b.ne.lat],
    [b.sw.lng, b.ne.lat],
    [b.sw.lng, b.sw.lat],
  ];
}

export default function SquareLayer({ squares = [], gridHashes = [], onSquareTap }: Props) {
  // Index DB squares by geohash for quick lookup
  const squaresByHash = useMemo(() => {
    const map = new Map<string, SquareWithImage>();
    for (const sq of squares) {
      map.set(sq.geohash, sq);
    }
    return map;
  }, [squares]);

  // Squares that have images to display
  const squaresWithImages = useMemo(
    () => squares.filter((sq) => sq.image_url),
    [squares],
  );

  // Grid polygon features
  const gridCollection = useMemo<GeoJSON.FeatureCollection>(() => {
    if (gridHashes.length === 0) {
      return { type: "FeatureCollection", features: [] };
    }

    const features: GeoJSON.Feature[] = gridHashes.map((hash, index) => {
      const dbSquare = squaresByHash.get(hash);
      const status: SquareStatus = dbSquare?.status ?? "libre";
      return {
        type: "Feature",
        id: index,
        properties: {
          geohash: hash,
          dbId: dbSquare?.id ?? null,
          status,
          color: STATUS_COLORS[status],
          hasPublication: dbSquare?.current_publication_id != null,
        },
        geometry: {
          type: "Polygon",
          coordinates: [hashToPolygon(hash)],
        },
      };
    });

    return { type: "FeatureCollection", features };
  }, [gridHashes, squaresByHash]);

  if (gridHashes.length === 0) {
    return null;
  }

  return (
    <>
      {/* Grid: polygons for all cells */}
      <MapboxGL.ShapeSource
        id="squares-source"
        shape={gridCollection}
        onPress={(e) => {
          const feature = e.features?.[0];
          if (feature?.properties?.geohash) {
            const hash = feature.properties.geohash as string;
            const square = squaresByHash.get(hash) ?? null;
            onSquareTap(hash, square);
          }
        }}
      >
        <MapboxGL.FillLayer
          id="squares-fill"
          style={{
            fillColor: ["get", "color"],
            fillOpacity: [
              "case",
              ["==", ["get", "status"], "libre"],
              0.1,
              0.25,
            ],
          }}
          minZoomLevel={9}
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
              1.5,
            ],
            lineOpacity: 0.6,
          }}
          minZoomLevel={9}
        />
      </MapboxGL.ShapeSource>

      {/* Publication images: rendered as native React markers */}
      {squaresWithImages.map((sq) => {
        const center = geohashDecode(sq.geohash);
        return (
          <MapboxGL.MarkerView
            key={sq.id}
            coordinate={[center.lng, center.lat]}
            anchor={{ x: 0.5, y: 0.5 }}
            allowOverlap
          >
            <Pressable
              onPress={() => onSquareTap(sq.geohash, sq)}
              style={styles.markerContainer}
            >
              <Image
                source={{ uri: sq.image_url! }}
                style={styles.markerImage}
                resizeMode="cover"
              />
            </Pressable>
          </MapboxGL.MarkerView>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  markerContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  markerImage: {
    width: "100%",
    height: "100%",
  },
});
