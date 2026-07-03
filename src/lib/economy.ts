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

export interface GameState {
  rush_active: boolean;
  rush_ends_at: string | null;
  next_rush_at: string;
}

export interface TeamRow {
  id: string;
  name: string;
  emoji: string;
  color: string;
  member_count: number;
}

export interface TeamChallengeTeam {
  rank: number;
  team_id: string;
  name: string;
  emoji: string;
  member_count: number;
  score: number;
}

export interface TeamChallenge {
  kind: 0 | 1 | 2;
  label: string;
  week_start: string;
  ends_at: string;
  top: TeamChallengeTeam[];
  my_team: {
    team_id: string;
    name: string;
    emoji: string;
    member_count: number;
    score: number;
    rank: number;
  } | null;
}

// ─── Helpers ──────────────────────────────────────────────

export async function getGameState(): Promise<GameState> {
  const { data, error } = await supabase.rpc("get_game_state");
  if (error) throw error;
  return data as GameState;
}

export async function createTeam(
  userId: string,
  name: string,
  emoji: string,
  color = "#FF6B6B",
): Promise<string> {
  const { data, error } = await supabase.rpc("create_team", {
    p_user_id: userId,
    p_name: name,
    p_emoji: emoji,
    p_color: color,
  });
  if (error) throw error;
  return data as string;
}

export async function joinTeam(userId: string, teamId: string): Promise<void> {
  const { error } = await supabase.rpc("join_team", {
    p_user_id: userId,
    p_team_id: teamId,
  });
  if (error) throw error;
}

export async function leaveTeam(userId: string): Promise<void> {
  const { error } = await supabase.rpc("leave_team", { p_user_id: userId });
  if (error) throw error;
}

export async function getTeamChallenge(userId: string): Promise<TeamChallenge> {
  const { data, error } = await supabase.rpc("get_team_challenge", {
    p_user_id: userId,
  });
  if (error) throw error;
  return data as TeamChallenge;
}

export async function listTeams(limit = 50): Promise<TeamRow[]> {
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, emoji, color, member_count")
    .order("member_count", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as TeamRow[];
}

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

export async function fortifySquare(
  squareId: string,
  userId: string,
  amount: number,
): Promise<number> {
  const { data, error } = await supabase.rpc("fortify_square", {
    p_user_id: userId,
    p_square_id: squareId,
    p_amount: amount,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("INSUFFICIENT_TESSELS")) {
      const match = msg.match(/need\s+(\d+),\s*have\s+(\d+)/i);
      throw new InsufficientTesselsError(
        match ? Number(match[1]) : 0,
        match ? Number(match[2]) : 0,
      );
    }
    throw error;
  }

  return data as number;
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
