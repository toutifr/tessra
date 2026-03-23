import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const { square_id } = await req.json();

  if (!square_id) {
    return new Response(JSON.stringify({ error: "square_id required" }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Get square base price
  const { data: square, error: sqError } = await supabase
    .from("squares")
    .select("base_price")
    .eq("id", square_id)
    .single();

  if (sqError || !square) {
    return new Response(JSON.stringify({ error: "Square not found" }), { status: 404 });
  }

  // Count recent demand actions (last 24h)
  const { count, error: demandError } = await supabase
    .from("square_demand")
    .select("*", { count: "exact", head: true })
    .eq("square_id", square_id)
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (demandError) {
    return new Response(JSON.stringify({ error: demandError.message }), { status: 500 });
  }

  const recentActions = count ?? 0;
  const demandMultiplier = Math.min(recentActions / 10.0, 2.0);
  const price = Number(square.base_price) * (1 + demandMultiplier);
  const isHighDemand = demandMultiplier > 0;

  return new Response(
    JSON.stringify({
      square_id,
      base_price: Number(square.base_price),
      demand_multiplier: demandMultiplier,
      price: Math.round(price * 100) / 100,
      recent_actions: recentActions,
      is_high_demand: isHighDemand,
    }),
    { status: 200 },
  );
});
