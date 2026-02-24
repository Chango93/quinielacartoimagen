import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  message: string;
}

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('announcements')
        .select('id, title, message')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (data) setAnnouncements(data);
    };
    fetch();
  }, []);

  if (announcements.length === 0) return null;

  return (
    <div className="space-y-3 mb-4">
      {announcements.map(a => (
        <div key={a.id} className="p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
          <div className="text-sm text-foreground">
            {a.title && <p className="font-semibold mb-1">{a.title}</p>}
            <p className="text-muted-foreground">{a.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
