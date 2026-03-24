import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import MapboxGL, { type MapState } from "@rnmapbox/maps";
import * as Location from "expo-location";
import { router } from "expo-router";
import { MAPBOX_ACCESS_TOKEN } from "../../src/constants/config";
import { useSquares } from "../../src/hooks/useSquares";
import SquareLayer from "../../src/components/SquareLayer";
import { SquareWithImage } from "../../src/hooks/useSquares";
import { geohashesInBounds } from "../../src/lib/geohashGrid";

MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);

const DEFAULT_CENTER: [number, number] = [2.3522, 48.8566]; // Paris
const DEFAULT_ZOOM = 14;
const GRID_MIN_ZOOM = 9;

/** Pick geohash precision based on zoom level to keep cell count manageable */
function precisionForZoom(zoom: number): number {
  if (zoom >= 15) return 7; // ~150m × 150m
  if (zoom >= 12) return 6; // ~1.2km × 0.6km
  if (zoom >= 9) return 5;  // ~5km × 5km
  return 4;                  // ~39km × 20km
}

export default function MapScreen() {
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [gridHashes, setGridHashes] = useState<string[]>([]);
  const { squares, fetchSquaresInViewport } = useSquares();
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation([location.coords.longitude, location.coords.latitude]);
      }
      setLocationLoading(false);
    })();
  }, []);

  const handleMapIdle = useCallback(
    (state: MapState) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(() => {
        const { bounds: mapBounds, zoom } = state.properties;

        if (mapBounds && zoom >= GRID_MIN_ZOOM) {
          const ne = { lat: mapBounds.ne[1], lng: mapBounds.ne[0] };
          const sw = { lat: mapBounds.sw[1], lng: mapBounds.sw[0] };

          // Generate the full grid for the viewport — precision adapts to zoom
          const precision = precisionForZoom(zoom);
          const hashes = geohashesInBounds(sw, ne, precision);
          setGridHashes(hashes);

          // Also fetch DB squares for this viewport
          fetchSquaresInViewport({ ne, sw });
        } else {
          // Zoomed out too far — hide grid
          setGridHashes([]);
        }
      }, 300);
    },
    [fetchSquaresInViewport],
  );

  const handleSquareTap = useCallback((geohash: string, square: SquareWithImage | null) => {
    if (square) {
      router.push(`/square/${square.id}`);
    } else {
      // Libre square — navigate to upload with geohash
      router.push(`/upload?geohash=${geohash}`);
    }
  }, []);

  if (locationLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const center = userLocation ?? DEFAULT_CENTER;

  return (
    <View style={styles.container}>
      <MapboxGL.MapView
        style={styles.map}
        styleURL={MapboxGL.StyleURL.Street}
        onMapIdle={handleMapIdle}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          zoomLevel={DEFAULT_ZOOM}
          centerCoordinate={center}
        />

        {userLocation && <MapboxGL.UserLocation visible />}

        <SquareLayer
          squares={squares}
          gridHashes={gridHashes}
          onSquareTap={handleSquareTap}
        />
      </MapboxGL.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
});
