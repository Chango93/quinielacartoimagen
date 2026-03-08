import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Trophy, RefreshCw, Radio } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface StandingEntry {
  position: number;
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

export default function Posiciones() {
  const [standings, setStandings] = useState<StandingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [hasLive, setHasLive] = useState(false);

  const fetchStandings = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('fetch-standings');
      if (fnError) throw fnError;
      if (data?.standings) {
        setStandings(data.standings);
        setLastUpdated(new Date());
      } else {
        setError('No se pudieron obtener las posiciones');
      }
    } catch (err: any) {
      console.error('Error fetching standings:', err);
      setError('Error al cargar la tabla de posiciones');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStandings();
  }, []);

  // Top 4 qualify, 5-12 repechaje zone (Liga MX format)
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
          <button
            onClick={fetchStandings}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Actualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && (
          <div className="text-center py-8 text-muted-foreground">
            <p>{error}</p>
            <button onClick={fetchStandings} className="mt-2 text-primary text-sm hover:underline">
              Reintentar
            </button>
          </div>
        )}

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
                  {standings.map((entry) => (
                    <tr
                      key={entry.position}
                      className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${getRowStyle(entry.position)}`}
                    >
                      <td className="py-3 px-2 font-bold text-muted-foreground">{entry.position}</td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          {entry.team_badge && (
                            <img src={entry.team_badge} alt="" className="w-6 h-6 object-contain" />
                          )}
                          <span className="font-medium text-foreground truncate">{entry.team_name}</span>
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
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-1">
              {standings.map((entry) => (
                <div
                  key={entry.position}
                  className={`flex items-center gap-3 p-3 rounded-lg ${getRowStyle(entry.position)} hover:bg-muted/20 transition-colors`}
                >
                  <span className="w-6 text-center font-bold text-muted-foreground text-sm">{entry.position}</span>
                  {entry.team_badge && (
                    <img src={entry.team_badge} alt="" className="w-7 h-7 object-contain flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm truncate">{entry.team_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {entry.played}JJ · {entry.won}G {entry.drawn}E {entry.lost}P · GD:{entry.goal_difference > 0 ? '+' : ''}{entry.goal_difference}
                    </p>
                  </div>
                  <span className="font-display font-bold text-lg text-foreground w-8 text-center">{entry.points}</span>
                </div>
              ))}
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

            {lastUpdated && (
              <p className="text-[10px] text-muted-foreground/50 text-right mt-2">
                Actualizado: {lastUpdated.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
