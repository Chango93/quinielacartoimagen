import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Copy, Loader2, FileText, Trophy, Medal } from 'lucide-react';

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

export default function AdminPredictions() {
  const { toast } = useToast();
  const [matchdays, setMatchdays] = useState<Matchday[]>([]);
  const [selectedMatchday, setSelectedMatchday] = useState<string>('');
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMatchdays();
  }, []);

  useEffect(() => {
    if (selectedMatchday) {
      fetchPredictions();
      fetchMatchdayLeaderboard();
    }
  }, [selectedMatchday]);

  const fetchMatchdays = async () => {
    const { data } = await supabase.from('matchdays').select('*').order('start_date', { ascending: false });
    if (data) {
      setMatchdays(data);
      if (data[0]) setSelectedMatchday(data[0].id);
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
      setLeaderboard(data as LeaderboardEntry[]);
    }
  };

  const currentMatchday = matchdays.find(md => md.id === selectedMatchday);

  const exportCSV = () => {
    if (predictions.length === 0) return;
    
    const headers = ['Usuario', 'Partido', 'Predicción', 'Resultado Real', 'Puntos'];
    const rows = predictions.map(p => [
      p.display_name,
      `${p.home_team_name} vs ${p.away_team_name}`,
      `${p.predicted_home_score}-${p.predicted_away_score}`,
      p.is_finished ? `${p.home_score}-${p.away_score}` : 'Pendiente',
      p.points_awarded?.toString() || '-'
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `predicciones_${currentMatchday?.name || 'jornada'}.csv`;
    link.click();
    
    toast({ title: 'CSV exportado' });
  };

  const copyForWhatsApp = () => {
    if (predictions.length === 0) return;

    const matchdayName = currentMatchday?.name || 'Jornada';
    
    // Agrupar por usuario
    const byUser: Record<string, PredictionRow[]> = {};
    predictions.forEach(p => {
      if (!byUser[p.display_name]) byUser[p.display_name] = [];
      byUser[p.display_name].push(p);
    });

    // Calcular puntos por usuario
    const userPoints: { name: string; points: number; exact: number }[] = [];
    Object.entries(byUser).forEach(([name, preds]) => {
      const points = preds.reduce((sum, p) => sum + (p.points_awarded || 0), 0);
      const exact = preds.filter(p => p.points_awarded === 2).length;
      userPoints.push({ name, points, exact });
    });
    userPoints.sort((a, b) => b.points - a.points || b.exact - a.exact);

    let text = `🏆 *${matchdayName}* - Resultados\n\n`;
    text += `📊 *Leaderboard:*\n`;
    
    userPoints.forEach((u, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      text += `${medal} ${u.name}: ${u.points} pts`;
      if (u.exact > 0) text += ` (${u.exact} exactos)`;
      text += '\n';
    });

    text += `\n📋 *Predicciones:*\n`;
    Object.entries(byUser).forEach(([name, preds]) => {
      text += `\n👤 *${name}*\n`;
      preds.forEach(p => {
        const result = p.is_finished ? `✅ ${p.home_score}-${p.away_score}` : '⏳';
        const pts = p.points_awarded !== null ? `(${p.points_awarded}p)` : '';
        text += `• ${p.home_team_name} ${p.predicted_home_score}-${p.predicted_away_score} ${p.away_team_name} ${result} ${pts}\n`;
      });
    });

    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado al portapapeles', description: 'Listo para pegar en WhatsApp/Telegram' });
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Select value={selectedMatchday} onValueChange={setSelectedMatchday}>
          <SelectTrigger className="w-[200px] bg-input border-border">
            <SelectValue placeholder="Selecciona jornada" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border z-50">
            {matchdays.map(md => (
              <SelectItem key={md.id} value={md.id}>
                {md.name} {md.is_open ? '(Abierta)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Button onClick={exportCSV} variant="outline" disabled={predictions.length === 0}>
          <Download className="w-4 h-4 mr-2" />Exportar CSV
        </Button>
        <Button onClick={copyForWhatsApp} variant="outline" disabled={predictions.length === 0}>
          <Copy className="w-4 h-4 mr-2" />Copiar para WhatsApp
        </Button>
      </div>

      {/* Leaderboard de la jornada */}
      {leaderboard.length > 0 && (
        <div className="bg-muted/50 rounded-lg p-4">
          <h3 className="font-display text-foreground mb-3 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-secondary" />
            Leaderboard - {currentMatchday?.name}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {leaderboard.slice(0, 6).map((entry, i) => (
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
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-foreground">Usuario</TableHead>
                <TableHead className="text-foreground">Partido</TableHead>
                <TableHead className="text-foreground text-center">Predicción</TableHead>
                <TableHead className="text-foreground text-center">Resultado</TableHead>
                <TableHead className="text-foreground text-center">Puntos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {predictions.map(p => (
                <TableRow key={p.prediction_id} className="border-border">
                  <TableCell className="font-medium text-foreground">{p.display_name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.home_team_name} vs {p.away_team_name}
                  </TableCell>
                  <TableCell className="text-center font-mono text-foreground">
                    {p.predicted_home_score} - {p.predicted_away_score}
                  </TableCell>
                  <TableCell className="text-center font-mono text-muted-foreground">
                    {p.is_finished ? `${p.home_score} - ${p.away_score}` : '-'}
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
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No hay predicciones para esta jornada</p>
        </div>
      )}
    </div>
  );
}
