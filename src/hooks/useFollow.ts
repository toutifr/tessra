import { useCallback, useState } from "react";
import { supabase } from "../lib/supabase";

export function useFollow() {
  const [loading, setLoading] = useState(false);

  const isFollowing = useCallback(async (targetUserId: string): Promise<boolean> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", user.id)
      .eq("followed_id", targetUserId)
      .maybeSingle();

    return !!data;
  }, []);

  const follow = useCallback(async (targetUserId: string): Promise<boolean> => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase.rpc("follow_user", {
        p_follower_id: user.id,
        p_followed_id: targetUserId,
      });

      return !error;
    } finally {
      setLoading(false);
    }
  }, []);

  const unfollow = useCallback(async (targetUserId: string): Promise<boolean> => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase.rpc("unfollow_user", {
        p_follower_id: user.id,
        p_followed_id: targetUserId,
      });

      return !error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { follow, unfollow, isFollowing, loading };
}
