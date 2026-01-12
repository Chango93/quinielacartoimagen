import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Trophy, Crown, CheckCircle2, Clock, Users } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

interface ChampionData {
  user_id: string;
  display_name: string;
  total_points: number;
  exact_results: number;
  total_predictions: number;
}

interface MatchdayChampionsProps {
  matchdayId: string;
  matchdayName: string;
}

export default function MatchdayChampions({ matchdayId, matchdayName }: MatchdayChampionsProps) {
  const [champions, setChampions] = useState<ChampionData[]>([]);
  const [seasonLeaders, setSeasonLeaders] = useState<ChampionData[]>([]);
  const [matchStatus, setMatchStatus] = useState<{ total: number; finished: number }>({ total: 0, finished: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [matchdayId]);

  const fetchData = async () => {
    setLoading(true);
    
    // Get match status
    const { data: matches } = await supabase
      .from('matches')
      .select('is_finished')
      .eq('matchday_id', matchdayId);

    if (matches) {
      const total = matches.length;
      const finished = matches.filter(m => m.is_finished).length;
      setMatchStatus({ total, finished });

      // Only fetch champions if all matches are finished
      if (total > 0 && finished === total) {
        // Get matchday leaderboard
        const { data: leaderboard } = await supabase.rpc('get_matchday_leaderboard', { 
          p_matchday_id: matchdayId 
        });

        if (leaderboard && leaderboard.length > 0) {
          // Filter participants with predictions
          const participants = (leaderboard as any[]).filter(e => e.total_predictions > 0);
          
          if (participants.length > 0) {
            // Find max points
            const maxPoints = participants[0].total_points;
            // Get all champions (ties)
            const champs = participants.filter(p => p.total_points === maxPoints);
            setChampions(champs);
          }
        }

        // Get season leaders
        const { data: seasonData } = await supabase.rpc('get_leaderboard');
        if (seasonData && seasonData.length > 0) {
          const seasonParticipants = (seasonData as any[]).filter(
            e => (e.competition_type === 'season' || e.competition_type === 'both') && e.total_predictions > 0
          );
          
          if (seasonParticipants.length > 0) {
            const maxSeasonPoints = seasonParticipants[0].total_points;
            const leaders = seasonParticipants.filter(p => p.total_points === maxSeasonPoints);
            setSeasonLeaders(leaders);
          }
        }
      }
    }
    
    setLoading(false);
  };

  const isComplete = matchStatus.total > 0 && matchStatus.finished === matchStatus.total;

  if (loading) {
    return (
      <div className="p-3 bg-muted/30 rounded-lg animate-pulse">
        <div className="h-4 bg-muted rounded w-1/2" />
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Status indicator */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Checkbox 
            id={`concluded-${matchdayId}`}
            checked={isComplete}
            disabled
            className={isComplete ? 'data-[state=checked]:bg-primary data-[state=checked]:border-primary' : ''}
          />
          <label 
            htmlFor={`concluded-${matchdayId}`}
            className={`text-sm font-medium ${isComplete ? 'text-primary' : 'text-muted-foreground'}`}
          >
            {isComplete ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                Jornada concluida
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {matchStatus.finished}/{matchStatus.total} partidos finalizados
              </span>
            )}
          </label>
        </div>
      </div>

      {/* Champions section - only show if complete */}
      {isComplete && champions.length > 0 && (
        <div className="p-4 rounded-xl border-2 border-secondary/50 bg-gradient-to-r from-secondary/10 via-secondary/5 to-secondary/10">
          <div className="flex items-center gap-2 mb-3">
            <Crown className="w-5 h-5 text-secondary" />
            <span className="text-sm font-semibold text-secondary">
              {champions.length > 1 ? `Campeones de ${matchdayName}` : `Campeón de ${matchdayName}`}
            </span>
            {champions.length > 1 && (
              <Badge variant="outline" className="border-secondary/50 text-secondary text-xs">
                <Users className="w-3 h-3 mr-1" />
                Empate
              </Badge>
            )}
          </div>
          
          <div className="space-y-2">
            {champions.map((champ, idx) => (
              <div 
                key={champ.user_id}
                className="flex items-center justify-between bg-card/50 rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center">
                    <Trophy className="w-4 h-4 text-secondary" />
                  </div>
                  <span className="font-semibold text-foreground">{champ.display_name}</span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-display text-secondary">{champ.total_points}</span>
                  <span className="text-xs text-muted-foreground ml-1">pts</span>
                  <span className="text-xs text-muted-foreground ml-2">({champ.exact_results} exactos)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Season leaders - only show if complete and there are season participants */}
      {isComplete && seasonLeaders.length > 0 && (
        <div className="p-4 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-5 h-5 text-primary" />
            <span className="text-sm font-semibold text-primary">
              {seasonLeaders.length > 1 ? 'Líderes de Temporada' : 'Líder de Temporada'}
            </span>
            {seasonLeaders.length > 1 && (
              <Badge variant="outline" className="border-primary/50 text-primary text-xs">
                <Users className="w-3 h-3 mr-1" />
                Empate
              </Badge>
            )}
          </div>
          
          <div className="space-y-2">
            {seasonLeaders.map((leader, idx) => (
              <div 
                key={leader.user_id}
                className="flex items-center justify-between bg-card/50 rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="font-display text-primary">{idx + 1}</span>
                  </div>
                  <span className="font-semibold text-foreground">{leader.display_name}</span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-display text-primary">{leader.total_points}</span>
                  <span className="text-xs text-muted-foreground ml-1">pts acumulados</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No season participants message */}
      {isComplete && seasonLeaders.length === 0 && champions.length > 0 && (
        <p className="text-xs text-muted-foreground italic">
          Sin participantes en formato Temporada para esta jornada
        </p>
      )}
    </div>
  );
}
