import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Trophy, Medal, Target, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type CompetitionType = 'weekly' | 'season' | 'both';

interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  total_points: number;
  exact_results: number;
  total_predictions: number;
  competition_type: CompetitionType;
}

interface Matchday {
  id: string;
  name: string;
}

interface LeaderboardProps {
  limit?: number;
  showTitle?: boolean;
  showTabs?: boolean;
}

export default function Leaderboard({ limit, showTitle = true, showTabs = true }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [matchdayEntries, setMatchdayEntries] = useState<LeaderboardEntry[]>([]);
  const [matchdays, setMatchdays] = useState<Matchday[]>([]);
  const [selectedMatchday, setSelectedMatchday] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'season' | 'matchday'>('season');

  useEffect(() => {
    fetchLeaderboard();
    fetchMatchdays();
  }, []);

  useEffect(() => {
    if (selectedMatchday) {
      fetchMatchdayLeaderboard();
    }
  }, [selectedMatchday]);

  const fetchLeaderboard = async () => {
    const { data, error } = await supabase.rpc('get_leaderboard');
    
    if (!error && data) {
      // Filtrar para temporada: solo 'season' o 'both'
      const seasonData = (data as LeaderboardEntry[]).filter(
        e => e.competition_type === 'season' || e.competition_type === 'both'
      );
      const limitedData = limit ? seasonData.slice(0, limit) : seasonData;
      setEntries(limitedData);
    }
    setLoading(false);
  };

  const fetchMatchdays = async () => {
    const { data } = await supabase.from('matchdays').select('id, name').order('start_date', { ascending: false });
    if (data) {
      setMatchdays(data);
      if (data[0]) setSelectedMatchday(data[0].id);
    }
  };

  const fetchMatchdayLeaderboard = async () => {
    const { data, error } = await supabase.rpc('get_matchday_leaderboard', { p_matchday_id: selectedMatchday });
    
    if (!error && data) {
      const limitedData = limit ? (data as LeaderboardEntry[]).slice(0, limit) : (data as LeaderboardEntry[]);
      setMatchdayEntries(limitedData);
    }
  };

  const getPositionStyle = (position: number) => {
    if (position === 1) return 'position-1';
    if (position === 2) return 'position-2';
    if (position === 3) return 'position-3';
    return 'bg-muted text-muted-foreground';
  };

  const getPositionIcon = (position: number) => {
    if (position === 1) return <Trophy className="w-4 h-4" />;
    if (position === 2) return <Medal className="w-4 h-4" />;
    if (position === 3) return <Medal className="w-4 h-4" />;
    return position;
  };

  const renderEntries = (data: LeaderboardEntry[]) => (
    <div className="space-y-2">
      {data.map((entry, index) => (
        <div
          key={entry.user_id}
          className={`match-card flex items-center justify-between animate-fade-in`}
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="flex items-center gap-4">
            <div className={`position-badge ${getPositionStyle(index + 1)}`}>
              {getPositionIcon(index + 1)}
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {entry.display_name}
              </p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  {entry.exact_results} exactos
                </span>
                <span>{entry.total_predictions} predicciones</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-display text-secondary glow-text">
              {entry.total_points}
            </p>
            <p className="text-xs text-muted-foreground">puntos</p>
          </div>
        </div>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(limit || 5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full bg-muted" />
        ))}
      </div>
    );
  }

  if (!showTabs) {
    if (entries.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <Trophy className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Aún no hay participantes</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {showTitle && (
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-secondary" />
            <h2 className="text-xl font-display text-foreground">Tabla General</h2>
          </div>
        )}
        {renderEntries(entries)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showTitle && (
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-secondary" />
          <h2 className="text-xl font-display text-foreground">Clasificación</h2>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'season' | 'matchday')}>
        <TabsList className="bg-muted w-full">
          <TabsTrigger value="season" className="flex-1">Temporada</TabsTrigger>
          <TabsTrigger value="matchday" className="flex-1">Por Jornada</TabsTrigger>
        </TabsList>

        <TabsContent value="season" className="mt-4">
          {entries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Trophy className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Aún no hay participantes en temporada</p>
            </div>
          ) : (
            renderEntries(entries)
          )}
        </TabsContent>

        <TabsContent value="matchday" className="mt-4 space-y-4">
          <Select value={selectedMatchday} onValueChange={setSelectedMatchday}>
            <SelectTrigger className="bg-input border-border">
              <SelectValue placeholder="Selecciona jornada" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border z-50">
              {matchdays.map(md => (
                <SelectItem key={md.id} value={md.id}>{md.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {matchdayEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Trophy className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Sin datos para esta jornada</p>
            </div>
          ) : (
            renderEntries(matchdayEntries)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
