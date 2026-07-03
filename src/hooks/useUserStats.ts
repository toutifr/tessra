import { supabase } from "../lib/supabase";
import { useSWR } from "../lib/swr";
import { useAuth } from "../providers/AuthProvider";
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

export async function fetchUserStats(userId: string): Promise<UserStats> {
  const { data, error } = await supabase.rpc("get_user_stats", {
    p_user_id: userId,
  });
  if (error || !data) throw error ?? new Error("stats indisponibles");
  return data as UserStats;
}

export function useUserStats() {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const { data, loading, refresh } = useSWR<UserStats>(
    uid ? `stats:${uid}` : null,
    () => fetchUserStats(uid!),
    30000,
  );
  return { stats: data ?? DEFAULT_STATS, loading, refetch: refresh };
}
