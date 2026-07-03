import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { UserStats } from "../types/square";

const DEFAULT_STATS: UserStats = {
  credits: 0,
  total_credits_earned: 0,
  streak_days: 0,
  cells_explored: 0,
  follower_count: 0,
  following_count: 0,
  active_squares: 0,
  total_publications: 0,
  total_replacements: 0,
  total_votes_received: 0,
  badges: [],
};

export function useUserStats() {
  const [stats, setStats] = useState<UserStats>(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.rpc("get_user_stats", {
        p_user_id: user.id,
      });

      if (!error && data) {
        setStats(data as UserStats);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}
