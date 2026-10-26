import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

// Fallback directo con la URL y clave pública (anon key) del proyecto Supabase
const DEFAULT_SUPABASE_URL = 'https://iadiswktxduqetzjujli.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhZGlzd2t0eGR1cWV0emp1amxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NTY5NzEsImV4cCI6MjEwODUzMjk3MX0._tt0ROWwTrktVBuZ173pYQQHV1TXUi_AXjgMZVjvZLc';

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseUrl = envUrl || DEFAULT_SUPABASE_URL;
export const supabaseAnonKey =
  envAnonKey && envAnonKey !== 'tu_clave_anonima_aqui' && envAnonKey.trim().length > 15
    ? envAnonKey
    : DEFAULT_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = true;

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
 * Asegura una sesión anónima en Supabase Auth o genera un identificador local
 * persistente en caso de fallo de red puntual.
 */
export async function ensureAnonymousAuth(): Promise<string> {
  const localId = localStorage.getItem('monster_hunt_anon_id') || crypto.randomUUID();
  localStorage.setItem('monster_hunt_anon_id', localId);

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
