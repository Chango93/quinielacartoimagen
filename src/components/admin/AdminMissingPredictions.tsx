import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, AlertTriangle, CheckCircle2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Matchday {
  id: string;
  name: string;
  is_current: boolean;
  is_open: boolean;
}

interface UserWithMissing {
  user_id: string;
  display_name: string;
  email: string;
  competition_type: string;
  total_matches: number;
  predictions_count: number;
  missing_count: number;
}

export default function AdminMissingPredictions() {
  const [matchdays, setMatchdays] = useState<Matchday[]>([]);
  const [selectedMatchday, setSelectedMatchday] = useState<string>('');
  const [users, setUsers] = useState<UserWithMissing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    fetchMatchdays();
  }, []);

  useEffect(() => {
    if (selectedMatchday) {
      fetchMissingPredictions();
    }
  }, [selectedMatchday]);

  const fetchMatchdays = async () => {
    const { data } = await supabase
      .from('matchdays')
      .select('id, name, is_current, is_open')
      .order('start_date', { ascending: false });
    
    if (data) {
      setMatchdays(data);
      // Seleccionar la jornada vigente por defecto
      const current = data.find(m => m.is_current);
      if (current) {
        setSelectedMatchday(current.id);
      } else if (data.length > 0) {
        setSelectedMatchday(data[0].id);
      }
    }
    setLoading(false);
  };

  const fetchMissingPredictions = async () => {
    setLoadingUsers(true);
    
    // 1. Obtener todos los partidos de la jornada
    const { data: matches } = await supabase
      .from('matches')
      .select('id')
      .eq('matchday_id', selectedMatchday);
    
    const matchIds = matches?.map(m => m.id) || [];
    const totalMatches = matchIds.length;

    if (totalMatches === 0) {
      setUsers([]);
      setLoadingUsers(false);
      return;
    }

    // 2. Obtener usuarios de temporada (season o both)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name, email, competition_type')
      .in('competition_type', ['season', 'both'])
      .order('display_name');

    if (!profiles || profiles.length === 0) {
      setUsers([]);
      setLoadingUsers(false);
      return;
    }

    // 3. Obtener predicciones de estos usuarios para esta jornada
    const userIds = profiles.map(p => p.user_id);
    const { data: predictions } = await supabase
      .from('predictions')
      .select('user_id, match_id')
      .in('user_id', userIds)
      .in('match_id', matchIds);

    // 4. Contar predicciones por usuario
    const predictionsByUser: Record<string, number> = {};
    predictions?.forEach(p => {
      predictionsByUser[p.user_id] = (predictionsByUser[p.user_id] || 0) + 1;
    });

    // 5. Calcular usuarios con predicciones faltantes
    const usersWithMissing: UserWithMissing[] = profiles.map(p => ({
      user_id: p.user_id,
      display_name: p.display_name || 'Sin nombre',
      email: p.email,
      competition_type: p.competition_type,
      total_matches: totalMatches,
      predictions_count: predictionsByUser[p.user_id] || 0,
      missing_count: totalMatches - (predictionsByUser[p.user_id] || 0)
    }));

    // Ordenar: primero los que tienen más faltantes
    usersWithMissing.sort((a, b) => b.missing_count - a.missing_count);

    setUsers(usersWithMissing);
    setLoadingUsers(false);
  };

  const selectedMatchdayData = matchdays.find(m => m.id === selectedMatchday);
  const usersWithMissing = users.filter(u => u.missing_count > 0);
  const usersComplete = users.filter(u => u.missing_count === 0);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-secondary" />
        <h3 className="font-display text-foreground">Predicciones Faltantes (Temporada)</h3>
      </div>

      <div className="bg-muted/30 p-4 rounded-lg mb-4">
        <p className="text-sm text-muted-foreground">
          Muestra qué usuarios del formato <Badge variant="default">Temporada</Badge> o <Badge variant="outline">Ambos</Badge> no han completado su quiniela para la jornada seleccionada.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <label className="text-sm text-muted-foreground">Jornada:</label>
        <Select value={selectedMatchday} onValueChange={setSelectedMatchday}>
          <SelectTrigger className="w-[200px] bg-input border-border">
            <SelectValue placeholder="Seleccionar jornada" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border z-50">
            {matchdays.map(md => (
              <SelectItem key={md.id} value={md.id}>
                {md.name} {md.is_current && '(Vigente)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedMatchdayData?.is_open && (
          <Badge variant="secondary" className="ml-2">Abierta</Badge>
        )}
      </div>

      {loadingUsers ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6 mt-4">
          {/* Usuarios con predicciones faltantes */}
          {usersWithMissing.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-destructive flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Falta llenar ({usersWithMissing.length})
              </h4>
              <div className="rounded-lg border border-destructive/30 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-destructive/10">
                    <tr>
                      <th className="text-left p-3 text-foreground">Usuario</th>
                      <th className="text-left p-3 text-foreground hidden md:table-cell">Tipo</th>
                      <th className="text-center p-3 text-foreground">Predicciones</th>
                      <th className="text-center p-3 text-foreground">Faltantes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersWithMissing.map(user => (
                      <tr key={user.user_id} className="border-t border-border">
                        <td className="p-3">
                          <div>
                            <span className="font-medium text-foreground">{user.display_name}</span>
                            <span className="text-muted-foreground text-xs block">{user.email}</span>
                          </div>
                        </td>
                        <td className="p-3 hidden md:table-cell">
                          <Badge variant={user.competition_type === 'both' ? 'outline' : 'default'}>
                            {user.competition_type === 'both' ? 'Ambos' : 'Temporada'}
                          </Badge>
                        </td>
                        <td className="p-3 text-center text-muted-foreground">
                          {user.predictions_count} / {user.total_matches}
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant="destructive">{user.missing_count}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : users.length > 0 ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span className="text-green-500 font-medium">
                ¡Todos los usuarios de temporada han completado su quiniela!
              </span>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No hay partidos en esta jornada
            </div>
          )}

          {/* Usuarios completos */}
          {usersComplete.length > 0 && usersWithMissing.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-green-500 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Quiniela completa ({usersComplete.length})
              </h4>
              <div className="rounded-lg border border-green-500/30 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-green-500/10">
                    <tr>
                      <th className="text-left p-3 text-foreground">Usuario</th>
                      <th className="text-left p-3 text-foreground hidden md:table-cell">Tipo</th>
                      <th className="text-center p-3 text-foreground">Predicciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersComplete.map(user => (
                      <tr key={user.user_id} className="border-t border-border">
                        <td className="p-3">
                          <div>
                            <span className="font-medium text-foreground">{user.display_name}</span>
                            <span className="text-muted-foreground text-xs block">{user.email}</span>
                          </div>
                        </td>
                        <td className="p-3 hidden md:table-cell">
                          <Badge variant={user.competition_type === 'both' ? 'outline' : 'default'}>
                            {user.competition_type === 'both' ? 'Ambos' : 'Temporada'}
                          </Badge>
                        </td>
                        <td className="p-3 text-center text-green-500">
                          {user.predictions_count} / {user.total_matches} ✓
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
