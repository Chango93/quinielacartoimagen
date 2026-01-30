import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Globe, Users, ThumbsUp, ThumbsDown } from 'lucide-react';

interface WorldCupResponse {
  user_id: string;
  is_interested: boolean;
  created_at: string;
  display_name?: string;
}

interface WorldCupStats {
  total: number;
  interested: number;
  notInterested: number;
}

export default function AdminWorldCupInterest() {
  const [responses, setResponses] = useState<WorldCupResponse[]>([]);
  const [stats, setStats] = useState<WorldCupStats>({ total: 0, interested: 0, notInterested: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchResponses();
  }, []);

  const fetchResponses = async () => {
    // Get all responses
    const { data: interestData, error } = await supabase
      .from('world_cup_interest')
      .select('user_id, is_interested, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching world cup interest:', error);
      setLoading(false);
      return;
    }

    if (interestData && interestData.length > 0) {
      // Get display names for users
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', interestData.map(r => r.user_id));

      const profileMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) || []);

      const enrichedResponses = interestData.map(r => ({
        ...r,
        display_name: profileMap.get(r.user_id) || 'Usuario'
      }));

      setResponses(enrichedResponses);

      // Calculate stats
      const interested = interestData.filter(r => r.is_interested).length;
      setStats({
        total: interestData.length,
        interested,
        notInterested: interestData.length - interested
      });
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const interestPercent = stats.total > 0 ? Math.round((stats.interested / stats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 via-yellow-500 to-red-500 flex items-center justify-center">
          <Globe className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Interés en Mundial 2026</h2>
          <p className="text-sm text-muted-foreground">USA • México • Canadá</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Users className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Respuestas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <ThumbsUp className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.interested}</p>
                <p className="text-sm text-muted-foreground">Interesados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/20">
                <ThumbsDown className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.notInterested}</p>
                <p className="text-sm text-muted-foreground">No interesados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar */}
      {stats.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Nivel de interés</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <ThumbsUp className="w-4 h-4 text-green-500" />
                  Interesados
                </span>
                <span className="font-bold text-lg">{interestPercent}%</span>
              </div>
              <div className="h-4 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${interestPercent}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground text-center mt-2">
                {stats.interested} de {stats.total} participantes están interesados
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Individual responses */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Respuestas individuales
          </CardTitle>
        </CardHeader>
        <CardContent>
          {responses.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Aún no hay respuestas
            </p>
          ) : (
            <div className="space-y-2">
              {responses.map((response) => (
                <div 
                  key={response.user_id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <span className="font-medium">
                    {response.display_name}
                  </span>
                  <Badge 
                    variant={response.is_interested ? "default" : "secondary"}
                    className={response.is_interested ? "bg-green-600" : ""}
                  >
                    {response.is_interested ? (
                      <>
                        <ThumbsUp className="w-3 h-3 mr-1" />
                        Interesado
                      </>
                    ) : (
                      <>
                        <ThumbsDown className="w-3 h-3 mr-1" />
                        No por ahora
                      </>
                    )}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
