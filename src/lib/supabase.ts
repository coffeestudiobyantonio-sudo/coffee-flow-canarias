import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Credenciales de Supabase no encontradas en las variables de entorno.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
