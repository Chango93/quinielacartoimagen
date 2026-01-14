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
  const [currentMatchdayId, setCurrentMatchdayId] = useState<string | null>(null);

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
      // Obtener la jornada actual (la última abierta)
      const { data: matchdays } = await supabase
        .from('matchdays')
        .select('id')
        .eq('is_open', true)
        .order('start_date', { ascending: false })
        .limit(1);

      const currentMatchday = matchdays?.[0];
      if (!currentMatchday) {
        // Si no hay jornada abierta, no mostrar encuesta
        setLoading(false);
        return;
      }

      setCurrentMatchdayId(currentMatchday.id);

      // Verificar si ya contestó para esta jornada
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('competition_type, last_survey_matchday_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        setLoading(false);
        return;
      }

      // Mostrar encuesta si:
      // 1. No tiene perfil
      // 2. No ha contestado para la jornada actual
      if (!profile || profile.last_survey_matchday_id !== currentMatchday.id) {
        // Pre-seleccionar su preferencia anterior si existe
        if (profile?.competition_type) {
          setSelectedType(profile.competition_type);
        }
        setShowSurvey(true);
      }
    } catch (err) {
      console.error('Error:', err);
    }
    
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!selectedType || !user || !currentMatchdayId) return;

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
          .update({ 
            competition_type: selectedType, 
            has_answered_survey: true,
            last_survey_matchday_id: currentMatchdayId 
          })
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
            last_survey_matchday_id: currentMatchdayId,
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

  const handleOptionClick = (value: CompetitionType) => {
    setSelectedType(value);
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

        <div className="py-4 space-y-3">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleOptionClick(option.value)}
              className={`w-full flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all text-left
                ${selectedType === option.value 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border hover:border-primary/50'
                }`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {option.icon}
              </div>
              <div>
                <span className="font-semibold text-foreground">{option.label}</span>
                <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
              </div>
            </button>
          ))}
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
