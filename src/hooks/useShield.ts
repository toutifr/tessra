import { useState } from "react";
import { supabase, getCachedUser } from "../lib/supabase";
import type { Shield } from "../types/square";

export function useShield() {
  const [activating, setActivating] = useState(false);

  const activateShield = async (
    squareId: string,
    tier: "bronze" | "silver" | "gold" = "bronze",
  ): Promise<string | null> => {
    setActivating(true);
    try {
      const {
        data: { user },
      } = await getCachedUser();
      if (!user) return null;

      const { data, error } = await supabase.rpc("activate_shield", {
        p_user_id: user.id,
        p_square_id: squareId,
        p_tier: tier,
      });

      if (error) throw error;
      return data as string;
    } catch {
      return null;
    } finally {
      setActivating(false);
    }
  };

  const getActiveShield = async (squareId: string): Promise<Shield | null> => {
    const { data } = await supabase
      .from("shields")
      .select("*")
      .eq("square_id", squareId)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .single();

    return (data as Shield) ?? null;
  };

  return { activateShield, getActiveShield, activating };
}
