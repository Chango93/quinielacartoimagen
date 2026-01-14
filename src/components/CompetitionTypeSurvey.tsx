import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Calendar, Trophy, Crown, Loader2 } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type CompetitionType = Database['public']['Enums']['competition_type'];

interface CompetitionTypeSurveyProps {
  onCompleted?: () => void;
}

export default function CompetitionTypeSurvey({ onCompleted }: CompetitionTypeSurveyProps) {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [showSurvey, setShowSurvey] = useState(false);
  const [selectedType, setSelectedType] = useState<CompetitionType | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      checkSurveyStatus();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [user, authLoading]);

  const checkSurveyStatus = async () => {
    if (!user) return;

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('competition_type, has_answered_survey')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        setLoading(false);
        return;
      }

      // Mostrar encuesta si no tiene perfil o si no ha respondido la encuesta
      if (!profile || !profile.has_answered_survey) {
        setShowSurvey(true);
      }
    } catch (err) {
      console.error('Error:', err);
    }
    
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!selectedType || !user) return;

    setSubmitting(true);
    try {
      // Primero verificar si existe el perfil
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingProfile) {
        // Actualizar perfil existente
        const { error } = await supabase
          .from('profiles')
          .update({ competition_type: selectedType, has_answered_survey: true })
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        // Crear nuevo perfil
        const { error } = await supabase
          .from('profiles')
          .insert({
            user_id: user.id,
            email: user.email || '',
            display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Usuario',
            competition_type: selectedType,
            has_answered_survey: true,
          });

        if (error) throw error;
      }

      toast({
        title: '¡Gracias por responder!',
        description: 'Tu preferencia de participación ha sido guardada.',
      });

      setShowSurvey(false);
      onCompleted?.();
    } catch (error) {
      console.error('Error saving preference:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar tu preferencia. Intenta de nuevo.',
        variant: 'destructive',
      });
    }
    setSubmitting(false);
  };

  if (loading || authLoading) return null;
  if (!showSurvey) return null;

  const options: { value: CompetitionType; label: string; description: string; icon: React.ReactNode }[] = [
    {
      value: 'weekly',
      label: 'Solo Jornadas',
      description: 'Participar únicamente en competencias semanales por jornada',
      icon: <Calendar className="w-6 h-6 text-secondary" />,
    },
    {
      value: 'season',
      label: 'Solo Temporada',
      description: 'Participar únicamente en la competencia de temporada completa',
      icon: <Trophy className="w-6 h-6 text-primary" />,
    },
    {
      value: 'both',
      label: 'Ambas',
      description: 'Participar tanto en jornadas como en temporada',
      icon: <Crown className="w-6 h-6 text-yellow-500" />,
    },
  ];

  return (
    <Dialog open={showSurvey} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-display flex items-center gap-2">
            <Trophy className="w-6 h-6 text-secondary" />
            ¿Cómo quieres participar?
          </DialogTitle>
          <DialogDescription className="text-base">
            Selecciona tu formato de participación en la quiniela. Esta elección nos ayuda a organizar mejor las competencias.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <RadioGroup
            value={selectedType || ''}
            onValueChange={(value) => setSelectedType(value as CompetitionType)}
            className="space-y-3"
          >
            {options.map((option) => (
              <div key={option.value} className="relative">
                <RadioGroupItem
                  value={option.value}
                  id={option.value}
                  className="peer sr-only"
                />
                <Label
                  htmlFor={option.value}
                  className="flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all
                    border-border hover:border-primary/50 
                    peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {option.icon}
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">{option.label}</span>
                    <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
                  </div>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <Button 
          onClick={handleSubmit} 
          disabled={!selectedType || submitting}
          className="w-full btn-gold"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Guardando...
            </>
          ) : (
            'Confirmar participación'
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
