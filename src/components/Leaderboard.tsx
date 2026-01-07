import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Trophy, Medal, Target, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  total_points: number;
  exact_results: number;
  total_predictions: number;
}

interface LeaderboardProps {
  limit?: number;
  showTitle?: boolean;
}

export default function Leaderboard({ limit, showTitle = true }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    const { data, error } = await supabase.rpc('get_leaderboard');
    
    if (!error && data) {
      const limitedData = limit ? data.slice(0, limit) : data;
      setEntries(limitedData as LeaderboardEntry[]);
    }
    setLoading(false);
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

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(limit || 5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full bg-muted" />
        ))}
      </div>
    );
  }

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

      <div className="space-y-2">
        {entries.map((entry, index) => (
          <div
            key={entry.user_id}
            className={`match-card flex items-center justify-between animate-fade-in`}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex items-center gap-4">
              {/* Posición */}
              <div className={`position-badge ${getPositionStyle(index + 1)}`}>
                {getPositionIcon(index + 1)}
              </div>

              {/* Nombre */}
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

            {/* Puntos */}
            <div className="text-right">
              <p className="text-2xl font-display text-secondary glow-text">
                {entry.total_points}
              </p>
              <p className="text-xs text-muted-foreground">puntos</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
