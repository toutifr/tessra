import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import MapboxGL from "@rnmapbox/maps";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router } from "expo-router";
import { MAPBOX_ACCESS_TOKEN } from "../../src/constants/config";
import { cellAt, cellFromId } from "../../src/lib/kmGrid";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import GridLayer from "../../src/components/GridLayer";
import TileLayer from "../../src/components/TileLayer";
import RushBanner from "../../src/components/RushBanner";
import { useSquares, SquareWithImage } from "../../src/hooks/useSquares";
import { onOptimisticUpload, type OptimisticUpload } from "../../src/lib/tileEvents";
import { useAuth } from "../../src/providers/AuthProvider";
import { getPlayfulMapStyle } from "../../src/lib/mapStyle";
import * as Haptics from "expo-haptics";

MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);

const DEFAULT_CENTER: [number, number] = [2.3522, 48.8566]; // Paris
const DEFAULT_ZOOM = 14;
const HOT_WINDOW_MS = 24 * 60 * 60 * 1000;

function cellPolygonFeature(cellId: string): GeoJSON.Feature | null {
  const cell = cellFromId(cellId);
  if (!cell) return null;
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [[
        [cell.sw.lng, cell.sw.lat],
        [cell.ne.lng, cell.sw.lat],
        [cell.ne.lng, cell.ne.lat],
        [cell.sw.lng, cell.ne.lat],
        [cell.sw.lng, cell.sw.lat],
      ]],
    },
  };
}

function cellsToFeatureCollection(squares: SquareWithImage[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: squares
      .map((sq) => (sq.cell_id ? cellPolygonFeature(sq.cell_id) : null))
      .filter(Boolean) as GeoJSON.Feature[],
  };
}

export default function MapScreen() {
  const { session } = useAuth();
  const meId = session?.user.id ?? null;
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);
  const [viewportBounds, setViewportBounds] = useState<{
    sw: { lat: number; lng: number };
    ne: { lat: number; lng: number };
  } | null>(null);
  const [optimisticUpload, setOptimisticUpload] = useState<OptimisticUpload | null>(null);
  const [styleJSON, setStyleJSON] = useState<string | null>(null);
  const { squares, fetchSquaresInViewport } = useSquares();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const mapViewRef = useRef<MapboxGL.MapView>(null);
  const squaresRef = useRef<SquareWithImage[]>([]);

  squaresRef.current = squares;

  // GPS en arrière-plan : la carte s'affiche immédiatement, on recentre après.
  // watchPosition pour que le point bleu suive les déplacements.
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation([location.coords.longitude, location.coords.latitude]);
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 20 },
          (loc) => setUserLocation([loc.coords.longitude, loc.coords.latitude]),
        );
      }
    })();
    return () => sub?.remove();
  }, []);

  // Recentre la caméra dès que la position arrive
  useEffect(() => {
    if (userLocation) {
      cameraRef.current?.setCamera({
        centerCoordinate: userLocation,
        zoomLevel: DEFAULT_ZOOM,
        animationDuration: 800,
      });
    }
  }, [userLocation]);

  // Style "monde ludique" (sans toponymes)
  useEffect(() => {
    let mounted = true;
    getPlayfulMapStyle().then((json) => {
      if (mounted && json) setStyleJSON(json);
    });
    return () => {
      mounted = false;
    };
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

  // Mes cases actives → outline doré
  const mySquaresGeoJSON = useMemo(() => {
    if (!meId) return cellsToFeatureCollection([]);
    return cellsToFeatureCollection(
      squares.filter((sq) => sq.status === "occupe" && sq.owner_id === meId),
    );
  }, [squares, meId]);

  // Cases chaudes (activité < 24 h, pas à moi) → outline orange subtil
  const hotSquaresGeoJSON = useMemo(() => {
    const cutoff = Date.now() - HOT_WINDOW_MS;
    return cellsToFeatureCollection(
      squares.filter(
        (sq) =>
          sq.status === "occupe" &&
          sq.owner_id !== meId &&
          !!sq.last_activity_at &&
          new Date(sq.last_activity_at).getTime() > cutoff,
      ),
    );
  }, [squares, meId]);

  const center = userLocation ?? DEFAULT_CENTER;

  return (
    <View style={styles.container}>
      <MapboxGL.MapView
        ref={mapViewRef}
        style={styles.map}
        styleURL={styleJSON ? undefined : MapboxGL.StyleURL.Dark}
        styleJSON={styleJSON ?? undefined}
        projection="globe"
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        onCameraChanged={handleCameraChanged}
        onMapIdle={handleMapIdle}
        onPress={handleMapPress}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          zoomLevel={DEFAULT_ZOOM}
          centerCoordinate={center}
        />

        {/* Photos rendues dans les tuiles — visibles à TOUS les zooms */}
        <TileLayer />

        {/* Grille tracée directement sur la carte — pas de réseau */}
        <GridLayer bounds={viewportBounds} zoom={currentZoom} />

        {/* Cases chaudes — outline orange subtil */}
        <MapboxGL.ShapeSource id="hot-squares" shape={hotSquaresGeoJSON}>
          <MapboxGL.LineLayer
            id="hot-squares-outline"
            style={{ lineColor: "#FF6B35", lineWidth: 1.5, lineOpacity: 0.55 }}
          />
        </MapboxGL.ShapeSource>

        {/* Mes cases — outline doré */}
        <MapboxGL.ShapeSource id="my-squares" shape={mySquaresGeoJSON}>
          <MapboxGL.LineLayer
            id="my-squares-outline"
            style={{ lineColor: "#FFD700", lineWidth: 2 }}
          />
        </MapboxGL.ShapeSource>

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

        {/* Point bleu de position — renderMode "native" : le puck est dessiné par le
            composant de localisation natif, TOUJOURS au-dessus de toutes les couches
            (tuiles photos, grille, outlines), contrairement au mode JS dont les
            CircleLayers peuvent être recouverts par les layers insérés après coup. */}
        {/* Point bleu de position : MarkerView = vraie vue RN ancrée à la coordonnée,
            rendue AU-DESSUS de toutes les couches Mapbox (tuiles photos, grille,
            outlines) par construction — contrairement à UserLocation dont les
            layers peuvent être recouverts par les sources insérées après coup. */}
        {userLocation && (
          <MapboxGL.MarkerView coordinate={userLocation} allowOverlap>
            <View style={styles.userDotHalo}>
              <View style={styles.userDot} />
            </View>
          </MapboxGL.MarkerView>
        )}
      </MapboxGL.MapView>

      {/* Bannière Rush Hour — overlay sous la safe area */}
      <View style={[styles.rushOverlay, { top: insets.top + 8 }]} pointerEvents="none">
        <RushBanner />
      </View>

      {/* FAB : recentrer sur ma position */}
      {userLocation && (
        <Pressable
          style={({ pressed }) => [
            styles.locateFab,
            { bottom: insets.bottom + 24, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => {
            cameraRef.current?.setCamera({
              centerCoordinate: userLocation,
              zoomLevel: DEFAULT_ZOOM,
              animationDuration: 600,
            });
          }}
          accessibilityLabel="Center on my position"
        >
          <Ionicons name="locate" size={22} color="#FFFFFF" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  userDotHalo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(10, 132, 255, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  userDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#0A84FF",
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  container: { flex: 1 },
  map: { flex: 1 },
  rushOverlay: { position: "absolute", left: 12, right: 12 },
  locateFab: {
    position: "absolute",
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(28, 28, 30, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
});
