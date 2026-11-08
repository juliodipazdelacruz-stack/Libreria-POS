import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const clave = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurado = Boolean(url && clave);

// El panel usa la clave "anon": la seguridad la aplican las políticas RLS de la base de datos.
export const supabase = createClient(url || 'http://localhost', clave || 'sin-configurar');
