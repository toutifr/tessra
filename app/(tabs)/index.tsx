import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import MapboxGL from "@rnmapbox/maps";
import * as Location from "expo-location";
import { router } from "expo-router";
import { MAPBOX_ACCESS_TOKEN } from "../../src/constants/config";
import { useSquares } from "../../src/hooks/useSquares";
import SquareLayer from "../../src/components/SquareLayer";
import { Square } from "../../src/types/square";

MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);

const DEFAULT_CENTER: [number, number] = [2.3522, 48.8566]; // Paris
const DEFAULT_ZOOM = 14;

export default function MapScreen() {
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
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

  const handleRegionChange = useCallback(
    (feature: GeoJSON.Feature) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(() => {
        const props = feature.properties as {
          visibleBounds?: [[number, number], [number, number]];
          zoomLevel?: number;
        } | null;
        const bounds = props?.visibleBounds;
        const zoom = props?.zoomLevel ?? 0;

        if (bounds && zoom >= 8) {
          fetchSquaresInViewport({
            ne: { lat: bounds[0][1], lng: bounds[0][0] },
            sw: { lat: bounds[1][1], lng: bounds[1][0] },
          });
        }
      }, 300);
    },
    [fetchSquaresInViewport],
  );

  const handleSquareTap = useCallback((square: Square) => {
    router.push(`/square/${square.id}`);
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
        onRegionDidChange={handleRegionChange}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          zoomLevel={DEFAULT_ZOOM}
          centerCoordinate={center}
        />

        {userLocation && <MapboxGL.UserLocation visible />}

        <SquareLayer squares={squares} onSquareTap={handleSquareTap} />
      </MapboxGL.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
});
