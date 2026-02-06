import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Users, Save, Pencil, X, Check, KeyRound } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

type CompetitionType = 'weekly' | 'season' | 'both';

interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string;
  competition_type: CompetitionType;
}

interface EditingUser {
  email: string;
  display_name: string;
}

export default function AdminUsers() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [changes, setChanges] = useState<Record<string, CompetitionType>>({});
  const [editing, setEditing] = useState<Record<string, EditingUser>>({});
  const [resetPasswordUser, setResetPasswordUser] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('display_name');
    
    if (!error && data) {
      setProfiles(data as Profile[]);
    }
    setLoading(false);
  };

  const handleTypeChange = (userId: string, newType: CompetitionType) => {
    setChanges(prev => ({ ...prev, [userId]: newType }));
  };

  const saveTypeChange = async (profile: Profile) => {
    const newType = changes[profile.user_id];
    if (!newType) return;
    
    setSaving(profile.user_id);
    const { error } = await supabase
      .from('profiles')
      .update({ competition_type: newType })
      .eq('user_id', profile.user_id);
    
    if (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar', variant: 'destructive' });
    } else {
      toast({ title: 'Actualizado', description: `${profile.display_name || profile.email} ahora participa en: ${getTypeLabel(newType)}` });
      setProfiles(prev => prev.map(p => 
        p.user_id === profile.user_id ? { ...p, competition_type: newType } : p
      ));
      setChanges(prev => {
        const next = { ...prev };
        delete next[profile.user_id];
        return next;
      });
    }
    setSaving(null);
  };

  const startEditing = (profile: Profile) => {
    setEditing(prev => ({
      ...prev,
      [profile.user_id]: {
        email: profile.email,
        display_name: profile.display_name || '',
      }
    }));
  };

  const cancelEditing = (userId: string) => {
    setEditing(prev => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  const saveUserEdit = async (profile: Profile) => {
    const edit = editing[profile.user_id];
    if (!edit) return;

    const emailChanged = edit.email !== profile.email;
    const nameChanged = edit.display_name !== (profile.display_name || '');

    if (!emailChanged && !nameChanged) {
      cancelEditing(profile.user_id);
      return;
    }

    setSaving(profile.user_id);

    try {
      const body: Record<string, string> = { target_user_id: profile.user_id };
      if (emailChanged) body.email = edit.email;
      if (nameChanged) body.display_name = edit.display_name;

      const { data, error } = await supabase.functions.invoke('admin-update-user', {
        body,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: 'Usuario actualizado',
        description: `${edit.display_name || edit.email} actualizado correctamente${emailChanged ? ' (email sincronizado en auth)' : ''}`,
      });

      setProfiles(prev => prev.map(p =>
        p.user_id === profile.user_id
          ? { ...p, email: edit.email, display_name: edit.display_name || null }
          : p
      ));
      cancelEditing(profile.user_id);
    } catch (err: any) {
      toast({
        title: 'Error al actualizar',
        description: err.message || 'No se pudo actualizar el usuario',
        variant: 'destructive',
      });
    }

    setSaving(null);
  };

  const handleResetPassword = async () => {
    if (!resetPasswordUser || !newPassword) return;
    if (newPassword.length < 6) {
      toast({ title: 'Error', description: 'La contraseña debe tener al menos 6 caracteres', variant: 'destructive' });
      return;
    }

    setSaving(resetPasswordUser.user_id);
    try {
      const { data, error } = await supabase.functions.invoke('admin-update-user', {
        body: { target_user_id: resetPasswordUser.user_id, password: newPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: 'Contraseña actualizada',
        description: `La contraseña de ${resetPasswordUser.display_name || resetPasswordUser.email} fue cambiada exitosamente`,
      });
      setResetPasswordUser(null);
      setNewPassword('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'No se pudo cambiar la contraseña', variant: 'destructive' });
    }
    setSaving(null);
  };

  const getTypeLabel = (type: CompetitionType) => {
    switch (type) {
      case 'weekly': return 'Solo Jornadas';
      case 'season': return 'Solo Temporada';
      case 'both': return 'Ambos';
    }
  };

  const getTypeBadgeVariant = (type: CompetitionType): "default" | "secondary" | "outline" => {
    switch (type) {
      case 'weekly': return 'secondary';
      case 'season': return 'default';
      case 'both': return 'outline';
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-secondary" />
        <h3 className="font-display text-foreground">Gestión de Usuarios</h3>
      </div>

      <div className="bg-muted/30 p-4 rounded-lg mb-4">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Tipos de competencia:</strong>
        </p>
        <ul className="text-sm text-muted-foreground mt-2 space-y-1">
          <li>• <Badge variant="secondary">Solo Jornadas</Badge> - Participa solo en el leaderboard por jornada</li>
          <li>• <Badge variant="default">Solo Temporada</Badge> - Participa solo en el acumulado de temporada</li>
          <li>• <Badge variant="outline">Ambos</Badge> - Participa en jornadas y acumulado de temporada</li>
        </ul>
        <p className="text-xs text-muted-foreground mt-3">
          💡 Haz clic en <Pencil className="w-3 h-3 inline" /> para editar el nombre o email de un usuario. El email se actualiza en auth y en el perfil.
        </p>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-foreground">Usuario</TableHead>
              <TableHead className="text-foreground">Email</TableHead>
              <TableHead className="text-foreground">Tipo Actual</TableHead>
              <TableHead className="text-foreground">Cambiar a</TableHead>
              <TableHead className="text-foreground w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map(profile => {
              const currentType = changes[profile.user_id] || profile.competition_type;
              const hasTypeChange = changes[profile.user_id] && changes[profile.user_id] !== profile.competition_type;
              const isEditing = !!editing[profile.user_id];
              const editData = editing[profile.user_id];
              
              return (
                <TableRow key={profile.id} className="border-border">
                  <TableCell className="font-medium text-foreground">
                    {isEditing ? (
                      <Input
                        value={editData.display_name}
                        onChange={e => setEditing(prev => ({
                          ...prev,
                          [profile.user_id]: { ...prev[profile.user_id], display_name: e.target.value }
                        }))}
                        className="h-8 text-sm"
                        placeholder="Nombre"
                      />
                    ) : (
                      profile.display_name || 'Sin nombre'
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {isEditing ? (
                      <Input
                        type="email"
                        value={editData.email}
                        onChange={e => setEditing(prev => ({
                          ...prev,
                          [profile.user_id]: { ...prev[profile.user_id], email: e.target.value }
                        }))}
                        className="h-8 text-sm"
                        placeholder="Email"
                      />
                    ) : (
                      profile.email
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getTypeBadgeVariant(profile.competition_type)}>
                      {getTypeLabel(profile.competition_type)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={currentType} 
                      onValueChange={(v) => handleTypeChange(profile.user_id, v as CompetitionType)}
                    >
                      <SelectTrigger className="w-[160px] bg-input border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border z-50">
                        <SelectItem value="weekly">Solo Jornadas</SelectItem>
                        <SelectItem value="season">Solo Temporada</SelectItem>
                        <SelectItem value="both">Ambos</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {isEditing ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => saveUserEdit(profile)}
                            disabled={saving === profile.user_id}
                          >
                            {saving === profile.user_id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4 text-green-500" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => cancelEditing(profile.user_id)}
                            disabled={saving === profile.user_id}
                          >
                            <X className="w-4 h-4 text-red-400" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEditing(profile)}
                            title="Editar usuario"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setResetPasswordUser(profile); setNewPassword(''); }}
                            title="Cambiar contraseña"
                          >
                            <KeyRound className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      {hasTypeChange && !isEditing && (
                        <Button 
                          size="sm" 
                          onClick={() => saveTypeChange(profile)}
                          disabled={saving === profile.user_id}
                        >
                          {saving === profile.user_id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {/* Password Reset Dialog */}
      <Dialog open={!!resetPasswordUser} onOpenChange={(open) => { if (!open) { setResetPasswordUser(null); setNewPassword(''); } }}>
        <DialogContent className="bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Cambiar contraseña</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Usuario: <strong className="text-foreground">{resetPasswordUser?.display_name || resetPasswordUser?.email}</strong>
            </p>
            <Input
              type="password"
              placeholder="Nueva contraseña (mín. 6 caracteres)"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetPasswordUser(null); setNewPassword(''); }}>
              Cancelar
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={!newPassword || newPassword.length < 6 || saving === resetPasswordUser?.user_id}
            >
              {saving === resetPasswordUser?.user_id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Guardar contraseña
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
