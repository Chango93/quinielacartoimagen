import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check - require admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Create client with user's auth token to validate permissions
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify JWT and get claims
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claims.claims.sub as string;

    // Check if user is admin
    const { data: hasRole } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!hasRole) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Now use service role key for the actual operation
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find matchdays that should be closed (end_date has passed and is_open is true)
    const now = new Date().toISOString();
    
    const { data: matchdaysToClose, error: fetchError } = await adminSupabase
      .from("matchdays")
      .select("id, name, end_date")
      .eq("is_open", true)
      .not("end_date", "is", null)
      .lte("end_date", now);

    if (fetchError) {
      throw fetchError;
    }

    if (!matchdaysToClose || matchdaysToClose.length === 0) {
      return new Response(
        JSON.stringify({ message: "No matchdays to close", closed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Close each matchday when end_date passes (locks predictions)
    // Note: auto-sync-results will continue updating scores until matches finish
    const closedMatchdays: string[] = [];
    for (const matchday of matchdaysToClose) {
      const { error: updateError } = await adminSupabase
        .from("matchdays")
        .update({ is_open: false, updated_at: now })
        .eq("id", matchday.id);

      if (!updateError) {
        closedMatchdays.push(matchday.name);
        console.log(`Closed matchday: ${matchday.name} (end_date: ${matchday.end_date})`);
      } else {
        console.error(`Failed to close matchday ${matchday.name}:`, updateError);
      }
    }

    return new Response(
      JSON.stringify({
        message: `Closed ${closedMatchdays.length} matchday(s)`,
        closed: closedMatchdays.length,
        matchdays: closedMatchdays,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in auto-close-matchdays:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
