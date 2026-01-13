import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, UserCheck, Calendar } from 'lucide-react';
import MatchCard from '@/components/MatchCard';
import { PredictionConfirmDialog } from '@/components/PredictionConfirmDialog';

interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string;
}

interface Team { 
  id: string; 
  name: string; 
  short_name: string; 
}

interface Matchday { 
  id: string; 
  name: string; 
  is_open: boolean; 
}

interface Match { 
  id: string; 
  home_team: Team; 
  away_team: Team; 
  match_date: string; 
  home_score: number | null; 
  away_score: number | null; 
  is_finished: boolean; 
}

interface Prediction { 
  match_id: string; 
  predicted_home_score: number; 
  predicted_away_score: number; 
  points_awarded?: number | null; 
}

export default function AdminDelegatePredictions() {
  const { toast } = useToast();
  
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [matchdays, setMatchdays] = useState<Matchday[]>([]);
  const [selectedMatchday, setSelectedMatchday] = useState<string>('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    const [profilesRes, matchdaysRes] = await Promise.all([
      supabase.from('profiles').select('id, user_id, display_name, email').order('display_name'),
      supabase.from('matchdays').select('*').order('name', { ascending: false })
    ]);

    if (profilesRes.data) {
      setProfiles(profilesRes.data as Profile[]);
    }
    
    if (matchdaysRes.data) {
      setMatchdays(matchdaysRes.data);
      // Select first open matchday
      const openMatchdays = matchdaysRes.data.filter(m => m.is_open);
      if (openMatchdays.length > 0) {
        setSelectedMatchday(openMatchdays[openMatchdays.length - 1].id);
      } else if (matchdaysRes.data[0]) {
        setSelectedMatchday(matchdaysRes.data[0].id);
      }
    }
    
    setLoading(false);
  };

  useEffect(() => {
    if (selectedMatchday) {
      fetchMatches();
    }
  }, [selectedMatchday]);

  useEffect(() => {
    if (selectedMatchday && selectedUserId) {
      fetchUserPredictions();
    } else {
      setPredictions({});
    }
  }, [selectedMatchday, selectedUserId]);

  const fetchMatches = async () => {
    const { data: matchesData } = await supabase
      .from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)')
      .eq('matchday_id', selectedMatchday)
      .order('match_date');

    if (matchesData) setMatches(matchesData);
  };

  const fetchUserPredictions = async () => {
    const matchIds = matches.map(m => m.id);
    if (matchIds.length === 0) return;

    const { data: predsData } = await supabase
      .from('predictions')
      .select('*')
      .eq('user_id', selectedUserId)
      .in('match_id', matchIds);

    if (predsData) {
      const predsMap: Record<string, Prediction> = {};
      predsData.forEach(p => { 
        predsMap[p.match_id] = p; 
      });
      setPredictions(predsMap);
    }
  };

  const handlePredictionChange = useCallback((matchId: string, homeScore: number, awayScore: number) => {
    setPredictions(prev => ({
      ...prev,
      [matchId]: { match_id: matchId, predicted_home_score: homeScore, predicted_away_score: awayScore }
    }));
  }, []);

  const savePredictions = async () => {
    if (!selectedUserId) {
      toast({ title: 'Error', description: 'Selecciona un usuario primero', variant: 'destructive' });
      return;
    }
    
    setSaving(true);
    
    const predsToSave = Object.values(predictions)
      .filter(p => p.predicted_home_score !== undefined && p.predicted_away_score !== undefined)
      .map(p => ({
        user_id: selectedUserId,
        match_id: p.match_id,
        predicted_home_score: p.predicted_home_score,
        predicted_away_score: p.predicted_away_score,
      }));

    if (predsToSave.length === 0) {
      toast({ title: 'Sin cambios', description: 'No hay predicciones que guardar', variant: 'default' });
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from('predictions')
      .upsert(predsToSave, { onConflict: 'user_id,match_id' });
    
    if (error) {
      toast({ title: 'Error', description: 'No se pudieron guardar las predicciones', variant: 'destructive' });
    } else {
      const selectedProfile = profiles.find(p => p.user_id === selectedUserId);
      toast({ 
        title: '¡Guardado!', 
        description: `Predicciones guardadas para ${selectedProfile?.display_name || selectedProfile?.email}` 
      });
    }
    setSaving(false);
  };

  const currentMatchday = matchdays.find(m => m.id === selectedMatchday);
  const isOpen = currentMatchday?.is_open ?? false;
  const selectedProfile = profiles.find(p => p.user_id === selectedUserId);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <UserCheck className="w-5 h-5 text-secondary" />
        <h3 className="font-display text-foreground">Capturar Predicciones por Otro Usuario</h3>
      </div>

      <div className="bg-muted/30 p-4 rounded-lg">
        <p className="text-sm text-muted-foreground">
          Aquí puedes capturar predicciones en nombre de otro usuario. 
          Útil para personas que no pueden acceder a la página directamente.
        </p>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Usuario</label>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="bg-input border-border">
              <SelectValue placeholder="Seleccionar usuario" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border max-h-60">
              {profiles.map(profile => (
                <SelectItem key={profile.user_id} value={profile.user_id}>
                  {profile.display_name || profile.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Jornada</label>
          <Select value={selectedMatchday} onValueChange={setSelectedMatchday}>
            <SelectTrigger className="bg-input border-border">
              <SelectValue placeholder="Seleccionar jornada" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              {matchdays.map(md => (
                <SelectItem key={md.id} value={md.id}>
                  {md.name} {md.is_open && '(Abierta)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Status indicator */}
      {selectedProfile && (
        <div className="flex items-center gap-2 p-3 bg-secondary/20 rounded-lg flex-wrap">
          <UserCheck className="w-5 h-5 text-secondary" />
          <span className="text-foreground font-medium">
            Capturando para: {selectedProfile.display_name || selectedProfile.email}
          </span>
          {!isOpen && (
            <span className="ml-auto text-amber-500 text-sm font-medium">(Jornada cerrada - modo admin)</span>
          )}
        </div>
      )}

      {/* Matches */}
      {!selectedUserId ? (
        <div className="card-sports p-8 text-center text-muted-foreground">
          <UserCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Selecciona un usuario para capturar sus predicciones</p>
        </div>
      ) : matches.length === 0 ? (
        <div className="card-sports p-8 text-center text-muted-foreground">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No hay partidos en esta jornada</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {matches.map(match => (
              <MatchCard
                key={match.id}
                match={match}
                prediction={predictions[match.id]}
                isOpen={true}
                onPredictionChange={handlePredictionChange}
                showResult={match.is_finished}
              />
            ))}
          </div>
          
          <Button 
            onClick={() => setConfirmOpen(true)} 
            disabled={saving || !selectedUserId} 
            className="w-full btn-hero"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Save className="w-5 h-5 mr-2" />
                Guardar Predicciones para {selectedProfile?.display_name || 'Usuario'}
              </>
            )}
          </Button>
          
          <PredictionConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            onConfirm={() => {
              setConfirmOpen(false);
              savePredictions();
            }}
            matches={matches}
            predictions={predictions}
            saving={saving}
          />
        </>
      )}
    </div>
  );
}
