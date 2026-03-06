import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");

    const { matchday_id } = await req.json();
    if (!matchday_id) throw new Error("matchday_id is required");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check if already paid
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: existing } = await supabaseAdmin
      .from("matchday_payments")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("matchday_id", matchday_id)
      .maybeSingle();

    if (existing?.status === "paid") {
      throw new Error("Ya has pagado esta jornada");
    }

    // Find or create Stripe customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const origin = req.headers.get("origin") || "https://quinielacartoimagen.lovable.app";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price: "price_1T870J2NOjyemblGryjEPGct",
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/quiniela?payment=success&matchday_id=${matchday_id}`,
      cancel_url: `${origin}/quiniela?payment=canceled`,
      metadata: {
        user_id: user.id,
        matchday_id: matchday_id,
      },
    });

    // Upsert payment record as pending
    await supabaseAdmin.from("matchday_payments").upsert(
      {
        user_id: user.id,
        matchday_id: matchday_id,
        stripe_session_id: session.id,
        status: "pending",
      },
      { onConflict: "user_id,matchday_id" }
    );

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
