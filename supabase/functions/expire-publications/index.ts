import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Find expired publications
  const { data: expired, error: fetchError } = await supabase
    .from("publications")
    .select("id, user_id, square_id, image_url, started_at")
    .eq("status", "active")
    .lte("expires_at", new Date().toISOString());

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
  }

  if (!expired || expired.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
  }

  let processed = 0;

  for (const pub of expired) {
    // Update publication status
    await supabase.from("publications").update({ status: "expired" }).eq("id", pub.id);

    // Update square status
    await supabase
      .from("squares")
      .update({ status: "remplacable", current_publication_id: null, updated_at: new Date().toISOString() })
      .eq("current_publication_id", pub.id);

    // Insert history record
    await supabase.from("publication_history").insert({
      publication_id: pub.id,
      user_id: pub.user_id,
      square_id: pub.square_id,
      image_url: pub.image_url,
      started_at: pub.started_at,
      ended_at: new Date().toISOString(),
      status: "expired",
      acquisition_mode: "free",
      end_reason: "natural_expiration",
    });

    processed++;
  }

  return new Response(JSON.stringify({ processed }), { status: 200 });
});
