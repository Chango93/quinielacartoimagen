import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, History, Clock, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Matchday {
  id: string;
  name: string;
  start_date: string;
}

interface PredictionLogEntry {
  user_id: string;
  display_name: string;
  match_id: string;
  home_team_name: string;
  away_team_name: string;
  predicted_home_score: number;
  predicted_away_score: number;
  created_at: string;
  updated_at: string;
  was_modified: boolean;
}

export default function AdminPredictionLog() {
  const [matchdays, setMatchdays] = useState<Matchday[]>([]);
  const [selectedMatchday, setSelectedMatchday] = useState('');
  const [entries, setEntries] = useState<PredictionLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMatchdays, setLoadingMatchdays] = useState(true);

  useEffect(() => {
    fetchMatchdays();
  }, []);

  useEffect(() => {
    if (selectedMatchday) fetchLog();
  }, [selectedMatchday]);

  const fetchMatchdays = async () => {
    const { data } = await supabase
      .from('matchdays')
      .select('id, name, start_date')
      .order('start_date', { ascending: false });
    if (data) {
      setMatchdays(data);
      const current = data[0];
      if (current) setSelectedMatchday(current.id);
    }
    setLoadingMatchdays(false);
  };

  const fetchLog = async () => {
    setLoading(true);

    // Get matches for this matchday
    const { data: matches } = await supabase
      .from('matches')
      .select('id, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)')
      .eq('matchday_id', selectedMatchday);

    if (!matches) { setLoading(false); return; }

    const matchIds = matches.map(m => m.id);
    const matchMap = new Map(matches.map(m => [m.id, {
      home: (m.home_team as any)?.name || 'Local',
      away: (m.away_team as any)?.name || 'Visitante',
    }]));

    // Get all predictions for these matches (admin can see all)
    const { data: predictions } = await supabase
      .from('predictions')
      .select('user_id, match_id, predicted_home_score, predicted_away_score, created_at, updated_at')
      .in('match_id', matchIds);

    if (!predictions) { setLoading(false); return; }

    // Get profiles for display names
    const userIds = [...new Set(predictions.map(p => p.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', userIds);

    const profileMap = new Map(profiles?.map(p => [p.user_id, p.display_name || 'Usuario']) || []);

    const logEntries: PredictionLogEntry[] = predictions.map(p => {
      const matchInfo = matchMap.get(p.match_id);
      return {
        user_id: p.user_id,
        display_name: profileMap.get(p.user_id) || 'Usuario',
        match_id: p.match_id,
        home_team_name: matchInfo?.home || 'Local',
        away_team_name: matchInfo?.away || 'Visitante',
        predicted_home_score: p.predicted_home_score,
        predicted_away_score: p.predicted_away_score,
        created_at: p.created_at,
        updated_at: p.updated_at,
        was_modified: p.created_at !== p.updated_at,
      };
    });

    // Sort by most recent activity (updated_at descending)
    logEntries.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    setEntries(logEntries);
    setLoading(false);
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "d MMM, HH:mm", { locale: es });
    } catch {
      return dateStr;
    }
  };

  // Group by user for summary view
  const userSummary = Array.from(
    entries.reduce((map, entry) => {
      const existing = map.get(entry.user_id);
      if (!existing) {
        map.set(entry.user_id, {
          display_name: entry.display_name,
          predictions: 1,
          modifications: entry.was_modified ? 1 : 0,
          firstActivity: entry.created_at,
          lastActivity: entry.updated_at,
        });
      } else {
        existing.predictions++;
        if (entry.was_modified) existing.modifications++;
        if (new Date(entry.created_at) < new Date(existing.firstActivity)) {
          existing.firstActivity = entry.created_at;
        }
        if (new Date(entry.updated_at) > new Date(existing.lastActivity)) {
          existing.lastActivity = entry.updated_at;
        }
      }
      return map;
    }, new Map<string, { display_name: string; predictions: number; modifications: number; firstActivity: string; lastActivity: string }>())
  ).sort((a, b) => new Date(b[1].lastActivity).getTime() - new Date(a[1].lastActivity).getTime());

  if (loadingMatchdays) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <History className="w-5 h-5 text-secondary" />
        <h2 className="text-xl font-display text-foreground">Log de Predicciones</h2>
      </div>

      <Select value={selectedMatchday} onValueChange={setSelectedMatchday}>
        <SelectTrigger className="input-sports w-full md:w-64">
          <SelectValue placeholder="Seleccionar jornada" />
        </SelectTrigger>
        <SelectContent>
          {matchdays.map(md => (
            <SelectItem key={md.id} value={md.id}>{md.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">Sin predicciones registradas</p>
      ) : (
        <div className="space-y-6">
          {/* Resumen por usuario */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Resumen por usuario</h3>
            <div className="space-y-1">
              {userSummary.map(([userId, info]) => (
                <div key={userId} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-medium text-foreground truncate">{info.display_name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {info.predictions} pred.
                    </span>
                    {info.modifications > 0 && (
                      <span className="flex items-center gap-1 text-xs text-yellow-500 shrink-0">
                        <Pencil className="w-3 h-3" />
                        {info.modifications} edit.
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {formatDate(info.firstActivity)}
                    </div>
                    {info.firstActivity !== info.lastActivity && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Pencil className="w-3 h-3" />
                        {formatDate(info.lastActivity)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detalle cronológico */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Actividad cronológica</h3>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {entries.map((entry, idx) => (
                <div key={`${entry.user_id}-${entry.match_id}-${idx}`} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 text-sm">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {entry.was_modified ? (
                      <Pencil className="w-3 h-3 text-yellow-500 shrink-0" />
                    ) : (
                      <Clock className="w-3 h-3 text-green-500 shrink-0" />
                    )}
                    <span className="font-medium text-foreground truncate">{entry.display_name}</span>
                    <span className="text-muted-foreground truncate hidden sm:inline">
                      {entry.home_team_name} vs {entry.away_team_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className="font-mono text-foreground">{entry.predicted_home_score}-{entry.predicted_away_score}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(entry.updated_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
