import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Liga MX ID in TheSportsDB
const LIGA_MX_ID = 4350;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const API_KEY = Deno.env.get('THESPORTSDB_API_KEY');
    if (!API_KEY) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use v1 endpoint for league table lookup
    // Optional season parameter
    const url = new URL(req.url);
    const season = url.searchParams.get('season') || '2025-2026';

    const apiUrl = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/lookuptable.php?l=${LIGA_MX_ID}&s=${season}`;

    console.log('Fetching standings from:', apiUrl);

    const response = await fetch(apiUrl);
    if (!response.ok) {
      console.error('TheSportsDB error:', response.status);
      return new Response(JSON.stringify({ error: `API error: ${response.status}` }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const table = data?.table || [];

    // Map to a cleaner structure
    const standings = table.map((entry: any, index: number) => ({
      position: index + 1,
      team_name: entry.strTeam || entry.name || '',
      team_badge: entry.strTeamBadge || entry.strBadge || '',
      played: parseInt(entry.intPlayed || '0'),
      won: parseInt(entry.intWin || '0'),
      drawn: parseInt(entry.intDraw || '0'),
      lost: parseInt(entry.intLoss || '0'),
      goals_for: parseInt(entry.intGoalsFor || '0'),
      goals_against: parseInt(entry.intGoalsAgainst || '0'),
      goal_difference: parseInt(entry.intGoalDifference || '0'),
      points: parseInt(entry.intPoints || '0'),
    }));

    return new Response(JSON.stringify({ standings }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching standings:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch standings' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
