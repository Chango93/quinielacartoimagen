import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ApiFixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string };
  };
  teams: {
    home: { name: string };
    away: { name: string };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const userId = claims.claims.sub as string;
    
    // Check if user is admin
    const { data: hasRole } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' });
    if (!hasRole) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { 
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const { matchday_id } = await req.json();
    if (!matchday_id) {
      return new Response(JSON.stringify({ error: 'matchday_id is required' }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Get matches for this matchday with team names
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select(`
        id,
        match_date,
        home_score,
        away_score,
        is_finished,
        home_team:teams!matches_home_team_id_fkey(name, short_name),
        away_team:teams!matches_away_team_id_fkey(name, short_name)
      `)
      .eq('matchday_id', matchday_id);

    if (matchesError) {
      console.error('Error fetching matches:', matchesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch matches' }), { 
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const API_KEY = Deno.env.get('API_FOOTBALL_KEY');
    if (!API_KEY) {
      return new Response(JSON.stringify({ error: 'API_FOOTBALL_KEY not configured' }), { 
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Liga MX Clausura 2025 - league ID 262
    const today = new Date();
    const seasonYear = today.getMonth() < 6 ? today.getFullYear() : today.getFullYear();
    
    // Fetch recent fixtures from API-Football
    const apiUrl = `https://v3.football.api-sports.io/fixtures?league=262&season=${seasonYear}&status=FT`;
    console.log('Fetching from API:', apiUrl);
    
    const apiResponse = await fetch(apiUrl, {
      headers: {
        'x-apisports-key': API_KEY
      }
    });

    if (!apiResponse.ok) {
      console.error('API-Football error:', apiResponse.status, await apiResponse.text());
      return new Response(JSON.stringify({ error: 'Failed to fetch from API-Football' }), { 
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const apiData = await apiResponse.json();
    const fixtures: ApiFixture[] = apiData.response || [];
    console.log(`Found ${fixtures.length} finished fixtures from API`);

    // Team name mapping (API names to our DB names)
    const teamNameMap: Record<string, string[]> = {
      'Guadalajara': ['CD Guadalajara', 'Chivas', 'GDL'],
      'Club America': ['Club América', 'América', 'AME'],
      'Atlas': ['Club Atlas', 'Atlas', 'ATL'],
      'Monterrey': ['CF Monterrey', 'Monterrey', 'MTY'],
      'Tigres UANL': ['Club Tigres', 'Tigres', 'TIG'],
      'Cruz Azul': ['Cruz Azul', 'CRU'],
      'Pumas UNAM': ['Club Universidad', 'Pumas', 'PUM'],
      'Pachuca': ['CF Pachuca', 'Pachuca', 'PAC'],
      'Toluca': ['Deportivo Toluca', 'Toluca', 'TOL'],
      'Santos Laguna': ['Club Santos Laguna', 'Santos', 'SAN'],
      'Leon': ['Club León', 'León', 'LEO'],
      'Necaxa': ['Club Necaxa', 'Necaxa', 'NEC'],
      'Atletico San Luis': ['Atlético San Luis', 'San Luis', 'ASL'],
      'Queretaro': ['Club Querétaro', 'Querétaro', 'QRO'],
      'Puebla': ['Club Puebla', 'Puebla', 'PUE'],
      'Tijuana': ['Club Tijuana', 'Xolos', 'TIJ'],
      'Mazatlan FC': ['Mazatlán FC', 'Mazatlán', 'MAZ'],
      'Juarez': ['FC Juárez', 'Juárez', 'JUA']
    };

    const normalizeTeamName = (apiName: string): string[] => {
      for (const [apiKey, dbNames] of Object.entries(teamNameMap)) {
        if (apiName.toLowerCase().includes(apiKey.toLowerCase()) || 
            apiKey.toLowerCase().includes(apiName.toLowerCase())) {
          return dbNames;
        }
      }
      return [apiName];
    };

    const matchTeam = (apiTeam: string, dbTeam: { name: string; short_name: string }): boolean => {
      const possibleNames = normalizeTeamName(apiTeam);
      return possibleNames.some(name => 
        dbTeam.name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(dbTeam.name.toLowerCase()) ||
        dbTeam.short_name.toLowerCase() === name.toLowerCase()
      );
    };

    let updated = 0;
    let notFound = 0;

    for (const match of matches || []) {
      if (match.is_finished) continue;
      
      const homeTeam = match.home_team as unknown as { name: string; short_name: string };
      const awayTeam = match.away_team as unknown as { name: string; short_name: string };
      
      if (!homeTeam || !awayTeam) continue;
      
      // Find matching fixture
      const fixture = fixtures.find(f => 
        matchTeam(f.teams.home.name, homeTeam) && 
        matchTeam(f.teams.away.name, awayTeam)
      );

      if (fixture && fixture.goals.home !== null && fixture.goals.away !== null) {
        console.log(`Updating ${homeTeam.name} vs ${awayTeam.name}: ${fixture.goals.home}-${fixture.goals.away}`);
        
        const { error: updateError } = await supabase
          .from('matches')
          .update({ 
            home_score: fixture.goals.home, 
            away_score: fixture.goals.away,
            is_finished: true 
          })
          .eq('id', match.id);

        if (updateError) {
          console.error('Error updating match:', updateError);
        } else {
          updated++;
        }
      } else {
        console.log(`No result found for ${homeTeam.name} vs ${awayTeam.name}`);
        notFound++;
      }
    }

    // Recalculate points if any matches were updated
    if (updated > 0) {
      await supabase.rpc('recalculate_matchday_points', { p_matchday_id: matchday_id });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      updated, 
      notFound,
      message: `${updated} partidos actualizados, ${notFound} sin resultado disponible`
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error('Sync error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
