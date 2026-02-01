import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Trophy, Medal, Target, TrendingUp, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import MatchdayWinner from './MatchdayWinner';
import SeasonLeader from './SeasonLeader';
import LeaderboardEntryDetails from './LeaderboardEntryDetails';

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
  is_current: boolean;
}

interface LeaderboardProps {
  limit?: number;
  showTitle?: boolean;
  showTabs?: boolean;
  topLimit?: number; // For showing top N in matchday
}

interface RawPrediction {
  user_id: string;
  display_name: string;
  predicted_home_score: number;
  predicted_away_score: number;
  home_score: number | null;
  away_score: number | null;
  match_id: string;
  competition_type?: CompetitionType;
}

export default function Leaderboard({ limit, showTitle = true, showTabs = true, topLimit = 20 }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [matchdayEntries, setMatchdayEntries] = useState<LeaderboardEntry[]>([]);
  const [matchdays, setMatchdays] = useState<Matchday[]>([]);
  const [selectedMatchday, setSelectedMatchday] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'season' | 'matchday'>('matchday');
  const [showAllMatchday, setShowAllMatchday] = useState(false);
  const [showAllSeason, setShowAllSeason] = useState(false);
  
  // For details dialog
  const [selectedUser, setSelectedUser] = useState<{ userId: string; displayName: string } | null>(null);

  // Store raw predictions so we can recalculate points client-side on score changes
  const matchdayPredictionsRef = useRef<RawPrediction[]>([]);

  const calculatePoints = useCallback((predHome: number, predAway: number, realHome: number, realAway: number) => {
    if (predHome === realHome && predAway === realAway) return 2;
    const predOutcome = predHome === predAway ? 'draw' : predHome > predAway ? 'home' : 'away';
    const realOutcome = realHome === realAway ? 'draw' : realHome > realAway ? 'home' : 'away';
    return predOutcome === realOutcome ? 1 : 0;
  }, []);

  const buildLeaderboard = useCallback((rows: RawPrediction[]): LeaderboardEntry[] => {
    const byUser = new Map<string, LeaderboardEntry>();

    rows.forEach((p) => {
      const hasScore = p.home_score !== null && p.away_score !== null;
      const pts = hasScore ? calculatePoints(p.predicted_home_score, p.predicted_away_score, p.home_score!, p.away_score!) : 0;

      const prev = byUser.get(p.user_id) ?? {
        user_id: p.user_id,
        display_name: p.display_name,
        total_points: 0,
        exact_results: 0,
        total_predictions: 0,
        competition_type: p.competition_type ?? 'both',
      };

      const next: LeaderboardEntry = {
        ...prev,
        display_name: prev.display_name || p.display_name,
        total_points: prev.total_points + pts,
        exact_results: prev.exact_results + (pts === 2 ? 1 : 0),
        total_predictions: prev.total_predictions + 1,
      };

      byUser.set(p.user_id, next);
    });

    return Array.from(byUser.values())
      .filter((e) => e.total_predictions > 0)
      .sort(
        (a, b) =>
          b.total_points - a.total_points ||
          b.exact_results - a.exact_results ||
          a.display_name.localeCompare(b.display_name)
      );
  }, [calculatePoints]);

  const fetchLeaderboard = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_leaderboard');

    if (!error && data) {
      const seasonData = (data as LeaderboardEntry[]).filter(
        e => e.competition_type === 'season' || e.competition_type === 'both'
      );
      const limitedData = limit ? seasonData.slice(0, limit) : seasonData;
      setEntries(limitedData);
    }
    setLoading(false);
  }, [limit]);

  const fetchMatchdays = useCallback(async () => {
    const { data } = await supabase
      .from('matchdays')
      .select('id, name, is_current')
      .order('start_date', { ascending: false });

    if (data && data.length > 0) {
      setMatchdays(data);
      const currentMatchday = data.find(m => m.is_current);
      const selected = currentMatchday || data[0];
      setSelectedMatchday(selected.id);
    }
  }, []);

  const fetchMatchdayLeaderboard = useCallback(async () => {
    if (!selectedMatchday) return;

    const { data, error } = await supabase.rpc('get_matchday_predictions', { p_matchday_id: selectedMatchday });

    if (!error && data) {
      // Filtrar solo usuarios que participan en jornadas (weekly o both)
      const filteredData = (data as any[]).filter(
        p => p.competition_type === 'weekly' || p.competition_type === 'both'
      );
      
      const rawPreds = filteredData.map((p) => ({
        user_id: p.user_id,
        display_name: p.display_name,
        predicted_home_score: p.predicted_home_score,
        predicted_away_score: p.predicted_away_score,
        home_score: p.home_score,
        away_score: p.away_score,
        match_id: p.match_id,
        competition_type: p.competition_type,
      })) as RawPrediction[];

      matchdayPredictionsRef.current = rawPreds;
      const lb = buildLeaderboard(rawPreds);
      const limitedData = limit ? lb.slice(0, limit) : lb;
      setMatchdayEntries(limitedData);
    }
  }, [buildLeaderboard, limit, selectedMatchday]);

  useEffect(() => {
    fetchLeaderboard();
    fetchMatchdays();
  }, [fetchLeaderboard, fetchMatchdays]);

  useEffect(() => {
    if (selectedMatchday) {
      fetchMatchdayLeaderboard();
    }
  }, [fetchMatchdayLeaderboard, selectedMatchday]);

  // Real-time: update scores in cached predictions and recalculate leaderboard
  useEffect(() => {
    if (!selectedMatchday) return;

    const channel = supabase
      .channel(`leaderboard-matches-${selectedMatchday}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `matchday_id=eq.${selectedMatchday}`,
        },
        (payload) => {
          const m = payload.new as any;

          // Update cached predictions with new scores
          matchdayPredictionsRef.current = matchdayPredictionsRef.current.map((p) =>
            p.match_id === m.id ? { ...p, home_score: m.home_score, away_score: m.away_score } : p
          );

          // Rebuild leaderboard
          const lb = buildLeaderboard(matchdayPredictionsRef.current);
          const limitedData = limit ? lb.slice(0, limit) : lb;
          setMatchdayEntries(limitedData);
        }
      )
      .subscribe();

    // Backup polling
    const interval = setInterval(fetchMatchdayLeaderboard, 20000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [buildLeaderboard, fetchMatchdayLeaderboard, limit, selectedMatchday]);

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

  const renderEntries = (data: LeaderboardEntry[], isClickable: boolean = true, positionOffset: number = 0) => (
    <TooltipProvider>
      <div className="space-y-2">
        {/* Hint for clickable entries */}
        {isClickable && data.length > 0 && positionOffset === 0 && (
          <p className="text-xs text-muted-foreground text-center mb-3 animate-fade-in flex items-center justify-center gap-1">
            <ChevronRight className="w-3 h-3" />
            Toca un nombre para ver el desglose de puntos
          </p>
        )}
        {data.map((entry, index) => {
          const position = positionOffset + index + 1;
          return (
            <Tooltip key={entry.user_id}>
              <TooltipTrigger asChild>
                <div
                  className={`match-card flex items-center justify-between animate-fade-in group ${
                    isClickable 
                      ? 'cursor-pointer hover:bg-muted/50 hover:border-secondary/30 transition-all duration-200' 
                      : ''
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                  onClick={() => isClickable && setSelectedUser({ userId: entry.user_id, displayName: entry.display_name })}
                >
                  <div className="flex items-center gap-4">
                    <div className={`position-badge ${getPositionStyle(position)}`}>
                      {getPositionIcon(position)}
                    </div>
                    <div className="flex items-center gap-2">
                      <div>
                        <p className={`font-semibold text-foreground ${
                          isClickable 
                            ? 'group-hover:text-secondary transition-colors duration-200' 
                            : ''
                        }`}>
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
                      {isClickable && (
                        <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-secondary group-hover:translate-x-1 transition-all duration-200" />
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-display text-secondary glow-text">
                      {entry.total_points}
                    </p>
                    <p className="text-xs text-muted-foreground">puntos</p>
                  </div>
                </div>
              </TooltipTrigger>
              {isClickable && (
                <TooltipContent side="top" className="bg-popover border-border">
                  <p>Ver desglose de puntos</p>
                </TooltipContent>
              )}
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
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

  const currentMatchdayName = matchdays.find(m => m.id === selectedMatchday)?.name || 'Jornada';

  // Entries to show based on toggle
  const matchdayTop = matchdayEntries.slice(0, topLimit);
  const seasonTop = entries.slice(0, topLimit);

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
          <TabsTrigger value="matchday" className="flex-1">Por Jornada</TabsTrigger>
          <TabsTrigger value="season" className="flex-1">Temporada</TabsTrigger>
        </TabsList>

        <TabsContent value="season" className="mt-4 space-y-4">
          <SeasonLeader />
          {entries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Trophy className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Aún no hay participantes en temporada</p>
            </div>
          ) : (
            <>
              {/* Top 20 Season */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Top {topLimit}</h3>
                {renderEntries(seasonTop, true)}
              </div>
              
              {entries.length > topLimit && (
                <button
                  onClick={() => setShowAllSeason(!showAllSeason)}
                  className="w-full py-2 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors bg-muted/30 rounded-lg"
                >
                  {showAllSeason ? (
                    <>
                      <ChevronUp className="w-4 h-4" />
                      Ocultar resto
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      Ver todos ({entries.length} participantes)
                    </>
                  )}
                </button>
              )}

              {showAllSeason && entries.length > topLimit && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Posiciones {topLimit + 1}+</h3>
                  {renderEntries(entries.slice(topLimit), true, topLimit)}
                </div>
              )}
            </>
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

          {selectedMatchday && (
            <MatchdayWinner 
              matchdayId={selectedMatchday} 
              matchdayName={currentMatchdayName}
            />
          )}

          {matchdayEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Trophy className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Sin datos para esta jornada</p>
            </div>
          ) : (
            <>
              {/* Top 20 Matchday */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Top {topLimit}</h3>
                {renderEntries(matchdayTop)}
              </div>
              
              {matchdayEntries.length > topLimit && (
                <button
                  onClick={() => setShowAllMatchday(!showAllMatchday)}
                  className="w-full py-2 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors bg-muted/30 rounded-lg"
                >
                  {showAllMatchday ? (
                    <>
                      <ChevronUp className="w-4 h-4" />
                      Ocultar resto
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      Ver todos ({matchdayEntries.length} participantes)
                    </>
                  )}
                </button>
              )}

              {showAllMatchday && matchdayEntries.length > topLimit && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Posiciones {topLimit + 1}+</h3>
                  <div className="space-y-2">
                    {matchdayEntries.slice(topLimit).map((entry, index) => (
                      <div
                        key={entry.user_id}
                        className="match-card flex items-center justify-between animate-fade-in cursor-pointer hover:bg-muted/50 transition-colors"
                        style={{ animationDelay: `${index * 30}ms` }}
                        onClick={() => setSelectedUser({ userId: entry.user_id, displayName: entry.display_name })}
                      >
                        <div className="flex items-center gap-4">
                          <div className="position-badge bg-muted text-muted-foreground">
                            {topLimit + index + 1}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground hover:text-secondary transition-colors">{entry.display_name}</p>
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
                          <p className="text-2xl font-display text-secondary glow-text">{entry.total_points}</p>
                          <p className="text-xs text-muted-foreground">puntos</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Details Dialog */}
      {selectedUser && (
        <LeaderboardEntryDetails
          userId={selectedUser.userId}
          displayName={selectedUser.displayName}
          matchdayId={selectedMatchday}
          matchdayName={currentMatchdayName}
          isOpen={!!selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}
