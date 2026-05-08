export interface Env {
  TILES_BUCKET: R2Bucket;
  WEBHOOK_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
}

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

export interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: {
    id: string;
    square_id: string;
    image_url: string;
    status: string;
  } | null;
  old_record: {
    id: string;
    square_id: string;
    image_url: string;
    status: string;
  } | null;
}
