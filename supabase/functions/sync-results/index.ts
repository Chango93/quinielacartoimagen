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

    // Liga MX - league ID 262
    // Fetch fixtures for the matchday date window (more reliable than filtering by status)
    const matchDateTimes = (matches || [])
      .map((m: any) => new Date(m.match_date).getTime())
      .filter((t: number) => Number.isFinite(t));

    const minDate = matchDateTimes.length ? new Date(Math.min(...matchDateTimes)) : new Date();
    const maxDate = matchDateTimes.length ? new Date(Math.max(...matchDateTimes)) : new Date();

    const fromDate = new Date(minDate);
    fromDate.setUTCDate(fromDate.getUTCDate() - 1);
    const toDate = new Date(maxDate);
    toDate.setUTCDate(toDate.getUTCDate() + 1);

    const fromStr = fromDate.toISOString().slice(0, 10);
    const toStr = toDate.toISOString().slice(0, 10);

    console.log(`Fetching fixtures window from=${fromStr} to=${toStr}`);

    // Try both current year and previous year since API-Football may use different season conventions
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;

    let fixtures: ApiFixture[] = [];

    for (const seasonYear of [currentYear, previousYear]) {
      const apiUrl = `https://v3.football.api-sports.io/fixtures?league=262&season=${seasonYear}&from=${fromStr}&to=${toStr}`;
      console.log('Fetching from API:', apiUrl);

      const apiResponse = await fetch(apiUrl, {
        headers: { 'x-apisports-key': API_KEY },
      });

      if (!apiResponse.ok) {
        console.error('API-Football error:', apiResponse.status, await apiResponse.text());
        continue;
      }

      const apiData = await apiResponse.json();
      if (apiData?.errors && Object.keys(apiData.errors).length > 0) {
        console.log('API-Football returned errors:', apiData.errors);
      }

      const seasonFixtures: ApiFixture[] = apiData.response || [];
      console.log(`Found ${seasonFixtures.length} fixtures from season ${seasonYear}`);

      if (seasonFixtures.length > 0) {
        fixtures = seasonFixtures;
        break;
      }
    }

    console.log(`Total fixtures found: ${fixtures.length}`);

    // Team name mapping (API-Football names -> DB names based on actual database)
    // DB teams: Atlético San Luis, CD Guadalajara, CF Monterrey, CF Pachuca, Club América,
    // Club Atlas, Club León, Club Necaxa, Club Puebla, Club Santos Laguna, Club Tijuana,
    // Cruz Azul, Deportivo Toluca, FC Juárez, Mazatlán FC, Pumas UNAM, Querétaro FC, Tigres UANL
    const teamNameMap: Record<string, string> = {
      'guadalajara': 'CD Guadalajara',
      'chivas': 'CD Guadalajara',
      'america': 'Club América',
      'club america': 'Club América',
      'atlas': 'Club Atlas',
      'monterrey': 'CF Monterrey',
      'tigres': 'Tigres UANL',
      'tigres uanl': 'Tigres UANL',
      'cruz azul': 'Cruz Azul',
      'pumas': 'Pumas UNAM',
      'pumas unam': 'Pumas UNAM',
      'pachuca': 'CF Pachuca',
      'toluca': 'Deportivo Toluca',
      'santos laguna': 'Club Santos Laguna',
      'santos': 'Club Santos Laguna',
      'leon': 'Club León',
      'necaxa': 'Club Necaxa',
      'atletico san luis': 'Atlético San Luis',
      'san luis': 'Atlético San Luis',
      'queretaro': 'Querétaro FC',
      'puebla': 'Club Puebla',
      'tijuana': 'Club Tijuana',
      'xolos': 'Club Tijuana',
      'mazatlan': 'Mazatlán FC',
      'mazatlan fc': 'Mazatlán FC',
      'juarez': 'FC Juárez',
      'fc juarez': 'FC Juárez'
    };

    const normalizeApiName = (apiName: string): string | null => {
      const lower = apiName.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Remove accents
      
      for (const [apiKey, dbName] of Object.entries(teamNameMap)) {
        if (lower.includes(apiKey) || apiKey.includes(lower)) {
          return dbName;
        }
      }
      return null;
    };

    const matchTeam = (apiTeam: string, dbTeam: { name: string; short_name: string }): boolean => {
      const normalizedName = normalizeApiName(apiTeam);
      if (normalizedName) {
        return dbTeam.name === normalizedName;
      }
      // Fallback: direct comparison
      const apiLower = apiTeam.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const dbLower = dbTeam.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return apiLower.includes(dbLower) || dbLower.includes(apiLower);
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
        const isFinished = fixture.fixture.status.short === 'FT';
        console.log(`Updating ${homeTeam.name} vs ${awayTeam.name}: ${fixture.goals.home}-${fixture.goals.away} (${isFinished ? 'finished' : 'live'})`);
        
        const { error: updateError } = await supabase
          .from('matches')
          .update({ 
            home_score: fixture.goals.home, 
            away_score: fixture.goals.away,
            is_finished: isFinished 
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
