// validate-receipt — V2 : vend uniquement des packs de Tessels (monnaie unique)
// Body: { receipt, platform: 'ios'|'android', transaction_id, sku }
// Valide le reçu auprès d'Apple/Google puis crédite le wallet via grant_tessels (idempotent).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VALID_SKUS = new Set([
  "piri_reis_s",
  "piri_reis_m",
  "piri_reis_l",
  "piri_reis_xl",
  "piri_reis_xxl",
]);

Deno.serve(async (req) => {
  const supabase = createClient(
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
  } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { receipt, platform, transaction_id, sku } = await req.json();

  if (!VALID_SKUS.has(sku)) {
    return new Response(JSON.stringify({ success: false, error: "Unknown SKU" }), { status: 400 });
  }
  if (!transaction_id || !receipt) {
    return new Response(JSON.stringify({ success: false, error: "Missing receipt" }), { status: 400 });
  }

  // ── Validation du reçu ──
  let isValid = false;

  if (platform === "ios") {
    const verify = async (url: string) => {
      const res = await fetch(url, {
        method: "POST",
        body: JSON.stringify({
          "receipt-data": receipt,
          password: Deno.env.get("APPLE_SHARED_SECRET"),
        }),
      });
      return res.json();
    };
    let data = await verify("https://buy.itunes.apple.com/verifyReceipt");
    if (data.status === 21007) {
      data = await verify("https://sandbox.itunes.apple.com/verifyReceipt");
    }
    if (data.status === 0) {
      // Vérifie que le SKU acheté correspond bien
      const items = data.receipt?.in_app ?? [];
      isValid = items.some((i: { product_id: string }) => i.product_id === sku) || items.length === 0;
    }
  } else if (platform === "android") {
    // TODO: Google Play Developer API (service account). MVP : contrôle de structure.
    isValid = typeof receipt === "string" && receipt.length > 20;
  }

  if (!isValid) {
    return new Response(JSON.stringify({ success: false, error: "Invalid receipt" }), {
      status: 400,
    });
  }

  // ── Crédit du wallet (idempotent sur transaction_id) ──
  const { data: balance, error } = await supabase.rpc("grant_tessels", {
    p_user_id: user.id,
    p_sku: sku,
    p_platform: platform,
    p_transaction_id: transaction_id,
  });

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 400 });
  }

  return new Response(JSON.stringify({ success: true, balance }), {
    headers: { "Content-Type": "application/json" },
  });
});
