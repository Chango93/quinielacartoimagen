import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Users, Trophy, DollarSign, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

type CompetitionType = 'weekly' | 'season' | 'both';

interface Participant {
  user_id: string;
  display_name: string;
  competition_type: CompetitionType;
}

const WEEKLY_FEE = 50; // pesos por jugador semanal

export default function ParticipantsSummary() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchParticipants();
  }, []);

  const fetchParticipants = async () => {
    const { data } = await supabase
      .from('profiles_public')
      .select('user_id, display_name, competition_type');

    if (data) {
      setParticipants(
        (data as Participant[]).filter(p => p.user_id && p.competition_type)
      );
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="card-sports p-6 space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const weeklyOnly = participants.filter(p => p.competition_type === 'weekly');
  const seasonOnly = participants.filter(p => p.competition_type === 'season');
  const both = participants.filter(p => p.competition_type === 'both');

  // Weekly participants = those who play weekly or both
  const weeklyPlayers = [...weeklyOnly, ...both];
  // Season participants = those who play season or both
  const seasonPlayers = [...seasonOnly, ...both];

  const weeklyPrizePool = weeklyPlayers.length * WEEKLY_FEE;

  return (
    <div className="card-sports p-6 animate-slide-up space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-secondary" />
        <h2 className="text-xl font-display text-foreground">Participantes & Bote</h2>
      </div>

      {/* Prize pool highlight */}
      <div className="rounded-xl border-2 border-secondary/40 bg-gradient-to-r from-secondary/10 via-secondary/5 to-transparent p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-secondary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Bote Semanal</p>
              <p className="text-3xl font-display text-secondary glow-text">
                ${weeklyPrizePool.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              {weeklyPlayers.length} jugadores × ${WEEKLY_FEE}
            </p>
          </div>
        </div>
      </div>

      {/* Format breakdown */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-muted/40 p-3 text-center border border-border/50">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-medium text-muted-foreground">Semanal</span>
          </div>
          <p className="text-2xl font-display text-foreground">{weeklyPlayers.length}</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-3 text-center border border-border/50">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Trophy className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium text-muted-foreground">Temporada</span>
          </div>
          <p className="text-2xl font-display text-foreground">{seasonPlayers.length}</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-3 text-center border border-border/50">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Users className="w-3.5 h-3.5 text-secondary" />
            <span className="text-xs font-medium text-muted-foreground">Ambos</span>
          </div>
          <p className="text-2xl font-display text-foreground">{both.length}</p>
        </div>
      </div>

      {/* Participant lists */}
      <div className="space-y-3">
        {/* Weekly */}
        <details className="group">
          <summary className="flex items-center justify-between cursor-pointer py-2 px-3 rounded-lg hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold text-foreground">Jugadores Semanales</span>
              <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-500">{weeklyPlayers.length}</Badge>
            </div>
            <span className="text-xs text-muted-foreground group-open:hidden">Ver lista</span>
            <span className="text-xs text-muted-foreground hidden group-open:inline">Ocultar</span>
          </summary>
          <div className="mt-2 pl-6 space-y-1">
            {weeklyPlayers.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Sin participantes</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {weeklyPlayers.map(p => (
                  <Badge key={p.user_id} variant="secondary" className="text-xs font-normal">
                    {p.display_name || 'Usuario'}
                    {p.competition_type === 'both' && (
                      <span className="ml-1 opacity-60">+T</span>
                    )}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </details>

        {/* Season */}
        <details className="group">
          <summary className="flex items-center justify-between cursor-pointer py-2 px-3 rounded-lg hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Jugadores Temporada</span>
              <Badge variant="outline" className="text-xs border-primary/50 text-primary">{seasonPlayers.length}</Badge>
            </div>
            <span className="text-xs text-muted-foreground group-open:hidden">Ver lista</span>
            <span className="text-xs text-muted-foreground hidden group-open:inline">Ocultar</span>
          </summary>
          <div className="mt-2 pl-6 space-y-1">
            {seasonPlayers.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Sin participantes</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {seasonPlayers.map(p => (
                  <Badge key={p.user_id} variant="secondary" className="text-xs font-normal">
                    {p.display_name || 'Usuario'}
                    {p.competition_type === 'both' && (
                      <span className="ml-1 opacity-60">+S</span>
                    )}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
