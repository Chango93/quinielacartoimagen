import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// TheSportsDB event structure
interface TheSportsDBEvent {
  idEvent: string;
  strEvent: string;
  strHomeTeam: string;
  strAwayTeam: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string | null;
  dateEvent: string;
  strTime: string;
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

    const API_KEY = Deno.env.get('THESPORTSDB_API_KEY');
    if (!API_KEY) {
      return new Response(JSON.stringify({ error: 'THESPORTSDB_API_KEY not configured' }), { 
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Liga MX ID in TheSportsDB: 4350
    const LIGA_MX_ID = '4350';
    
    // Fetch livescores first (for matches currently in progress)
    const livescoreUrl = `https://www.thesportsdb.com/api/v2/json/${API_KEY}/livescore/${LIGA_MX_ID}`;
    console.log('Fetching livescores from:', livescoreUrl);
    
    let livescoreEvents: TheSportsDBEvent[] = [];
    try {
      const livescoreResponse = await fetch(livescoreUrl);
      if (livescoreResponse.ok) {
        const livescoreData = await livescoreResponse.json();
        livescoreEvents = livescoreData.livescores || livescoreData.events || [];
        console.log(`Found ${livescoreEvents.length} live events`);
      }
    } catch (e) {
      console.log('Livescore fetch error (may be no live games):', e);
    }

    // Fetch recent and upcoming events from schedule
    const prevEventsUrl = `https://www.thesportsdb.com/api/v2/json/${API_KEY}/schedule/previous/league/${LIGA_MX_ID}`;
    const nextEventsUrl = `https://www.thesportsdb.com/api/v2/json/${API_KEY}/schedule/next/league/${LIGA_MX_ID}`;
    
    console.log('Fetching previous events:', prevEventsUrl);
    console.log('Fetching next events:', nextEventsUrl);

    let scheduleEvents: TheSportsDBEvent[] = [];
    
    // Fetch previous events (completed matches)
    try {
      const prevResponse = await fetch(prevEventsUrl);
      if (prevResponse.ok) {
        const prevData = await prevResponse.json();
        const prevEvents = prevData.schedule || prevData.events || [];
        scheduleEvents.push(...prevEvents);
        console.log(`Found ${prevEvents.length} previous events`);
      }
    } catch (e) {
      console.log('Previous events fetch error:', e);
    }

    // Fetch next events (upcoming matches)
    try {
      const nextResponse = await fetch(nextEventsUrl);
      if (nextResponse.ok) {
        const nextData = await nextResponse.json();
        const nextEvents = nextData.schedule || nextData.events || [];
        scheduleEvents.push(...nextEvents);
        console.log(`Found ${nextEvents.length} next events`);
      }
    } catch (e) {
      console.log('Next events fetch error:', e);
    }

    // Combine all events, prioritizing livescores (more up-to-date)
    const allEvents = [...livescoreEvents, ...scheduleEvents];
    console.log(`Total events to process: ${allEvents.length}`);

    // Team name mapping (TheSportsDB names -> DB names)
    const teamNameMap: Record<string, string> = {
      'guadalajara': 'CD Guadalajara',
      'chivas': 'CD Guadalajara',
      'cd guadalajara': 'CD Guadalajara',
      'america': 'Club América',
      'club america': 'Club América',
      'cf america': 'Club América',
      'atlas': 'Club Atlas',
      'club atlas': 'Club Atlas',
      'monterrey': 'CF Monterrey',
      'cf monterrey': 'CF Monterrey',
      'tigres': 'Tigres UANL',
      'tigres uanl': 'Tigres UANL',
      'cruz azul': 'Cruz Azul',
      'pumas': 'Pumas UNAM',
      'pumas unam': 'Pumas UNAM',
      'pachuca': 'CF Pachuca',
      'cf pachuca': 'CF Pachuca',
      'toluca': 'Deportivo Toluca',
      'deportivo toluca': 'Deportivo Toluca',
      'santos laguna': 'Club Santos Laguna',
      'santos': 'Club Santos Laguna',
      'club santos laguna': 'Club Santos Laguna',
      'leon': 'Club León',
      'club leon': 'Club León',
      'necaxa': 'Club Necaxa',
      'club necaxa': 'Club Necaxa',
      'atletico san luis': 'Atlético San Luis',
      'san luis': 'Atlético San Luis',
      'queretaro': 'Querétaro FC',
      'queretaro fc': 'Querétaro FC',
      'puebla': 'Club Puebla',
      'club puebla': 'Club Puebla',
      'tijuana': 'Club Tijuana',
      'club tijuana': 'Club Tijuana',
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
      
      // Find matching event
      const event = allEvents.find(e => 
        matchTeam(e.strHomeTeam, homeTeam) && 
        matchTeam(e.strAwayTeam, awayTeam)
      );

      if (event) {
        const homeScore = event.intHomeScore !== null ? parseInt(event.intHomeScore) : null;
        const awayScore = event.intAwayScore !== null ? parseInt(event.intAwayScore) : null;
        
        // Determine if finished based on status
        // Common statuses: "Match Finished", "FT", "NS" (not started), "1H", "2H", "HT", etc.
        const status = (event.strStatus || '').toLowerCase();
        const isFinished = status.includes('finished') || status === 'ft' || status === 'aet' || status === 'pen';
        
        if (homeScore !== null && awayScore !== null && !isNaN(homeScore) && !isNaN(awayScore)) {
          console.log(`Updating ${homeTeam.name} vs ${awayTeam.name}: ${homeScore}-${awayScore} (status: ${event.strStatus}, finished: ${isFinished})`);
          
          const { error: updateError } = await supabase
            .from('matches')
            .update({ 
              home_score: homeScore, 
              away_score: awayScore,
              is_finished: isFinished 
            })
            .eq('id', match.id);

          if (updateError) {
            console.error('Error updating match:', updateError);
          } else {
            updated++;
          }
        } else {
          console.log(`Match found but no scores yet: ${homeTeam.name} vs ${awayTeam.name} (status: ${event.strStatus})`);
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
