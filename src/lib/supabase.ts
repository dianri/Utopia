import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://iadiswktxduqetzjujli.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseAnonKey) {
  console.warn('VITE_SUPABASE_ANON_KEY no está configurada en las variables de entorno.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

/**
 * Asegura una sesión anónima en Supabase Auth
 */
export async function ensureAnonymousAuth(): Promise<string> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError) {
    console.error('Error al recuperar sesión:', sessionError);
  }

  if (session?.user) {
    return session.user.id;
  }

  // Intentar login anónimo
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error('Error al iniciar sesión anónima:', error);
    // Fallback: Si la autenticación anónima falla o no está habilitada en el dashboard,
    // generar un identificador UUID local persistente para desarrollo
    const localId = localStorage.getItem('monster_hunt_anon_id') || crypto.randomUUID();
    localStorage.setItem('monster_hunt_anon_id', localId);
    return localId;
  }

  return data.user?.id || crypto.randomUUID();
}
