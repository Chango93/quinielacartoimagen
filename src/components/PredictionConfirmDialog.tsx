import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, AlertTriangle } from 'lucide-react';

interface Team {
  id: string;
  name: string;
  short_name: string;
}

interface Match {
  id: string;
  home_team: Team;
  away_team: Team;
}

interface Prediction {
  match_id: string;
  predicted_home_score: number;
  predicted_away_score: number;
}

interface PredictionConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  matches: Match[];
  predictions: Record<string, Prediction>;
  saving?: boolean;
}

export function PredictionConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  matches,
  predictions,
  saving,
}: PredictionConfirmDialogProps) {
  const predictedMatches = matches.filter(m => predictions[m.id]);
  
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Check className="w-5 h-5 text-primary" />
            Confirmar Predicciones
          </AlertDialogTitle>
          <AlertDialogDescription>
            Revisa tus marcadores antes de guardar:
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <ScrollArea className="max-h-64 pr-4">
          <div className="space-y-2">
            {predictedMatches.length === 0 ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertTriangle className="w-4 h-4" />
                No has ingresado ninguna predicción
              </div>
            ) : (
              predictedMatches.map(match => {
                const pred = predictions[match.id];
                const isHighScore = pred.predicted_home_score > 5 || pred.predicted_away_score > 5;
                
                return (
                  <div
                    key={match.id}
                    className={`flex items-center justify-between p-3 rounded-lg text-sm ${
                      isHighScore ? 'bg-warning/10 border border-warning/30' : 'bg-muted/50'
                    }`}
                  >
                    <span className="text-muted-foreground truncate flex-1">
                      {match.home_team.short_name} vs {match.away_team.short_name}
                    </span>
                    <span className={`font-mono font-bold text-base ${isHighScore ? 'text-warning' : 'text-foreground'}`}>
                      {pred.predicted_home_score} - {pred.predicted_away_score}
                      {isHighScore && ' ⚠️'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {matches.length > predictedMatches.length && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted text-muted-foreground text-xs">
            <AlertTriangle className="w-3 h-3" />
            {matches.length - predictedMatches.length} partido(s) sin predicción
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={saving || predictedMatches.length === 0}
            className="btn-hero"
          >
            {saving ? 'Guardando...' : 'Confirmar y Guardar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
