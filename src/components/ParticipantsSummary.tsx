import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Users, Trophy, DollarSign, Zap, CheckCircle2, XCircle } from 'lucide-react';
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
  const { isAdmin } = useAuth();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [weeklyWithPredictions, setWeeklyWithPredictions] = useState<Set<string>>(new Set());
  const [currentMatchdayName, setCurrentMatchdayName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    // Fetch participants and current matchday in parallel
    const [profilesRes, matchdayRes] = await Promise.all([
      supabase.from('profiles_public').select('user_id, display_name, competition_type'),
      supabase.from('matchdays').select('id, name').eq('is_current', true).limit(1).maybeSingle(),
    ]);

    const allParticipants = profilesRes.data
      ? (profilesRes.data as Participant[]).filter(p => p.user_id && p.competition_type)
      : [];
    setParticipants(allParticipants);

    if (matchdayRes.data) {
      setCurrentMatchdayName(matchdayRes.data.name);

      // Get which weekly/both users have predictions in this matchday
      const { data: predictions } = await supabase
        .from('predictions')
        .select('user_id, matches!inner(matchday_id)')
        .eq('matches.matchday_id', matchdayRes.data.id);

      if (predictions) {
        const userIds = new Set((predictions as any[]).map(p => p.user_id));
        setWeeklyWithPredictions(userIds);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin]);

  // Solo mostrar a admins
  if (!isAdmin) {
    return null;
  }

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

  // All eligible weekly players (registered as weekly or both)
  const allWeeklyPlayers = [...weeklyOnly, ...both];
  // Season participants = fixed, always count
  const seasonPlayers = [...seasonOnly, ...both];

  // Active weekly players = those who actually submitted predictions this matchday
  const activeWeeklyPlayers = allWeeklyPlayers.filter(p => weeklyWithPredictions.has(p.user_id!));
  const inactiveWeeklyPlayers = allWeeklyPlayers.filter(p => !weeklyWithPredictions.has(p.user_id!));

  const weeklyPrizePool = activeWeeklyPlayers.length * WEEKLY_FEE;

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
              <p className="text-sm text-muted-foreground">Bote Semanal{currentMatchdayName ? ` — ${currentMatchdayName}` : ''}</p>
              <p className="text-3xl font-display text-secondary glow-text">
                ${weeklyPrizePool.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              {activeWeeklyPlayers.length} de {allWeeklyPlayers.length} jugaron
            </p>
            <p className="text-xs text-muted-foreground">
              × ${WEEKLY_FEE} c/u
            </p>
          </div>
        </div>
      </div>

      {/* Format breakdown */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-muted/40 p-3 text-center border border-border/50">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Zap className="w-3.5 h-3.5 text-secondary" />
            <span className="text-xs font-medium text-muted-foreground">Semanal</span>
          </div>
          <p className="text-2xl font-display text-foreground">
            {activeWeeklyPlayers.length}
            <span className="text-sm text-muted-foreground font-normal">/{allWeeklyPlayers.length}</span>
          </p>
        </div>
        <div className="rounded-lg bg-muted/40 p-3 text-center border border-border/50">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Trophy className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium text-muted-foreground">Temporada</span>
          </div>
          <p className="text-2xl font-display text-foreground">{seasonPlayers.length}</p>
          <p className="text-[10px] text-muted-foreground">fijos</p>
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
              <Zap className="w-4 h-4 text-secondary" />
              <span className="text-sm font-semibold text-foreground">Jugadores Semanales</span>
              <Badge variant="outline" className="text-xs border-secondary/50 text-secondary">
                {activeWeeklyPlayers.length}/{allWeeklyPlayers.length}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground group-open:hidden">Ver lista</span>
            <span className="text-xs text-muted-foreground hidden group-open:inline">Ocultar</span>
          </summary>
          <div className="mt-2 pl-6 space-y-2">
            {allWeeklyPlayers.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Sin participantes</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {activeWeeklyPlayers.map(p => (
                  <Badge key={p.user_id} variant="secondary" className="text-xs font-normal flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    {p.display_name || 'Usuario'}
                    {p.competition_type === 'both' && (
                      <span className="ml-0.5 opacity-60">+T</span>
                    )}
                  </Badge>
                ))}
                {inactiveWeeklyPlayers.map(p => (
                  <Badge key={p.user_id} variant="outline" className="text-xs font-normal flex items-center gap-1 opacity-50">
                    <XCircle className="w-3 h-3" />
                    {p.display_name || 'Usuario'}
                    {p.competition_type === 'both' && (
                      <span className="ml-0.5 opacity-60">+T</span>
                    )}
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground italic">
              Solo quienes llenen su quiniela entran al bote semanal
            </p>
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
          <div className="mt-2 pl-6 space-y-2">
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
            <p className="text-[10px] text-muted-foreground italic">
              Los jugadores de temporada participan en todas las jornadas automáticamente
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}
