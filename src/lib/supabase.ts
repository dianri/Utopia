import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Indica si Supabase cuenta con credenciales válidas configuradas
 */
export const isSupabaseConfigured = Boolean(
  envUrl &&
  envAnonKey &&
  envAnonKey !== 'tu_clave_anonima_aqui' &&
  envAnonKey.trim().length > 15
);

// Fallback seguro a URL por defecto del proyecto si no se especifica
export const supabaseUrl = envUrl || 'https://iadiswktxduqetzjujli.supabase.co';

// Dummy key sintácticamente válida (JWT con cabecera y payload base64) para evitar
// que @supabase/supabase-js lance 'supabaseKey is required' al inicializar en Vercel
// antes de que el usuario configure sus Environment Variables.
const fallbackAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy_anon_key_for_unconfigured_deployment';

export const supabaseAnonKey = isSupabaseConfigured ? envAnonKey! : fallbackAnonKey;

if (!isSupabaseConfigured) {
  console.warn(
    '[Supabase Shield] VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY no están configuradas. ' +
    'Configura estas variables en Vercel Settings > Environment Variables para activar la sincronización multijugador.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: isSupabaseConfigured,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

/**
 * Asegura una sesión anónima en Supabase Auth o genera un identificador local
 * persistente si Supabase no está configurado o falla la red.
 */
export async function ensureAnonymousAuth(): Promise<string> {
  const localId = localStorage.getItem('monster_hunt_anon_id') || crypto.randomUUID();
  localStorage.setItem('monster_hunt_anon_id', localId);

  if (!isSupabaseConfigured) {
    return localId;
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.warn('Error al recuperar sesión de Supabase:', sessionError);
    }
    if (session?.user) {
      return session.user.id;
    }

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.warn('Login anónimo falló:', error);
      return localId;
    }
    return data.user?.id || localId;
  } catch (err) {
    console.warn('Excepción en autenticación de Supabase:', err);
    return localId;
  }
}
