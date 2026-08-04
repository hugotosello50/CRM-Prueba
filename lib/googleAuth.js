import { getSupabaseAdmin } from './supabaseAdmin';

// Verifica el token de sesión de Supabase que manda el cliente en el header
// Authorization, y devuelve el usuario autenticado (o null).
export async function getUserFromRequest(request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return null;
  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}
