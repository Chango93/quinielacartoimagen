import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Trophy, Target, X as XIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface MatchPrediction {
  match_id: string;
  home_team_name: string;
  away_team_name: string;
  predicted_home_score: number;
  predicted_away_score: number;
  home_score: number | null;
  away_score: number | null;
  is_finished: boolean;
}

interface LeaderboardEntryDetailsProps {
  userId: string;
  displayName: string;
  matchdayId: string;
  matchdayName: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function LeaderboardEntryDetails({
  userId,
  displayName,
  matchdayId,
  matchdayName,
  isOpen,
  onClose
}: LeaderboardEntryDetailsProps) {
  const [predictions, setPredictions] = useState<MatchPrediction[]>([]);
  const [loading, setLoading] = useState(true);

  const calculatePoints = (predHome: number, predAway: number, realHome: number, realAway: number) => {
    if (predHome === realHome && predAway === realAway) return 2;
    const predOutcome = predHome === predAway ? 'draw' : predHome > predAway ? 'home' : 'away';
    const realOutcome = realHome === realAway ? 'draw' : realHome > realAway ? 'home' : 'away';
    return predOutcome === realOutcome ? 1 : 0;
  };

  useEffect(() => {
    if (!isOpen || !userId || !matchdayId) return;

    const fetchUserPredictions = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_matchday_predictions', { p_matchday_id: matchdayId });
      
      if (!error && data) {
        const userPreds = (data as any[])
          .filter(p => p.user_id === userId)
          .map(p => ({
            match_id: p.match_id,
            home_team_name: p.home_team_name,
            away_team_name: p.away_team_name,
            predicted_home_score: p.predicted_home_score,
            predicted_away_score: p.predicted_away_score,
            home_score: p.home_score,
            away_score: p.away_score,
            is_finished: p.is_finished
          }));
        setPredictions(userPreds);
      }
      setLoading(false);
    };

    fetchUserPredictions();
  }, [isOpen, userId, matchdayId]);

  const totalPoints = predictions.reduce((acc, p) => {
    if (p.home_score !== null && p.away_score !== null) {
      return acc + calculatePoints(p.predicted_home_score, p.predicted_away_score, p.home_score, p.away_score);
    }
    return acc;
  }, 0);

  const exactResults = predictions.filter(p => 
    p.home_score !== null && p.away_score !== null &&
    calculatePoints(p.predicted_home_score, p.predicted_away_score, p.home_score, p.away_score) === 2
  ).length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-card border-border max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Trophy className="w-5 h-5 text-secondary" />
            {displayName}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{matchdayName}</p>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center justify-center gap-6 p-4 bg-muted/50 rounded-lg">
              <div className="text-center">
                <p className="text-3xl font-display text-secondary glow-text">{totalPoints}</p>
                <p className="text-xs text-muted-foreground">Puntos</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-semibold text-foreground">{exactResults}</p>
                <p className="text-xs text-muted-foreground">Exactos</p>
              </div>
            </div>

            {/* Match breakdown */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Target className="w-4 h-4" />
                Desglose por partido
              </h4>
              <div className="space-y-2">
                {predictions.map((p) => {
                  const hasScore = p.home_score !== null && p.away_score !== null;
                  const pts = hasScore 
                    ? calculatePoints(p.predicted_home_score, p.predicted_away_score, p.home_score!, p.away_score!)
                    : null;

                  return (
                    <div 
                      key={p.match_id} 
                      className={`p-3 rounded-lg border transition-all ${
                        pts === 2 ? 'bg-green-500/10 border-green-500/30' :
                        pts === 1 ? 'bg-yellow-500/10 border-yellow-500/30' :
                        pts === 0 ? 'bg-red-500/10 border-red-500/30' :
                        'bg-muted/30 border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="text-sm font-medium text-foreground truncate cursor-help">
                                  {p.home_team_name} vs {p.away_team_name}
                                </p>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{p.home_team_name} vs {p.away_team_name}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <span>Predicción: <span className="font-mono text-foreground">{p.predicted_home_score}-{p.predicted_away_score}</span></span>
                            {hasScore && (
                              <span>Real: <span className="font-mono text-foreground">{p.home_score}-{p.away_score}</span></span>
                            )}
                          </div>
                        </div>
                        <div className={`ml-2 px-3 py-1 rounded-full text-sm font-bold ${
                          pts === 2 ? 'bg-green-500/20 text-green-400' :
                          pts === 1 ? 'bg-yellow-500/20 text-yellow-400' :
                          pts === 0 ? 'bg-red-500/20 text-red-400' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {pts !== null ? `+${pts}` : '-'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
