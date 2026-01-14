import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar, Trophy, Crown, Users, PieChart } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type CompetitionType = Database['public']['Enums']['competition_type'];

interface ProfileSurvey {
  user_id: string;
  display_name: string | null;
  competition_type: CompetitionType;
}

interface SurveyStats {
  weekly: number;
  season: number;
  both: number;
  total: number;
}

export default function AdminSurveyResults() {
  const [profiles, setProfiles] = useState<ProfileSurvey[]>([]);
  const [stats, setStats] = useState<SurveyStats>({ weekly: 0, season: 0, both: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSurveyResults();
  }, []);

  const fetchSurveyResults = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, display_name, competition_type')
      .order('display_name');

    if (error) {
      console.error('Error fetching survey results:', error);
      setLoading(false);
      return;
    }

    if (data) {
      setProfiles(data);
      
      // Calcular estadísticas
      const newStats: SurveyStats = { weekly: 0, season: 0, both: 0, total: data.length };
      data.forEach((profile) => {
        if (profile.competition_type === 'weekly') newStats.weekly++;
        else if (profile.competition_type === 'season') newStats.season++;
        else if (profile.competition_type === 'both') newStats.both++;
      });
      setStats(newStats);
    }

    setLoading(false);
  };

  const getCompetitionBadge = (type: CompetitionType) => {
    switch (type) {
      case 'weekly':
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Jornadas
          </Badge>
        );
      case 'season':
        return (
          <Badge variant="default" className="flex items-center gap-1 bg-primary">
            <Trophy className="w-3 h-3" />
            Temporada
          </Badge>
        );
      case 'both':
        return (
          <Badge className="flex items-center gap-1 bg-yellow-500 hover:bg-yellow-600">
            <Crown className="w-3 h-3" />
            Ambas
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumen estadístico */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Users className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-secondary/20">
                <Calendar className="w-5 h-5 text-secondary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.weekly}</p>
                <p className="text-sm text-muted-foreground">Solo Jornadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Trophy className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.season}</p>
                <p className="text-sm text-muted-foreground">Solo Temporada</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/20">
                <Crown className="w-5 h-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.both}</p>
                <p className="text-sm text-muted-foreground">Ambas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de barras simple */}
      {stats.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="w-5 h-5" />
              Distribución
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-secondary" />
                    Solo Jornadas
                  </span>
                  <span className="font-medium">{Math.round((stats.weekly / stats.total) * 100)}%</span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-secondary rounded-full transition-all"
                    style={{ width: `${(stats.weekly / stats.total) * 100}%` }}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-primary" />
                    Solo Temporada
                  </span>
                  <span className="font-medium">{Math.round((stats.season / stats.total) * 100)}%</span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${(stats.season / stats.total) * 100}%` }}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-yellow-500" />
                    Ambas
                  </span>
                  <span className="font-medium">{Math.round((stats.both / stats.total) * 100)}%</span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-yellow-500 rounded-full transition-all"
                    style={{ width: `${(stats.both / stats.total) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de participantes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Respuestas individuales
          </CardTitle>
        </CardHeader>
        <CardContent>
          {profiles.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay respuestas aún
            </p>
          ) : (
            <div className="space-y-2">
              {profiles.map((profile) => (
                <div 
                  key={profile.user_id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <span className="font-medium">
                    {profile.display_name || 'Usuario sin nombre'}
                  </span>
                  {getCompetitionBadge(profile.competition_type)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
