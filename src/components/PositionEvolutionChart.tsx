import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { TrendingUp, TrendingDown, Target, Crown, ChevronDown, Swords } from 'lucide-react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';

interface MatchdayData {
  id: string;
  name: string;
  shortName: string;
  isConcluded: boolean;
}

interface UserPositionData {
  matchdayId: string;
  matchdayName: string;
  position: number;
  points: number;
  cumulativePoints: number;
}

interface ParticipantEvolution {
  userId: string;
  displayName: string;
  positions: Map<string, { position: number; points: number; cumulative: number }>;
  isCurrentUser: boolean;
  latestPosition: number;
}

type ViewMode = 'my_progress' | 'vs_leader' | 'vs_rival' | 'top5' | 'top10';

export default function PositionEvolutionChart() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [matchdays, setMatchdays] = useState<MatchdayData[]>([]);
  const [participants, setParticipants] = useState<ParticipantEvolution[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('my_progress');
  const [selectedRival, setSelectedRival] = useState<string>('');
  const [isWeeklyOnly, setIsWeeklyOnly] = useState(false);
  const [userStats, setUserStats] = useState<{
    bestPosition: number;
    bestMatchday: string;
    worstDrop: number;
    dropFromTo: string;
    distanceToLeader: number;
  } | null>(null);

  useEffect(() => {
    fetchEvolutionData();
    checkUserCompetitionType();
  }, [user]);

  const checkUserCompetitionType = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('competition_type')
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (data?.competition_type === 'weekly') {
      setIsWeeklyOnly(true);
      setViewMode('top10'); // Default to top10 for weekly users
    }
  };

  const fetchEvolutionData = async () => {
    setLoading(true);
    try {
      // Get all concluded matchdays ordered by start_date
      const { data: matchdaysData } = await supabase
        .from('matchdays')
        .select('id, name, start_date, is_concluded')
        .eq('is_concluded', true)
        .order('start_date', { ascending: true });

      if (!matchdaysData || matchdaysData.length === 0) {
        setLoading(false);
        return;
      }

      // Map all matchdays with their original index for shortName
      const allMatchdays: MatchdayData[] = matchdaysData.map((md, idx) => ({
        id: md.id,
        name: md.name,
        shortName: `J${idx + 1}`,
        isConcluded: md.is_concluded
      }));

      // Skip J1 (first matchday) - only show from J2 onwards
      const processedMatchdays = allMatchdays.slice(1);

      setMatchdays(processedMatchdays);

      // Fetch leaderboard for each matchday and accumulate points
      const participantMap = new Map<string, ParticipantEvolution>();
      const cumulativePoints = new Map<string, number>();

      // First pass: accumulate points from all matchdays
      for (const matchday of processedMatchdays) {
        const { data: leaderboard } = await supabase
          .rpc('get_matchday_leaderboard', { p_matchday_id: matchday.id });

        if (leaderboard) {
          // Filter by season/both competition type
          const filteredLeaderboard = leaderboard.filter(
            e => e.competition_type === 'season' || e.competition_type === 'both'
          );
          
          filteredLeaderboard.forEach((entry) => {
            const points = Number(entry.total_points || 0);
            
            // Update cumulative points
            const prevCumulative = cumulativePoints.get(entry.user_id) || 0;
            const newCumulative = prevCumulative + points;
            cumulativePoints.set(entry.user_id, newCumulative);

            if (!participantMap.has(entry.user_id)) {
              participantMap.set(entry.user_id, {
                userId: entry.user_id,
                displayName: entry.display_name || 'Usuario',
                positions: new Map(),
                isCurrentUser: entry.user_id === user?.id,
                latestPosition: 0
              });
            }

            const participant = participantMap.get(entry.user_id)!;
            // Store cumulative points for now, we'll calculate positions after
            participant.positions.set(matchday.id, { 
              position: 0, // Will be calculated below
              points,
              cumulative: newCumulative
            });
          });
        }

        // Calculate positions based on cumulative points after each matchday
        const sortedByCumulative = Array.from(cumulativePoints.entries())
          .sort((a, b) => b[1] - a[1]); // Sort by cumulative points descending
        
        sortedByCumulative.forEach(([userId, _], index) => {
          const participant = participantMap.get(userId);
          if (participant) {
            const posData = participant.positions.get(matchday.id);
            if (posData) {
              posData.position = index + 1;
            }
            participant.latestPosition = index + 1;
          }
        });
      }

      const participantsList = Array.from(participantMap.values());
      setParticipants(participantsList);

      // Calculate user stats
      if (user) {
        const currentUserData = participantsList.find(p => p.isCurrentUser);
        if (currentUserData && currentUserData.positions.size > 0) {
          let bestPosition = Infinity;
          let bestMatchday = '';
          let worstDrop = 0;
          let dropFromTo = '';
          let prevPosition: number | null = null;

          processedMatchdays.forEach(md => {
            const posData = currentUserData.positions.get(md.id);
            if (posData) {
              if (posData.position < bestPosition) {
                bestPosition = posData.position;
                bestMatchday = md.name;
              }
              if (prevPosition !== null) {
                const drop = posData.position - prevPosition;
                if (drop > worstDrop) {
                  worstDrop = drop;
                  const prevMd = processedMatchdays[processedMatchdays.indexOf(md) - 1];
                  dropFromTo = `${prevMd?.shortName || ''} → ${md.shortName}`;
                }
              }
              prevPosition = posData.position;
            }
          });

          // Distance to leader (in cumulative points)
          const leader = participantsList.find(p => p.latestPosition === 1);
          const lastMatchday = processedMatchdays[processedMatchdays.length - 1];
          const userCumulative = currentUserData.positions.get(lastMatchday.id)?.cumulative || 0;
          const leaderCumulative = leader?.positions.get(lastMatchday.id)?.cumulative || 0;

          setUserStats({
            bestPosition: bestPosition === Infinity ? 0 : bestPosition,
            bestMatchday,
            worstDrop,
            dropFromTo,
            distanceToLeader: leaderCumulative - userCumulative
          });
        }
      }
    } catch (error) {
      console.error('Error fetching evolution data:', error);
    }
    setLoading(false);
  };

  // Prepare chart data based on view mode
  const chartData = useMemo(() => {
    if (matchdays.length === 0 || participants.length === 0) return [];

    return matchdays.map(md => {
      const dataPoint: Record<string, any> = {
        name: md.shortName,
        fullName: md.name
      };

      participants.forEach(p => {
        const posData = p.positions.get(md.id);
        if (posData) {
          dataPoint[p.userId] = posData.position;
          dataPoint[`${p.userId}_points`] = posData.cumulative;
        }
      });

      return dataPoint;
    });
  }, [matchdays, participants]);

  // Filter lines based on view mode
  const visibleParticipants = useMemo(() => {
    const currentUser = participants.find(p => p.isCurrentUser);
    const leader = participants.find(p => p.latestPosition === 1);
    const top5 = participants.filter(p => p.latestPosition <= 5);
    const top10 = participants.filter(p => p.latestPosition <= 10);
    const rival = selectedRival ? participants.find(p => p.userId === selectedRival) : null;

    switch (viewMode) {
      case 'my_progress':
        return currentUser ? [currentUser] : [];
      case 'vs_leader':
        const resultLeader = [];
        if (currentUser) resultLeader.push(currentUser);
        if (leader && !leader.isCurrentUser) resultLeader.push(leader);
        return resultLeader;
      case 'vs_rival':
        const resultRival = [];
        if (currentUser) resultRival.push(currentUser);
        if (rival && !rival.isCurrentUser) resultRival.push(rival);
        return resultRival;
      case 'top5':
        return top5;
      case 'top10':
        return top10;
      default:
        return [];
    }
  }, [viewMode, participants, selectedRival]);

  // Get available rivals (all participants except current user)
  const availableRivals = useMemo(() => {
    return participants
      .filter(p => !p.isCurrentUser)
      .sort((a, b) => a.latestPosition - b.latestPosition);
  }, [participants]);

  // Color palette
  const getLineColor = (participant: ParticipantEvolution, index: number) => {
    if (participant.isCurrentUser) return 'hsl(var(--secondary))'; // Gold for current user
    if (participant.latestPosition === 1) return 'hsl(142 76% 36%)'; // Green for leader
    if (participant.latestPosition === 2) return 'hsl(221 83% 53%)'; // Blue
    if (participant.latestPosition === 3) return 'hsl(262 83% 58%)'; // Purple
    
    // Others in muted colors
    const colors = ['hsl(var(--muted-foreground))', 'hsl(0 0% 60%)', 'hsl(0 0% 50%)'];
    return colors[index % colors.length];
  };

  if (loading) {
    return (
      <Card className="card-sports">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (matchdays.length < 2) {
    return null; // Don't show chart if less than 2 concluded matchdays
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;

    const matchdayData = chartData.find(d => d.name === label);
    
    // Sort payload by current position (entry.value is the position)
    const sortedPayload = [...payload].sort((a: any, b: any) => {
      const posA = a.value ?? Infinity;
      const posB = b.value ?? Infinity;
      return posA - posB;
    });
    
    return (
      <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg">
        <p className="font-semibold text-foreground mb-2">{matchdayData?.fullName || label}</p>
        {sortedPayload.map((entry: any, idx: number) => {
          const participant = participants.find(p => p.userId === entry.dataKey);
          const cumulativePoints = matchdayData?.[`${entry.dataKey}_points`] || 0;
          return (
            <div key={idx} className="flex items-center gap-2 text-sm">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: entry.stroke }}
              />
              <span className="text-muted-foreground">{participant?.displayName}:</span>
              <span className="font-medium text-foreground">
                #{entry.value} ({cumulativePoints} pts)
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Card className="card-sports animate-fade-in">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="w-5 h-5 text-secondary" />
            Evolución de Posiciones
            {isWeeklyOnly && (
              <span className="text-xs font-normal text-muted-foreground ml-2">
                (Competencia de Temporada)
              </span>
            )}
          </CardTitle>
          
          {isWeeklyOnly ? (
            <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
              👀 Modo espectador
            </div>
          ) : (
            <Select value={viewMode} onValueChange={(v) => {
              setViewMode(v as ViewMode);
              // Reset rival when switching away from vs_rival
              if (v !== 'vs_rival') {
                setSelectedRival('');
              }
            }}>
              <SelectTrigger className="w-[180px] bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="my_progress">Solo mi progreso</SelectItem>
                <SelectItem value="vs_leader">Yo vs Líder</SelectItem>
                <SelectItem value="vs_rival">
                  <span className="flex items-center gap-2">
                    <Swords className="w-4 h-4" />
                    1 vs 1
                  </span>
                </SelectItem>
                <SelectItem value="top5">Top 5</SelectItem>
                <SelectItem value="top10">Top 10</SelectItem>
              </SelectContent>
            </Select>
          )}
          
          {/* Rival selector - shown when vs_rival mode is active */}
          {viewMode === 'vs_rival' && !isWeeklyOnly && (
            <Select value={selectedRival} onValueChange={setSelectedRival}>
              <SelectTrigger className="w-[180px] bg-background/50">
                <SelectValue placeholder="Elige rival..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {availableRivals.map(rival => (
                  <SelectItem key={rival.userId} value={rival.userId}>
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">#{rival.latestPosition}</span>
                      {rival.displayName}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        
        {isWeeklyOnly && (
          <p className="text-sm text-muted-foreground mt-2 italic">
            🏆 Así va la competencia de temporada. ¡La próxima jornada podrías unirte!
          </p>
        )}
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="h-64 sm:h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart 
              data={chartData} 
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <XAxis 
                dataKey="name" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                reversed 
                domain={[1, 'dataMax']}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `#${value}`}
              />
              <Tooltip content={<CustomTooltip />} />
              
              {visibleParticipants.map((participant, idx) => (
                <Line
                  key={participant.userId}
                  type="monotone"
                  dataKey={participant.userId}
                  stroke={getLineColor(participant, idx)}
                  strokeWidth={participant.isCurrentUser ? 3 : 2}
                  dot={{ 
                    fill: getLineColor(participant, idx), 
                    strokeWidth: 0,
                    r: participant.isCurrentUser ? 5 : 3
                  }}
                  activeDot={{ 
                    r: participant.isCurrentUser ? 7 : 5,
                    stroke: 'hsl(var(--background))',
                    strokeWidth: 2
                  }}
                  name={participant.displayName}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 1v1 Stats - shown when rival is selected */}
        {viewMode === 'vs_rival' && selectedRival && !isWeeklyOnly && (() => {
          const currentUser = participants.find(p => p.isCurrentUser);
          const rival = participants.find(p => p.userId === selectedRival);
          const lastMd = matchdays[matchdays.length - 1];
          
          if (!currentUser || !rival || !lastMd) return null;
          
          const userPos = currentUser.positions.get(lastMd.id)?.position || 0;
          const rivalPos = rival.positions.get(lastMd.id)?.position || 0;
          const userPts = currentUser.positions.get(lastMd.id)?.cumulative || 0;
          const rivalPts = rival.positions.get(lastMd.id)?.cumulative || 0;
          const ptsDiff = userPts - rivalPts;
          const isWinning = ptsDiff > 0;
          const isTied = ptsDiff === 0;
          
          return (
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-gradient-to-r from-secondary/10 via-background to-primary/10">
                {/* User side */}
                <div className="flex-1 text-center">
                  <p className="font-semibold text-foreground">{currentUser.displayName}</p>
                  <p className="text-2xl font-display text-secondary">#{userPos}</p>
                  <p className="text-sm text-muted-foreground">{userPts} pts</p>
                </div>
                
                {/* VS indicator */}
                <div className="flex flex-col items-center gap-1">
                  <Swords className="w-6 h-6 text-muted-foreground" />
                  <div className={`text-sm font-semibold px-2 py-0.5 rounded ${
                    isTied ? 'bg-muted text-muted-foreground' :
                    isWinning ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {isTied ? 'Empate' : isWinning ? `+${ptsDiff} pts` : `${ptsDiff} pts`}
                  </div>
                </div>
                
                {/* Rival side */}
                <div className="flex-1 text-center">
                  <p className="font-semibold text-foreground">{rival.displayName}</p>
                  <p className="text-2xl font-display text-primary">#{rivalPos}</p>
                  <p className="text-sm text-muted-foreground">{rivalPts} pts</p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Stats Summary - only for season participants (not in 1v1 mode) */}
        {!isWeeklyOnly && viewMode !== 'vs_rival' && userStats && userStats.bestPosition > 0 && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                <Crown className="w-4 h-4 text-yellow-500" />
                <div>
                  <span className="text-muted-foreground">Mejor posición:</span>
                  <span className="ml-1 font-semibold text-foreground">
                    #{userStats.bestPosition}
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">
                    ({userStats.bestMatchday})
                  </span>
                </div>
              </div>
              
              {userStats.worstDrop > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                  <TrendingDown className="w-4 h-4 text-red-500" />
                  <div>
                    <span className="text-muted-foreground">Mayor caída:</span>
                    <span className="ml-1 font-semibold text-foreground">
                      -{userStats.worstDrop} pos
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">
                      ({userStats.dropFromTo})
                    </span>
                  </div>
                </div>
              )}
              
              {userStats.distanceToLeader > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                  <Target className="w-4 h-4 text-blue-500" />
                  <div>
                    <span className="text-muted-foreground">Al líder:</span>
                    <span className="ml-1 font-semibold text-foreground">
                      {userStats.distanceToLeader} pts
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
