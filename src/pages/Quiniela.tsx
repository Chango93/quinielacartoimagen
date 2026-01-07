import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import MatchCard from '@/components/MatchCard';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Loader2, Calendar } from 'lucide-react';

interface Team { id: string; name: string; short_name: string; }
interface Matchday { id: string; name: string; is_open: boolean; }
interface Match { id: string; home_team: Team; away_team: Team; match_date: string; home_score: number | null; away_score: number | null; is_finished: boolean; }
interface Prediction { match_id: string; predicted_home_score: number; predicted_away_score: number; points_awarded?: number | null; }

export default function Quiniela() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [matchdays, setMatchdays] = useState<Matchday[]>([]);
  const [selectedMatchday, setSelectedMatchday] = useState<string>('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate('/auth');
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) fetchMatchdays();
  }, [user]);

  const fetchMatchdays = async () => {
    const { data } = await supabase.from('matchdays').select('*').order('start_date', { ascending: false });
    if (data) {
      setMatchdays(data);
      const open = data.find(m => m.is_open);
      if (open) setSelectedMatchday(open.id);
      else if (data[0]) setSelectedMatchday(data[0].id);
    }
    setLoadingData(false);
  };

  useEffect(() => {
    if (selectedMatchday && user) fetchMatchesAndPredictions();
  }, [selectedMatchday, user]);

  const fetchMatchesAndPredictions = async () => {
    setLoadingData(true);
    const { data: matchesData } = await supabase
      .from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)')
      .eq('matchday_id', selectedMatchday)
      .order('match_date');

    if (matchesData) setMatches(matchesData);

    const { data: predsData } = await supabase
      .from('predictions')
      .select('*')
      .eq('user_id', user!.id)
      .in('match_id', matchesData?.map(m => m.id) || []);

    if (predsData) {
      const predsMap: Record<string, Prediction> = {};
      predsData.forEach(p => { predsMap[p.match_id] = p; });
      setPredictions(predsMap);
    }
    setLoadingData(false);
  };

  const handlePredictionChange = useCallback((matchId: string, homeScore: number, awayScore: number) => {
    setPredictions(prev => ({
      ...prev,
      [matchId]: { match_id: matchId, predicted_home_score: homeScore, predicted_away_score: awayScore }
    }));
  }, []);

  const savePredictions = async () => {
    if (!user) return;
    setSaving(true);
    
    const predsToSave = Object.values(predictions).filter(p => 
      p.predicted_home_score !== undefined && p.predicted_away_score !== undefined
    ).map(p => ({
      user_id: user.id,
      match_id: p.match_id,
      predicted_home_score: p.predicted_home_score,
      predicted_away_score: p.predicted_away_score,
    }));

    const { error } = await supabase.from('predictions').upsert(predsToSave, { onConflict: 'user_id,match_id' });
    
    if (error) {
      toast({ title: 'Error', description: 'No se pudieron guardar las predicciones', variant: 'destructive' });
    } else {
      toast({ title: '¡Guardado!', description: 'Tus predicciones han sido guardadas' });
    }
    setSaving(false);
  };

  const currentMatchday = matchdays.find(m => m.id === selectedMatchday);
  const isOpen = currentMatchday?.is_open ?? false;

  if (loading || loadingData) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="container py-8 max-w-3xl">
      <div className="card-sports p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-secondary" />
            <h1 className="text-2xl font-display text-foreground">Mi Quiniela</h1>
          </div>
          <Select value={selectedMatchday} onValueChange={setSelectedMatchday}>
            <SelectTrigger className="w-48 bg-input border-border">
              <SelectValue placeholder="Seleccionar jornada" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              {matchdays.map(md => (
                <SelectItem key={md.id} value={md.id}>{md.name} {md.is_open && '(Abierta)'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="card-sports p-8 text-center text-muted-foreground">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No hay partidos en esta jornada</p>
        </div>
      ) : (
        <>
          <div className="space-y-4 mb-6">
            {matches.map(match => (
              <MatchCard
                key={match.id}
                match={match}
                prediction={predictions[match.id]}
                isOpen={isOpen}
                onPredictionChange={handlePredictionChange}
                showResult={match.is_finished}
              />
            ))}
          </div>
          {isOpen && (
            <Button onClick={savePredictions} disabled={saving} className="w-full btn-hero">
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-2" />Guardar Quiniela</>}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
