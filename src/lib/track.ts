import { supabase, getCachedUser } from "./supabase";

/**
 * Analytics fire-and-forget : insert dans public.events.
 * Silencieux en cas d'échec (jamais bloquant pour l'UX).
 */
export function track(name: string, props?: object): void {
  (async () => {
    try {
      const {
        data: { user },
      } = await getCachedUser();
      if (!user) return;
      await supabase.from("events").insert({
        user_id: user.id,
        name,
        props: props ?? {},
      });
    } catch {
      // silencieux
    }
  })();
}
