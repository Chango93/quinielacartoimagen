import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import MatchCard from '@/components/MatchCard';
import { PredictionConfirmDialog } from '@/components/PredictionConfirmDialog';
import CompetitionTypeSurvey from '@/components/CompetitionTypeSurvey';
import QuinielaProgress from '@/components/QuinielaProgress';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Loader2, Calendar, Cloud, CloudOff } from 'lucide-react';

const STORAGE_KEY = 'quiniela_draft_';
const AUTO_SAVE_DELAY = 2000; // 2 seconds debounce

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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedHashRef = useRef<string>('');
  const isInitialLoadRef = useRef(true);

  // Generate a hash of predictions for comparison
  const getPredictionsHash = useCallback((preds: Record<string, Prediction>) => {
    return JSON.stringify(
      Object.values(preds)
        .filter(p => p.predicted_home_score !== undefined && p.predicted_away_score !== undefined)
        .sort((a, b) => a.match_id.localeCompare(b.match_id))
        .map(p => `${p.match_id}:${p.predicted_home_score}-${p.predicted_away_score}`)
    );
  }, []);

  // Save draft to localStorage
  const saveDraftToLocal = useCallback((preds: Record<string, Prediction>, matchdayId: string) => {
    if (!user || !matchdayId) return;
    const key = `${STORAGE_KEY}${user.id}_${matchdayId}`;
    const draft = Object.values(preds).filter(
      p => p.predicted_home_score !== undefined && p.predicted_away_score !== undefined
    );
    if (draft.length > 0) {
      localStorage.setItem(key, JSON.stringify({ predictions: draft, timestamp: Date.now() }));
    }
  }, [user]);

  // Load draft from localStorage
  const loadDraftFromLocal = useCallback((matchdayId: string): Prediction[] | null => {
    if (!user || !matchdayId) return null;
    const key = `${STORAGE_KEY}${user.id}_${matchdayId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        // Check if draft is less than 24 hours old
        if (data.timestamp && Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
          return data.predictions;
        }
      } catch {
        // Ignore parse errors
      }
    }
    return null;
  }, [user]);

  // Clear draft from localStorage
  const clearDraftFromLocal = useCallback((matchdayId: string) => {
    if (!user || !matchdayId) return;
    const key = `${STORAGE_KEY}${user.id}_${matchdayId}`;
    localStorage.removeItem(key);
  }, [user]);

  // Auto-save to database
  const autoSaveToDatabase = useCallback(async (preds: Record<string, Prediction>) => {
    if (!user) return;
    
    const currentHash = getPredictionsHash(preds);
    if (currentHash === lastSavedHashRef.current) return; // No changes
    
    setAutoSaveStatus('saving');
    
    const predsToSave = Object.values(preds).filter(p => 
      p.predicted_home_score !== undefined && p.predicted_away_score !== undefined
    ).map(p => ({
      user_id: user.id,
      match_id: p.match_id,
      predicted_home_score: p.predicted_home_score,
      predicted_away_score: p.predicted_away_score,
    }));

    if (predsToSave.length === 0) {
      setAutoSaveStatus('idle');
      return;
    }

    const { error } = await supabase.from('predictions').upsert(predsToSave, { onConflict: 'user_id,match_id' });
    
    if (error) {
      setAutoSaveStatus('error');
      // Keep local draft as backup
    } else {
      lastSavedHashRef.current = currentHash;
      setAutoSaveStatus('saved');
      clearDraftFromLocal(selectedMatchday);
      // Reset to idle after 3 seconds
      setTimeout(() => setAutoSaveStatus('idle'), 3000);
    }
  }, [user, selectedMatchday, getPredictionsHash, clearDraftFromLocal]);

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
      const openMatchdays = data.filter(m => m.is_open);
      const lastOpen = openMatchdays.length > 0 ? openMatchdays[openMatchdays.length - 1] : null;
      if (lastOpen) setSelectedMatchday(lastOpen.id);
      else if (data[0]) setSelectedMatchday(data[0].id);
    }
    setLoadingData(false);
  };

  useEffect(() => {
    if (selectedMatchday && user) {
      isInitialLoadRef.current = true;
      fetchMatchesAndPredictions();
    }
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

    let predsMap: Record<string, Prediction> = {};
    
    if (predsData) {
      predsData.forEach(p => { predsMap[p.match_id] = p; });
    }
    
    // Check for local draft and merge if newer data exists
    const localDraft = loadDraftFromLocal(selectedMatchday);
    if (localDraft && localDraft.length > 0) {
      // Merge local draft with server data (local takes priority for open matchday)
      const currentMatchday = matchdays.find(m => m.id === selectedMatchday);
      if (currentMatchday?.is_open) {
        localDraft.forEach(p => {
          // Only apply draft if it has values
          if (p.predicted_home_score !== undefined && p.predicted_away_score !== undefined) {
            predsMap[p.match_id] = p;
          }
        });
        toast({ 
          title: 'Borrador recuperado', 
          description: 'Se restauraron tus predicciones sin guardar',
        });
      }
    }
    
    setPredictions(predsMap);
    lastSavedHashRef.current = getPredictionsHash(predsMap);
    setLoadingData(false);
    
    // Mark initial load complete after a short delay
    setTimeout(() => {
      isInitialLoadRef.current = false;
    }, 500);
  };

  // Auto-save effect with debounce
  useEffect(() => {
    const currentMatchday = matchdays.find(m => m.id === selectedMatchday);
    if (!currentMatchday?.is_open || isInitialLoadRef.current) return;
    
    // Save to localStorage immediately
    saveDraftToLocal(predictions, selectedMatchday);
    
    // Debounce database save
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSaveToDatabase(predictions);
    }, AUTO_SAVE_DELAY);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [predictions, selectedMatchday, matchdays, saveDraftToLocal, autoSaveToDatabase]);

  // Save before page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveDraftToLocal(predictions, selectedMatchday);
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        saveDraftToLocal(predictions, selectedMatchday);
      }
    });
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [predictions, selectedMatchday, saveDraftToLocal]);

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
      lastSavedHashRef.current = getPredictionsHash(predictions);
      clearDraftFromLocal(selectedMatchday);
      toast({ title: '¡Guardado!', description: 'Tus predicciones han sido guardadas' });
    }
    setSaving(false);
  };

  const currentMatchday = matchdays.find(m => m.id === selectedMatchday);
  const isOpen = currentMatchday?.is_open ?? false;

  const completedPredictions = useMemo(() => {
    return Object.values(predictions).filter(
      p => p.predicted_home_score !== undefined && 
           p.predicted_away_score !== undefined &&
           p.predicted_home_score !== null &&
           p.predicted_away_score !== null
    ).length;
  }, [predictions]);

  const getAutoSaveIndicator = () => {
    if (!isOpen) return null;
    
    switch (autoSaveStatus) {
      case 'saving':
        return (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Guardando...</span>
          </div>
        );
      case 'saved':
        return (
          <div className="flex items-center gap-1.5 text-xs text-primary">
            <Cloud className="w-3 h-3" />
            <span>Guardado</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <CloudOff className="w-3 h-3" />
            <span>Error al guardar</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/50">
            <Cloud className="w-3 h-3" />
            <span>Auto-guardado activo</span>
          </div>
        );
    }
  };

  if (loading || loadingData) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="container py-8 max-w-3xl">
      <CompetitionTypeSurvey />
      <div className="card-sports p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-secondary" />
            <h1 className="text-2xl font-display text-foreground">Mi Quiniela</h1>
          </div>
          <div className="flex items-center gap-3">
            {getAutoSaveIndicator()}
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
      </div>

      {matches.length === 0 ? (
        <div className="card-sports p-8 text-center text-muted-foreground">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No hay partidos en esta jornada</p>
        </div>
      ) : (
        <>
          <QuinielaProgress 
            total={matches.length}
            completed={completedPredictions}
            isOpen={isOpen}
          />
          
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
            <>
              <Button onClick={() => setConfirmOpen(true)} disabled={saving} className="w-full btn-hero">
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-2" />Guardar Quiniela</>}
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
        </>
      )}
    </div>
  );
}
