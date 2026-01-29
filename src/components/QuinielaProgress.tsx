import { Progress } from '@/components/ui/progress';
import { Check, AlertCircle } from 'lucide-react';

interface QuinielaProgressProps {
  total: number;
  completed: number;
  isOpen: boolean;
}

export default function QuinielaProgress({ total, completed, isOpen }: QuinielaProgressProps) {
  if (total === 0) return null;

  const percentage = Math.round((completed / total) * 100);
  const isComplete = completed === total;

  return (
    <div className="card-sports p-4 mb-4 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isComplete ? (
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
              <Check className="w-4 h-4 text-primary" />
            </div>
          ) : (
            <div className="w-6 h-6 rounded-full bg-secondary/20 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-secondary" />
            </div>
          )}
          <span className="text-sm font-medium text-foreground">
            {isComplete ? '¡Quiniela completa!' : `${completed} de ${total} predicciones`}
          </span>
        </div>
        <span className={`text-sm font-display ${isComplete ? 'text-primary' : 'text-secondary'}`}>
          {percentage}%
        </span>
      </div>
      <Progress 
        value={percentage} 
        className="h-2 bg-muted"
      />
      {!isComplete && isOpen && (
        <p className="text-xs text-muted-foreground mt-2">
          Te faltan {total - completed} predicciones por completar
        </p>
      )}
    </div>
  );
}
