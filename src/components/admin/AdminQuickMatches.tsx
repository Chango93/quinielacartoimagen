import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Upload, Download, Loader2, Calendar } from 'lucide-react';

interface Team { id: string; name: string; short_name: string; logo_url: string | null; }
interface Matchday { id: string; name: string; }

interface MatchRow {
  home_team_id: string;
  away_team_id: string;
  match_date: string;
}

export default function AdminQuickMatches() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [teams, setTeams] = useState<Team[]>([]);
  const [matchdays, setMatchdays] = useState<Matchday[]>([]);
  const [selectedMatchday, setSelectedMatchday] = useState<string>('');
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [teamsRes, matchdaysRes] = await Promise.all([
      supabase.from('teams').select('id, name, short_name, logo_url').order('name'),
      supabase.from('matchdays').select('id, name').order('start_date', { ascending: false })
    ]);
    
    if (teamsRes.data) setTeams(teamsRes.data);
    if (matchdaysRes.data) {
      setMatchdays(matchdaysRes.data);
      if (matchdaysRes.data[0]) setSelectedMatchday(matchdaysRes.data[0].id);
    }
    setLoading(false);
  };

  const addRow = () => {
    setRows(prev => [...prev, { home_team_id: '', away_team_id: '', match_date: '' }]);
  };

  const updateRow = (index: number, field: keyof MatchRow, value: string) => {
    setRows(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
  };

  const removeRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  const saveMatches = async () => {
    if (!selectedMatchday) {
      toast({ title: 'Error', description: 'Selecciona una jornada', variant: 'destructive' });
      return;
    }

    const validRows = rows.filter(r => r.home_team_id && r.away_team_id && r.match_date);
    if (validRows.length === 0) {
      toast({ title: 'Error', description: 'Agrega al menos un partido válido', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const matches = validRows.map(r => ({
      matchday_id: selectedMatchday,
      home_team_id: r.home_team_id,
      away_team_id: r.away_team_id,
      match_date: new Date(r.match_date).toISOString()
    }));

    const { error } = await supabase.from('matches').insert(matches);
    
    if (error) {
      toast({ title: 'Error', description: 'No se pudieron guardar los partidos', variant: 'destructive' });
    } else {
      toast({ title: 'Guardado', description: `${validRows.length} partidos agregados` });
      setRows([]);
    }
    setSaving(false);
  };

  const downloadTemplate = () => {
    // Usar los primeros 2 equipos reales como ejemplo
    const team1 = teams[0]?.name || 'Equipo1';
    const team2 = teams[1]?.name || 'Equipo2';
    const template = `local,visitante,fecha\n${team1},${team2},2025-01-15`;
    const blob = new Blob([template], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'plantilla_partidos.csv';
    link.click();
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').slice(1); // Skip header
      
      const newRows: MatchRow[] = [];
      lines.forEach(line => {
        const [local, visitante, fecha] = line.split(',').map(s => s.trim());
        if (!local || !visitante || !fecha) return;

        // Buscar equipos por nombre o short_name
        const homeTeam = teams.find(t => 
          t.name.toLowerCase() === local.toLowerCase() || 
          t.short_name.toLowerCase() === local.toLowerCase()
        );
        const awayTeam = teams.find(t => 
          t.name.toLowerCase() === visitante.toLowerCase() || 
          t.short_name.toLowerCase() === visitante.toLowerCase()
        );

        if (homeTeam && awayTeam) {
          newRows.push({
            home_team_id: homeTeam.id,
            away_team_id: awayTeam.id,
            match_date: fecha
          });
        }
      });

      if (newRows.length > 0) {
        setRows(prev => [...prev, ...newRows]);
        toast({ title: 'CSV importado', description: `${newRows.length} partidos agregados` });
      } else {
        toast({ title: 'Error', description: 'No se encontraron partidos válidos en el CSV', variant: 'destructive' });
      }
    };
    reader.readAsText(file);
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="w-5 h-5 text-secondary" />
        <h3 className="font-display text-foreground">Carga Rápida de Partidos</h3>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedMatchday} onValueChange={setSelectedMatchday}>
          <SelectTrigger className="w-[200px] bg-input border-border">
            <SelectValue placeholder="Selecciona jornada" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border z-50">
            {matchdays.map(md => <SelectItem key={md.id} value={md.id}>{md.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Button variant="outline" onClick={downloadTemplate}>
          <Download className="w-4 h-4 mr-2" />Descargar Plantilla CSV
        </Button>
        
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleCSVImport}
          className="hidden"
        />
        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-4 h-4 mr-2" />Importar CSV
        </Button>
      </div>

      {/* Referencia de nombres de equipos */}
      <details className="bg-muted/30 rounded-lg p-4">
        <summary className="cursor-pointer text-sm font-medium text-foreground hover:text-secondary">
          📋 Ver nombres exactos de equipos para CSV
        </summary>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-sm">
          {teams.map(t => (
            <div key={t.id} className="bg-background/50 px-2 py-1 rounded text-muted-foreground">
              {t.name}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Usa estos nombres exactos en el CSV. También puedes usar el nombre corto: {teams.slice(0, 3).map(t => t.short_name).join(', ')}...
        </p>
      </details>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-foreground">Local</TableHead>
              <TableHead className="text-foreground">Visitante</TableHead>
              <TableHead className="text-foreground">Fecha</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index} className="border-border">
                <TableCell>
                  <Select value={row.home_team_id} onValueChange={v => updateRow(index, 'home_team_id', v)}>
                    <SelectTrigger className="bg-input border-border">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border z-50 max-h-60">
                      {teams.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="flex items-center gap-2">
                            {t.logo_url && <img src={t.logo_url} alt="" className="w-5 h-5 object-contain" />}
                            {t.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select value={row.away_team_id} onValueChange={v => updateRow(index, 'away_team_id', v)}>
                    <SelectTrigger className="bg-input border-border">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border z-50 max-h-60">
                      {teams.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="flex items-center gap-2">
                            {t.logo_url && <img src={t.logo_url} alt="" className="w-5 h-5 object-contain" />}
                            {t.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input 
                    type="date" 
                    value={row.match_date} 
                    onChange={e => updateRow(index, 'match_date', e.target.value)}
                    className="input-sports"
                  />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => removeRow(index)} className="text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Haz clic en "Agregar fila" o importa un CSV
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={addRow}>
          <Plus className="w-4 h-4 mr-2" />Agregar fila
        </Button>
        <Button 
          onClick={saveMatches} 
          disabled={saving || rows.length === 0}
          className="btn-hero"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Guardar {rows.filter(r => r.home_team_id && r.away_team_id && r.match_date).length} partidos
        </Button>
      </div>
    </div>
  );
}
