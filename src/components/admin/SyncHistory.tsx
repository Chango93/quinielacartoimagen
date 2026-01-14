import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { RefreshCw, Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface SyncLog {
  id: string;
  timestamp: Date;
  message: string;
  type: 'update' | 'skip' | 'info' | 'error';
}

export default function SyncHistory() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      // Call the sync-results function to get latest sync and also fetch current match states
      const { data: matches } = await supabase
        .from('matches')
        .select(`
          id,
          home_score,
          away_score,
          is_finished,
          updated_at,
          home_team:teams!matches_home_team_id_fkey(short_name),
          away_team:teams!matches_away_team_id_fkey(short_name),
          matchday:matchdays!matches_matchday_id_fkey(is_current, name)
        `)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (matches) {
        const recentLogs: SyncLog[] = matches
          .filter((m: any) => m.matchday?.is_current)
          .map((m: any, i: number) => {
            const homeTeam = m.home_team?.short_name || 'Local';
            const awayTeam = m.away_team?.short_name || 'Visitante';
            const hasScore = m.home_score !== null && m.away_score !== null;
            
            let message = '';
            let type: SyncLog['type'] = 'info';
            
            if (m.is_finished) {
              message = `✓ ${homeTeam} ${m.home_score}-${m.away_score} ${awayTeam} (Finalizado)`;
              type = 'skip';
            } else if (hasScore) {
              message = `⚽ ${homeTeam} ${m.home_score}-${m.away_score} ${awayTeam} (En vivo)`;
              type = 'update';
            } else {
              message = `⏳ ${homeTeam} vs ${awayTeam} (Por comenzar)`;
              type = 'info';
            }
            
            return {
              id: m.id,
              timestamp: new Date(m.updated_at),
              message,
              type,
            };
          });
        
        setLogs(recentLogs);
      }
      setLastFetch(new Date());
    } catch (error) {
      console.error('Error fetching sync logs:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
    
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchLogs, 60000);
    return () => clearInterval(interval);
  }, []);

  const getTypeStyles = (type: SyncLog['type']) => {
    switch (type) {
      case 'update':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'skip':
        return 'bg-muted/50 text-muted-foreground border-border';
      case 'error':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
  };

  const getTypeIcon = (type: SyncLog['type']) => {
    switch (type) {
      case 'update':
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-secondary" />
          <h3 className="font-display text-foreground">Estado de Partidos (Jornada Actual)</h3>
        </div>
        <div className="flex items-center gap-3">
          {lastFetch && (
            <span className="text-xs text-muted-foreground">
              Actualizado: {format(lastFetch, 'HH:mm:ss', { locale: es })}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <div className="bg-muted/30 rounded-lg p-3 border border-border">
        <div className="flex items-center gap-2 mb-3 text-sm">
          <span className="px-2 py-1 rounded bg-primary/20 text-primary text-xs font-medium">
            Auto-sync: Cada 3 min
          </span>
          <span className="text-muted-foreground text-xs">
            • El backend sincroniza automáticamente partidos en progreso
          </span>
        </div>
        
        {loading && logs.length === 0 ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">
            No hay partidos en la jornada actual
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`flex items-center gap-3 p-2 rounded-lg border text-sm ${getTypeStyles(log.type)}`}
              >
                {getTypeIcon(log.type)}
                <span className="flex-1 font-mono text-xs">{log.message}</span>
                <span className="text-xs opacity-60">
                  {format(log.timestamp, 'HH:mm', { locale: es })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
