import { supabase } from "./supabase";

interface PriceInfo {
  square_id: string;
  base_price: number;
  demand_multiplier: number;
  price: number;
  recent_actions: number;
  is_high_demand: boolean;
}

export async function getSquarePrice(squareId: string): Promise<PriceInfo> {
  const { data, error } = await supabase.functions.invoke("calculate-price", {
    body: { square_id: squareId },
  });

  if (error) throw error;
  return data as PriceInfo;
}

export async function trackDemand(
  squareId: string,
  actionType: "view" | "takeover_attempt" | "flag",
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("square_demand").insert({
    square_id: squareId,
    action_type: actionType,
    user_id: user?.id,
  });
}
