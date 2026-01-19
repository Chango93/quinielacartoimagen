import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import Leaderboard from '@/components/Leaderboard';
import LiveMatchesBanner from '@/components/LiveMatchesBanner';
import MatchdayDashboard from '@/components/MatchdayDashboard';
import { Trophy, Calendar, ChevronRight, Loader2 } from 'lucide-react';

interface Matchday {
  id: string;
  name: string;
  start_date: string;
  is_open: boolean;
}

export default function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [currentMatchday, setCurrentMatchday] = useState<Matchday | null>(null);
  const [loadingMatchday, setLoadingMatchday] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchCurrentMatchday();
    }
  }, [user]);

  const fetchCurrentMatchday = async () => {
    // Primero intentar obtener la jornada marcada como actual (is_current)
    let { data } = await supabase
      .from('matchdays')
      .select('*')
      .eq('is_current', true)
      .limit(1)
      .maybeSingle();
    
    // Si no hay jornada marcada como current, buscar la jornada abierta más próxima
    if (!data) {
      const { data: openMatchday } = await supabase
        .from('matchdays')
        .select('*')
        .eq('is_open', true)
        .order('start_date', { ascending: true })
        .limit(1)
        .maybeSingle();
      data = openMatchday;
    }
    
    setCurrentMatchday(data);
    setLoadingMatchday(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container py-8">
      <LiveMatchesBanner />
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Hero */}
          <div className="card-sports p-6 animate-fade-in">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-xl bg-primary/20 flex items-center justify-center">
                <Trophy className="w-8 h-8 text-secondary" />
              </div>
              <div>
                <h1 className="text-3xl font-display text-foreground">
                  ¡Bienvenido a la Quiniela!
                </h1>
                <p className="text-muted-foreground">
                  Predice los resultados y gana puntos
                </p>
              </div>
            </div>
          </div>

          {/* Jornada actual */}
          <div className="card-sports p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-secondary" />
                <h2 className="text-xl font-display text-foreground">Jornada Actual</h2>
              </div>
            </div>

            {loadingMatchday ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : currentMatchday ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-display text-foreground">{currentMatchday.name}</p>
                  <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold matchday-open border">
                    Abierta para predicciones
                  </span>
                </div>
                <Link to="/quiniela">
                  <Button className="btn-gold flex items-center gap-2">
                    Capturar quiniela
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No hay jornadas activas</p>
                <p className="text-sm">El administrador debe crear una nueva jornada</p>
              </div>
            )}
          </div>

          {/* Dashboard de la jornada */}
          {currentMatchday && (
            <MatchdayDashboard 
              matchdayId={currentMatchday.id}
              matchdayName={currentMatchday.name}
              isOpen={currentMatchday.is_open}
            />
          )}
        </div>

        {/* Sidebar - Tabla */}
        <div className="card-sports p-6 animate-slide-up" style={{ animationDelay: '100ms' }}>
          <Leaderboard limit={5} />
          <Link to="/tabla" className="block mt-4">
            <Button variant="ghost" className="w-full text-primary">
              Ver tabla completa
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
