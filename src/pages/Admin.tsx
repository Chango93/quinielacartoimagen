import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Calendar, Trophy, Users, Plus, Save, Loader2, RefreshCw } from 'lucide-react';

interface Team { id: string; name: string; short_name: string; }
interface Matchday { id: string; name: string; start_date: string; is_open: boolean; }
interface Match { id: string; matchday_id: string; home_team_id: string; away_team_id: string; match_date: string; home_score: number | null; away_score: number | null; is_finished: boolean; home_team?: Team; away_team?: Team; }

export default function Admin() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [teams, setTeams] = useState<Team[]>([]);
  const [matchdays, setMatchdays] = useState<Matchday[]>([]);
  const [selectedMatchday, setSelectedMatchday] = useState<string>('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);

  // Nueva jornada
  const [newMatchdayName, setNewMatchdayName] = useState('');
  
  // Nuevo partido
  const [newHomeTeam, setNewHomeTeam] = useState('');
  const [newAwayTeam, setNewAwayTeam] = useState('');
  const [newMatchDate, setNewMatchDate] = useState('');

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate('/');
  }, [user, isAdmin, loading, navigate]);

  useEffect(() => {
    if (isAdmin) { fetchTeams(); fetchMatchdays(); }
  }, [isAdmin]);

  const fetchTeams = async () => {
    const { data } = await supabase.from('teams').select('*').order('name');
    if (data) setTeams(data);
  };

  const fetchMatchdays = async () => {
    const { data } = await supabase.from('matchdays').select('*').order('start_date', { ascending: false });
    if (data) { setMatchdays(data); if (data[0]) setSelectedMatchday(data[0].id); }
    setLoadingData(false);
  };

  useEffect(() => {
    if (selectedMatchday) fetchMatches();
  }, [selectedMatchday]);

  const fetchMatches = async () => {
    const { data } = await supabase.from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)')
      .eq('matchday_id', selectedMatchday).order('match_date');
    if (data) setMatches(data);
  };

  const createMatchday = async () => {
    if (!newMatchdayName) return;
    const { error } = await supabase.from('matchdays').insert({ name: newMatchdayName, start_date: new Date().toISOString() });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Jornada creada' }); setNewMatchdayName(''); fetchMatchdays(); }
  };

  const toggleMatchdayOpen = async (id: string, isOpen: boolean) => {
    await supabase.from('matchdays').update({ is_open: !isOpen }).eq('id', id);
    fetchMatchdays();
  };

  const addMatch = async () => {
    if (!newHomeTeam || !newAwayTeam || !newMatchDate || !selectedMatchday) return;
    const { error } = await supabase.from('matches').insert({
      matchday_id: selectedMatchday, home_team_id: newHomeTeam, away_team_id: newAwayTeam, match_date: newMatchDate
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Partido agregado' }); setNewHomeTeam(''); setNewAwayTeam(''); setNewMatchDate(''); fetchMatches(); }
  };

  const updateResult = async (matchId: string, homeScore: number | null, awayScore: number | null) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, home_score: homeScore, away_score: awayScore } : m));
  };

  const saveResults = async () => {
    setSaving(true);
    for (const match of matches) {
      if (match.home_score !== null && match.away_score !== null) {
        await supabase.from('matches').update({ home_score: match.home_score, away_score: match.away_score, is_finished: true }).eq('id', match.id);
      }
    }
    await supabase.rpc('recalculate_matchday_points', { p_matchday_id: selectedMatchday });
    toast({ title: '¡Guardado!', description: 'Resultados guardados y puntos calculados' });
    setSaving(false);
    fetchMatches();
  };

  if (loading || loadingData) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="container py-8">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="w-6 h-6 text-secondary" />
        <h1 className="text-3xl font-display text-foreground">Panel de Administrador</h1>
      </div>

      <Tabs defaultValue="matchdays" className="space-y-6">
        <TabsList className="bg-muted">
          <TabsTrigger value="matchdays"><Calendar className="w-4 h-4 mr-2" />Jornadas</TabsTrigger>
          <TabsTrigger value="matches"><Trophy className="w-4 h-4 mr-2" />Partidos</TabsTrigger>
          <TabsTrigger value="results"><RefreshCw className="w-4 h-4 mr-2" />Resultados</TabsTrigger>
        </TabsList>

        <TabsContent value="matchdays" className="card-sports p-6 space-y-4">
          <div className="flex gap-2">
            <Input placeholder="Nombre (ej: Jornada 5)" value={newMatchdayName} onChange={e => setNewMatchdayName(e.target.value)} className="input-sports" />
            <Button onClick={createMatchday} className="btn-hero"><Plus className="w-4 h-4 mr-2" />Crear</Button>
          </div>
          <div className="space-y-2">
            {matchdays.map(md => (
              <div key={md.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="font-medium text-foreground">{md.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{md.is_open ? 'Abierta' : 'Cerrada'}</span>
                  <Switch checked={md.is_open} onCheckedChange={() => toggleMatchdayOpen(md.id, md.is_open)} />
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="matches" className="card-sports p-6 space-y-4">
          <Select value={selectedMatchday} onValueChange={setSelectedMatchday}>
            <SelectTrigger className="bg-input border-border"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover border-border">
              {matchdays.map(md => <SelectItem key={md.id} value={md.id}>{md.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <Select value={newHomeTeam} onValueChange={setNewHomeTeam}>
              <SelectTrigger className="bg-input border-border"><SelectValue placeholder="Local" /></SelectTrigger>
              <SelectContent className="bg-popover border-border">{teams.map(t => <SelectItem key={t.id} value={t.id}>{t.short_name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={newAwayTeam} onValueChange={setNewAwayTeam}>
              <SelectTrigger className="bg-input border-border"><SelectValue placeholder="Visitante" /></SelectTrigger>
              <SelectContent className="bg-popover border-border">{teams.map(t => <SelectItem key={t.id} value={t.id}>{t.short_name}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="datetime-local" value={newMatchDate} onChange={e => setNewMatchDate(e.target.value)} className="input-sports" />
            <Button onClick={addMatch} className="btn-hero"><Plus className="w-4 h-4 mr-2" />Agregar</Button>
          </div>
          <div className="space-y-2">
            {matches.map(m => (
              <div key={m.id} className="p-3 bg-muted/50 rounded-lg flex justify-between items-center">
                <span className="text-foreground">{m.home_team?.short_name} vs {m.away_team?.short_name}</span>
                <span className="text-muted-foreground text-sm">{new Date(m.match_date).toLocaleString('es-MX')}</span>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="results" className="card-sports p-6 space-y-4">
          <Select value={selectedMatchday} onValueChange={setSelectedMatchday}>
            <SelectTrigger className="bg-input border-border"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover border-border">{matchdays.map(md => <SelectItem key={md.id} value={md.id}>{md.name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="space-y-3">
            {matches.map(m => (
              <div key={m.id} className="p-4 bg-muted/50 rounded-lg flex items-center justify-between gap-4">
                <span className="text-foreground flex-1">{m.home_team?.short_name}</span>
                <Input type="number" min="0" value={m.home_score ?? ''} onChange={e => updateResult(m.id, e.target.value ? parseInt(e.target.value) : null, m.away_score)} className="w-16 text-center input-sports" />
                <span className="text-muted-foreground">-</span>
                <Input type="number" min="0" value={m.away_score ?? ''} onChange={e => updateResult(m.id, m.home_score, e.target.value ? parseInt(e.target.value) : null)} className="w-16 text-center input-sports" />
                <span className="text-foreground flex-1 text-right">{m.away_team?.short_name}</span>
              </div>
            ))}
          </div>
          <Button onClick={saveResults} disabled={saving} className="w-full btn-gold">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-2" />Guardar y Recalcular Puntos</>}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
