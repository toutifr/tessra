/**
 * Mini stale-while-revalidate maison — zéro dépendance.
 * - Le cache mémoire est servi immédiatement (même périmé) ;
 * - refetch silencieux en fond si périmé ;
 * - `mutate` pour les mises à jour optimistes, `prefetch` pour le préchauffage.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface Entry {
  data: unknown;
  at: number;
}

const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const inflight = new Map<string, Promise<unknown>>();

function notify(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

/** Écrit dans le cache et notifie tous les hooks abonnés (maj optimiste). */
export function mutate<T>(key: string, data: T): void {
  cache.set(key, { data, at: Date.now() });
  notify(key);
}

/** Invalide une clé (le prochain useSWR refetch). */
export function invalidate(key: string): void {
  const e = cache.get(key);
  if (e) cache.set(key, { ...e, at: 0 });
}

/** Lecture synchrone du cache. */
export function getCached<T>(key: string): T | undefined {
  return cache.get(key)?.data as T | undefined;
}

/** Précharge une clé si absente ou périmée (fire-and-forget safe). */
export async function prefetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 30000,
): Promise<T | undefined> {
  const e = cache.get(key);
  if (e && Date.now() - e.at < ttlMs) return e.data as T;
  const pending = inflight.get(key);
  if (pending) return pending.then((d) => d as T).catch(() => undefined);
  const p = fetcher();
  inflight.set(key, p);
  try {
    const data = await p;
    mutate(key, data);
    return data;
  } catch {
    return undefined;
  } finally {
    inflight.delete(key);
  }
}

export function useSWR<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  ttlMs = 30000,
): { data: T | undefined; loading: boolean; refresh: () => Promise<void> } {
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(() => !!key && !cache.has(key));
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    if (!key) return;
    if (!cache.has(key)) setLoading(true);
    try {
      const pending =
        (inflight.get(key) as Promise<T> | undefined) ?? fetcherRef.current();
      inflight.set(key, pending);
      const data = await pending;
      mutate(key, data);
    } catch {
      // silencieux — on garde le cache existant
    } finally {
      inflight.delete(key);
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    if (!key) return;
    let set = listeners.get(key);
    if (!set) {
      set = new Set();
      listeners.set(key, set);
    }
    const l = () => setTick((t) => t + 1);
    set.add(l);

    const e = cache.get(key);
    if (!e || Date.now() - e.at > ttlMs) {
      refresh(); // cache absent → loading ; périmé → refetch silencieux
    } else {
      setLoading(false);
    }
    return () => {
      set!.delete(l);
    };
  }, [key, ttlMs, refresh]);

  const data = key ? (cache.get(key)?.data as T | undefined) : undefined;
  return { data, loading: loading && data === undefined, refresh };
}
