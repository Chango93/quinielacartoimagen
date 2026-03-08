import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Trophy, RefreshCw, Radio } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface StandingEntry {
  team_id: string;
  team_name: string;
  team_short: string;
  team_logo: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  live: boolean;
}

export default function Posiciones() {
  const [standings, setStandings] = useState<StandingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLive, setHasLive] = useState(false);

  const fetchStandings = async () => {
    setLoading(true);

    // Fetch base standings + current matchday live matches in parallel
    const [standingsRes, matchdayRes] = await Promise.all([
      supabase
        .from('league_standings')
        .select('*, team:teams!league_standings_team_id_fkey(id, name, short_name, logo_url)')
        .order('points', { ascending: false }),
      supabase
        .from('matchdays')
        .select('id')
        .eq('is_current', true)
        .maybeSingle(),
    ]);

    if (!standingsRes.data) {
      setLoading(false);
      return;
    }

    // Build base standings map
    const map = new Map<string, StandingEntry>();
    for (const row of standingsRes.data) {
      const team = row.team as any;
      map.set(team.id, {
        team_id: team.id,
        team_name: team.name,
        team_short: team.short_name,
        team_logo: team.logo_url,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        goals_for: row.goals_for,
        goals_against: row.goals_against,
        goal_difference: row.goals_for - row.goals_against,
        points: row.points,
        live: false,
      });
    }

    // Overlay live (in-progress) matches
    let liveFound = false;
    if (matchdayRes.data?.id) {
      const { data: liveMatches } = await supabase
        .from('matches')
        .select('home_team_id, away_team_id, home_score, away_score')
        .eq('matchday_id', matchdayRes.data.id)
        .eq('is_finished', false)
        .not('home_score', 'is', null)
        .not('away_score', 'is', null);

      if (liveMatches && liveMatches.length > 0) {
        liveFound = true;
        for (const m of liveMatches) {
          const home = map.get(m.home_team_id);
          const away = map.get(m.away_team_id);
          if (!home || !away) continue;

          home.played += 1;
          away.played += 1;
          home.goals_for += m.home_score!;
          home.goals_against += m.away_score!;
          away.goals_for += m.away_score!;
          away.goals_against += m.home_score!;
          home.goal_difference = home.goals_for - home.goals_against;
          away.goal_difference = away.goals_for - away.goals_against;
          home.live = true;
          away.live = true;

          if (m.home_score! > m.away_score!) {
            home.won += 1; home.points += 3;
            away.lost += 1;
          } else if (m.home_score! < m.away_score!) {
            away.won += 1; away.points += 3;
            home.lost += 1;
          } else {
            home.drawn += 1; home.points += 1;
            away.drawn += 1; away.points += 1;
          }
        }
      }
    }

    // Sort
    const sorted = Array.from(map.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
      return b.goals_for - a.goals_for;
    });

    setStandings(sorted);
    setHasLive(liveFound);
    setLoading(false);
  };

  useEffect(() => {
    fetchStandings();

    // Subscribe to match updates for live refresh
    const channel = supabase
      .channel('standings-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, () => fetchStandings())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_standings' }, () => fetchStandings())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const getRowStyle = (pos: number) => {
    if (pos <= 4) return 'bg-emerald-500/10 border-l-2 border-l-emerald-500';
    if (pos <= 12) return 'bg-primary/5 border-l-2 border-l-primary/50';
    return '';
  };

  return (
    <div className="container py-8 max-w-3xl space-y-6">
      <div className="card-sports p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-display font-bold text-foreground">Tabla de Posiciones</h1>
              <p className="text-xs text-muted-foreground">Liga MX · Clausura 2026</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasLive && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/10 border border-red-500/30">
                <Radio className="w-3 h-3 text-red-500 animate-pulse" />
                <span className="text-[10px] font-bold text-red-400 uppercase">En vivo</span>
              </div>
            )}
            <button
              onClick={fetchStandings}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Actualizar"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading && !standings.length ? (
          <div className="space-y-2">
            {Array.from({ length: 18 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : standings.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                    <th className="text-left py-3 px-2 w-8">#</th>
                    <th className="text-left py-3 px-2">Equipo</th>
                    <th className="text-center py-3 px-1 w-8">JJ</th>
                    <th className="text-center py-3 px-1 w-8">JG</th>
                    <th className="text-center py-3 px-1 w-8">JE</th>
                    <th className="text-center py-3 px-1 w-8">JP</th>
                    <th className="text-center py-3 px-1 w-8">GF</th>
                    <th className="text-center py-3 px-1 w-8">GC</th>
                    <th className="text-center py-3 px-1 w-10">DIF</th>
                    <th className="text-center py-3 px-2 w-10 font-bold">PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((entry, idx) => {
                    const pos = idx + 1;
                    return (
                      <tr
                        key={entry.team_id}
                        className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${getRowStyle(pos)}`}
                      >
                        <td className="py-3 px-2 font-bold text-muted-foreground">{pos}</td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            {entry.team_logo && (
                              <img src={entry.team_logo} alt="" className="w-6 h-6 object-contain" />
                            )}
                            <span className="font-medium text-foreground truncate">{entry.team_name}</span>
                            {entry.live && (
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" title="En vivo" />
                            )}
                          </div>
                        </td>
                        <td className="text-center py-3 px-1 text-muted-foreground">{entry.played}</td>
                        <td className="text-center py-3 px-1 text-muted-foreground">{entry.won}</td>
                        <td className="text-center py-3 px-1 text-muted-foreground">{entry.drawn}</td>
                        <td className="text-center py-3 px-1 text-muted-foreground">{entry.lost}</td>
                        <td className="text-center py-3 px-1 text-muted-foreground">{entry.goals_for}</td>
                        <td className="text-center py-3 px-1 text-muted-foreground">{entry.goals_against}</td>
                        <td className="text-center py-3 px-1">
                          <span className={`font-medium ${entry.goal_difference > 0 ? 'text-emerald-400' : entry.goal_difference < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                            {entry.goal_difference > 0 ? '+' : ''}{entry.goal_difference}
                          </span>
                        </td>
                        <td className="text-center py-3 px-2 font-display font-bold text-lg text-foreground">{entry.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-1">
              {standings.map((entry, idx) => {
                const pos = idx + 1;
                return (
                  <div
                    key={entry.team_id}
                    className={`flex items-center gap-3 p-3 rounded-lg ${getRowStyle(pos)} hover:bg-muted/20 transition-colors`}
                  >
                    <span className="w-6 text-center font-bold text-muted-foreground text-sm">{pos}</span>
                    {entry.team_logo && (
                      <img src={entry.team_logo} alt="" className="w-7 h-7 object-contain flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-foreground text-sm truncate">{entry.team_short}</p>
                        {entry.live && (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {entry.played}JJ · {entry.won}G {entry.drawn}E {entry.lost}P · GD:{entry.goal_difference > 0 ? '+' : ''}{entry.goal_difference}
                      </p>
                    </div>
                    <span className="font-display font-bold text-lg text-foreground w-8 text-center">{entry.points}</span>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-emerald-500/30 border border-emerald-500/50" />
                <span>Directo a Liguilla (1-4)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-primary/20 border border-primary/30" />
                <span>Play-in (5-12)</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
