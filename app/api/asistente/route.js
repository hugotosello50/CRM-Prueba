import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { getUserFromRequest } from '../../../lib/googleAuth';
import { CATALOGO_ACCIONES } from '../../../lib/acciones';
import { ESQUEMA_RESPUESTA_IA, PROMPT_SISTEMA, resolverPedido } from '../../../lib/asistenteIA';

// Frente de IA (Fase 2 del plan — ver conversación donde se armó).
//
// Dos modos, según el body:
//  - { texto } -> INTERPRETA el pedido con Gemini y resuelve los nombres a ids reales, pero
//    no toca los datos todavía. Devuelve una propuesta para confirmar (o un motivo por el
//    que no se pudo interpretar/resolver).
//  - { accion, parametros, confirmar: true } -> EJECUTA directamente esa acción del catálogo
//    (ya con ids resueltos) y guarda el resultado. No vuelve a llamar a la IA — así confirmar
//    no tiene costo de IA y el "esto es lo que voy a hacer" que vio el usuario es exactamente
//    lo que se ejecuta.
//
// Todavía no está conectado a ninguna pantalla (eso es la Fase 4) — se puede probar con
// una herramienta de requests HTTP mandando el token de sesión en el header Authorization.

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Arma, para el motivo "ambiguo", una lista de opciones legible ("¿A cuál te referís: Juan
// Pérez o Juan Gómez?") a partir de lo que devuelve resolverPedido.
function textoAmbiguedad(resultado) {
  const nombres = (resultado.opciones || []).map((o) => o.nombre).join(', ');
  return `${resultado.detalle} Opciones: ${nombres}.`;
}

function textoResumen(accion, parametros) {
  const entrada = CATALOGO_ACCIONES.find((a) => a.nombre === accion);
  return `Acción: ${entrada?.descripcion || accion}. Parámetros: ${JSON.stringify(parametros)}`;
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const supabaseAdmin = getSupabaseAdmin();
  const { data: row } = await supabaseAdmin.from('crm_data').select('core, acciones').eq('user_id', user.id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'No se encontraron datos del CRM para este usuario.' }, { status: 404 });
  const { core, acciones } = row;

  // ---------------------------------------------------------------------
  // Modo "confirmar y ejecutar" — no llama a la IA.
  // ---------------------------------------------------------------------
  if (body.confirmar) {
    const entrada = CATALOGO_ACCIONES.find((a) => a.nombre === body.accion);
    if (!entrada) return NextResponse.json({ error: `Acción desconocida: "${body.accion}".` }, { status: 400 });
    let resultado;
    try {
      resultado = entrada.ejecutar(core, acciones, body.parametros || {});
    } catch (err) {
      return NextResponse.json({ error: err.message || 'No se pudo ejecutar la acción.' }, { status: 400 });
    }
    const { error } = await supabaseAdmin
      .from('crm_data')
      .update({ core: resultado.core, acciones: resultado.acciones, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: 'No se pudo guardar el cambio.' }, { status: 500 });
    return NextResponse.json({ ok: true, resultado: resultado.resultado });
  }

  // ---------------------------------------------------------------------
  // Modo "interpretar" — llama a la IA y resuelve nombres, sin tocar datos.
  // ---------------------------------------------------------------------
  const texto = (body.texto || '').trim();
  if (!texto) return NextResponse.json({ error: 'Falta el texto del pedido.' }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Falta configurar la clave de Gemini (GEMINI_API_KEY).' }, { status: 500 });

  const ai = new GoogleGenAI({ apiKey });
  let response;
  try {
    response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: texto,
      config: {
        systemInstruction: `${PROMPT_SISTEMA}\n\nHoy es ${todayISO()}.`,
        responseMimeType: 'application/json',
        responseJsonSchema: ESQUEMA_RESPUESTA_IA,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: `No se pudo consultar la IA: ${err.message || err}` }, { status: 502 });
  }

  let interpretado;
  try {
    interpretado = JSON.parse(response.text);
  } catch {
    return NextResponse.json({ error: 'La IA devolvió una respuesta que no se pudo interpretar.' }, { status: 502 });
  }

  if (interpretado.accion === 'ninguna') {
    return NextResponse.json({ ok: false, motivo: 'sin_interpretar', detalle: interpretado.aclaracion || 'No se pudo interpretar el pedido.' });
  }

  const resultado = resolverPedido(core, acciones, interpretado.accion, interpretado.parametros);
  if (!resultado.ok) {
    const detalle = resultado.motivo === 'ambiguo' ? textoAmbiguedad(resultado) : resultado.detalle;
    return NextResponse.json({ ok: false, motivo: resultado.motivo, detalle, opciones: resultado.opciones || null });
  }

  return NextResponse.json({
    ok: true,
    accion: resultado.accion,
    parametros: resultado.parametros,
    resumen: textoResumen(resultado.accion, resultado.parametros),
  });
}
