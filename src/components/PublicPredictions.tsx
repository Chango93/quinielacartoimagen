import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, FileText, Trophy, Users } from 'lucide-react';

interface Matchday { id: string; name: string; is_open: boolean; }

interface PredictionRow {
  prediction_id: string;
  user_id: string;
  display_name: string;
  match_id: string;
  home_team_name: string;
  away_team_name: string;
  predicted_home_score: number;
  predicted_away_score: number;
  home_score: number | null;
  away_score: number | null;
  points_awarded: number | null;
  is_finished: boolean;
}

interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  total_points: number;
  exact_results: number;
  total_predictions: number;
}

export default function PublicPredictions() {
  const [matchdays, setMatchdays] = useState<Matchday[]>([]);
  const [selectedMatchday, setSelectedMatchday] = useState<string>('');
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClosedMatchdays();
  }, []);

  useEffect(() => {
    if (selectedMatchday) {
      fetchPredictions();
      fetchMatchdayLeaderboard();
    }
  }, [selectedMatchday]);

  const fetchClosedMatchdays = async () => {
    // Solo traer jornadas cerradas (is_open = false)
    const { data } = await supabase
      .from('matchdays')
      .select('*')
      .eq('is_open', false)
      .order('start_date', { ascending: false });
    
    if (data && data.length > 0) {
      setMatchdays(data);
      // Priorizar jornada marcada como vigente (is_current), si está cerrada
      const currentMatchday = data.find(m => m.is_current);
      const selected = currentMatchday || data[0];
      setSelectedMatchday(selected.id);
    }
    setLoading(false);
  };

  const fetchPredictions = async () => {
    const { data, error } = await supabase.rpc('get_matchday_predictions', { p_matchday_id: selectedMatchday });
    if (!error && data) {
      setPredictions(data as PredictionRow[]);
    }
  };

  const fetchMatchdayLeaderboard = async () => {
    const { data, error } = await supabase.rpc('get_matchday_leaderboard', { p_matchday_id: selectedMatchday });
    if (!error && data) {
      // Solo mostrar usuarios con predicciones
      const withPredictions = (data as LeaderboardEntry[]).filter(e => e.total_predictions > 0);
      setLeaderboard(withPredictions);
    }
  };

  const currentMatchday = matchdays.find(md => md.id === selectedMatchday);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (matchdays.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No hay jornadas cerradas para mostrar</p>
        <p className="text-sm mt-2">Las predicciones se muestran cuando la jornada cierra</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Users className="w-5 h-5 text-secondary" />
        <h2 className="text-xl font-display text-foreground">Predicciones de Todos</h2>
      </div>

      <Select value={selectedMatchday} onValueChange={setSelectedMatchday}>
        <SelectTrigger className="w-full bg-input border-border">
          <SelectValue placeholder="Selecciona jornada" />
        </SelectTrigger>
        <SelectContent className="bg-popover border-border z-50">
          {matchdays.map(md => (
            <SelectItem key={md.id} value={md.id}>
              {md.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Leaderboard de la jornada */}
      {leaderboard.length > 0 && (
        <div className="bg-muted/50 rounded-lg p-4">
          <h3 className="font-display text-foreground mb-3 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-secondary" />
            Leaderboard - {currentMatchday?.name}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {leaderboard.map((entry, i) => (
              <div key={entry.user_id} className="flex items-center gap-3 p-2 bg-background/50 rounded-lg">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  i === 0 ? 'bg-yellow-500 text-black' : 
                  i === 1 ? 'bg-gray-400 text-black' : 
                  i === 2 ? 'bg-orange-600 text-white' : 
                  'bg-muted text-muted-foreground'
                }`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{entry.display_name}</p>
                  <p className="text-xs text-muted-foreground">{entry.exact_results} exactos</p>
                </div>
                <span className="font-display text-secondary text-lg">{entry.total_points}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla de predicciones */}
      {predictions.length > 0 ? (
        <div className="rounded-lg border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-foreground">Usuario</TableHead>
                <TableHead className="text-foreground">Partido</TableHead>
                <TableHead className="text-foreground text-center">Predicción</TableHead>
                <TableHead className="text-foreground text-center">Resultado</TableHead>
                <TableHead className="text-foreground text-center">Pts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {predictions.map(p => (
                <TableRow key={p.prediction_id} className="border-border">
                  <TableCell className="font-medium text-foreground">{p.display_name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {p.home_team_name} vs {p.away_team_name}
                  </TableCell>
                  <TableCell className="text-center font-mono text-foreground">
                    {p.predicted_home_score}-{p.predicted_away_score}
                  </TableCell>
                  <TableCell className="text-center font-mono text-muted-foreground">
                    {p.is_finished ? `${p.home_score}-${p.away_score}` : '-'}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`px-2 py-1 rounded text-sm font-bold ${
                      p.points_awarded === 2 ? 'bg-green-500/20 text-green-400' :
                      p.points_awarded === 1 ? 'bg-yellow-500/20 text-yellow-400' :
                      p.points_awarded === 0 ? 'bg-red-500/20 text-red-400' :
                      'text-muted-foreground'
                    }`}>
                      {p.points_awarded !== null ? p.points_awarded : '-'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No hay predicciones para esta jornada</p>
        </div>
      )}
    </div>
  );
}
