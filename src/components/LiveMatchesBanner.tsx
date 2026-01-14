import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Radio, CheckCircle2 } from 'lucide-react';

interface Team {
  id: string;
  name: string;
  short_name: string;
  logo_url?: string | null;
}

interface LiveMatch {
  id: string;
  home_team: Team;
  away_team: Team;
  home_score: number | null;
  away_score: number | null;
  match_date: string;
  is_finished: boolean;
  updated_at: string;
}

export default function LiveMatchesBanner() {
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([]);
  const [recentlyFinished, setRecentlyFinished] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [flashingMatch, setFlashingMatch] = useState<string | null>(null);
  const prevScores = useRef<Record<string, { home: number | null; away: number | null }>>({});

  const fetchMatches = async () => {
    // Get current matchday
    const { data: currentMatchday } = await supabase
      .from('matchdays')
      .select('id')
      .eq('is_current', true)
      .maybeSingle();

    if (!currentMatchday) {
      setLoading(false);
      return;
    }

    // Get all matches from current matchday with scores
    const { data } = await supabase
      .from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)')
      .eq('matchday_id', currentMatchday.id)
      .not('home_score', 'is', null)
      .not('away_score', 'is', null)
      .order('match_date');

    if (data) {
      // Get current time in Mexico timezone
      const nowMexico = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
      
      // Live matches: have scores but not finished
      const live = data.filter(m => !m.is_finished);
      
      // Recently finished: finished AND match started more than 1.5 hours ago (match likely over)
      // AND less than 4 hours ago (still recent)
      const recent = data.filter(m => {
        if (!m.is_finished) return false;
        // Convert match date to Mexico timezone for comparison
        const matchDateMexico = new Date(new Date(m.match_date).toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
        const timeSinceStart = nowMexico.getTime() - matchDateMexico.getTime();
        const hoursSinceStart = timeSinceStart / (1000 * 60 * 60);
        // Only show if match started 1.5+ hours ago (likely actually finished)
        // and less than 4 hours ago (still recent)
        return hoursSinceStart >= 1.5 && hoursSinceStart <= 4;
      });

      // Check for score changes on live matches (for goal animation)
      live.forEach(match => {
        const prev = prevScores.current[match.id];
        if (prev) {
          if (prev.home !== match.home_score || prev.away !== match.away_score) {
            setFlashingMatch(match.id);
            setTimeout(() => setFlashingMatch(null), 3000);
          }
        }
        prevScores.current[match.id] = { home: match.home_score, away: match.away_score };
      });

      setLiveMatches(live);
      setRecentlyFinished(recent);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMatches();

    // Subscribe to match updates
    const channel = supabase
      .channel('live-matches-banner')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
        },
        () => {
          fetchMatches();
        }
      )
      .subscribe();

    // Poll every 30 seconds as backup
    const interval = setInterval(fetchMatches, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  if (loading || (liveMatches.length === 0 && recentlyFinished.length === 0)) {
    return null;
  }

  return (
    <div className="space-y-4 mb-6">
      {/* Live Matches */}
      {liveMatches.length > 0 && (
        <div className="bg-gradient-to-r from-red-950/80 via-red-900/60 to-red-950/80 border border-red-500/30 rounded-xl p-4 animate-pulse-slow">
          <div className="flex items-center gap-2 mb-3">
            <Radio className="w-4 h-4 text-red-500 animate-pulse" />
            <span className="text-red-400 font-bold text-sm uppercase tracking-wider">En Vivo</span>
            <span className="text-xs text-red-400/60">({liveMatches.length})</span>
          </div>
          
          <div className="grid gap-3">
            {liveMatches.map(match => (
              <MatchRow 
                key={match.id} 
                match={match} 
                isFlashing={flashingMatch === match.id}
                isLive={true}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recently Finished */}
      {recentlyFinished.length > 0 && (
        <div className="bg-gradient-to-r from-muted/50 via-muted/30 to-muted/50 border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            <span className="text-muted-foreground font-medium text-sm">Recién Finalizados</span>
            <span className="text-xs text-muted-foreground/60">({recentlyFinished.length})</span>
          </div>
          
          <div className="grid gap-2">
            {recentlyFinished.map(match => (
              <MatchRow 
                key={match.id} 
                match={match} 
                isFlashing={false}
                isLive={false}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MatchRow({ match, isFlashing, isLive }: { match: LiveMatch; isFlashing: boolean; isLive: boolean }) {
  return (
    <div 
      className={`
        bg-background/40 rounded-lg p-3 transition-all duration-500
        ${isFlashing ? 'ring-2 ring-yellow-400 bg-yellow-500/20 scale-[1.02]' : ''}
      `}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Home team */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {match.home_team.logo_url && (
            <img src={match.home_team.logo_url} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
          )}
          <span className="text-foreground font-medium truncate text-sm">{match.home_team.short_name}</span>
        </div>
        
        {/* Score */}
        <div className={`
          flex items-center gap-2 px-3 py-1.5 rounded-lg font-display text-lg
          ${isFlashing 
            ? 'bg-yellow-500 text-black animate-bounce' 
            : isLive 
              ? 'bg-red-500/20 text-red-400' 
              : 'bg-muted/50 text-foreground'
          }
        `}>
          <span className="w-5 text-center">{match.home_score ?? 0}</span>
          <span className="text-muted-foreground text-sm">-</span>
          <span className="w-5 text-center">{match.away_score ?? 0}</span>
        </div>
        
        {/* Away team */}
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <span className="text-foreground font-medium truncate text-sm">{match.away_team.short_name}</span>
          {match.away_team.logo_url && (
            <img src={match.away_team.logo_url} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
          )}
        </div>
      </div>
      
      {isFlashing && (
        <div className="text-center mt-2">
          <span className="text-yellow-400 font-bold text-sm animate-pulse">⚽ ¡GOOOL!</span>
        </div>
      )}
    </div>
  );
}
