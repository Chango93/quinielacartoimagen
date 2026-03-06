import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams } from 'react-router-dom';

interface WeeklyPaymentButtonProps {
  matchdayId: string;
  matchdayName: string;
}

export default function WeeklyPaymentButton({ matchdayId, matchdayName }: WeeklyPaymentButtonProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [paymentStatus, setPaymentStatus] = useState<'loading' | 'unpaid' | 'pending' | 'paid'>('loading');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (user && matchdayId) {
      checkPaymentStatus();
    }
  }, [user, matchdayId]);

  // Handle return from Stripe
  useEffect(() => {
    const payment = searchParams.get('payment');
    const returnedMatchdayId = searchParams.get('matchday_id');
    
    if (payment === 'success' && returnedMatchdayId === matchdayId) {
      verifyPayment();
      // Clean URL params
      searchParams.delete('payment');
      searchParams.delete('matchday_id');
      setSearchParams(searchParams, { replace: true });
    } else if (payment === 'canceled') {
      toast({ title: 'Pago cancelado', description: 'Puedes intentar de nuevo cuando quieras' });
      searchParams.delete('payment');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, matchdayId]);

  const checkPaymentStatus = async () => {
    const { data } = await supabase
      .from('matchday_payments')
      .select('status')
      .eq('user_id', user!.id)
      .eq('matchday_id', matchdayId)
      .maybeSingle();

    if (data?.status === 'paid') {
      setPaymentStatus('paid');
    } else if (data?.status === 'pending') {
      setPaymentStatus('pending');
    } else {
      setPaymentStatus('unpaid');
    }
  };

  const verifyPayment = async () => {
    setPaymentStatus('loading');
    const { data, error } = await supabase.functions.invoke('verify-weekly-payment', {
      body: { matchday_id: matchdayId },
    });

    if (error) {
      toast({ title: 'Error', description: 'No se pudo verificar el pago', variant: 'destructive' });
      setPaymentStatus('pending');
      return;
    }

    if (data?.status === 'paid') {
      setPaymentStatus('paid');
      toast({ title: '¡Pago confirmado!', description: 'Tu participación semanal ha sido registrada' });
    } else {
      setPaymentStatus('pending');
      toast({ title: 'Pago pendiente', description: 'El pago aún no se ha confirmado. Intenta de nuevo en unos segundos.' });
    }
  };

  const handlePayment = async () => {
    setProcessing(true);
    const { data, error } = await supabase.functions.invoke('create-weekly-payment', {
      body: { matchday_id: matchdayId },
    });

    if (error || data?.error) {
      toast({
        title: 'Error',
        description: data?.error || 'No se pudo crear la sesión de pago',
        variant: 'destructive',
      });
      setProcessing(false);
      return;
    }

    if (data?.url) {
      window.open(data.url, '_blank');
    }
    setProcessing(false);
  };

  if (paymentStatus === 'loading') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Verificando pago...</span>
      </div>
    );
  }

  if (paymentStatus === 'paid') {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Pago semanal confirmado
        </Badge>
      </div>
    );
  }

  if (paymentStatus === 'pending') {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={verifyPayment} className="text-xs">
          <Loader2 className="w-3.5 h-3.5 mr-1" />
          Verificar pago
        </Button>
        <span className="text-xs text-muted-foreground">Pago pendiente</span>
      </div>
    );
  }

  return (
    <Button
      onClick={handlePayment}
      disabled={processing}
      size="sm"
      className="bg-emerald-600 hover:bg-emerald-700 text-white"
    >
      {processing ? (
        <Loader2 className="w-4 h-4 animate-spin mr-1" />
      ) : (
        <CreditCard className="w-4 h-4 mr-1" />
      )}
      Pagar $50 MXN
      <ExternalLink className="w-3 h-3 ml-1" />
    </Button>
  );
}
