import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// TheSportsDB event structure
interface TheSportsDBEvent {
  idEvent: string;
  strEvent?: string;
  strLeague?: string;
  idLeague?: string;
  strHomeTeam: string;
  strAwayTeam: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string | null;
  dateEvent?: string;
  strTime?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const nowUtc = new Date();
    console.log('Auto-sync started at', nowUtc.toISOString());

    // Use service role key for cron jobs (no user auth)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const API_KEY = Deno.env.get('THESPORTSDB_API_KEY');
    if (!API_KEY) {
      console.error('THESPORTSDB_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'THESPORTSDB_API_KEY not configured' }), { 
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Get all ACTIVE matches: started (match_date <= now) but not finished.
    // NOTE: We intentionally do NOT depend on matchday.is_open here, because
    // matchday end_date can be configured incorrectly and close a matchday early.
    // We keep syncing until the match reaches full time (is_finished=true).
    const { data: rawMatches, error: matchesError } = await supabase
      .from('matches')
      .select(`
        id,
        match_date,
        matchday_id,
        home_score,
        away_score,
        is_finished,
        home_team:teams!matches_home_team_id_fkey(name, short_name),
        away_team:teams!matches_away_team_id_fkey(name, short_name)
      `)
      .eq('is_finished', false)
      .lte('match_date', nowUtc.toISOString());

    if (matchesError) {
      console.error('Error fetching active matches:', matchesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch matches' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const matches = rawMatches ?? [];

    if (matches.length === 0) {
      console.log('No active matches to sync (no matches started or all finished)');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No active matches to sync',
        activeMatches: 0
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    console.log(`Found ${matches.length} active match(es) to sync`);

    // Build a date window from active matches
    const matchDateTimes = matches
      .map((m: any) => new Date(m.match_date).getTime())
      .filter((t: number) => Number.isFinite(t));

    const minDate = new Date(Math.min(...matchDateTimes));
    const maxDate = new Date(Math.max(...matchDateTimes));

    const fromDate = new Date(minDate);
    fromDate.setUTCDate(fromDate.getUTCDate() - 1);
    const toDate = new Date(maxDate);
    toDate.setUTCDate(toDate.getUTCDate() + 1);

    const fromStr = fromDate.toISOString().slice(0, 10);
    const toStr = toDate.toISOString().slice(0, 10);

    const TSDB_BASE = 'https://www.thesportsdb.com/api/v2/json';

    const tsdbFetchJson = async (path: string): Promise<any | null> => {
      const url = `${TSDB_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
      const headers = {
        'X-API-KEY': API_KEY,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };

      const tryRequest = async (method: 'GET' | 'POST') => {
        const res = await fetch(url, {
          method,
          headers,
          ...(method === 'POST' ? { body: '{}' } : {}),
        });
        const text = await res.text();
        let json: any = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          // ignore
        }
        return { res, text, json };
      };

      let out = await tryRequest('GET');
      if (!out.res.ok) out = await tryRequest('POST');
      return out.json;
    };

    const extractEvents = (data: any): TheSportsDBEvent[] => {
      const arr = data?.events ?? data?.schedule ?? data?.livescores ?? data?.livescore ?? [];
      return Array.isArray(arr) ? (arr as TheSportsDBEvent[]) : [];
    };

    const resolveLigaMxLeagueId = async (): Promise<string | null> => {
      const queries = ['liga_mx', 'liga_bbva_mx', 'mexican_primera', 'mexican_primera_league', 'mexico_primera'];
      for (const q of queries) {
        const data = await tsdbFetchJson(`/search/league/${q}`);
        const leagues = (data?.leagues ?? data?.search ?? data?.results ?? data?.league ?? []) as any[];
        if (!Array.isArray(leagues)) continue;

        const found = leagues.find((l) =>
          typeof l?.idLeague === 'string' &&
          typeof l?.strSport === 'string' &&
          l.strSport.toLowerCase() === 'soccer' &&
          typeof l?.strLeague === 'string' &&
          /liga\s*mx|mexican\s*primera|liga\s*bbva/i.test(l.strLeague)
        );

        if (found?.idLeague) return found.idLeague;
      }
      return null;
    };

    const leagueId = (await resolveLigaMxLeagueId()) || '4350';
    console.log(`Resolved Liga MX leagueId=${leagueId} window ${fromStr}..${toStr}`);

    // Fetch livescores (priority for active matches)
    let livescoreEvents: TheSportsDBEvent[] = extractEvents(await tsdbFetchJson(`/livescore/${leagueId}`));

    if (livescoreEvents.length === 0) {
      const soccerLive = extractEvents(await tsdbFetchJson('/livescore/soccer'));
      livescoreEvents = soccerLive.filter((e) => {
        const league = (e as any).strLeague;
        return typeof league === 'string' && /liga\s*mx|mexican\s*primera|liga\s*bbva/i.test(league);
      });
    }

    // Fetch schedule for fallback
    const prevData = await tsdbFetchJson(`/schedule/previous/league/${leagueId}`);
    const nextData = await tsdbFetchJson(`/schedule/next/league/${leagueId}`);
    const scheduleEvents = [...extractEvents(prevData), ...extractEvents(nextData)];

    const inWindow = (e: TheSportsDBEvent): boolean => {
      const d = (e as any).dateEvent;
      return typeof d === 'string' && d >= fromStr && d <= toStr;
    };

    const allEvents = [...livescoreEvents, ...scheduleEvents].filter(inWindow);
    console.log(
      `TSDB events: live=${livescoreEvents.length} schedule=${scheduleEvents.length} windowed=${allEvents.length} window ${fromStr}..${toStr}`
    );
    if (allEvents.length > 0) {
      const s = allEvents[0] as any;
      console.log('TSDB sample event:', {
        home: s?.strHomeTeam,
        away: s?.strAwayTeam,
        homeScore: s?.intHomeScore,
        awayScore: s?.intAwayScore,
        status: s?.strStatus,
        league: s?.strLeague,
        dateEvent: s?.dateEvent,
      });
    }

    // Team name mapping
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
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      
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
      const apiLower = apiTeam.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const dbLower = dbTeam.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return apiLower.includes(dbLower) || dbLower.includes(apiLower);
    };

    const normalizeStatus = (v: unknown): string => String(v ?? '').trim().toLowerCase();

    const parseScore = (v: unknown): number | null => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      const s = String(v).trim();
      if (!s) return null;
      const n = Number.parseInt(s, 10);
      return Number.isFinite(n) ? n : null;
    };

    let updated = 0;
    let notFound = 0;
    const matchdaysToRecalc = new Set<string>();

    for (const match of matches) {
      const homeTeam = match.home_team as unknown as { name: string; short_name: string };
      const awayTeam = match.away_team as unknown as { name: string; short_name: string };
      
      if (!homeTeam || !awayTeam) continue;

      const matchDirect = (e: TheSportsDBEvent) =>
        matchTeam(e.strHomeTeam, homeTeam) && matchTeam(e.strAwayTeam, awayTeam);
      const matchSwapped = (e: TheSportsDBEvent) =>
        matchTeam(e.strHomeTeam, awayTeam) && matchTeam(e.strAwayTeam, homeTeam);

      const event = allEvents.find((e) => matchDirect(e) || matchSwapped(e));
      const swapped = event ? matchSwapped(event) : false;

      if (event) {
        const status = normalizeStatus(event.strStatus);
        const isFinished =
          status.includes('finished') ||
          status.includes('final') ||
          status === 'ft' ||
          status === 'aet' ||
          status === 'pen';

        const isNotStarted = status === 'ns' || status.includes('not started');

        const rawHome = parseScore((event as any).intHomeScore);
        const rawAway = parseScore((event as any).intAwayScore);

        let homeScore = swapped ? rawAway : rawHome;
        let awayScore = swapped ? rawHome : rawAway;

        // Some endpoints return null/"" for the side that has 0.
        // If we have at least one score and the match isn't "not started", default the missing side to 0.
        if (!isNotStarted && (homeScore !== null || awayScore !== null)) {
          homeScore = homeScore ?? 0;
          awayScore = awayScore ?? 0;
        }

        if (homeScore === null || awayScore === null) {
          console.log(`Match found but scores missing: ${homeTeam.name} vs ${awayTeam.name}`, {
            status,
            swapped,
            intHomeScore: (event as any).intHomeScore,
            intAwayScore: (event as any).intAwayScore,
          });
          continue;
        }

        console.log(
          `Updating ${homeTeam.name} vs ${awayTeam.name}: ${homeScore}-${awayScore} (finished: ${isFinished}, status: ${status})`
        );

        const { error: updateError } = await supabase
          .from('matches')
          .update({
            home_score: homeScore,
            away_score: awayScore,
            is_finished: isFinished,
          })
          .eq('id', match.id);

        if (updateError) {
          console.error('Error updating match:', updateError);
        } else {
          updated++;
          matchdaysToRecalc.add(match.matchday_id);
        }
      } else {
        console.log(`No event found for ${homeTeam.name} vs ${awayTeam.name}`);
        notFound++;
      }
    }

    // Recalculate points for affected matchdays
    for (const matchdayId of matchdaysToRecalc) {
      const { error: recalcError } = await supabase.rpc('recalculate_matchday_points', { p_matchday_id: matchdayId });
      if (recalcError) {
        console.error('Error recalculating points for matchday', matchdayId, recalcError);
      }
    }

    console.log(`Auto-sync completed: ${updated} updated, ${notFound} not found`);

    return new Response(JSON.stringify({ 
      success: true, 
      updated,
      notFound,
      activeMatches: matches.length,
      message: `Sync: ${updated}/${matches.length} partidos actualizados`
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error('Auto-sync error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
