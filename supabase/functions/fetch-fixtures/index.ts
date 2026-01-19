import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Liga MX ID en API-Football
const LIGA_MX_ID = 262;

// Timezone CDMX
const CDMX_TIMEZONE = "America/Mexico_City";

interface ApiFixture {
  fixture: {
    id: number;
    date: string;
    timestamp: number;
  };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  league: {
    round: string;
  };
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("API_FOOTBALL_KEY");
    if (!apiKey) {
      console.error("API_FOOTBALL_KEY not configured");
      return new Response(
        JSON.stringify({ error: "API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Obtener parámetros
    const url = new URL(req.url);
    const round = url.searchParams.get("round"); // e.g., "Regular Season - 6"
    // API-Football free plan: temporadas 2022-2024
    // La temporada de Liga MX Clausura 2025 técnicamente es "2024" en API-Football
    const season = url.searchParams.get("season") || "2024";

    console.log(`Fetching fixtures for Liga MX, season ${season}, round: ${round || "all"}`);

    // Construir URL de API-Football
    let apiUrl = `https://v3.football.api-sports.io/fixtures?league=${LIGA_MX_ID}&season=${season}`;
    if (round) {
      apiUrl += `&round=${encodeURIComponent(round)}`;
    }

    console.log(`API URL: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      headers: {
        "x-apisports-key": apiKey,
      },
    });

    if (!response.ok) {
      console.error(`API-Football error: ${response.status}`);
      return new Response(
        JSON.stringify({ error: `API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log(`API response: ${data.results} fixtures found`);

    if (data.errors && Object.keys(data.errors).length > 0) {
      console.error("API errors:", data.errors);
      return new Response(
        JSON.stringify({ error: "API error", details: data.errors }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Obtener equipos de la base de datos para mapear nombres
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id, name, short_name");

    if (teamsError) {
      console.error("Error fetching teams:", teamsError);
      return new Response(
        JSON.stringify({ error: "Error fetching teams" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Función para encontrar equipo por nombre (fuzzy matching)
    const findTeam = (apiName: string) => {
      const normalized = apiName.toLowerCase().trim();
      return teams?.find((t) => {
        const name = t.name.toLowerCase();
        const shortName = t.short_name.toLowerCase();
        return (
          name === normalized ||
          shortName === normalized ||
          name.includes(normalized) ||
          normalized.includes(name) ||
          // Casos especiales comunes
          (normalized.includes("america") && name.includes("américa")) ||
          (normalized.includes("atletico") && name.includes("atlético")) ||
          (normalized.includes("leon") && name.includes("león")) ||
          (normalized.includes("queretaro") && name.includes("querétaro")) ||
          (normalized.includes("san luis") && name.includes("san luis")) ||
          (normalized.includes("cruz azul") && name.includes("cruz azul")) ||
          (normalized.includes("guadalajara") && (name.includes("guadalajara") || name.includes("chivas"))) ||
          (normalized.includes("unam") && name.includes("pumas")) ||
          (normalized.includes("pumas") && name.includes("pumas")) ||
          (normalized.includes("tigres") && name.includes("tigres")) ||
          (normalized.includes("monterrey") && name.includes("monterrey") && !normalized.includes("rayados")) ||
          (normalized.includes("rayados") && name.includes("monterrey")) ||
          (normalized.includes("santos") && name.includes("santos")) ||
          (normalized.includes("toluca") && name.includes("toluca")) ||
          (normalized.includes("pachuca") && name.includes("pachuca")) ||
          (normalized.includes("tijuana") && name.includes("tijuana")) ||
          (normalized.includes("necaxa") && name.includes("necaxa")) ||
          (normalized.includes("mazatlan") && name.includes("mazatlán")) ||
          (normalized.includes("juarez") && name.includes("juárez"))
        );
      });
    };

    // Convertir fixtures a formato para el frontend
    const fixtures = (data.response as ApiFixture[]).map((f) => {
      const homeTeam = findTeam(f.teams.home.name);
      const awayTeam = findTeam(f.teams.away.name);

      // Convertir timestamp a fecha en CDMX
      const utcDate = new Date(f.fixture.timestamp * 1000);
      const cdmxFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: CDMX_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const cdmxDate = cdmxFormatter.format(utcDate);

      // También obtener hora en CDMX
      const timeFormatter = new Intl.DateTimeFormat("es-MX", {
        timeZone: CDMX_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const cdmxTime = timeFormatter.format(utcDate);

      return {
        api_fixture_id: f.fixture.id,
        home_team_api: f.teams.home.name,
        away_team_api: f.teams.away.name,
        home_team_id: homeTeam?.id || null,
        away_team_id: awayTeam?.id || null,
        home_team_name: homeTeam?.name || null,
        away_team_name: awayTeam?.name || null,
        match_date: cdmxDate, // YYYY-MM-DD en CDMX
        match_time: cdmxTime, // HH:mm en CDMX
        round: f.league.round,
        matched: !!(homeTeam && awayTeam),
      };
    });

    // Obtener jornadas únicas
    const rounds = [...new Set(fixtures.map((f) => f.round))].sort();

    console.log(`Processed ${fixtures.length} fixtures, rounds: ${rounds.join(", ")}`);

    return new Response(
      JSON.stringify({
        fixtures,
        rounds,
        total: fixtures.length,
        matched: fixtures.filter((f) => f.matched).length,
        unmatched: fixtures.filter((f) => !f.matched).length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
