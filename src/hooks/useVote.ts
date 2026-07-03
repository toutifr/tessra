import { useState } from "react";
import { supabase, getCachedUser } from "../lib/supabase";

export function useVote() {
  const [voting, setVoting] = useState(false);

  const vote = async (publicationId: string): Promise<boolean> => {
    setVoting(true);
    try {
      const {
        data: { user },
      } = await getCachedUser();
      if (!user) return false;

      const { error } = await supabase.rpc("vote_publication", {
        p_user_id: user.id,
        p_publication_id: publicationId,
      });

      if (error) {
        // Unique constraint = already voted
        if (error.message?.includes("unique") || error.message?.includes("duplicate")) {
          return false;
        }
        throw error;
      }

      return true;
    } catch {
      return false;
    } finally {
      setVoting(false);
    }
  };

  return { vote, voting };
}
