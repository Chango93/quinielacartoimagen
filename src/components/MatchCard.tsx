import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Calendar, Lock, Check, Minus } from 'lucide-react';

interface Team {
  id: string;
  name: string;
  short_name: string;
  logo_url?: string;
}

interface Match {
  id: string;
  home_team: Team;
  away_team: Team;
  match_date: string;
  home_score: number | null;
  away_score: number | null;
  is_finished: boolean;
}

interface Prediction {
  predicted_home_score: number;
  predicted_away_score: number;
  points_awarded?: number | null;
}

interface MatchCardProps {
  match: Match;
  prediction?: Prediction;
  isOpen: boolean;
  onPredictionChange?: (matchId: string, homeScore: number, awayScore: number) => void;
  showResult?: boolean;
}

export default function MatchCard({
  match,
  prediction,
  isOpen,
  onPredictionChange,
  showResult = false,
}: MatchCardProps) {
  const [homeScore, setHomeScore] = useState<string>(
    prediction?.predicted_home_score?.toString() ?? ''
  );
  const [awayScore, setAwayScore] = useState<string>(
    prediction?.predicted_away_score?.toString() ?? ''
  );

  useEffect(() => {
    if (prediction) {
      setHomeScore(prediction.predicted_home_score?.toString() ?? '');
      setAwayScore(prediction.predicted_away_score?.toString() ?? '');
    }
  }, [prediction]);

  const handleScoreChange = (isHome: boolean, value: string) => {
    const numValue = value === '' ? '' : Math.max(0, Math.min(99, parseInt(value) || 0)).toString();
    
    if (isHome) {
      setHomeScore(numValue);
      if (numValue !== '' && awayScore !== '' && onPredictionChange) {
        onPredictionChange(match.id, parseInt(numValue), parseInt(awayScore));
      }
    } else {
      setAwayScore(numValue);
      if (homeScore !== '' && numValue !== '' && onPredictionChange) {
        onPredictionChange(match.id, parseInt(homeScore), parseInt(numValue));
      }
    }
  };

  const getPointsBadge = () => {
    if (prediction?.points_awarded === undefined || prediction?.points_awarded === null) return null;
    
    const points = prediction.points_awarded;
    if (points === 2) {
      return (
        <span className="points-exact px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
          <Check className="w-3 h-3" />
          +2 Exacto
        </span>
      );
    }
    if (points === 1) {
      return (
        <span className="points-partial px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
          <Check className="w-3 h-3" />
          +1 Resultado
        </span>
      );
    }
    return (
      <span className="points-none px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
        <Minus className="w-3 h-3" />
        0 pts
      </span>
    );
  };

  return (
    <div className="match-card">
      {/* Fecha */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Calendar className="w-4 h-4" />
          <span>
            {format(new Date(match.match_date), "EEE d MMM, HH:mm", { locale: es })}
          </span>
        </div>
        {!isOpen && (
          <Lock className="w-4 h-4 text-muted-foreground" />
        )}
        {showResult && match.is_finished && getPointsBadge()}
      </div>

      {/* Equipos y marcadores */}
      <div className="flex items-center justify-between gap-4">
        {/* Equipo local */}
        <div className="flex-1 text-right">
          <p className="font-semibold text-foreground truncate" title={match.home_team.name}>
            {match.home_team.short_name}
          </p>
          <p className="text-xs text-muted-foreground hidden sm:block">
            {match.home_team.name}
          </p>
        </div>

        {/* Marcadores */}
        <div className="flex items-center gap-2">
          {isOpen && onPredictionChange ? (
            <>
              <Input
                type="number"
                min="0"
                max="99"
                value={homeScore}
                onChange={(e) => handleScoreChange(true, e.target.value)}
                className="score-input"
                placeholder="-"
              />
              <span className="text-muted-foreground font-bold text-xl">:</span>
              <Input
                type="number"
                min="0"
                max="99"
                value={awayScore}
                onChange={(e) => handleScoreChange(false, e.target.value)}
                className="score-input"
                placeholder="-"
              />
            </>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-14 h-14 flex items-center justify-center bg-muted rounded-lg text-2xl font-display text-foreground">
                {prediction?.predicted_home_score ?? '-'}
              </div>
              <span className="text-muted-foreground font-bold text-xl">:</span>
              <div className="w-14 h-14 flex items-center justify-center bg-muted rounded-lg text-2xl font-display text-foreground">
                {prediction?.predicted_away_score ?? '-'}
              </div>
            </div>
          )}
        </div>

        {/* Equipo visitante */}
        <div className="flex-1 text-left">
          <p className="font-semibold text-foreground truncate" title={match.away_team.name}>
            {match.away_team.short_name}
          </p>
          <p className="text-xs text-muted-foreground hidden sm:block">
            {match.away_team.name}
          </p>
        </div>
      </div>

      {/* Resultado real (si está terminado) */}
      {showResult && match.is_finished && match.home_score !== null && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-center gap-2 text-sm">
            <span className="text-muted-foreground">Resultado real:</span>
            <span className="font-display text-lg text-secondary">
              {match.home_score} - {match.away_score}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
