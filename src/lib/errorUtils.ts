/**
 * Maps database/auth error messages to safe, user-friendly messages
 * Prevents exposing internal database details to end users
 */
export const getSafeErrorMessage = (error: unknown): string => {
  const errorObj = error as { message?: string } | null;
  const message = errorObj?.message?.toLowerCase() || '';
  
  // Database constraint errors
  if (message.includes('foreign key') || message.includes('fk_')) {
    return 'No se puede completar la operación porque hay datos relacionados';
  }
  if (message.includes('unique') || message.includes('duplicate')) {
    return 'Ya existe un registro con estos datos';
  }
  if (message.includes('not null') || message.includes('null value')) {
    return 'Faltan datos requeridos';
  }
  if (message.includes('check constraint') || message.includes('violates check')) {
    return 'Los datos proporcionados no son válidos';
  }
  
  // Permission/RLS errors
  if (message.includes('permission') || message.includes('policy') || message.includes('rls')) {
    return 'No tienes permisos para esta operación';
  }
  if (message.includes('unauthorized') || message.includes('not authenticated')) {
    return 'Debes iniciar sesión para realizar esta acción';
  }
  
  // Network/connection errors
  if (message.includes('network') || message.includes('connection') || message.includes('timeout')) {
    return 'Error de conexión. Por favor verifica tu internet e intenta nuevamente';
  }
  if (message.includes('fetch') || message.includes('failed to fetch')) {
    return 'No se pudo conectar con el servidor. Intenta nuevamente';
  }
  
  // Storage errors
  if (message.includes('storage') || message.includes('bucket')) {
    return 'Error al procesar el archivo. Intenta nuevamente';
  }
  if (message.includes('file size') || message.includes('too large')) {
    return 'El archivo es demasiado grande';
  }
  if (message.includes('file type') || message.includes('mime')) {
    return 'Tipo de archivo no permitido';
  }
  
  // Auth-specific errors (keep some user-friendly ones)
  if (message.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos';
  }
  if (message.includes('already registered') || message.includes('user already exists')) {
    return 'Este correo ya está registrado. Intenta iniciar sesión';
  }
  if (message.includes('email not confirmed')) {
    return 'Debes confirmar tu correo electrónico primero';
  }
  if (message.includes('weak password') || message.includes('password')) {
    return 'La contraseña no cumple con los requisitos mínimos';
  }
  
  // Generic fallback - don't expose the actual message
  return 'Ocurrió un error. Por favor intenta nuevamente';
};
