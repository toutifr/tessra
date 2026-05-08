import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import MapboxGL from "@rnmapbox/maps";
import * as Location from "expo-location";
import { router } from "expo-router";
import { MAPBOX_ACCESS_TOKEN } from "../../src/constants/config";
import { cellAt, cellFromId } from "../../src/lib/kmGrid";
import GridLayer from "../../src/components/GridLayer";
import TileLayer from "../../src/components/TileLayer";
import { useSquares, SquareWithImage } from "../../src/hooks/useSquares";
import { onOptimisticUpload, type OptimisticUpload } from "../../src/lib/tileEvents";
import * as Haptics from "expo-haptics";

MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);

const DEFAULT_CENTER: [number, number] = [2.3522, 48.8566]; // Paris
const DEFAULT_ZOOM = 14;

export default function MapScreen() {
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);
  const [viewportBounds, setViewportBounds] = useState<{
    sw: { lat: number; lng: number };
    ne: { lat: number; lng: number };
  } | null>(null);
  const [optimisticUpload, setOptimisticUpload] = useState<OptimisticUpload | null>(null);
  const { squares, fetchSquaresInViewport } = useSquares();
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const mapViewRef = useRef<MapboxGL.MapView>(null);
  const squaresRef = useRef<SquareWithImage[]>([]);

  squaresRef.current = squares;

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

  useEffect(() => {
    return onOptimisticUpload((event) => {
      setOptimisticUpload(event);
      setTimeout(() => setOptimisticUpload(null), 10_000);
    });
  }, []);

  // Real-time grid updates during pan/zoom (lightweight, cached in GridLayer)
  const handleCameraChanged = useCallback(
    (state: MapboxGL.MapState) => {
      const { bounds: mapBounds, zoom } = state.properties;
      setCurrentZoom(zoom);

      if (mapBounds) {
        const ne = { lat: mapBounds.ne[1], lng: mapBounds.ne[0] };
        const sw = { lat: mapBounds.sw[1], lng: mapBounds.sw[0] };
        setViewportBounds({ sw, ne });
      }
    },
    [],
  );

  // Heavy data fetching only after map stops moving
  const handleMapIdle = useCallback(
    (state: MapboxGL.MapState) => {
      const { bounds: mapBounds, zoom } = state.properties;
      if (mapBounds && zoom >= 9) {
        const ne = { lat: mapBounds.ne[1], lng: mapBounds.ne[0] };
        const sw = { lat: mapBounds.sw[1], lng: mapBounds.sw[0] };
        const latPad = (ne.lat - sw.lat) * 0.5;
        const lngPad = (ne.lng - sw.lng) * 0.5;
        fetchSquaresInViewport({
          ne: { lat: ne.lat + latPad, lng: ne.lng + lngPad },
          sw: { lat: sw.lat - latPad, lng: sw.lng - lngPad },
        });
      }
    },
    [fetchSquaresInViewport],
  );

  const handleMapPress = useCallback(
    (event: GeoJSON.Feature) => {
      if (currentZoom < 12) return;
      const coords = (event.geometry as GeoJSON.Point).coordinates;
      const [lng, lat] = coords;
      const cell = cellAt(lat, lng);

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const square = squaresRef.current.find((sq) => sq.cell_id === cell.id);
      if (square) {
        router.push(`/square/${square.id}`);
      } else {
        router.push(`/upload?cellId=${cell.id}`);
      }
    },
    [currentZoom],
  );

  // Photos to overlay
  const photosToShow = useMemo(() => {
    if (currentZoom < 9) return [];
    return squares.filter((sq) => sq.image_url && sq.cell_id);
  }, [squares, currentZoom]);

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
        ref={mapViewRef}
        style={styles.map}
        styleURL={MapboxGL.StyleURL.Dark}
        projection="globe"
        onCameraChanged={handleCameraChanged}
        onMapIdle={handleMapIdle}
        onPress={handleMapPress}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          zoomLevel={DEFAULT_ZOOM}
          centerCoordinate={center}
        />

        {userLocation && <MapboxGL.UserLocation visible />}

        {/* Photos rendues dans les tuiles — visibles à TOUS les zooms */}
        <TileLayer />

        {/* Grille tracée directement sur la carte — pas de réseau */}
        <GridLayer bounds={viewportBounds} zoom={currentZoom} />

        {/* Photos côté client en plus (chargement rapide en zoom proche) */}
        {photosToShow.map((sq) => {
          const cell = cellFromId(sq.cell_id!);
          if (!cell || !sq.image_url) return null;
          return (
            <MapboxGL.ImageSource
              key={`photo-${sq.id}`}
              id={`photo-${sq.id}`}
              coordinates={[
                [cell.sw.lng, cell.ne.lat],
                [cell.ne.lng, cell.ne.lat],
                [cell.ne.lng, cell.sw.lat],
                [cell.sw.lng, cell.sw.lat],
              ]}
              url={sq.image_url}
            >
              <MapboxGL.RasterLayer
                id={`photo-layer-${sq.id}`}
                style={{ rasterOpacity: 1 }}
              />
            </MapboxGL.ImageSource>
          );
        })}

        {/* Optimistic overlay */}
        {optimisticUpload && (() => {
          const cell = cellFromId(optimisticUpload.cellId);
          if (!cell) return null;
          return (
            <MapboxGL.ImageSource
              id="optimistic-upload"
              coordinates={[
                [cell.sw.lng, cell.ne.lat],
                [cell.ne.lng, cell.ne.lat],
                [cell.ne.lng, cell.sw.lat],
                [cell.sw.lng, cell.sw.lat],
              ]}
              url={optimisticUpload.imageUri}
            >
              <MapboxGL.RasterLayer
                id="optimistic-upload-layer"
                style={{ rasterOpacity: 1 }}
              />
            </MapboxGL.ImageSource>
          );
        })()}
      </MapboxGL.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
});
