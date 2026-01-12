import { Trophy, Crown, Sparkles, Star, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';

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
  const [winners, setWinners] = useState<WinnerData[]>([]);
  const [isConcluded, setIsConcluded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkMatchdayStatus();
  }, [matchdayId]);

  const checkMatchdayStatus = async () => {
    // Check if matchday is marked as concluded
    const { data: matchday } = await supabase
      .from('matchdays')
      .select('is_concluded')
      .eq('id', matchdayId)
      .single();

    if (matchday?.is_concluded) {
      setIsConcluded(true);
      
      // Get the winners
      const { data: leaderboard } = await supabase.rpc('get_matchday_leaderboard', { 
        p_matchday_id: matchdayId 
      });

      if (leaderboard && leaderboard.length > 0) {
        const participants = (leaderboard as any[]).filter(e => e.total_predictions > 0);
        
        if (participants.length > 0) {
          const maxPoints = participants[0].total_points;
          const champs = participants.filter(p => p.total_points === maxPoints);
          setWinners(champs.map(c => ({
            display_name: c.display_name,
            total_points: c.total_points,
            exact_results: c.exact_results,
            total_predictions: c.total_predictions
          })));
        }
      }
    }
    setLoading(false);
  };

  if (loading || !isConcluded || winners.length === 0) {
    return null;
  }

  const isTie = winners.length > 1;

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
        <div className="flex items-center justify-center gap-2 mb-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/80">
            🏆 {isTie ? `Campeones de ${matchdayName}` : `Campeón de ${matchdayName}`} 🏆
          </p>
          {isTie && (
            <Badge className="bg-white/20 text-white border-white/30 text-xs">
              <Users className="w-3 h-3 mr-1" />
              Empate
            </Badge>
          )}
        </div>

        {/* Winner names */}
        <div className="space-y-2 mb-3">
          {winners.map((winner, idx) => (
            <h2 key={idx} className="text-2xl md:text-3xl font-display text-white drop-shadow-lg">
              {winner.display_name}
            </h2>
          ))}
        </div>

        {/* Stats (show first winner's stats, they're all the same for ties) */}
        <div className="flex items-center justify-center gap-6 text-white/90">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            <span className="text-xl font-bold">{winners[0].total_points}</span>
            <span className="text-sm opacity-80">pts</span>
          </div>
          <div className="h-6 w-px bg-white/30" />
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">{winners[0].exact_results}</span>
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
