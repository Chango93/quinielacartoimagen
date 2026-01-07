import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Users, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type CompetitionType = 'weekly' | 'season' | 'both';

interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string;
  competition_type: CompetitionType;
}

export default function AdminUsers() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [changes, setChanges] = useState<Record<string, CompetitionType>>({});

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('display_name');
    
    if (!error && data) {
      setProfiles(data as Profile[]);
    }
    setLoading(false);
  };

  const handleTypeChange = (userId: string, newType: CompetitionType) => {
    setChanges(prev => ({ ...prev, [userId]: newType }));
  };

  const saveChange = async (profile: Profile) => {
    const newType = changes[profile.user_id];
    if (!newType) return;
    
    setSaving(profile.user_id);
    const { error } = await supabase
      .from('profiles')
      .update({ competition_type: newType })
      .eq('user_id', profile.user_id);
    
    if (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar', variant: 'destructive' });
    } else {
      toast({ title: 'Actualizado', description: `${profile.display_name || profile.email} ahora participa en: ${getTypeLabel(newType)}` });
      setProfiles(prev => prev.map(p => 
        p.user_id === profile.user_id ? { ...p, competition_type: newType } : p
      ));
      setChanges(prev => {
        const next = { ...prev };
        delete next[profile.user_id];
        return next;
      });
    }
    setSaving(null);
  };

  const getTypeLabel = (type: CompetitionType) => {
    switch (type) {
      case 'weekly': return 'Solo Jornadas';
      case 'season': return 'Solo Temporada';
      case 'both': return 'Ambos';
    }
  };

  const getTypeBadgeVariant = (type: CompetitionType): "default" | "secondary" | "outline" => {
    switch (type) {
      case 'weekly': return 'secondary';
      case 'season': return 'default';
      case 'both': return 'outline';
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-secondary" />
        <h3 className="font-display text-foreground">Gestión de Usuarios</h3>
      </div>

      <div className="bg-muted/30 p-4 rounded-lg mb-4">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Tipos de competencia:</strong>
        </p>
        <ul className="text-sm text-muted-foreground mt-2 space-y-1">
          <li>• <Badge variant="secondary">Solo Jornadas</Badge> - Participa solo en el leaderboard por jornada</li>
          <li>• <Badge variant="default">Solo Temporada</Badge> - Participa solo en el acumulado de temporada</li>
          <li>• <Badge variant="outline">Ambos</Badge> - Participa en jornadas y acumulado de temporada</li>
        </ul>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-foreground">Usuario</TableHead>
              <TableHead className="text-foreground">Email</TableHead>
              <TableHead className="text-foreground">Tipo Actual</TableHead>
              <TableHead className="text-foreground">Cambiar a</TableHead>
              <TableHead className="text-foreground w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map(profile => {
              const currentType = changes[profile.user_id] || profile.competition_type;
              const hasChange = changes[profile.user_id] && changes[profile.user_id] !== profile.competition_type;
              
              return (
                <TableRow key={profile.id} className="border-border">
                  <TableCell className="font-medium text-foreground">
                    {profile.display_name || 'Sin nombre'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {profile.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getTypeBadgeVariant(profile.competition_type)}>
                      {getTypeLabel(profile.competition_type)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={currentType} 
                      onValueChange={(v) => handleTypeChange(profile.user_id, v as CompetitionType)}
                    >
                      <SelectTrigger className="w-[160px] bg-input border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border z-50">
                        <SelectItem value="weekly">Solo Jornadas</SelectItem>
                        <SelectItem value="season">Solo Temporada</SelectItem>
                        <SelectItem value="both">Ambos</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {hasChange && (
                      <Button 
                        size="sm" 
                        onClick={() => saveChange(profile)}
                        disabled={saving === profile.user_id}
                      >
                        {saving === profile.user_id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
