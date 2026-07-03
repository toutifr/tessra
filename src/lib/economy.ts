import { supabase } from "./supabase";

// ─── Types ────────────────────────────────────────────────

export class InsufficientTesselsError extends Error {
  need: number;
  have: number;

  constructor(need: number, have: number) {
    super(`INSUFFICIENT_TESSELS: need ${need}, have ${have}`);
    this.name = "InsufficientTesselsError";
    this.need = need;
    this.have = have;
  }
}

export interface FeedItem {
  publication_id: string;
  image_url: string;
  created_at: string;
  vote_count: number;
  owner_id: string;
  username: string;
  avatar_url: string | null;
  square_id: string;
  cell_id: string;
  last_price: number;
  min_price: number;
  has_voted: boolean;
  is_shielded: boolean;
}

export type LeaderboardKind = "tiles" | "votes" | "explorer";

export interface LeaderboardRow {
  rank: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
  value: number;
}

export interface DailyQuest {
  key: string;
  label: string;
  target: number;
  reward: number;
  progress: number;
  claimed: boolean;
}

// ─── Helpers ──────────────────────────────────────────────

export async function getBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("profiles")
    .select("credits")
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return data?.credits ?? 0;
}

/**
 * Prise d'une case occupée, payée en Tessels (à distance).
 * Relance InsufficientTesselsError si le solde est insuffisant.
 */
export async function takeSquare(
  squareId: string,
  userId: string,
  imageUrl: string,
  bid?: number,
): Promise<string> {
  const { data, error } = await supabase.rpc("take_square", {
    p_square_id: squareId,
    p_user_id: userId,
    p_image_url: imageUrl,
    p_bid: bid ?? null,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("INSUFFICIENT_TESSELS")) {
      const match = msg.match(/need\s+(\d+),\s*have\s+(\d+)/i);
      const need = match ? Number(match[1]) : 0;
      const have = match ? Number(match[2]) : 0;
      throw new InsufficientTesselsError(need, have);
    }
    throw error;
  }

  return data as string;
}

export async function getFeed(userId: string, before?: string): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc("get_feed", {
    p_user_id: userId,
    p_limit: 20,
    p_before: before ?? null,
  });
  if (error) throw error;
  return (data ?? []) as FeedItem[];
}

export async function getLeaderboard(kind: LeaderboardKind): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase.rpc("get_leaderboard", {
    p_kind: kind,
    p_limit: 50,
  });
  if (error) throw error;
  return (data ?? []) as LeaderboardRow[];
}

export async function getDailyQuests(userId: string): Promise<DailyQuest[]> {
  const { data, error } = await supabase.rpc("get_daily_quests", {
    p_user_id: userId,
  });
  if (error) throw error;
  return (data ?? []) as DailyQuest[];
}

/** Réclame une quête ; retourne le nouveau solde. */
export async function claimQuest(userId: string, key: string): Promise<number> {
  const { data, error } = await supabase.rpc("claim_quest", {
    p_user_id: userId,
    p_quest_key: key,
  });
  if (error) throw error;
  return data as number;
}
