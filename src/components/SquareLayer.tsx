import MapboxGL from "@rnmapbox/maps";
import { Square, STATUS_COLORS } from "../types/square";
import { bounds as geohashBounds } from "../lib/geohash";

interface Props {
  squares: Square[];
  onSquareTap: (square: Square) => void;
}

function squareToFeature(square: Square): GeoJSON.Feature {
  const b = geohashBounds(square.geohash);
  return {
    type: "Feature",
    id: square.id,
    properties: {
      id: square.id,
      status: square.status,
      color: STATUS_COLORS[square.status],
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [b.sw.lng, b.sw.lat],
          [b.ne.lng, b.sw.lat],
          [b.ne.lng, b.ne.lat],
          [b.sw.lng, b.ne.lat],
          [b.sw.lng, b.sw.lat],
        ],
      ],
    },
  };
}

export default function SquareLayer({ squares, onSquareTap }: Props) {
  const featureCollection: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: squares.map(squareToFeature),
  };

  return (
    <MapboxGL.ShapeSource
      id="squares-source"
      shape={featureCollection}
      onPress={(e) => {
        const feature = e.features?.[0];
        if (feature?.properties?.id) {
          const square = squares.find((s) => s.id === feature.properties!.id);
          if (square) onSquareTap(square);
        }
      }}
    >
      <MapboxGL.FillLayer
        id="squares-fill"
        style={{
          fillColor: ["get", "color"],
          fillOpacity: 0.4,
        }}
        minZoomLevel={8}
      />
      <MapboxGL.LineLayer
        id="squares-border"
        style={{
          lineColor: ["get", "color"],
          lineWidth: 1.5,
          lineOpacity: 0.8,
        }}
        minZoomLevel={8}
      />
    </MapboxGL.ShapeSource>
  );
}
