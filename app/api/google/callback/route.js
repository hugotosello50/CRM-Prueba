import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

// Google redirige acá después de que el usuario acepta (o cancela) el permiso.
// "state" viaja con el access token de Supabase del usuario que inició la conexión,
// así identificamos a quién pertenecen los tokens sin necesitar una sesión de servidor.
export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError || !code || !state) {
    return NextResponse.redirect(new URL('/?google=error', url.origin));
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(state);
  if (userError || !userData?.user) {
    return NextResponse.redirect(new URL('/?google=error', url.origin));
  }
  const userId = userData.user.id;

  const redirectUri = `${url.origin}/api/google/callback`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || !tokenData.access_token || !tokenData.refresh_token) {
    return NextResponse.redirect(new URL('/?google=error', url.origin));
  }

  const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();

  await supabaseAdmin.from('google_contacts_tokens').upsert(
    {
      user_id: userId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  return NextResponse.redirect(new URL('/?google=connected', url.origin));
}
