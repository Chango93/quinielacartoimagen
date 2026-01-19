import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Liga MX ID en TheSportsDB
const LIGA_MX_ID = 4350;

// Timezone CDMX
const CDMX_TIMEZONE = "America/Mexico_City";

interface SportsDBEvent {
  idEvent: string;
  strEvent: string;
  strHomeTeam: string;
  strAwayTeam: string;
  dateEvent: string; // YYYY-MM-DD
  strTime: string; // HH:mm:ss or HH:mm:ss+00:00
  intRound: string;
  strStatus: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("THESPORTSDB_API_KEY");
    if (!apiKey) {
      console.error("THESPORTSDB_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Obtener parámetros de URL o body
    const url = new URL(req.url);
    let round = url.searchParams.get("round"); // e.g., "6"
    let season = url.searchParams.get("season") || "2025-2026";
    let mode = url.searchParams.get("mode") || "season"; // "season" o "next"

    // También aceptar parámetros del body (para supabase.functions.invoke)
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.round) round = body.round;
        if (body?.season) season = body.season;
        if (body?.mode) mode = body.mode;
      } catch (e) {
        // Body vacío o no JSON, ignorar
      }
    }

    console.log(`Fetching fixtures for Liga MX, season ${season}, round: ${round || "all"}, mode: ${mode}`);

    let apiUrl: string;
    
    if (mode === "next") {
      // Próximos eventos (para obtener jornada actual)
      apiUrl = `https://www.thesportsdb.com/api/v1/json/${apiKey}/eventsnextleague.php?id=${LIGA_MX_ID}`;
    } else {
      // Eventos de toda la temporada
      apiUrl = `https://www.thesportsdb.com/api/v1/json/${apiKey}/eventsseason.php?id=${LIGA_MX_ID}&s=${season}`;
    }

    console.log(`API URL: ${apiUrl}`);

    const response = await fetch(apiUrl);

    if (!response.ok) {
      console.error(`TheSportsDB error: ${response.status}`);
      return new Response(
        JSON.stringify({ error: `API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const events: SportsDBEvent[] = data.events || [];
    
    console.log(`API response: ${events.length} events found`);

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({ 
          fixtures: [], 
          rounds: [], 
          total: 0, 
          matched: 0, 
          unmatched: 0,
          message: "No events found for this season" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
          // Casos especiales comunes de TheSportsDB
          (normalized.includes("america") && name.includes("américa")) ||
          (normalized.includes("club america") && name.includes("américa")) ||
          (normalized.includes("atletico") && name.includes("atlético")) ||
          (normalized.includes("leon") && name.includes("león")) ||
          (normalized.includes("queretaro") && name.includes("querétaro")) ||
          (normalized.includes("san luis") && name.includes("san luis")) ||
          (normalized.includes("cruz azul") && name.includes("cruz azul")) ||
          (normalized.includes("guadalajara") && (name.includes("guadalajara") || name.includes("chivas"))) ||
          (normalized.includes("chivas") && (name.includes("guadalajara") || name.includes("chivas"))) ||
          (normalized.includes("unam") && name.includes("pumas")) ||
          (normalized.includes("pumas") && name.includes("pumas")) ||
          (normalized.includes("tigres") && name.includes("tigres")) ||
          (normalized.includes("monterrey") && name.includes("monterrey")) ||
          (normalized.includes("rayados") && name.includes("monterrey")) ||
          (normalized.includes("santos") && name.includes("santos")) ||
          (normalized.includes("santos laguna") && name.includes("santos")) ||
          (normalized.includes("toluca") && name.includes("toluca")) ||
          (normalized.includes("pachuca") && name.includes("pachuca")) ||
          (normalized.includes("tijuana") && name.includes("tijuana")) ||
          (normalized.includes("xolos") && name.includes("tijuana")) ||
          (normalized.includes("necaxa") && name.includes("necaxa")) ||
          (normalized.includes("mazatlan") && name.includes("mazatlán")) ||
          (normalized.includes("juarez") && name.includes("juárez")) ||
          (normalized.includes("fc juarez") && name.includes("juárez")) ||
          (normalized.includes("puebla") && name.includes("puebla")) ||
          (normalized.includes("atlas") && name.includes("atlas"))
        );
      });
    };

    // Función para convertir hora UTC a CDMX
    const convertToCDMX = (dateStr: string, timeStr: string): { date: string; time: string } => {
      try {
        // Limpiar el tiempo (puede venir como "19:00:00" o "19:00:00+00:00")
        const cleanTime = timeStr?.split("+")[0] || "12:00:00";
        const utcDateTime = new Date(`${dateStr}T${cleanTime}Z`);
        
        const cdmxFormatter = new Intl.DateTimeFormat("en-CA", {
          timeZone: CDMX_TIMEZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
        
        const timeFormatter = new Intl.DateTimeFormat("es-MX", {
          timeZone: CDMX_TIMEZONE,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        
        return {
          date: cdmxFormatter.format(utcDateTime),
          time: timeFormatter.format(utcDateTime)
        };
      } catch (e) {
        console.error("Error converting date:", e);
        return { date: dateStr, time: "12:00" };
      }
    };

    // Filtrar por jornada si se especifica
    let filteredEvents = events;
    if (round) {
      filteredEvents = events.filter(e => e.intRound === round);
    }

    // Convertir eventos a formato para el frontend
    const fixtures = filteredEvents.map((e) => {
      const homeTeam = findTeam(e.strHomeTeam);
      const awayTeam = findTeam(e.strAwayTeam);
      const cdmxDateTime = convertToCDMX(e.dateEvent, e.strTime);

      return {
        api_event_id: e.idEvent,
        event_name: e.strEvent,
        home_team_api: e.strHomeTeam,
        away_team_api: e.strAwayTeam,
        home_team_id: homeTeam?.id || null,
        away_team_id: awayTeam?.id || null,
        home_team_name: homeTeam?.name || null,
        away_team_name: awayTeam?.name || null,
        match_date: cdmxDateTime.date, // YYYY-MM-DD en CDMX
        match_time: cdmxDateTime.time, // HH:mm en CDMX
        round: e.intRound,
        status: e.strStatus,
        matched: !!(homeTeam && awayTeam),
      };
    });

    // Obtener jornadas únicas ordenadas numéricamente
    const rounds = [...new Set(events.map((e) => e.intRound))]
      .filter(r => r)
      .sort((a, b) => parseInt(a) - parseInt(b));

    console.log(`Processed ${fixtures.length} fixtures, rounds: ${rounds.slice(0, 10).join(", ")}...`);

    return new Response(
      JSON.stringify({
        fixtures,
        rounds,
        total: fixtures.length,
        matched: fixtures.filter((f) => f.matched).length,
        unmatched: fixtures.filter((f) => !f.matched).length,
        season,
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
