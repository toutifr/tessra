// delete-account — RGPD art. 17 : effacement complet du compte.
// 1. Vérifie le JWT → identité du demandeur (on ne supprime que SON compte)
// 2. Supprime les fichiers Storage (photos publiées + avatar)
// 3. RPC gdpr_delete_user (nettoyage DB, anonymisation paiements)
// 4. auth.admin.deleteUser → cascade sur profiles
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    // ── 1. Fichiers Storage ──
    const { data: pubs } = await admin
      .from("publications")
      .select("image_url")
      .eq("user_id", user.id);

    const paths: string[] = [];
    for (const p of pubs ?? []) {
      // URL publique → chemin bucket : .../object/public/publications/<path>
      const m = (p.image_url as string).match(/\/publications\/(.+)$/);
      if (m) paths.push(m[1]);
    }
    if (paths.length > 0) {
      for (let i = 0; i < paths.length; i += 100) {
        await admin.storage.from("publications").remove(paths.slice(i, i + 100));
      }
    }
    await admin.storage.from("publications").remove([`avatars/${user.id}.jpg`]).catch(() => {});

    // ── 2. Nettoyage DB ──
    const { error: rpcError } = await admin.rpc("gdpr_delete_user", { p_user_id: user.id });
    if (rpcError) throw rpcError;

    // ── 3. Compte auth (cascade profiles) ──
    const { error: delError } = await admin.auth.admin.deleteUser(user.id);
    if (delError) throw delError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500 });
  }
});
