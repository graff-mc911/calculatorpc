import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * Optional Edge Function for owner aggregates (service_role).
 * Primary path is RPC `owner_user_stats` from the migration; this function
 * is a fallback if you prefer Edge over SECURITY DEFINER SQL.
 */
Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (req.method !== "GET" && req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: isOwner, error: ownerError } = await userClient.rpc("is_app_owner");
    if (ownerError || !isOwner) {
      return json({ error: "Forbidden" }, 403);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { count: totalUsers, error: countError } = await admin
      .from("user_app_meta")
      .select("*", { count: "exact", head: true });

    // Prefer auth admin API for total users
    let total = 0;
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (!listed.error && listed.data) {
      // listUsers does not always return total; fall back to RPC via admin
      const rpc = await admin.rpc("owner_user_stats");
      if (!rpc.error && rpc.data) {
        return json(rpc.data);
      }
    }

    // Fallback aggregate from user_app_meta only (incomplete vs auth.users)
    const { data: metaRows } = await admin
      .from("user_app_meta")
      .select("country_code");

    const byCountry: Record<string, number> = {};
    for (const row of metaRows ?? []) {
      const key = (row.country_code || "unknown").toUpperCase() || "unknown";
      byCountry[key] = (byCountry[key] || 0) + 1;
    }

    if (countError) {
      void countError;
    }

    total = totalUsers ?? Object.values(byCountry).reduce((a, b) => a + b, 0);

    return json({ total_users: total, by_country: byCountry });
  } catch (error) {
    return json({ error: error?.message ?? "Unknown error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
