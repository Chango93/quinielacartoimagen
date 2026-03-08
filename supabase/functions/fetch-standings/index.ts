import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Liga MX ID in TheSportsDB
const LIGA_MX_ID = 4350;

interface StandingEntry {
  team_name: string;
  team_badge: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  live_adjustment: boolean;
}

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

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const url = new URL(req.url);
    const season = url.searchParams.get('season') || '2025-2026';

    // Fetch base standings from API and live matches from DB in parallel
    const apiUrl = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/lookuptable.php?l=${LIGA_MX_ID}&s=${season}`;
    console.log('Fetching standings from:', apiUrl);

    const [apiResponse, matchdayResult] = await Promise.all([
      fetch(apiUrl),
      supabase
        .from('matchdays')
        .select('id')
        .eq('is_current', true)
        .maybeSingle(),
    ]);

    if (!apiResponse.ok) {
      console.error('TheSportsDB error:', apiResponse.status);
      return new Response(JSON.stringify({ error: `API error: ${apiResponse.status}` }), {
        status: apiResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await apiResponse.json();
    const table = data?.table || [];

    // Build base standings map by team name
    const standingsMap = new Map<string, StandingEntry>();
    for (const entry of table) {
      const name = entry.strTeam || entry.name || '';
      standingsMap.set(name.toLowerCase(), {
        team_name: name,
        team_badge: entry.strTeamBadge || entry.strBadge || '',
        played: parseInt(entry.intPlayed || '0'),
        won: parseInt(entry.intWin || '0'),
        drawn: parseInt(entry.intDraw || '0'),
        lost: parseInt(entry.intLoss || '0'),
        goals_for: parseInt(entry.intGoalsFor || '0'),
        goals_against: parseInt(entry.intGoalsAgainst || '0'),
        goal_difference: parseInt(entry.intGoalDifference || '0'),
        points: parseInt(entry.intPoints || '0'),
        live_adjustment: false,
      });
    }

    // If there's a current matchday, overlay live/in-progress match results
    let hasLiveMatches = false;
    if (matchdayResult.data?.id) {
      const { data: matches } = await supabase
        .from('matches')
        .select('home_score, away_score, is_finished, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)')
        .eq('matchday_id', matchdayResult.data.id)
        .not('home_score', 'is', null)
        .not('away_score', 'is', null);

      if (matches && matches.length > 0) {
        // Team name mapping from our DB names to TheSportsDB names
        const dbToApiName: Record<string, string> = {
          'cd guadalajara': 'guadalajara',
          'club américa': 'club america',
          'club america': 'club america',
          'atlas fc': 'atlas',
          'mazatlán fc': 'mazatlan',
          'mazatlan fc': 'mazatlan',
          'león': 'leon',
          'león fc': 'leon',
          'querétaro': 'queretaro',
          'querétaro fc': 'queretaro',
          'fc juárez': 'fc juarez',
          'fc juarez': 'fc juarez',
          'san luis': 'atletico san luis',
          'atlético san luis': 'atletico san luis',
          'necaxa': 'necaxa',
          'toluca': 'toluca',
          'tigres uanl': 'tigres',
          'tigres': 'tigres',
          'monterrey': 'monterrey',
          'santos laguna': 'santos laguna',
          'cruz azul': 'cruz azul',
          'pumas unam': 'pumas unam',
          'puebla': 'puebla',
          'pachuca': 'pachuca',
          'tijuana': 'club tijuana',
          'xolos de tijuana': 'club tijuana',
          'club tijuana': 'club tijuana',
        };

        const findInMap = (teamName: string): StandingEntry | undefined => {
          const lower = teamName.toLowerCase().trim();
          // Direct match
          if (standingsMap.has(lower)) return standingsMap.get(lower);
          // Try mapped name
          const mapped = dbToApiName[lower];
          if (mapped && standingsMap.has(mapped)) return standingsMap.get(mapped);
          // Fuzzy: find key that contains or is contained
          for (const [key, val] of standingsMap) {
            if (key.includes(lower) || lower.includes(key)) return val;
          }
          return undefined;
        };

        for (const match of matches) {
          const homeTeamName = (match.home_team as any)?.name;
          const awayTeamName = (match.away_team as any)?.name;
          if (!homeTeamName || !awayTeamName) continue;

          const homeScore = match.home_score!;
          const awayScore = match.away_score!;

          const homeEntry = findInMap(homeTeamName);
          const awayEntry = findInMap(awayTeamName);

          if (homeEntry && awayEntry) {
            hasLiveMatches = true;

            // Add match stats
            homeEntry.played += 1;
            awayEntry.played += 1;
            homeEntry.goals_for += homeScore;
            homeEntry.goals_against += awayScore;
            awayEntry.goals_for += awayScore;
            awayEntry.goals_against += homeScore;
            homeEntry.goal_difference = homeEntry.goals_for - homeEntry.goals_against;
            awayEntry.goal_difference = awayEntry.goals_for - awayEntry.goals_against;
            homeEntry.live_adjustment = true;
            awayEntry.live_adjustment = true;

            if (homeScore > awayScore) {
              homeEntry.won += 1;
              homeEntry.points += 3;
              awayEntry.lost += 1;
            } else if (homeScore < awayScore) {
              awayEntry.won += 1;
              awayEntry.points += 3;
              homeEntry.lost += 1;
            } else {
              homeEntry.drawn += 1;
              awayEntry.drawn += 1;
              homeEntry.points += 1;
              awayEntry.points += 1;
            }
          }
        }
      }
    }

    // Sort by points, then goal_difference, then goals_for
    const sorted = Array.from(standingsMap.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
      return b.goals_for - a.goals_for;
    });

    const standings = sorted.map((entry, index) => ({
      position: index + 1,
      ...entry,
    }));

    return new Response(JSON.stringify({ standings, has_live: hasLiveMatches }), {
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
