import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
import { getDailyTargets, DailyTarget } from "../../src/lib/economy";
import { useSWR } from "../../src/lib/swr";
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

const TARGET_META: Record<DailyTarget["kind"], { icon: string; color: string }> = {
  scout: { icon: "📸", color: "#34C759" },
  revive: { icon: "🔥", color: "#FFB300" },
  raid: { icon: "⚔️", color: "#FF3B30" },
};

function targetLabel(t: DailyTarget): string {
  switch (t.kind) {
    case "scout":
      return `Scout: virgin tile +${t.reward} ⬡`;
    case "revive":
      return `Revive your tile +${t.reward} ⬡`;
    case "raid":
      return "Raid: -30% on site";
  }
}

function distanceKm(from: [number, number], lat: number, lng: number): number {
  const R = 6371;
  const dLat = ((lat - from[1]) * Math.PI) / 180;
  const dLng = ((lng - from[0]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((from[1] * Math.PI) / 180) *
      Math.cos((lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
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

  // Daily targets — chargés une fois la position connue (stables sur la journée)
  const [targetsCollapsed, setTargetsCollapsed] = useState(false);
  const { data: targets } = useSWR<DailyTarget[]>(
    meId && userLocation ? `targets:${meId}` : null,
    () => getDailyTargets(meId!, userLocation![1], userLocation![0]),
    5 * 60_000,
  );

  const flyToTarget = useCallback((t: DailyTarget) => {
    cameraRef.current?.setCamera({
      centerCoordinate: [t.lng, t.lat],
      zoomLevel: 14,
      animationDuration: 800,
    });
  }, []);

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

  // Mes cases actives → outline doré. Clusters 4-adjacents de ≥3 cases →
  // "territoire" fusionné : fill doré + outline épais.
  const { myNormalGeoJSON, myTerritoryGeoJSON } = useMemo(() => {
    const empty = cellsToFeatureCollection([]);
    if (!meId) return { myNormalGeoJSON: empty, myTerritoryGeoJSON: empty };
    const mine = squares.filter(
      (sq) => sq.status === "occupe" && sq.owner_id === meId && sq.cell_id,
    );
    const rc = new Map<string, [number, number]>();
    const posIndex = new Map<string, string>(); // "r,c" -> cell_id
    for (const sq of mine) {
      const m = sq.cell_id!.match(/^r(-?\d+)c(-?\d+)$/);
      if (!m) continue;
      const pos: [number, number] = [Number(m[1]), Number(m[2])];
      rc.set(sq.cell_id!, pos);
      posIndex.set(`${pos[0]},${pos[1]}`, sq.cell_id!);
    }
    const seen = new Set<string>();
    const territoryIds = new Set<string>();
    for (const id of rc.keys()) {
      if (seen.has(id)) continue;
      const cluster: string[] = [];
      const stack = [id];
      seen.add(id);
      while (stack.length) {
        const cur = stack.pop()!;
        cluster.push(cur);
        const [r, col] = rc.get(cur)!;
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nb = posIndex.get(`${r + dr},${col + dc}`);
          if (nb && !seen.has(nb)) {
            seen.add(nb);
            stack.push(nb);
          }
        }
      }
      if (cluster.length >= 3) cluster.forEach((cid) => territoryIds.add(cid));
    }
    return {
      myNormalGeoJSON: cellsToFeatureCollection(
        mine.filter((sq) => !territoryIds.has(sq.cell_id!)),
      ),
      myTerritoryGeoJSON: cellsToFeatureCollection(
        mine.filter((sq) => territoryIds.has(sq.cell_id!)),
      ),
    };
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

        {/* Mes cases isolées — outline doré */}
        <MapboxGL.ShapeSource id="my-squares" shape={myNormalGeoJSON}>
          <MapboxGL.LineLayer
            id="my-squares-outline"
            style={{ lineColor: "#FFD700", lineWidth: 2 }}
          />
        </MapboxGL.ShapeSource>

        {/* Mes territoires (clusters ≥3) — fusion visuelle dorée */}
        <MapboxGL.ShapeSource id="my-territories" shape={myTerritoryGeoJSON}>
          <MapboxGL.FillLayer
            id="my-territories-fill"
            style={{ fillColor: "#FFD700", fillOpacity: 0.12 }}
          />
          <MapboxGL.LineLayer
            id="my-territories-outline"
            style={{ lineColor: "#FFD700", lineWidth: 3 }}
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

        {/* Objectifs du jour — 3 marqueurs */}
        {targets?.map((t) => (
          <MapboxGL.MarkerView
            key={`target-${t.kind}-${t.cell_id}`}
            coordinate={[t.lng, t.lat]}
            allowOverlap
          >
            <View
              style={[
                styles.targetDot,
                { backgroundColor: TARGET_META[t.kind].color, opacity: t.done ? 0.5 : 1 },
              ]}
            >
              <Text style={styles.targetDotIcon}>
                {t.done ? "✓" : TARGET_META[t.kind].icon}
              </Text>
            </View>
          </MapboxGL.MarkerView>
        ))}
      </MapboxGL.MapView>

      {/* Bannière Rush / Pulse — overlay sous la safe area */}
      <View style={[styles.rushOverlay, { top: insets.top + 8 }]} pointerEvents="none">
        <RushBanner coords={userLocation ?? undefined} />
      </View>

      {/* Objectifs du jour — carte compacte en bas à gauche */}
      {targets && targets.length > 0 && (
        <View style={[styles.targetsWrap, { bottom: insets.bottom + 24 }]}>
          {targetsCollapsed ? (
            <Pressable
              style={({ pressed }) => [styles.targetsChip, { opacity: pressed ? 0.8 : 1 }]}
              onPress={() => setTargetsCollapsed(false)}
              accessibilityLabel="Show today's targets"
            >
              <Text style={styles.targetsChipText}>
                🎯 {targets.filter((t) => t.done).length}/{targets.length}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.targetsCard}>
              <Pressable style={styles.targetsHeader} onPress={() => setTargetsCollapsed(true)}>
                <Text style={styles.targetsTitle}>Today's targets</Text>
                <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.55)" />
              </Pressable>
              {targets.map((t) => (
                <Pressable
                  key={`row-${t.kind}-${t.cell_id}`}
                  style={({ pressed }) => [styles.targetRow, { opacity: pressed ? 0.7 : 1 }]}
                  onPress={() => flyToTarget(t)}
                >
                  <Text style={styles.targetRowIcon}>{TARGET_META[t.kind].icon}</Text>
                  <Text
                    style={[styles.targetRowLabel, t.done && styles.targetRowDone]}
                    numberOfLines={1}
                  >
                    {targetLabel(t)}
                  </Text>
                  <Text style={styles.targetRowDist}>
                    {t.done
                      ? "✓"
                      : userLocation
                        ? `${distanceKm(userLocation, t.lat, t.lng).toFixed(1)} km`
                        : ""}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

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

  targetDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  targetDotIcon: { fontSize: 14, color: "#FFFFFF" },

  targetsWrap: { position: "absolute", left: 12 },
  targetsChip: {
    backgroundColor: "rgba(28, 28, 30, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  targetsChipText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  targetsCard: {
    backgroundColor: "rgba(28, 28, 30, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 14,
    padding: 10,
    width: 232,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  targetsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  targetsTitle: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  targetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    gap: 6,
  },
  targetRowIcon: { fontSize: 13 },
  targetRowLabel: { flex: 1, color: "rgba(255,255,255,0.9)", fontSize: 12 },
  targetRowDone: { opacity: 0.5, textDecorationLine: "line-through" },
  targetRowDist: { color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: "600" },
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
