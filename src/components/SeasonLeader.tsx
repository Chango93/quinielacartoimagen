import { Trophy, TrendingUp, Target, Flame } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface LeaderData {
  display_name: string;
  total_points: number;
  exact_results: number;
  total_predictions: number;
}

interface SeasonLeaderProps {
  compact?: boolean;
}

export default function SeasonLeader({ compact = false }: SeasonLeaderProps) {
  const [leader, setLeader] = useState<LeaderData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSeasonLeader();
  }, []);

  const fetchSeasonLeader = async () => {
    const { data, error } = await supabase.rpc('get_leaderboard');
    
    if (!error && data && data.length > 0) {
      // Filter for season participants
      const seasonData = (data as any[]).filter(
        e => e.competition_type === 'season' || e.competition_type === 'both'
      );
      
      if (seasonData.length > 0 && seasonData[0].total_predictions > 0) {
        setLeader({
          display_name: seasonData[0].display_name,
          total_points: seasonData[0].total_points,
          exact_results: seasonData[0].exact_results,
          total_predictions: seasonData[0].total_predictions
        });
      }
    }
    setLoading(false);
  };

  if (loading || !leader) {
    return null;
  }

  if (compact) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 p-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/20">
              <Flame className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Líder Temporada</p>
              <p className="font-display text-lg text-foreground">{leader.display_name}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-display text-primary">{leader.total_points}</p>
            <p className="text-xs text-muted-foreground">puntos</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl mb-6 animate-fade-in">
      {/* Background with green gradient */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, hsl(150 60% 20%) 0%, hsl(150 70% 30%) 50%, hsl(150 60% 25%) 100%)'
        }}
      />
      
      {/* Pattern overlay */}
      <div 
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      />

      {/* Glow effect */}
      <div 
        className="absolute inset-0 opacity-40"
        style={{
          background: 'radial-gradient(ellipse at center, hsla(150, 70%, 50%, 0.3) 0%, transparent 70%)'
        }}
      />

      {/* Content */}
      <div className="relative z-10 p-6 text-center">
        {/* Trophy icon */}
        <div className="flex justify-center mb-2">
          <div className="relative">
            <div className="p-3 rounded-full bg-white/10 backdrop-blur-sm">
              <TrendingUp className="w-8 h-8 text-white" />
            </div>
          </div>
        </div>

        {/* Title */}
        <p className="text-xs font-semibold uppercase tracking-widest text-white/70 mb-1">
          Líder de Temporada
        </p>

        {/* Leader name */}
        <h2 className="text-3xl md:text-4xl font-display text-white drop-shadow-lg mb-3">
          {leader.display_name}
        </h2>

        {/* Stats */}
        <div className="flex items-center justify-center gap-6 text-white/90">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            <span className="text-xl font-bold">{leader.total_points}</span>
            <span className="text-sm opacity-80">pts</span>
          </div>
          <div className="h-6 w-px bg-white/30" />
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4" />
            <span className="text-xl font-bold">{leader.exact_results}</span>
            <span className="text-sm opacity-80">exactos</span>
          </div>
        </div>

        {/* Decorative line */}
        <div className="mt-4 mx-auto w-24 h-1 rounded-full bg-white/20" />
      </div>

      {/* Bottom shine effect */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{
          background: 'linear-gradient(90deg, transparent, hsla(150, 70%, 50%, 0.6), transparent)'
        }}
      />
    </div>
  );
}
