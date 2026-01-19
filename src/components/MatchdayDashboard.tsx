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
  Goal,
  Zap,
  AlertTriangle
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

// Stats para jornada pre-inicio
interface PreMatchdayStats {
  participationPercent: number;
  totalParticipants: number;
  mostBackedTeam: string | null;
  mostBackedTeamVotes: number;
  expectedGoals: 'low' | 'medium' | 'high';
  avgPredictedGoals: number;
  mostPolarizedMatch: string | null;
  mostPolarizedPercent: number;
  mostUnbalancedMatch: string | null;
  mostUnbalancedPercent: number;
}

// Stats para jornada en curso/finalizada
interface InProgressStats {
  percentWithExact: number;
  difficultyLabel: string;
  mostBackedTeam: string | null;
  mostBackedTeamRewarded: boolean | null;
  remainingMatchesCanChange: number;
  mostAccurateScore: string | null;
  mostAccurateScorePercent: number;
  mostPolarizedMatch: string | null;
  mostPolarizedPercent: number;
  mostUnbalancedMatch: string | null;
  mostUnbalancedPercent: number;
}

type MatchdayState = 'pre_start' | 'in_progress' | 'closed';

export default function MatchdayDashboard({ matchdayId, matchdayName, isOpen }: MatchdayDashboardProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<MatchdaySummary | null>(null);
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [keyMatch, setKeyMatch] = useState<KeyMatch | null>(null);
  const [preStats, setPreStats] = useState<PreMatchdayStats | null>(null);
  const [inProgressStats, setInProgressStats] = useState<InProgressStats | null>(null);
  const [matchdayState, setMatchdayState] = useState<MatchdayState>('pre_start');

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
        fetchStats()
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
    const matchesWithScores = matches.filter(m => m.home_score !== null && m.away_score !== null);
    const pendingMatches = matches.filter(m => !m.is_finished).length;
    const totalGoals = matchesWithScores.reduce((sum, m) => sum + (m.home_score || 0) + (m.away_score || 0), 0);
    const progressPercent = matches.length > 0 ? Math.round((playedMatches / matches.length) * 100) : 0;

    // Determine matchday state
    if (matchesWithScores.length === 0 && isOpen) {
      setMatchdayState('pre_start');
    } else if (playedMatches < matches.length) {
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

    const { data: leaderboard } = await supabase
      .rpc('get_matchday_leaderboard', { p_matchday_id: matchdayId });

    if (!leaderboard) return;

    const userEntry = leaderboard.find(entry => entry.user_id === user.id);
    const position = leaderboard.findIndex(entry => entry.user_id === user.id) + 1;

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

    const { data: predictions } = await supabase
      .from('predictions')
      .select('match_id')
      .in('match_id', matches.map(m => m.id));

    const predictionCounts = new Map<string, number>();
    predictions?.forEach(p => {
      predictionCounts.set(p.match_id, (predictionCounts.get(p.match_id) || 0) + 1);
    });

    const pendingMatches = matches.filter(m => !m.is_finished);
    let selectedMatch = pendingMatches.length > 0
      ? pendingMatches.reduce((best, current) => {
          const bestCount = predictionCounts.get(best.id) || 0;
          const currentCount = predictionCounts.get(current.id) || 0;
          return currentCount > bestCount ? current : best;
        }, pendingMatches[0])
      : matches[0];

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
      reason = `${predCount} predicciones`;
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

  const fetchStats = async () => {
    const { data: matches } = await supabase
      .from('matches')
      .select(`
        id, 
        home_score, 
        away_score, 
        is_finished,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name)
      `)
      .eq('matchday_id', matchdayId);

    if (!matches) return;

    const { data: predictions } = await supabase
      .from('predictions')
      .select('user_id, match_id, predicted_home_score, predicted_away_score, points_awarded')
      .in('match_id', matches.map(m => m.id));

    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('user_id')
      .in('competition_type', ['season', 'both', 'weekly']);

    const totalRegisteredUsers = allProfiles?.length || 0;
    const uniqueParticipants = new Set(predictions?.map(p => p.user_id) || []);
    const matchesWithScores = matches.filter(m => m.home_score !== null && m.away_score !== null);
    const hasResults = matchesWithScores.length > 0;

    // Calculate team votes
    const teamWinVotes = new Map<string, { votes: number; matchIds: string[] }>();
    predictions?.forEach(p => {
      const match = matches.find(m => m.id === p.match_id);
      if (match) {
        if (p.predicted_home_score > p.predicted_away_score) {
          const team = (match.home_team as any)?.name;
          if (team) {
            const current = teamWinVotes.get(team) || { votes: 0, matchIds: [] };
            teamWinVotes.set(team, { 
              votes: current.votes + 1, 
              matchIds: [...current.matchIds, match.id] 
            });
          }
        } else if (p.predicted_away_score > p.predicted_home_score) {
          const team = (match.away_team as any)?.name;
          if (team) {
            const current = teamWinVotes.get(team) || { votes: 0, matchIds: [] };
            teamWinVotes.set(team, { 
              votes: current.votes + 1, 
              matchIds: [...current.matchIds, match.id] 
            });
          }
        }
      }
    });

    const topTeam = Array.from(teamWinVotes.entries())
      .sort((a, b) => b[1].votes - a[1].votes)[0];

    if (!hasResults) {
      // PRE-MATCHDAY STATS
      const participationPercent = totalRegisteredUsers > 0 
        ? Math.round((uniqueParticipants.size / totalRegisteredUsers) * 100)
        : 0;

      // Expected goals based on predictions
      const totalPredictedGoals = predictions?.reduce((sum, p) => 
        sum + p.predicted_home_score + p.predicted_away_score, 0) || 0;
      const avgPredictedGoals = predictions && predictions.length > 0 
        ? totalPredictedGoals / predictions.length 
        : 0;
      
      let expectedGoals: 'low' | 'medium' | 'high' = 'medium';
      if (avgPredictedGoals < 2) expectedGoals = 'low';
      else if (avgPredictedGoals > 3.5) expectedGoals = 'high';

      // Analyze match polarity (how divided predictions are)
      let mostPolarizedMatch: string | null = null;
      let mostPolarizedPercent = 0;
      let mostUnbalancedMatch: string | null = null;
      let mostUnbalancedPercent = 0;

      matches.forEach(match => {
        const matchPreds = predictions?.filter(p => p.match_id === match.id) || [];
        if (matchPreds.length < 3) return; // Need at least 3 predictions

        let homeWins = 0;
        let awayWins = 0;
        let draws = 0;
        
        matchPreds.forEach(p => {
          if (p.predicted_home_score > p.predicted_away_score) homeWins++;
          else if (p.predicted_away_score > p.predicted_home_score) awayWins++;
          else draws++;
        });

        const total = matchPreds.length;
        const maxSide = Math.max(homeWins, awayWins);
        const minSide = Math.min(homeWins, awayWins);
        
        // Polarized = divided predictions (close to 50/50 between home/away)
        const polarizedRatio = minSide / (homeWins + awayWins || 1);
        if (polarizedRatio > 0.35 && polarizedRatio > mostPolarizedPercent) {
          mostPolarizedPercent = polarizedRatio;
          mostPolarizedMatch = `${(match.home_team as any)?.name} vs ${(match.away_team as any)?.name}`;
        }

        // Unbalanced = one team heavily favored
        const unbalancedPercent = (maxSide / total) * 100;
        if (unbalancedPercent > 60 && unbalancedPercent > mostUnbalancedPercent) {
          mostUnbalancedPercent = unbalancedPercent;
          const favored = homeWins > awayWins ? (match.home_team as any)?.name : (match.away_team as any)?.name;
          const opponent = homeWins > awayWins ? (match.away_team as any)?.name : (match.home_team as any)?.name;
          mostUnbalancedMatch = `${favored} vs ${opponent}`;
        }
      });

      setPreStats({
        participationPercent,
        totalParticipants: uniqueParticipants.size,
        mostBackedTeam: topTeam?.[0] || null,
        mostBackedTeamVotes: topTeam?.[1].votes || 0,
        expectedGoals,
        avgPredictedGoals: Math.round(avgPredictedGoals * 10) / 10,
        mostPolarizedMatch,
        mostPolarizedPercent: Math.round(mostPolarizedPercent * 100),
        mostUnbalancedMatch,
        mostUnbalancedPercent: Math.round(mostUnbalancedPercent)
      });
      setInProgressStats(null);
    } else {
      // IN-PROGRESS / CLOSED STATS
      const usersWithExact = new Set(
        predictions?.filter(p => p.points_awarded === 2).map(p => p.user_id) || []
      );
      const percentWithExact = uniqueParticipants.size > 0 
        ? Math.round((usersWithExact.size / uniqueParticipants.size) * 100) 
        : 0;

      let difficultyLabel = 'Normal';
      if (percentWithExact < 20) difficultyLabel = 'Muy difícil';
      else if (percentWithExact < 40) difficultyLabel = 'Complicada';
      else if (percentWithExact > 60) difficultyLabel = 'Accesible';

      // Check if most backed team was rewarded
      let mostBackedTeamRewarded: boolean | null = null;
      if (topTeam) {
        const teamMatchIds = topTeam[1].matchIds;
        const finishedTeamMatches = matches.filter(m => 
          teamMatchIds.includes(m.id) && m.is_finished
        );
        if (finishedTeamMatches.length > 0) {
          // Check if team won any of those matches
          const teamWins = finishedTeamMatches.filter(m => {
            const isHome = (m.home_team as any)?.name === topTeam[0];
            if (isHome) {
              return (m.home_score || 0) > (m.away_score || 0);
            } else {
              return (m.away_score || 0) > (m.home_score || 0);
            }
          });
          mostBackedTeamRewarded = teamWins.length > 0;
        }
      }

      // Most accurate score
      let mostAccurateScore: string | null = null;
      let mostAccurateScorePercent = 0;
      const finishedMatches = matches.filter(m => m.is_finished);
      finishedMatches.forEach(match => {
        const matchPreds = predictions?.filter(p => p.match_id === match.id) || [];
        const exactCount = matchPreds.filter(p => p.points_awarded === 2).length;
        const percent = matchPreds.length > 0 ? (exactCount / matchPreds.length) * 100 : 0;
        if (percent > mostAccurateScorePercent) {
          mostAccurateScorePercent = percent;
          mostAccurateScore = `${match.home_score}-${match.away_score}`;
        }
      });

      // Remaining matches that can change standings
      const remainingMatchesCanChange = matches.filter(m => !m.is_finished).length;

      // Analyze match polarity (same logic as pre-matchday)
      let mostPolarizedMatch: string | null = null;
      let mostPolarizedPercent = 0;
      let mostUnbalancedMatch: string | null = null;
      let mostUnbalancedPercent = 0;

      matches.forEach(match => {
        const matchPreds = predictions?.filter(p => p.match_id === match.id) || [];
        if (matchPreds.length < 3) return;

        let homeWins = 0;
        let awayWins = 0;
        
        matchPreds.forEach(p => {
          if (p.predicted_home_score > p.predicted_away_score) homeWins++;
          else if (p.predicted_away_score > p.predicted_home_score) awayWins++;
        });

        const total = matchPreds.length;
        const maxSide = Math.max(homeWins, awayWins);
        const minSide = Math.min(homeWins, awayWins);
        
        const polarizedRatio = minSide / (homeWins + awayWins || 1);
        if (polarizedRatio > 0.35 && polarizedRatio > mostPolarizedPercent) {
          mostPolarizedPercent = polarizedRatio;
          mostPolarizedMatch = `${(match.home_team as any)?.name} vs ${(match.away_team as any)?.name}`;
        }

        const unbalancedPercent = (maxSide / total) * 100;
        if (unbalancedPercent > 60 && unbalancedPercent > mostUnbalancedPercent) {
          mostUnbalancedPercent = unbalancedPercent;
          const favored = homeWins > awayWins ? (match.home_team as any)?.name : (match.away_team as any)?.name;
          const opponent = homeWins > awayWins ? (match.away_team as any)?.name : (match.home_team as any)?.name;
          mostUnbalancedMatch = `${favored} vs ${opponent}`;
        }
      });

      setInProgressStats({
        percentWithExact,
        difficultyLabel,
        mostBackedTeam: topTeam?.[0] || null,
        mostBackedTeamRewarded,
        remainingMatchesCanChange,
        mostAccurateScore,
        mostAccurateScorePercent: Math.round(mostAccurateScorePercent),
        mostPolarizedMatch,
        mostPolarizedPercent: Math.round(mostPolarizedPercent * 100),
        mostUnbalancedMatch,
        mostUnbalancedPercent: Math.round(mostUnbalancedPercent)
      });
      setPreStats(null);
    }
  };

  const getStateLabel = () => {
    switch (matchdayState) {
      case 'pre_start': return { text: 'Por iniciar', color: 'text-green-500', icon: Clock };
      case 'in_progress': return { text: 'En curso', color: 'text-yellow-500', icon: Zap };
      case 'closed': return { text: 'Finalizada', color: 'text-muted-foreground', icon: CheckCircle2 };
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

  const getExpectedGoalsLabel = (level: 'low' | 'medium' | 'high') => {
    switch (level) {
      case 'low': return { text: 'Pocos goles esperados', color: 'text-blue-400' };
      case 'medium': return { text: 'Goles moderados esperados', color: 'text-yellow-400' };
      case 'high': return { text: 'Muchos goles esperados', color: 'text-orange-400' };
    }
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
  const StateIcon = stateLabel.icon;

  return (
    <div className="space-y-4 animate-slide-up">
      <div className="grid gap-4 md:grid-cols-2">
        {/* 1️⃣ Resumen de la Jornada */}
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-display">
              <BarChart3 className="w-4 h-4 text-secondary" />
              Resumen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-foreground">{matchdayName}</span>
              <span className={`flex items-center gap-1 text-sm font-medium ${stateLabel.color}`}>
                <StateIcon className="w-3 h-3" />
                {stateLabel.text}
              </span>
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

                {matchdayState !== 'pre_start' && (
                  <div className="flex items-center gap-2">
                    <Goal className="w-4 h-4 text-secondary" />
                    <span className="text-sm text-muted-foreground">Goles:</span>
                    <span className="font-semibold text-foreground">{summary.totalGoals}</span>
                  </div>
                )}

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
              Tu estado
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

                {matchdayState !== 'pre_start' ? (
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
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    La jornada aún no comienza
                  </p>
                )}

                {userStatus.remainingMatches > 0 && matchdayState === 'in_progress' && (
                  <p className="text-xs text-muted-foreground text-center">
                    Puedes sumar hasta <span className="font-semibold text-secondary">{userStatus.remainingMatches * 2}</span> puntos más
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
              {matchdayState === 'pre_start' ? 'Partido más esperado' : 'Partido clave'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {keyMatch ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 text-center">
                    <p className="font-semibold text-foreground text-sm truncate">{keyMatch.homeTeam}</p>
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
                    <p className="font-semibold text-foreground text-sm truncate">{keyMatch.awayTeam}</p>
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

        {/* 4️⃣ Estadísticas - Dinámicas según estado */}
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-display">
              <TrendingUp className="w-4 h-4 text-secondary" />
              {matchdayState === 'pre_start' ? 'Expectativa' : 'Desempeño'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {matchdayState === 'pre_start' && preStats ? (
              <div className="space-y-2">
                {/* Participación */}
                <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                  <Users className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-foreground">
                      {preStats.participationPercent}% ya capturó su quiniela
                    </span>
                    <span className="text-xs text-muted-foreground block">
                      {preStats.totalParticipants} participantes registrados
                    </span>
                  </div>
                </div>

                {/* Equipo favorito */}
                {preStats.mostBackedTeam && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                    <Flame className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-foreground truncate block">
                        {preStats.mostBackedTeam}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Equipo más respaldado ({preStats.mostBackedTeamVotes} votos)
                      </span>
                    </div>
                  </div>
                )}

                {/* Expectativa de goles */}
                <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                  <Goal className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-semibold ${getExpectedGoalsLabel(preStats.expectedGoals).color}`}>
                      {getExpectedGoalsLabel(preStats.expectedGoals).text}
                    </span>
                    <span className="text-xs text-muted-foreground block">
                      Promedio predicho: {preStats.avgPredictedGoals} goles/partido
                    </span>
                  </div>
                </div>

                {/* Partido más polarizado */}
                {preStats.mostPolarizedMatch && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                    <Zap className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-muted-foreground block">Partido más polarizado</span>
                      <span className="text-sm font-semibold text-foreground truncate block">
                        {preStats.mostPolarizedMatch}
                      </span>
                      <span className="text-xs text-muted-foreground">Opiniones muy divididas</span>
                    </div>
                  </div>
                )}

                {/* Partido más desequilibrado */}
                {preStats.mostUnbalancedMatch && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                    <TrendingUp className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-muted-foreground block">Partido más desequilibrado</span>
                      <span className="text-sm font-semibold text-foreground truncate block">
                        {preStats.mostUnbalancedMatch}
                      </span>
                      <span className="text-xs text-muted-foreground">{preStats.mostUnbalancedPercent}% apoya al favorito</span>
                    </div>
                  </div>
                )}
              </div>
            ) : inProgressStats ? (
              <div className="space-y-2">
                {/* Dificultad */}
                <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${
                    inProgressStats.percentWithExact < 30 ? 'text-red-400' : 
                    inProgressStats.percentWithExact < 50 ? 'text-yellow-400' : 'text-green-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-foreground">
                      Jornada {inProgressStats.difficultyLabel.toLowerCase()}
                    </span>
                    <span className="text-xs text-muted-foreground block">
                      {inProgressStats.percentWithExact}% de usuarios con al menos un exacto
                    </span>
                  </div>
                </div>

                {/* Equipo favorito y resultado */}
                {inProgressStats.mostBackedTeam && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                    <Flame className={`w-4 h-4 shrink-0 mt-0.5 ${
                      inProgressStats.mostBackedTeamRewarded === true ? 'text-green-500' : 
                      inProgressStats.mostBackedTeamRewarded === false ? 'text-red-400' : 'text-orange-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-foreground truncate block">
                        {inProgressStats.mostBackedTeam}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {inProgressStats.mostBackedTeamRewarded === true ? 'Confianza recompensada ✓' :
                         inProgressStats.mostBackedTeamRewarded === false ? 'Confianza sin recompensa' :
                         'Equipo más respaldado'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Resultado más acertado */}
                {inProgressStats.mostAccurateScore && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-foreground">
                        {inProgressStats.mostAccurateScore}
                      </span>
                      <span className="text-xs text-muted-foreground block">
                        Resultado más acertado ({inProgressStats.mostAccurateScorePercent}% exactos)
                      </span>
                    </div>
                  </div>
                )}

                {/* Partidos restantes */}
                {inProgressStats.remainingMatchesCanChange > 0 && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                    <Target className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-foreground">
                        {inProgressStats.remainingMatchesCanChange} partidos restantes
                      </span>
                      <span className="text-xs text-muted-foreground block">
                        Aún pueden mover la tabla
                      </span>
                    </div>
                  </div>
                )}

                {/* Partido más polarizado */}
                {inProgressStats.mostPolarizedMatch && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                    <Zap className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-muted-foreground block">Partido más polarizado</span>
                      <span className="text-sm font-semibold text-foreground truncate block">
                        {inProgressStats.mostPolarizedMatch}
                      </span>
                      <span className="text-xs text-muted-foreground">Opiniones muy divididas</span>
                    </div>
                  </div>
                )}

                {/* Partido más desequilibrado */}
                {inProgressStats.mostUnbalancedMatch && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                    <TrendingUp className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-muted-foreground block">Partido más desequilibrado</span>
                      <span className="text-sm font-semibold text-foreground truncate block">
                        {inProgressStats.mostUnbalancedMatch}
                      </span>
                      <span className="text-xs text-muted-foreground">{inProgressStats.mostUnbalancedPercent}% apoya al favorito</span>
                    </div>
                  </div>
                )}
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
