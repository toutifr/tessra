import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  // Get user from JWT
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { receipt, platform, transaction_id, action } = await req.json();

  // Validate receipt with platform
  let isValid = false;

  if (platform === "ios") {
    const appleResponse = await fetch("https://buy.itunes.apple.com/verifyReceipt", {
      method: "POST",
      body: JSON.stringify({
        "receipt-data": receipt,
        password: Deno.env.get("APPLE_SHARED_SECRET"),
      }),
    });
    const appleData = await appleResponse.json();

    // Status 0 = valid, 21007 = sandbox receipt
    if (appleData.status === 0) {
      isValid = true;
    } else if (appleData.status === 21007) {
      // Retry with sandbox URL
      const sandboxResponse = await fetch("https://sandbox.itunes.apple.com/verifyReceipt", {
        method: "POST",
        body: JSON.stringify({
          "receipt-data": receipt,
          password: Deno.env.get("APPLE_SHARED_SECRET"),
        }),
      });
      const sandboxData = await sandboxResponse.json();
      isValid = sandboxData.status === 0;
    }
  } else if (platform === "android") {
    // Google Play validation would use the Google Play Developer API
    // For MVP, trust the receipt and validate structure
    isValid = !!receipt && !!transaction_id;
  }

  if (!isValid) {
    return new Response(JSON.stringify({ success: false, error: "Invalid receipt" }), {
      status: 400,
    });
  }

  // Check for duplicate transaction
  const { data: existing } = await supabase
    .from("payments")
    .select("id")
    .eq("store_transaction_id", transaction_id)
    .single();

  if (existing) {
    return new Response(JSON.stringify({ success: false, error: "Duplicate transaction" }), {
      status: 400,
    });
  }

  // Process the action — only replace_square is supported
  let publicationId: string | null = null;

  if (action.type === "replace" && action.squareId && action.imageUrl) {
    const { data, error } = await supabase.rpc("replace_square", {
      p_square_id: action.squareId,
      p_user_id: user.id,
      p_image_url: action.imageUrl,
      p_price_paid: action.price,
    });

    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 400,
      });
    }
    publicationId = data;
  }

  // Record payment
  if (publicationId) {
    await supabase.from("payments").insert({
      user_id: user.id,
      publication_id: publicationId,
      amount: action.price,
      currency: "USD",
      platform,
      store_transaction_id: transaction_id,
      status: "completed",
    });
  }

  return new Response(JSON.stringify({ success: true, publication_id: publicationId }), {
    status: 200,
  });
});
