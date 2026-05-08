import { useCallback, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { Square } from "../types/square";
import { cellAt } from "../lib/kmGrid";

interface ViewportBounds {
  ne: { lat: number; lng: number };
  sw: { lat: number; lng: number };
}

/** Square with its active publication image URL */
export interface SquareWithImage extends Square {
  image_url?: string | null;
}

export function useSquares() {
  const [squares, setSquares] = useState<SquareWithImage[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSquaresInViewport = useCallback(async (bounds: ViewportBounds) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    setLoading(true);
    try {
      // 1. Fetch squares in viewport
      const { data: squaresData, error: sqErr } = await supabase
        .from("squares")
        .select("*")
        .gte("lat", bounds.sw.lat)
        .lte("lat", bounds.ne.lat)
        .gte("lng", bounds.sw.lng)
        .lte("lng", bounds.ne.lng)
        .limit(500);

      if (sqErr) throw sqErr;
      if (!squaresData || squaresData.length === 0) {
        setSquares([]);
        return;
      }

      // 2. Get publication image URLs for squares that have active publications
      const pubIds = squaresData
        .map((s) => s.current_publication_id)
        .filter(Boolean) as string[];

      const imageMap = new Map<string, string>();

      if (pubIds.length > 0) {
        const { data: pubsData } = await supabase
          .from("publications")
          .select("id, image_url")
          .in("id", pubIds);

        if (pubsData) {
          for (const pub of pubsData) {
            if (pub.image_url) {
              imageMap.set(pub.id, pub.image_url);
            }
          }
        }
      }

      // 3. Merge + compute cell_id from lat/lng to ensure consistency
      const enriched: SquareWithImage[] = squaresData.map((sq) => {
        // Always recompute cell_id from the square's coordinates
        // to ensure it matches the client-side grid
        const computedCellId = cellAt(sq.lat, sq.lng).id;
        return {
          ...sq,
          cell_id: sq.cell_id || computedCellId,
          image_url: sq.current_publication_id
            ? imageMap.get(sq.current_publication_id) ?? null
            : null,
        } as SquareWithImage;
      });

      setSquares(enriched);
    } catch {
      // Silently handle aborted requests
    } finally {
      setLoading(false);
    }
  }, []);

  return { squares, loading, fetchSquaresInViewport };
}
