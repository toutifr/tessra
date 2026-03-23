import { useCallback, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { Square } from "../types/square";

interface ViewportBounds {
  ne: { lat: number; lng: number };
  sw: { lat: number; lng: number };
}

export function useSquares() {
  const [squares, setSquares] = useState<Square[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSquaresInViewport = useCallback(async (bounds: ViewportBounds) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("squares")
        .select("*")
        .gte("lat", bounds.sw.lat)
        .lte("lat", bounds.ne.lat)
        .gte("lng", bounds.sw.lng)
        .lte("lng", bounds.ne.lng)
        .limit(500);

      if (error) throw error;
      setSquares((data as Square[]) ?? []);
    } catch {
      // Silently handle aborted requests
    } finally {
      setLoading(false);
    }
  }, []);

  return { squares, loading, fetchSquaresInViewport };
}
