/**
 * Tiny event bus to focus the map camera from anywhere in the app.
 * Tabs stay mounted (lazy:false) — the map subscribes once on mount;
 * a pending target covers the cold-start case (focus set before subscribe).
 */

export interface MapFocusTarget {
  lat: number;
  lng: number;
  zoom?: number;
}

type Listener = (target: MapFocusTarget) => void;

const listeners = new Set<Listener>();
let pending: MapFocusTarget | null = null;

/** Store the target and notify subscribers (map screen). */
export function focusOnMap(target: MapFocusTarget): void {
  if (listeners.size > 0) {
    listeners.forEach((l) => l(target));
  } else {
    pending = target;
  }
}

/** Subscribe to focus events; returns unsubscribe. */
export function subscribeMapFocus(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Pick up (and clear) a focus set before the map subscribed. */
export function consumePendingFocus(): MapFocusTarget | null {
  const t = pending;
  pending = null;
  return t;
}
