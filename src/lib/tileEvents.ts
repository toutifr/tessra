/**
 * Simple event emitter for optimistic tile updates.
 *
 * After an upload, the upload screen emits an event with the local photo URI
 * and cell coordinates. The map screen listens and overlays the photo
 * immediately, before the tile worker has regenerated the tile.
 */

type Listener = (event: OptimisticUpload) => void;

export interface OptimisticUpload {
  cellId: string;
  imageUri: string;
  lat: number;
  lng: number;
}

const listeners = new Set<Listener>();

export function onOptimisticUpload(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitOptimisticUpload(event: OptimisticUpload): void {
  for (const listener of listeners) {
    listener(event);
  }
}
