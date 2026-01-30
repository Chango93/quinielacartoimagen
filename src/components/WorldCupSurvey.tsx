import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trophy, Globe, PartyPopper } from 'lucide-react';
import { toast } from 'sonner';

export default function WorldCupSurvey() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      checkIfAnswered();
    }
  }, [user]);

  const checkIfAnswered = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('world_cup_interest')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    
    // Show survey if user hasn't answered yet
    if (!data) {
      // Small delay to not overwhelm user on page load
      setTimeout(() => setOpen(true), 2000);
    }
  };

  const handleResponse = async (interested: boolean) => {
    if (!user) return;
    
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('world_cup_interest')
        .insert({
          user_id: user.id,
          is_interested: interested
        });

      if (error) throw error;

      setOpen(false);
      
      if (interested) {
        toast.success('¡Genial! Te avisaremos cuando esté lista la quiniela del Mundial 🏆', {
          duration: 5000,
        });
      } else {
        toast('Gracias por responder. ¡Siempre puedes cambiar de opinión! 😊', {
          duration: 4000,
        });
      }
    } catch (error) {
      console.error('Error saving response:', error);
      toast.error('Error al guardar tu respuesta');
    }
    setSubmitting(false);
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 w-20 h-20 rounded-full bg-gradient-to-br from-green-500 via-yellow-500 to-red-500 flex items-center justify-center">
            <Globe className="w-10 h-10 text-white" />
          </div>
          <DialogTitle className="text-2xl font-display text-center">
            🏆 Mundial 2026
          </DialogTitle>
          <DialogDescription className="text-center text-base pt-2">
            ¿Te gustaría participar en la <strong className="text-foreground">Quiniela del Mundial 2026</strong>?
            <br />
            <span className="text-sm text-muted-foreground mt-2 block">
              USA • México • Canadá
            </span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-3 mt-4">
          <Button 
            onClick={() => handleResponse(true)}
            disabled={submitting}
            className="w-full h-14 text-lg bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
          >
            <PartyPopper className="w-5 h-5 mr-2" />
            ¡Claro que sí!
          </Button>
          
          <Button 
            variant="outline"
            onClick={() => handleResponse(false)}
            disabled={submitting}
            className="w-full"
          >
            No por ahora
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground mt-4">
          Solo queremos saber cuántos estarían interesados para ir planeando.
        </p>
      </DialogContent>
    </Dialog>
  );
}
