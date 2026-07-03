export type SquareStatus =
  | "libre"
  | "occupe"
  | "signale"
  | "bloque";

export interface Square {
  id: string;
  lat: number;
  lng: number;
  geohash: string;
  cell_id: string;
  status: SquareStatus;
  current_publication_id: string | null;
  replacement_count: number;
  last_price: number;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

export interface Publication {
  id: string;
  user_id: string;
  square_id: string;
  image_url: string;
  status: string;
  started_at: string;
  is_paid: boolean;
  price_paid: number | null;
  replaced_by: string | null;
  vote_count: number;
  created_at: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  credits_reward: number;
}

export interface UserBadge {
  id: string;
  badge_id: string;
  name: string;
  icon: string;
  earned_at: string;
}

export interface UserStats {
  credits: number;
  total_credits_earned: number;
  streak_days: number;
  cells_explored: number;
  follower_count: number;
  following_count: number;
  active_squares: number;
  total_publications: number;
  total_replacements: number;
  total_votes_received: number;
  badges: UserBadge[];
}

export interface Shield {
  id: string;
  square_id: string;
  user_id: string;
  tier: "bronze" | "silver" | "gold";
  activated_at: string;
  expires_at: string;
}

export const STATUS_COLORS: Record<SquareStatus, string> = {
  libre: "#4CAF50",
  occupe: "#2196F3",
  signale: "#FF5722",
  bloque: "#B71C1C",
};
