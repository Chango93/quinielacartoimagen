import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  BarChart3, 
  User, 
  Star, 
  TrendingUp,
  Trophy,
  Target,
  Clock,
  CheckCircle2,
  Flame,
  Users,
  Goal
} from 'lucide-react';

interface MatchdayDashboardProps {
  matchdayId: string;
  matchdayName: string;
  isOpen: boolean;
}

interface MatchdaySummary {
  totalMatches: number;
  playedMatches: number;
  pendingMatches: number;
  totalGoals: number;
  progressPercent: number;
}

interface UserStatus {
  position: number;
  totalParticipants: number;
  points: number;
  exactResults: number;
  remainingMatches: number;
}

interface KeyMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  isFinished: boolean;
  isLive: boolean;
  reason: string;
  predictionCount: number;
}

interface CuriousStats {
  mostRepeatedScore: string;
  mostAccurateResult: string | null;
  mostVotedToWin: string | null;
  percentWithExact: number;
}

type MatchdayState = 'open' | 'in_progress' | 'closed';

export default function MatchdayDashboard({ matchdayId, matchdayName, isOpen }: MatchdayDashboardProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<MatchdaySummary | null>(null);
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [keyMatch, setKeyMatch] = useState<KeyMatch | null>(null);
  const [curiousStats, setCuriousStats] = useState<CuriousStats | null>(null);
  const [matchdayState, setMatchdayState] = useState<MatchdayState>('open');

  useEffect(() => {
    if (matchdayId) {
      fetchDashboardData();
    }
  }, [matchdayId, user]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchMatchdaySummary(),
        fetchUserStatus(),
        fetchKeyMatch(),
        fetchCuriousStats()
      ]);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
    setLoading(false);
  };

  const fetchMatchdaySummary = async () => {
    const { data: matches } = await supabase
      .from('matches')
      .select('id, home_score, away_score, is_finished, match_date')
      .eq('matchday_id', matchdayId);

    if (!matches) return;

    const playedMatches = matches.filter(m => m.is_finished).length;
    const pendingMatches = matches.filter(m => !m.is_finished).length;
    const totalGoals = matches
      .filter(m => m.home_score !== null && m.away_score !== null)
      .reduce((sum, m) => sum + (m.home_score || 0) + (m.away_score || 0), 0);
    const progressPercent = matches.length > 0 ? Math.round((playedMatches / matches.length) * 100) : 0;

    // Determine matchday state
    const hasLiveMatches = matches.some(m => 
      m.home_score !== null && m.away_score !== null && !m.is_finished
    );
    
    if (isOpen && playedMatches === 0) {
      setMatchdayState('open');
    } else if (playedMatches < matches.length || hasLiveMatches) {
      setMatchdayState('in_progress');
    } else {
      setMatchdayState('closed');
    }

    setSummary({
      totalMatches: matches.length,
      playedMatches,
      pendingMatches,
      totalGoals,
      progressPercent
    });
  };

  const fetchUserStatus = async () => {
    if (!user) return;

    // Get leaderboard for this matchday
    const { data: leaderboard } = await supabase
      .rpc('get_matchday_leaderboard', { p_matchday_id: matchdayId });

    if (!leaderboard) return;

    const userEntry = leaderboard.find(entry => entry.user_id === user.id);
    const position = leaderboard.findIndex(entry => entry.user_id === user.id) + 1;

    // Get remaining matches where user can still score
    const { data: matches } = await supabase
      .from('matches')
      .select('id, is_finished')
      .eq('matchday_id', matchdayId)
      .eq('is_finished', false);

    const { data: predictions } = await supabase
      .from('predictions')
      .select('match_id')
      .eq('user_id', user.id)
      .in('match_id', matches?.map(m => m.id) || []);

    setUserStatus({
      position: position || 0,
      totalParticipants: leaderboard.length,
      points: Number(userEntry?.total_points || 0),
      exactResults: Number(userEntry?.exact_results || 0),
      remainingMatches: predictions?.length || 0
    });
  };

  const fetchKeyMatch = async () => {
    // Get all matches with team info
    const { data: matches } = await supabase
      .from('matches')
      .select(`
        id,
        home_score,
        away_score,
        is_finished,
        match_date,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name)
      `)
      .eq('matchday_id', matchdayId)
      .order('match_date', { ascending: false });

    if (!matches || matches.length === 0) return;

    // Get prediction counts for all matches
    const { data: predictions } = await supabase
      .from('predictions')
      .select('match_id')
      .in('match_id', matches.map(m => m.id));

    const predictionCounts = new Map<string, number>();
    predictions?.forEach(p => {
      predictionCounts.set(p.match_id, (predictionCounts.get(p.match_id) || 0) + 1);
    });

    // Find key match: prioritize pending match with most predictions
    const pendingMatches = matches.filter(m => !m.is_finished);
    let selectedMatch = pendingMatches.length > 0
      ? pendingMatches.reduce((best, current) => {
          const bestCount = predictionCounts.get(best.id) || 0;
          const currentCount = predictionCounts.get(current.id) || 0;
          return currentCount > bestCount ? current : best;
        }, pendingMatches[0])
      : matches[0]; // If all finished, show last played

    const predCount = predictionCounts.get(selectedMatch.id) || 0;
    const isLive = selectedMatch.home_score !== null && 
                   selectedMatch.away_score !== null && 
                   !selectedMatch.is_finished;

    let reason = '';
    if (selectedMatch.is_finished) {
      reason = 'Último partido jugado';
    } else if (isLive) {
      reason = 'En vivo ahora';
    } else if (predCount > 0) {
      reason = `${predCount} predicciones registradas`;
    } else {
      reason = 'Próximo partido';
    }

    setKeyMatch({
      id: selectedMatch.id,
      homeTeam: (selectedMatch.home_team as any)?.name || 'Local',
      awayTeam: (selectedMatch.away_team as any)?.name || 'Visitante',
      homeScore: selectedMatch.home_score,
      awayScore: selectedMatch.away_score,
      isFinished: selectedMatch.is_finished,
      isLive,
      reason,
      predictionCount: predCount
    });
  };

  const fetchCuriousStats = async () => {
    // Get all matches for this matchday
    const { data: matches } = await supabase
      .from('matches')
      .select('id, home_score, away_score, is_finished')
      .eq('matchday_id', matchdayId);

    if (!matches) return;

    // Get all predictions for this matchday's matches
    const { data: predictions } = await supabase
      .from('predictions')
      .select('user_id, match_id, predicted_home_score, predicted_away_score, points_awarded')
      .in('match_id', matches.map(m => m.id));

    if (!predictions || predictions.length === 0) {
      setCuriousStats({
        mostRepeatedScore: 'Sin datos',
        mostAccurateResult: null,
        mostVotedToWin: null,
        percentWithExact: 0
      });
      return;
    }

    // Most repeated predicted score
    const scoreCounts = new Map<string, number>();
    predictions.forEach(p => {
      const score = `${p.predicted_home_score}-${p.predicted_away_score}`;
      scoreCounts.set(score, (scoreCounts.get(score) || 0) + 1);
    });
    const mostRepeatedScore = Array.from(scoreCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Sin datos';

    // Most accurate result (highest % of correct predictions for a finished match)
    let mostAccurateResult: string | null = null;
    const finishedMatches = matches.filter(m => m.is_finished);
    if (finishedMatches.length > 0) {
      let bestAccuracy = 0;
      finishedMatches.forEach(match => {
        const matchPreds = predictions.filter(p => p.match_id === match.id);
        const correctCount = matchPreds.filter(p => p.points_awarded === 2).length;
        const accuracy = matchPreds.length > 0 ? correctCount / matchPreds.length : 0;
        if (accuracy > bestAccuracy) {
          bestAccuracy = accuracy;
          mostAccurateResult = `${match.home_score}-${match.away_score} (${Math.round(accuracy * 100)}% exactos)`;
        }
      });
    }

    // Most voted team to win (based on predictions)
    const teamWinVotes = new Map<string, number>();
    const { data: matchesWithTeams } = await supabase
      .from('matches')
      .select(`
        id,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name)
      `)
      .eq('matchday_id', matchdayId);

    predictions.forEach(p => {
      const match = matchesWithTeams?.find(m => m.id === p.match_id);
      if (match) {
        if (p.predicted_home_score > p.predicted_away_score) {
          const team = (match.home_team as any)?.name;
          if (team) teamWinVotes.set(team, (teamWinVotes.get(team) || 0) + 1);
        } else if (p.predicted_away_score > p.predicted_home_score) {
          const team = (match.away_team as any)?.name;
          if (team) teamWinVotes.set(team, (teamWinVotes.get(team) || 0) + 1);
        }
      }
    });
    const mostVotedToWin = Array.from(teamWinVotes.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Percent of users with at least one exact result
    const usersWithExact = new Set(
      predictions.filter(p => p.points_awarded === 2).map(p => p.user_id)
    );
    const uniqueUsers = new Set(predictions.map(p => p.user_id));
    const percentWithExact = uniqueUsers.size > 0 
      ? Math.round((usersWithExact.size / uniqueUsers.size) * 100) 
      : 0;

    setCuriousStats({
      mostRepeatedScore,
      mostAccurateResult,
      mostVotedToWin,
      percentWithExact
    });
  };

  const getStateLabel = () => {
    switch (matchdayState) {
      case 'open': return { text: 'Abierta', color: 'text-green-500' };
      case 'in_progress': return { text: 'En curso', color: 'text-yellow-500' };
      case 'closed': return { text: 'Finalizada', color: 'text-muted-foreground' };
    }
  };

  const getMatchStatusBadge = (isFinished: boolean, isLive: boolean) => {
    if (isFinished) {
      return <span className="px-2 py-1 text-xs rounded-full bg-muted text-muted-foreground">Finalizado</span>;
    }
    if (isLive) {
      return <span className="px-2 py-1 text-xs rounded-full bg-red-500/20 text-red-400 animate-pulse">En vivo</span>;
    }
    return <span className="px-2 py-1 text-xs rounded-full bg-primary/20 text-primary">Pendiente</span>;
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="border-border/50">
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const stateLabel = getStateLabel();

  return (
    <div className="space-y-4 animate-slide-up">
      <div className="grid gap-4 md:grid-cols-2">
        {/* 1️⃣ Resumen de la Jornada */}
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-display">
              <BarChart3 className="w-4 h-4 text-secondary" />
              Resumen de la Jornada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-foreground">{matchdayName}</span>
              <span className={`text-sm font-medium ${stateLabel.color}`}>{stateLabel.text}</span>
            </div>
            
            {summary && (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-muted/50">
                    <p className="text-xl font-bold text-foreground">{summary.totalMatches}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <p className="text-xl font-bold text-green-500">{summary.playedMatches}</p>
                    <p className="text-xs text-muted-foreground">Jugados</p>
                  </div>
                  <div className="p-2 rounded-lg bg-primary/10">
                    <p className="text-xl font-bold text-primary">{summary.pendingMatches}</p>
                    <p className="text-xs text-muted-foreground">Pendientes</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Goal className="w-4 h-4 text-secondary" />
                  <span className="text-sm text-muted-foreground">Goles:</span>
                  <span className="font-semibold text-foreground">{summary.totalGoals}</span>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Avance</span>
                    <span className="font-medium text-foreground">{summary.progressPercent}%</span>
                  </div>
                  <Progress value={summary.progressPercent} className="h-2" />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* 2️⃣ Tu estado en la jornada */}
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-display">
              <User className="w-4 h-4 text-secondary" />
              Tu estado en la jornada
            </CardTitle>
          </CardHeader>
          <CardContent>
            {userStatus ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-secondary" />
                    <span className="text-muted-foreground">Posición</span>
                  </div>
                  <span className="text-2xl font-bold text-foreground">
                    {userStatus.position > 0 ? (
                      <>#{userStatus.position} <span className="text-sm text-muted-foreground">/ {userStatus.totalParticipants}</span></>
                    ) : (
                      <span className="text-sm text-muted-foreground">Sin participar</span>
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-secondary/10">
                    <p className="text-xl font-bold text-secondary">{userStatus.points}</p>
                    <p className="text-xs text-muted-foreground">Puntos</p>
                  </div>
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <p className="text-xl font-bold text-green-500">{userStatus.exactResults}</p>
                    <p className="text-xs text-muted-foreground">Exactos</p>
                  </div>
                  <div className="p-2 rounded-lg bg-primary/10">
                    <p className="text-xl font-bold text-primary">{userStatus.remainingMatches}</p>
                    <p className="text-xs text-muted-foreground">Por jugar</p>
                  </div>
                </div>

                {userStatus.remainingMatches > 0 && matchdayState !== 'closed' && (
                  <p className="text-xs text-muted-foreground text-center">
                    Aún puedes sumar hasta <span className="font-semibold text-secondary">{userStatus.remainingMatches * 2}</span> puntos
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Inicia sesión para ver tu estado</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3️⃣ Partido clave */}
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-display">
              <Star className="w-4 h-4 text-secondary" />
              Partido clave
            </CardTitle>
          </CardHeader>
          <CardContent>
            {keyMatch ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 text-center">
                    <p className="font-semibold text-foreground truncate">{keyMatch.homeTeam}</p>
                  </div>
                  <div className="px-3 text-center">
                    {keyMatch.isFinished || keyMatch.isLive ? (
                      <p className="text-xl font-bold text-foreground">
                        {keyMatch.homeScore} - {keyMatch.awayScore}
                      </p>
                    ) : (
                      <p className="text-xl font-bold text-muted-foreground">vs</p>
                    )}
                  </div>
                  <div className="flex-1 text-center">
                    <p className="font-semibold text-foreground truncate">{keyMatch.awayTeam}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  {getMatchStatusBadge(keyMatch.isFinished, keyMatch.isLive)}
                  <span className="text-xs text-muted-foreground">{keyMatch.reason}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Sin partidos en esta jornada</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 4️⃣ Estadísticas curiosas */}
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-display">
              <TrendingUp className="w-4 h-4 text-secondary" />
              Estadísticas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {curiousStats ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                  <Target className="w-4 h-4 text-secondary shrink-0" />
                  <span className="text-xs text-muted-foreground">Marcador más predicho:</span>
                  <span className="text-sm font-semibold text-foreground ml-auto">{curiousStats.mostRepeatedScore}</span>
                </div>

                {curiousStats.mostAccurateResult && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    <span className="text-xs text-muted-foreground">Más acertado:</span>
                    <span className="text-sm font-semibold text-foreground ml-auto">{curiousStats.mostAccurateResult}</span>
                  </div>
                )}

                {curiousStats.mostVotedToWin && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                    <Flame className="w-4 h-4 text-orange-500 shrink-0" />
                    <span className="text-xs text-muted-foreground">Favorito:</span>
                    <span className="text-sm font-semibold text-foreground ml-auto truncate max-w-[120px]">{curiousStats.mostVotedToWin}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                  <Users className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-xs text-muted-foreground">Con al menos 1 exacto:</span>
                  <span className="text-sm font-semibold text-foreground ml-auto">{curiousStats.percentWithExact}%</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Sin datos suficientes</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
