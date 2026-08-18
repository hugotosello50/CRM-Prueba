import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

// Zona horaria fija asumida para toda la app (no hay un campo de timezone por usuario):
// Argentina no tiene horario de verano, así que el offset es siempre -03:00.
const OFFSET_HORARIO = '-03:00';

const MS_POR_UNIDAD = { minutos: 60 * 1000, horas: 60 * 60 * 1000, dias: 24 * 60 * 60 * 1000 };

// Ventana de tolerancia: si el cron no corrió justo a tiempo (o estuvo caído un rato), un
// aviso vencido hace más de esto ya no se dispara solo — evita mandar un alud de avisos
// viejos de golpe si el cron estuvo parado horas.
const VENTANA_MS = 15 * 60 * 1000;

function momentoAviso(fecha, hora, aviso) {
  if (!fecha || !hora || !aviso?.activo) return null;
  const objetivo = new Date(`${fecha}T${hora}:00${OFFSET_HORARIO}`);
  if (isNaN(objetivo.getTime())) return null;
  const ms = (Number(aviso.cantidad) || 0) * (MS_POR_UNIDAD[aviso.unidad] || MS_POR_UNIDAD.minutos);
  return objetivo.getTime() - ms;
}

function debeAvisarAhora(fecha, hora, aviso, avisoEnviado, ahoraMs) {
  if (avisoEnviado) return false;
  const momento = momentoAviso(fecha, hora, aviso);
  if (momento === null) return false;
  return momento <= ahoraMs && ahoraMs - momento < VENTANA_MS;
}

export async function POST(request) {
  const secret = process.env.AVISOS_CRON_SECRET;
  const auth = request.headers.get('authorization') || '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublic || !vapidPrivate) {
    return NextResponse.json({ error: 'Faltan las VAPID keys configuradas' }, { status: 500 });
  }
  webpush.setVapidDetails('mailto:avisos@feyro.app', vapidPublic, vapidPrivate);

  const supabaseAdmin = getSupabaseAdmin();
  const ahoraMs = Date.now();

  const { data: filas, error: filasError } = await supabaseAdmin.from('crm_data').select('user_id, core, acciones');
  if (filasError) return NextResponse.json({ error: filasError.message }, { status: 500 });

  let avisosDisparados = 0;
  let usuariosConAviso = 0;

  for (const fila of filas || []) {
    const { user_id: userId, core, acciones } = fila;
    if (!core || !Array.isArray(acciones)) continue;

    // Junta, de este usuario, todo lo que tenga un aviso vencido: acciones pendientes,
    // tareas (hilos) y subtareas — son tres formas distintas de guardar fecha/hora/aviso.
    const pendientes = [];

    for (const a of acciones) {
      if (a.estado === 'Pendiente' && debeAvisarAhora(a.fechaProgramada, a.horaProgramada, a.aviso, a.avisoEnviado, ahoraMs)) {
        pendientes.push({ tipo: 'accion', id: a.id, hiloId: a.hiloId, texto: a.notaPlanificada || 'Acción programada', fecha: a.fechaProgramada, hora: a.horaProgramada });
      }
    }
    for (const h of core.hilos || []) {
      if (h.tipo === 'tarea' && h.estado === 'Activo' && debeAvisarAhora(h.fecha, h.hora, h.aviso, h.avisoEnviado, ahoraMs)) {
        pendientes.push({ tipo: 'tarea', hiloId: h.id, texto: h.titulo, fecha: h.fecha, hora: h.hora });
      }
      for (const s of h.subtareas || []) {
        if (!s.hecha && debeAvisarAhora(s.fecha, s.hora, s.aviso, s.avisoEnviado, ahoraMs)) {
          pendientes.push({ tipo: 'subtarea', hiloId: h.id, subId: s.id, texto: s.texto, fecha: s.fecha, hora: s.hora });
        }
      }
    }

    if (pendientes.length === 0) continue;

    const { data: subs } = await supabaseAdmin.from('push_subscriptions').select('*').eq('user_id', userId);
    let algunEnvioOk = subs && subs.length > 0;

    for (const item of pendientes) {
      let envioOk = false;
      for (const sub of subs || []) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({
              title: 'Recordatorio',
              body: item.texto,
              url: `/?abrir=${item.hiloId}&texto=${encodeURIComponent(item.texto)}&fecha=${item.fecha || ''}&hora=${item.hora || ''}`,
              hiloId: item.hiloId,
              fecha: item.fecha || null,
              hora: item.hora || null,
            })
          );
          envioOk = true;
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
          }
        }
      }
      if (envioOk) avisosDisparados++;
      algunEnvioOk = algunEnvioOk && envioOk;
    }

    // Se marcan como enviados los que efectivamente salieron, o los que no tenían ningún
    // dispositivo suscripto (no tiene sentido reintentar por siempre sin destino).
    const idsAcciones = new Set(pendientes.filter((p) => p.tipo === 'accion').map((p) => p.id));
    const nuevasAcciones = acciones.map((a) => (idsAcciones.has(a.id) ? { ...a, avisoEnviado: true } : a));

    const idsTareas = new Set(pendientes.filter((p) => p.tipo === 'tarea').map((p) => p.hiloId));
    const subIdsPorHilo = new Map();
    pendientes.filter((p) => p.tipo === 'subtarea').forEach((p) => {
      if (!subIdsPorHilo.has(p.hiloId)) subIdsPorHilo.set(p.hiloId, new Set());
      subIdsPorHilo.get(p.hiloId).add(p.subId);
    });
    const nuevosHilos = (core.hilos || []).map((h) => {
      let hh = h;
      if (idsTareas.has(h.id)) hh = { ...hh, avisoEnviado: true };
      if (subIdsPorHilo.has(h.id)) {
        const subIds = subIdsPorHilo.get(h.id);
        hh = { ...hh, subtareas: (hh.subtareas || []).map((s) => (subIds.has(s.id) ? { ...s, avisoEnviado: true } : s)) };
      }
      return hh;
    });

    await supabaseAdmin
      .from('crm_data')
      .update({ core: { ...core, hilos: nuevosHilos }, acciones: nuevasAcciones, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    usuariosConAviso++;
  }

  return NextResponse.json({ ok: true, usuariosConAviso, avisosDisparados });
}
