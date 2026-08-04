import { createClient } from '@supabase/supabase-js';

// Cliente de Supabase para usar SOLO en el servidor (API routes). Usa la service role
// key, que salta las políticas de RLS — nunca debe importarse desde un componente
// 'use client' ni exponerse al navegador.
// Se crea recién al llamarlo (no al importar el módulo), para que el build no falle
// si las variables de entorno todavía no están configuradas en ese momento.
let client;
export function getSupabaseAdmin() {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
