import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getSafeErrorMessage } from '@/lib/errorUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Settings, Calendar, Trophy, Users, Plus, Save, Loader2, RefreshCw, Trash2, Pencil, Upload, Shield, FileText, Zap, CloudDownload, RotateCcw, Clock } from 'lucide-react';
import AdminPredictions from '@/components/admin/AdminPredictions';
import AdminUsers from '@/components/admin/AdminUsers';
import AdminQuickMatches from '@/components/admin/AdminQuickMatches';
import MatchdayChampions from '@/components/admin/MatchdayChampions';

interface Team { id: string; name: string; short_name: string; logo_url?: string | null; }
interface Matchday { id: string; name: string; start_date: string; end_date: string | null; is_open: boolean; }
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
  const [syncing, setSyncing] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Nueva jornada
  const [newMatchdayName, setNewMatchdayName] = useState('');
  const [editingMatchday, setEditingMatchday] = useState<Matchday | null>(null);
  
  // Nuevo partido
  const [newHomeTeam, setNewHomeTeam] = useState('');
  const [newAwayTeam, setNewAwayTeam] = useState('');
  const [newMatchDate, setNewMatchDate] = useState('');
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);

  // Editar equipo
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Helper para formatear fecha de forma segura para datetime-local input
  const formatDateForInput = (dateString: string | undefined): string => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      // Ajustar a timezone local para el input
      const offset = date.getTimezoneOffset();
      const localDate = new Date(date.getTime() - offset * 60 * 1000);
      return localDate.toISOString().slice(0, 16);
    } catch {
      return '';
    }
  };

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

  // === JORNADAS ===
  const createMatchday = async () => {
    if (!newMatchdayName) return;
    const { error } = await supabase.from('matchdays').insert({ name: newMatchdayName, start_date: new Date().toISOString() });
    if (error) {
      console.error('Database error:', error);
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    }
    else { toast({ title: 'Jornada creada' }); setNewMatchdayName(''); fetchMatchdays(); }
  };

  const updateMatchday = async () => {
    if (!editingMatchday) return;
    const updateData: { name: string; end_date?: string | null } = { name: editingMatchday.name };
    if (editingMatchday.end_date) {
      updateData.end_date = new Date(editingMatchday.end_date).toISOString();
    } else {
      updateData.end_date = null;
    }
    const { error } = await supabase.from('matchdays').update(updateData).eq('id', editingMatchday.id);
    if (error) {
      console.error('Database error:', error);
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    }
    else { toast({ title: 'Jornada actualizada' }); setEditingMatchday(null); fetchMatchdays(); }
  };

  const deleteMatchday = async (id: string) => {
    if (!confirm('¿Eliminar esta jornada y todos sus partidos?')) return;
    const { error } = await supabase.from('matchdays').delete().eq('id', id);
    if (error) {
      console.error('Database error:', error);
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    }
    else { toast({ title: 'Jornada eliminada' }); fetchMatchdays(); }
  };

  const toggleMatchdayOpen = async (id: string, isOpen: boolean) => {
    await supabase.from('matchdays').update({ is_open: !isOpen }).eq('id', id);
    fetchMatchdays();
  };

  const resetMatchdayResults = async () => {
    if (!selectedMatchday) return;
    if (!confirm('¿Resetear TODOS los resultados y puntos de esta jornada? Los partidos volverán a estar sin resultado.')) return;
    
    setResetting(true);
    try {
      // Reset all matches in the matchday
      const { error: matchError } = await supabase
        .from('matches')
        .update({ home_score: null, away_score: null, is_finished: false })
        .eq('matchday_id', selectedMatchday);
      
      if (matchError) throw matchError;

      // Reset all predictions points for this matchday
      await supabase.rpc('recalculate_matchday_points', { p_matchday_id: selectedMatchday });
      
      toast({ title: 'Jornada reseteada', description: 'Resultados y puntos eliminados' });
      fetchMatches();
    } catch (error) {
      console.error('Reset error:', error);
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    }
    setResetting(false);
  };

  // === PARTIDOS ===
  const addMatch = async () => {
    if (!newHomeTeam || !newAwayTeam || !newMatchDate || !selectedMatchday) return;
    // Convertir datetime-local a ISO con timezone local
    const matchDateISO = new Date(newMatchDate).toISOString();
    const { error } = await supabase.from('matches').insert({
      matchday_id: selectedMatchday, home_team_id: newHomeTeam, away_team_id: newAwayTeam, match_date: matchDateISO
    });
    if (error) {
      console.error('Database error:', error);
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    }
    else { toast({ title: 'Partido agregado' }); setNewHomeTeam(''); setNewAwayTeam(''); setNewMatchDate(''); fetchMatches(); }
  };

  const updateMatch = async () => {
    if (!editingMatch) return;
    // Convertir datetime-local a ISO con timezone local
    const matchDateISO = new Date(editingMatch.match_date).toISOString();
    const { error } = await supabase.from('matches').update({
      home_team_id: editingMatch.home_team_id,
      away_team_id: editingMatch.away_team_id,
      match_date: matchDateISO
    }).eq('id', editingMatch.id);
    if (error) {
      console.error('Database error:', error);
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    }
    else { toast({ title: 'Partido actualizado' }); setEditingMatch(null); fetchMatches(); }
  };

  const deleteMatch = async (id: string) => {
    if (!confirm('¿Eliminar este partido?')) return;
    const { error } = await supabase.from('matches').delete().eq('id', id);
    if (error) {
      console.error('Database error:', error);
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    }
    else { toast({ title: 'Partido eliminado' }); fetchMatches(); }
  };

  const updateResult = async (matchId: string, homeScore: number | null, awayScore: number | null) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, home_score: homeScore, away_score: awayScore } : m));
  };

  const clearResult = async (matchId: string) => {
    const { error } = await supabase.from('matches').update({ home_score: null, away_score: null, is_finished: false }).eq('id', matchId);
    if (error) {
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    } else {
      toast({ title: 'Resultado limpiado' });
      await supabase.rpc('recalculate_matchday_points', { p_matchday_id: selectedMatchday });
      fetchMatches();
    }
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

  const syncWithApi = async () => {
    if (!selectedMatchday) return;
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-results`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ matchday_id: selectedMatchday })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Error al sincronizar');
      toast({ title: 'Sincronización completada', description: result.message });
      fetchMatches();
    } catch (error) {
      console.error('Sync error:', error);
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    }
    setSyncing(false);
  };

  // === EQUIPOS ===
  const handleLogoUpload = async (teamId: string, file: File) => {
    setUploadingLogo(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${teamId}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('team-logos')
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      console.error('Storage error:', uploadError);
      toast({ title: 'Error al subir', description: getSafeErrorMessage(uploadError), variant: 'destructive' });
      setUploadingLogo(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('team-logos').getPublicUrl(fileName);
    
    await supabase.from('teams').update({ logo_url: urlData.publicUrl }).eq('id', teamId);
    toast({ title: 'Logo actualizado' });
    setUploadingLogo(false);
    fetchTeams();
    setEditingTeam(null);
  };

  const updateTeam = async () => {
    if (!editingTeam) return;
    const { error } = await supabase.from('teams').update({ 
      name: editingTeam.name, 
      short_name: editingTeam.short_name 
    }).eq('id', editingTeam.id);
    if (error) {
      console.error('Database error:', error);
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    }
    else { toast({ title: 'Equipo actualizado' }); fetchTeams(); }
  };

  if (loading || loadingData) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="container py-8">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="w-6 h-6 text-secondary" />
        <h1 className="text-3xl font-display text-foreground">Panel de Administrador</h1>
      </div>

      <Tabs defaultValue="matchdays" className="space-y-6">
        <TabsList className="bg-muted flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="matchdays"><Calendar className="w-4 h-4 mr-2" />Jornadas</TabsTrigger>
          <TabsTrigger value="matches"><Trophy className="w-4 h-4 mr-2" />Partidos</TabsTrigger>
          <TabsTrigger value="quick-matches"><Zap className="w-4 h-4 mr-2" />Carga Rápida</TabsTrigger>
          <TabsTrigger value="results"><RefreshCw className="w-4 h-4 mr-2" />Resultados</TabsTrigger>
          <TabsTrigger value="teams"><Shield className="w-4 h-4 mr-2" />Equipos</TabsTrigger>
          <TabsTrigger value="predictions"><FileText className="w-4 h-4 mr-2" />Predicciones</TabsTrigger>
          <TabsTrigger value="users"><Users className="w-4 h-4 mr-2" />Usuarios</TabsTrigger>
        </TabsList>

        {/* JORNADAS */}
        <TabsContent value="matchdays" className="card-sports p-6 space-y-4">
          <div className="flex gap-2">
            <Input placeholder="Nombre (ej: Jornada 5)" value={newMatchdayName} onChange={e => setNewMatchdayName(e.target.value)} className="input-sports" />
            <Button onClick={createMatchday} className="btn-hero"><Plus className="w-4 h-4 mr-2" />Crear</Button>
          </div>
          <div className="space-y-3">
            {matchdays.map(md => (
              <div key={md.id} className="p-4 bg-muted/50 rounded-lg space-y-2">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <span className="font-medium text-foreground text-lg">{md.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">{md.is_open ? 'Abierta' : 'Cerrada'}</span>
                    <Switch checked={md.is_open} onCheckedChange={() => toggleMatchdayOpen(md.id, md.is_open)} />
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => setEditingMatchday(md)}><Pencil className="w-4 h-4" /></Button>
                      </DialogTrigger>
                      <DialogContent className="bg-card border-border">
                        <DialogHeader><DialogTitle className="text-foreground">Editar Jornada</DialogTitle></DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <label className="text-sm text-muted-foreground">Nombre</label>
                            <Input value={editingMatchday?.name || ''} onChange={e => setEditingMatchday(prev => prev ? {...prev, name: e.target.value} : null)} className="input-sports" />
                          </div>
                          <Button onClick={updateMatchday} className="btn-hero w-full">Guardar</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button variant="ghost" size="icon" onClick={() => deleteMatchday(md.id)} className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
                
                {/* Cierre automático - visible directamente */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-border/50">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>Cierre automático:</span>
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    <Input 
                      type="datetime-local" 
                      value={formatDateForInput(md.end_date || '')}
                      onChange={async (e) => {
                        const newEndDate = e.target.value ? new Date(e.target.value).toISOString() : null;
                        await supabase.from('matchdays').update({ end_date: newEndDate }).eq('id', md.id);
                        fetchMatchdays();
                        toast({ title: newEndDate ? 'Cierre programado' : 'Cierre automático desactivado' });
                      }}
                      className="input-sports max-w-[250px]"
                    />
                    {md.end_date && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={async () => {
                          await supabase.from('matchdays').update({ end_date: null }).eq('id', md.id);
                          fetchMatchdays();
                          toast({ title: 'Cierre automático desactivado' });
                        }}
                        className="text-destructive hover:text-destructive"
                      >
                        Quitar
                      </Button>
                    )}
                  </div>
                  {md.end_date && (
                    <span className="text-xs text-primary">
                      Se cierra: {new Date(md.end_date).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}
                    </span>
                  )}
                </div>
                
                {/* Champions section */}
                <MatchdayChampions matchdayId={md.id} matchdayName={md.name} />
              </div>
            ))}
          </div>
        </TabsContent>

        {/* PARTIDOS */}
        <TabsContent value="matches" className="card-sports p-6 space-y-4">
          <Select value={selectedMatchday} onValueChange={setSelectedMatchday}>
            <SelectTrigger className="bg-input border-border"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover border-border z-50">
              {matchdays.map(md => <SelectItem key={md.id} value={md.id}>{md.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <Select value={newHomeTeam} onValueChange={setNewHomeTeam}>
              <SelectTrigger className="bg-input border-border"><SelectValue placeholder="Local" /></SelectTrigger>
              <SelectContent className="bg-popover border-border z-50 max-h-60">{teams.map(t => <SelectItem key={t.id} value={t.id}>{t.short_name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={newAwayTeam} onValueChange={setNewAwayTeam}>
              <SelectTrigger className="bg-input border-border"><SelectValue placeholder="Visitante" /></SelectTrigger>
              <SelectContent className="bg-popover border-border z-50 max-h-60">{teams.map(t => <SelectItem key={t.id} value={t.id}>{t.short_name}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="datetime-local" value={newMatchDate} onChange={e => setNewMatchDate(e.target.value)} className="input-sports" />
            <Button onClick={addMatch} className="btn-hero"><Plus className="w-4 h-4 mr-2" />Agregar</Button>
          </div>
          <div className="space-y-2">
            {matches.map(m => (
              <div key={m.id} className="p-3 bg-muted/50 rounded-lg flex justify-between items-center">
                <div className="flex items-center gap-2">
                  {m.home_team?.logo_url && <img src={m.home_team.logo_url} alt="" className="w-6 h-6 object-contain" />}
                  <span className="text-foreground">{m.home_team?.short_name} vs {m.away_team?.short_name}</span>
                  {m.away_team?.logo_url && <img src={m.away_team.logo_url} alt="" className="w-6 h-6 object-contain" />}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm">{new Date(m.match_date).toLocaleString('es-MX')}</span>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={() => setEditingMatch(m)}><Pencil className="w-4 h-4" /></Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border">
                      <DialogHeader><DialogTitle className="text-foreground">Editar Partido</DialogTitle></DialogHeader>
                      <div className="space-y-3">
                        <Select value={editingMatch?.home_team_id || ''} onValueChange={v => setEditingMatch(prev => prev ? {...prev, home_team_id: v} : null)}>
                          <SelectTrigger className="bg-input border-border"><SelectValue placeholder="Local" /></SelectTrigger>
                          <SelectContent className="bg-popover border-border z-50 max-h-60">{teams.map(t => <SelectItem key={t.id} value={t.id}>{t.short_name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={editingMatch?.away_team_id || ''} onValueChange={v => setEditingMatch(prev => prev ? {...prev, away_team_id: v} : null)}>
                          <SelectTrigger className="bg-input border-border"><SelectValue placeholder="Visitante" /></SelectTrigger>
                          <SelectContent className="bg-popover border-border z-50 max-h-60">{teams.map(t => <SelectItem key={t.id} value={t.id}>{t.short_name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input type="datetime-local" value={formatDateForInput(editingMatch?.match_date)} onChange={e => setEditingMatch(prev => prev ? {...prev, match_date: e.target.value} : null)} className="input-sports" />
                        <Button onClick={updateMatch} className="w-full btn-hero">Guardar</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button variant="ghost" size="icon" onClick={() => deleteMatch(m.id)} className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
            {matches.length === 0 && <p className="text-center py-4 text-muted-foreground">No hay partidos en esta jornada</p>}
          </div>
        </TabsContent>

        {/* RESULTADOS */}
        <TabsContent value="results" className="card-sports p-6 space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Select value={selectedMatchday} onValueChange={setSelectedMatchday}>
              <SelectTrigger className="bg-input border-border flex-1"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">{matchdays.map(md => <SelectItem key={md.id} value={md.id}>{md.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={syncWithApi} disabled={syncing || !selectedMatchday} variant="outline" className="gap-2">
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
              Sincronizar API
            </Button>
            <Button onClick={resetMatchdayResults} disabled={resetting || !selectedMatchday || matches.length === 0} variant="outline" className="gap-2 text-destructive hover:text-destructive border-destructive/50">
              {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Resetear Jornada
            </Button>
          </div>
          <div className="space-y-3">
            {matches.map(m => (
              <div key={m.id} className="p-4 bg-muted/50 rounded-lg flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-1">
                  {m.home_team?.logo_url && <img src={m.home_team.logo_url} alt="" className="w-6 h-6 object-contain" />}
                  <span className="text-foreground">{m.home_team?.short_name}</span>
                </div>
                <Input type="number" min="0" value={m.home_score ?? ''} onChange={e => updateResult(m.id, e.target.value ? parseInt(e.target.value) : null, m.away_score)} className="w-16 text-center input-sports" />
                <span className="text-muted-foreground">-</span>
                <Input type="number" min="0" value={m.away_score ?? ''} onChange={e => updateResult(m.id, m.home_score, e.target.value ? parseInt(e.target.value) : null)} className="w-16 text-center input-sports" />
                <div className="flex items-center gap-2 flex-1 justify-end">
                  <span className="text-foreground">{m.away_team?.short_name}</span>
                  {m.away_team?.logo_url && <img src={m.away_team.logo_url} alt="" className="w-6 h-6 object-contain" />}
                </div>
                {(m.home_score !== null || m.away_score !== null) && (
                  <Button variant="ghost" size="icon" onClick={() => clearResult(m.id)} className="text-destructive hover:text-destructive" title="Limpiar resultado">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
            {matches.length === 0 && <p className="text-center py-4 text-muted-foreground">No hay partidos en esta jornada</p>}
          </div>
          <Button onClick={saveResults} disabled={saving || matches.length === 0} className="w-full btn-gold">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-2" />Guardar y Recalcular Puntos</>}
          </Button>
        </TabsContent>

        {/* EQUIPOS */}
        <TabsContent value="teams" className="card-sports p-6 space-y-4">
          <h3 className="text-lg font-display text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-secondary" />
            Gestión de Equipos
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {teams.map(team => (
              <div key={team.id} className="p-4 bg-muted/50 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {team.logo_url ? (
                    <img src={team.logo_url} alt={team.name} className="w-10 h-10 object-contain" />
                  ) : (
                    <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-xs">
                      {team.short_name}
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-foreground">{team.short_name}</p>
                    <p className="text-xs text-muted-foreground">{team.name}</p>
                  </div>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => setEditingTeam(team)}><Pencil className="w-4 h-4" /></Button>
                  </DialogTrigger>
                  <DialogContent className="bg-card border-border">
                    <DialogHeader><DialogTitle className="text-foreground">Editar Equipo</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <div className="flex justify-center">
                        {editingTeam?.logo_url ? (
                          <img src={editingTeam.logo_url} alt="" className="w-20 h-20 object-contain" />
                        ) : (
                          <div className="w-20 h-20 bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
                            Sin logo
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground mb-1 block">Subir Logo</label>
                        <Input 
                          type="file" 
                          accept="image/*" 
                          disabled={uploadingLogo}
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file && editingTeam) handleLogoUpload(editingTeam.id, file);
                          }}
                          className="input-sports"
                        />
                      </div>
                      <Input placeholder="Nombre completo" value={editingTeam?.name || ''} onChange={e => setEditingTeam(prev => prev ? {...prev, name: e.target.value} : null)} className="input-sports" />
                      <Input placeholder="Abreviación" value={editingTeam?.short_name || ''} onChange={e => setEditingTeam(prev => prev ? {...prev, short_name: e.target.value} : null)} className="input-sports" />
                      <Button onClick={updateTeam} disabled={uploadingLogo} className="w-full btn-hero">
                        {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar Cambios'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* CARGA RÁPIDA */}
        <TabsContent value="quick-matches" className="card-sports p-6">
          <AdminQuickMatches />
        </TabsContent>

        {/* PREDICCIONES */}
        <TabsContent value="predictions" className="card-sports p-6">
          <AdminPredictions />
        </TabsContent>

        {/* USUARIOS */}
        <TabsContent value="users" className="card-sports p-6">
          <AdminUsers />
        </TabsContent>
      </Tabs>
    </div>
  );
}
