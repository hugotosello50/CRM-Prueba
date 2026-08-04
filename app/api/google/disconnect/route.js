import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { getUserFromRequest } from '../../../../lib/googleAuth';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  await getSupabaseAdmin().from('google_contacts_tokens').delete().eq('user_id', user.id);

  return NextResponse.json({ ok: true });
}
