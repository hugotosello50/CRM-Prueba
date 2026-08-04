import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { getUserFromRequest } from '../../../../lib/googleAuth';

function digitsOnly(s) {
  return (s || '').replace(/\D/g, '');
}

// Heurística simple para no duplicar una persona que ya existía manualmente: si los
// últimos 8 dígitos coinciden, lo tomamos como el mismo teléfono.
function phonesMatch(a, b) {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (da.length < 8 || db.length < 8) return false;
  return da.slice(-8) === db.slice(-8);
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'No se pudo renovar el token de Google');
  return data;
}

// Busca, entre las etiquetas (contact groups) del usuario, la que coincide con el
// nombre configurado. Devuelve su resourceName, o null si todavía no la creó.
async function findLabelGroup(accessToken, labelName) {
  const url = new URL('https://people.googleapis.com/v1/contactGroups');
  url.searchParams.set('pageSize', '1000');
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Error consultando las etiquetas de Google Contacts');
  const target = labelName.trim().toLowerCase();
  const grupo = (data.contactGroups || []).find((g) => (g.formattedName || g.name || '').trim().toLowerCase() === target);
  return grupo ? grupo.resourceName : null;
}

async function fetchContactsInGroup(accessToken, groupResourceName) {
  let contacts = [];
  let pageToken = '';
  do {
    const url = new URL('https://people.googleapis.com/v1/people/me/connections');
    url.searchParams.set('personFields', 'names,phoneNumbers,memberships');
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Error consultando Google Contacts');
    contacts = contacts.concat(data.connections || []);
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return contacts.filter((c) =>
    (c.memberships || []).some((m) => m.contactGroupMembership?.contactGroupResourceName === groupResourceName)
  );
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: tokenRow } = await supabaseAdmin
    .from('google_contacts_tokens')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!tokenRow) return NextResponse.json({ connected: false });

  let accessToken = tokenRow.access_token;
  if (new Date(tokenRow.expires_at).getTime() < Date.now() + 60000) {
    try {
      const refreshed = await refreshAccessToken(tokenRow.refresh_token);
      accessToken = refreshed.access_token;
      await supabaseAdmin
        .from('google_contacts_tokens')
        .update({
          access_token: accessToken,
          expires_at: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
    } catch {
      return NextResponse.json({ connected: true, error: 'reconectar' });
    }
  }

  const { data: row } = await supabaseAdmin.from('crm_data').select('core').eq('user_id', user.id).maybeSingle();
  if (!row) return NextResponse.json({ connected: true, agregados: 0, actualizados: 0 });

  const core = row.core;
  const labelName = (core.parametros?.googleContactsLabel || 'CRM').trim() || 'CRM';

  let groupResourceName;
  try {
    groupResourceName = await findLabelGroup(accessToken, labelName);
  } catch {
    return NextResponse.json({ connected: true, error: 'reconectar' });
  }

  if (!groupResourceName) {
    return NextResponse.json({ connected: true, error: 'sin_etiqueta', label: labelName });
  }

  let googleContacts;
  try {
    googleContacts = await fetchContactsInGroup(accessToken, groupResourceName);
  } catch {
    return NextResponse.json({ connected: true, error: 'reconectar' });
  }

  const personas = Array.isArray(core.personas) ? [...core.personas] : [];
  let agregados = 0;
  let actualizados = 0;

  for (const c of googleContacts) {
    const nombre = c.names?.[0]?.displayName?.trim();
    const telefono = c.phoneNumbers?.[0]?.value?.trim();
    if (!nombre || !telefono) continue;

    const idx = personas.findIndex((p) => p.googleContactId === c.resourceName);
    if (idx >= 0) {
      if (personas[idx].nombre !== nombre || personas[idx].whatsapp !== telefono) {
        personas[idx] = { ...personas[idx], nombre, whatsapp: telefono };
        actualizados++;
      }
      continue;
    }

    const matchIdx = personas.findIndex((p) => !p.googleContactId && phonesMatch(p.whatsapp, telefono));
    if (matchIdx >= 0) {
      personas[matchIdx] = { ...personas[matchIdx], googleContactId: c.resourceName, nombre, whatsapp: telefono };
      actualizados++;
      continue;
    }

    personas.push({
      id: 'P-' + Math.random().toString(36).slice(2, 9),
      nombre,
      whatsapp: telefono,
      direccion: '',
      ciudad: '',
      notas: '',
      googleContactId: c.resourceName,
    });
    agregados++;
  }

  if (agregados > 0 || actualizados > 0) {
    await supabaseAdmin
      .from('crm_data')
      .update({ core: { ...core, personas }, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
  }

  return NextResponse.json({ connected: true, agregados, actualizados, total: googleContacts.length, personas });
}
