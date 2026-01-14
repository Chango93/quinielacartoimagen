import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface MatchPayload {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  is_finished: boolean;
}

interface TeamCache {
  [id: string]: { name: string; short_name: string };
}

export function useScoreAlerts() {
  const { toast } = useToast();
  const teamsCache = useRef<TeamCache>({});
  const prevScores = useRef<Record<string, { home: number | null; away: number | null }>>({});

  useEffect(() => {
    // Pre-load teams for display names
    const loadTeams = async () => {
      const { data } = await supabase.from('teams').select('id, name, short_name');
      if (data) {
        data.forEach(t => {
          teamsCache.current[t.id] = { name: t.name, short_name: t.short_name };
        });
      }
    };
    loadTeams();

    // Subscribe to match updates
    const channel = supabase
      .channel('score-alerts')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
        },
        (payload) => {
          const match = payload.new as MatchPayload;
          const prev = prevScores.current[match.id];
          
          const homeChanged = prev && match.home_score !== null && prev.home !== match.home_score;
          const awayChanged = prev && match.away_score !== null && prev.away !== match.away_score;
          
          if (homeChanged || awayChanged) {
            const homeTeam = teamsCache.current[match.home_team_id]?.short_name || 'Local';
            const awayTeam = teamsCache.current[match.away_team_id]?.short_name || 'Visitante';
            
            toast({
              title: '⚽ ¡Gol!',
              description: `${homeTeam} ${match.home_score ?? 0} - ${match.away_score ?? 0} ${awayTeam}`,
              duration: 5000,
            });
          }
          
          // Update cache
          prevScores.current[match.id] = {
            home: match.home_score,
            away: match.away_score,
          };
        }
      )
      .subscribe();

    // Initialize score cache from current matches
    const initScores = async () => {
      const { data } = await supabase.from('matches').select('id, home_score, away_score');
      if (data) {
        data.forEach(m => {
          prevScores.current[m.id] = { home: m.home_score, away: m.away_score };
        });
      }
    };
    initScores();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast]);
}
