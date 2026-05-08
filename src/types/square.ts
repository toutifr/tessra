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
  created_at: string;
}

export const STATUS_COLORS: Record<SquareStatus, string> = {
  libre: "#4CAF50",
  occupe: "#2196F3",
  signale: "#FF5722",
  bloque: "#B71C1C",
};
