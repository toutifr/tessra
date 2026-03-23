export type SquareStatus =
  | "libre"
  | "occupe_gratuit"
  | "occupe_payant"
  | "en_expiration"
  | "remplacable"
  | "signale"
  | "en_moderation"
  | "bloque";

export interface Square {
  id: string;
  lat: number;
  lng: number;
  geohash: string;
  status: SquareStatus;
  current_publication_id: string | null;
  demand_score: number;
  base_price: number;
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
  expires_at: string;
  is_paid: boolean;
  price_paid: number | null;
  replaced_by: string | null;
  created_at: string;
}

export const STATUS_COLORS: Record<SquareStatus, string> = {
  libre: "#4CAF50",
  occupe_gratuit: "#2196F3",
  occupe_payant: "#FFD700",
  en_expiration: "#FF9800",
  remplacable: "#9E9E9E",
  signale: "#FF5722",
  en_moderation: "#FF5722",
  bloque: "#B71C1C",
};
