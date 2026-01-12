import { Trophy, Crown, Sparkles, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface WinnerData {
  display_name: string;
  total_points: number;
  exact_results: number;
  total_predictions: number;
}

interface MatchdayWinnerProps {
  matchdayId: string;
  matchdayName: string;
}

export default function MatchdayWinner({ matchdayId, matchdayName }: MatchdayWinnerProps) {
  const [winner, setWinner] = useState<WinnerData | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkMatchdayStatus();
  }, [matchdayId]);

  const checkMatchdayStatus = async () => {
    // Check if all matches in this matchday are finished
    const { data: matches } = await supabase
      .from('matches')
      .select('is_finished')
      .eq('matchday_id', matchdayId);

    if (matches && matches.length > 0) {
      const allFinished = matches.every(m => m.is_finished);
      setIsFinished(allFinished);

      if (allFinished) {
        // Get the winner
        const { data: leaderboard } = await supabase.rpc('get_matchday_leaderboard', { 
          p_matchday_id: matchdayId 
        });

        if (leaderboard && leaderboard.length > 0) {
          const topEntry = leaderboard[0] as any;
          if (topEntry.total_predictions > 0) {
            setWinner({
              display_name: topEntry.display_name,
              total_points: topEntry.total_points,
              exact_results: topEntry.exact_results,
              total_predictions: topEntry.total_predictions
            });
          }
        }
      }
    }
    setLoading(false);
  };

  if (loading || !isFinished || !winner) {
    return null;
  }

  return (
    <div className="relative overflow-hidden rounded-2xl mb-6 animate-fade-in">
      {/* Background with gradient */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, hsl(42 90% 25%) 0%, hsl(42 85% 35%) 30%, hsl(42 90% 50%) 50%, hsl(42 85% 35%) 70%, hsl(42 90% 25%) 100%)'
        }}
      />
      
      {/* Animated sparkle overlay */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-2 left-[10%] animate-pulse">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div className="absolute top-4 right-[15%] animate-pulse delay-300">
          <Star className="w-3 h-3 text-white fill-white" />
        </div>
        <div className="absolute bottom-3 left-[20%] animate-pulse delay-500">
          <Star className="w-2 h-2 text-white fill-white" />
        </div>
        <div className="absolute top-6 left-[40%] animate-pulse delay-700">
          <Sparkles className="w-3 h-3 text-white" />
        </div>
        <div className="absolute bottom-4 right-[25%] animate-pulse delay-200">
          <Star className="w-3 h-3 text-white fill-white" />
        </div>
        <div className="absolute top-3 right-[35%] animate-pulse delay-400">
          <Sparkles className="w-2 h-2 text-white" />
        </div>
      </div>
      
      {/* Glow effect */}
      <div 
        className="absolute inset-0 opacity-50"
        style={{
          background: 'radial-gradient(ellipse at center, hsla(42, 90%, 60%, 0.4) 0%, transparent 70%)'
        }}
      />

      {/* Content */}
      <div className="relative z-10 p-6 text-center">
        {/* Crown icon */}
        <div className="flex justify-center mb-2">
          <div className="relative">
            <Crown className="w-10 h-10 text-white drop-shadow-lg animate-bounce" style={{ animationDuration: '2s' }} />
            <div className="absolute inset-0 blur-md">
              <Crown className="w-10 h-10 text-yellow-200" />
            </div>
          </div>
        </div>

        {/* Title */}
        <p className="text-xs font-semibold uppercase tracking-widest text-white/80 mb-1">
          🏆 Campeón de {matchdayName} 🏆
        </p>

        {/* Winner name */}
        <h2 className="text-3xl md:text-4xl font-display text-white drop-shadow-lg mb-3">
          {winner.display_name}
        </h2>

        {/* Stats */}
        <div className="flex items-center justify-center gap-6 text-white/90">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            <span className="text-xl font-bold">{winner.total_points}</span>
            <span className="text-sm opacity-80">pts</span>
          </div>
          <div className="h-6 w-px bg-white/30" />
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">{winner.exact_results}</span>
            <span className="text-sm opacity-80">exactos</span>
          </div>
        </div>

        {/* Decorative line */}
        <div className="mt-4 mx-auto w-24 h-1 rounded-full bg-white/30" />
      </div>

      {/* Bottom shine effect */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{
          background: 'linear-gradient(90deg, transparent, hsla(42, 90%, 70%, 0.8), transparent)'
        }}
      />
    </div>
  );
}
