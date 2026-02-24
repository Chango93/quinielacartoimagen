import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Plus, Save, Trash2, Loader2 } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  message: string;
  is_active: boolean;
  created_at: string;
}

export default function AdminAnnouncements() {
  const { toast } = useToast();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setAnnouncements(data);
    setLoading(false);
  };

  const createAnnouncement = async () => {
    if (!newMessage.trim()) return;
    setSaving('new');
    const { error } = await supabase.from('announcements').insert({
      title: newTitle.trim(),
      message: newMessage.trim(),
    });
    if (error) {
      toast({ title: 'Error', description: 'No se pudo crear el anuncio', variant: 'destructive' });
    } else {
      toast({ title: 'Anuncio creado' });
      setNewTitle('');
      setNewMessage('');
      fetchAnnouncements();
    }
    setSaving(null);
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    setSaving(id);
    await supabase.from('announcements').update({ is_active: !currentActive }).eq('id', id);
    setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, is_active: !currentActive } : a));
    setSaving(null);
  };

  const updateAnnouncement = async (id: string, title: string, message: string) => {
    setSaving(id);
    const { error } = await supabase.from('announcements').update({ title, message }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar', variant: 'destructive' });
    } else {
      toast({ title: 'Actualizado' });
    }
    setSaving(null);
  };

  const deleteAnnouncement = async (id: string) => {
    setSaving(id);
    await supabase.from('announcements').delete().eq('id', id);
    setAnnouncements(prev => prev.filter(a => a.id !== id));
    setSaving(null);
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      {/* Create new */}
      <div className="p-4 bg-muted/50 rounded-lg space-y-3">
        <h3 className="font-semibold text-foreground">Nuevo anuncio</h3>
        <Input
          placeholder="Título (opcional)"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          className="input-sports"
        />
        <Textarea
          placeholder="Mensaje del anuncio..."
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          className="min-h-[80px]"
        />
        <Button onClick={createAnnouncement} disabled={!newMessage.trim() || saving === 'new'} className="btn-hero">
          {saving === 'new' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
          Crear anuncio
        </Button>
      </div>

      {/* Existing announcements */}
      {announcements.length === 0 ? (
        <p className="text-center text-muted-foreground py-4">No hay anuncios</p>
      ) : (
        <div className="space-y-4">
          {announcements.map(a => (
            <AnnouncementItem
              key={a.id}
              announcement={a}
              saving={saving === a.id}
              onToggle={() => toggleActive(a.id, a.is_active)}
              onSave={(title, message) => updateAnnouncement(a.id, title, message)}
              onDelete={() => deleteAnnouncement(a.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AnnouncementItem({
  announcement,
  saving,
  onToggle,
  onSave,
  onDelete,
}: {
  announcement: Announcement;
  saving: boolean;
  onToggle: () => void;
  onSave: (title: string, message: string) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(announcement.title);
  const [message, setMessage] = useState(announcement.message);
  const hasChanges = title !== announcement.title || message !== announcement.message;

  return (
    <div className={`p-4 rounded-lg border space-y-3 ${announcement.is_active ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-border bg-muted/30 opacity-60'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Switch checked={announcement.is_active} onCheckedChange={onToggle} />
          <span className="text-sm text-muted-foreground">
            {announcement.is_active ? 'Visible' : 'Oculto'}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onDelete} disabled={saving} className="text-destructive hover:text-destructive">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <Input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Título"
        className="input-sports"
      />
      <Textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        className="min-h-[60px]"
      />
      {hasChanges && (
        <Button size="sm" onClick={() => onSave(title, message)} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Guardar cambios
        </Button>
      )}
    </div>
  );
}
