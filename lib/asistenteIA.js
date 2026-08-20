// Traductor entre lenguaje natural y el catálogo de acciones de lib/acciones.js (Fase 2 del
// plan de "frente de IA" — ver conversación donde se armó).
//
// La IA nunca conoce los ids reales de las entidades (personas, empresas, hilos...) — le
// pedimos que devuelva una acción del catálogo con los datos de referencia en TEXTO (nombres),
// y acá los resolvemos a ids reales antes de poder ejecutar la acción. Este archivo no hace
// ninguna llamada a la IA en sí (eso vive en la API route) — solo arma el pedido (esquema +
// instrucciones) y resuelve la respuesta.

import { CATALOGO_ACCIONES, buscarEntidad } from './acciones';

// ---------------------------------------------------------------------------
// Esquema de respuesta que le exigimos a la IA (JSON Schema — Gemini lo hace cumplir).
// "parametros" queda deliberadamente laxo (objeto libre): la forma exacta de campos por
// acción se describe en el prompt, no en el schema, para no tener que mantener dos
// versiones (schema + prompt) del mismo detalle.
// ---------------------------------------------------------------------------
export const ESQUEMA_RESPUESTA_IA = {
  type: 'object',
  properties: {
    accion: {
      type: 'string',
      enum: [...CATALOGO_ACCIONES.map((a) => a.nombre), 'ninguna'],
      description: '"ninguna" si el pedido no corresponde a ninguna acción del catálogo, o si falta información imprescindible.',
    },
    parametros: { type: 'object', description: 'Los datos de la acción elegida, con nombres en texto libre (no ids) para todo lo que haga referencia a una entidad existente.' },
    aclaracion: { type: 'string', description: 'Si accion es "ninguna", explicar acá en una frase por qué no se pudo interpretar.' },
  },
  required: ['accion', 'parametros'],
};

// ---------------------------------------------------------------------------
// Prompt de sistema: contexto del negocio + guía de campos por acción (versión "IA", con
// nombres en vez de ids). Este es el texto que se ajusta con el tiempo a medida que se vean
// casos mal interpretados — ver conversación sobre cómo se afina.
// ---------------------------------------------------------------------------
export const PROMPT_SISTEMA = `Sos el asistente del CRM de Feyro, una empresa dedicada a la venta de materiales
eléctricos dentro del rubro de la construcción de inmuebles. El usuario te va a pedir en
lenguaje natural (texto o transcripción de audio) que hagas algo en el CRM. Tu trabajo es
elegir UNA acción del catálogo de abajo y devolver sus parámetros — nunca ejecutás nada vos,
solo interpretás.

Reglas importantes:
- Para cualquier campo que haga referencia a una persona, empresa, obra o hilo existente,
  devolvé el NOMBRE tal como lo dijo el usuario (texto libre), nunca un id — no los conocés.
- Si el pedido no corresponde a ninguna acción del catálogo, o falta un dato imprescindible
  (por ejemplo el nombre de la persona a crear), respondé accion:"ninguna" y explicá por qué
  en "aclaracion", en una frase breve y clara para alguien sin conocimientos técnicos.
- Las fechas van en formato AAAA-MM-DD y las horas en HH:MM (24hs). Si el usuario dice "mañana",
  "el jueves que viene", etc., convertilo a fecha concreta vos mismo usando la fecha de hoy que
  se te pasa más abajo.
- prioridad es siempre uno de: "Alta", "Media", "Baja".

Acciones disponibles y sus parámetros (formato "IA", con nombres en vez de ids):

1. crearPersona: { nombre*, whatsapp?, direccion?, ciudad?, notas?, empresaNombres?: string[], obraNombres?: string[] }
2. crearEmpresa: { denominacion*, cuit?, direccion?, ciudad?, personaNombre? }
3. crearObra: { nombre*, descripcion?, metros2?, direccion?, ciudad?, empresaNombre? }
4. crearHiloSeguimiento: { titulo*, personaNombre?, empresaNombres?: string[], obraNombres?: string[] }
5. crearTarea: { titulo*, fecha?, hora?, aviso?: { activo: boolean, cantidad: number, unidad: "minutos"|"horas"|"dias" } }
6. avanzarHilo: { hiloNombre* (título del hilo o tarea), tipoAccionNombre* (ej: "Llamada", "WhatsApp", "Email", "Reunión", "Visita"),
   notaHecho?, fechaHecho?, programarProxima?: boolean, tipoAccionNombreProxima?, notaPlanificada?,
   fechaProxima? (obligatoria si programarProxima), horaProxima?, prioridad?, aviso? }
7. vincularEntidades: { origenes*: {tipo: "Persona"|"Empresa"|"Obra", nombre}[], destinos*: (mismo formato), nota? }
8. asignarEtiqueta: { entidadTipo* ("Persona"|"Empresa"|"Obra"), entidadNombres*: string[], nombreEtiqueta*, categoriaNombre? }

(* = obligatorio, ? = opcional)`;

// ---------------------------------------------------------------------------
// Resolución de nombres -> ids reales, con detección de ambigüedad.
// ---------------------------------------------------------------------------
function resolverUnaEntidad(core, tipo, nombre) {
  if (!nombre || !nombre.trim()) return { ok: false, motivo: 'falta_dato', detalle: `Falta el nombre de ${tipo.toLowerCase()}.` };
  const candidatos = buscarEntidad(core, nombre, [tipo]);
  const q = nombre.trim().toLowerCase();
  const exacto = candidatos.find((c) => c.nombre.trim().toLowerCase() === q);
  if (exacto) return { ok: true, id: exacto.id, nombre: exacto.nombre };
  if (candidatos.length === 0) return { ok: false, motivo: 'no_encontrado', detalle: `No encontré ninguna ${tipo.toLowerCase()} llamada "${nombre}".` };
  if (candidatos.length > 1) return { ok: false, motivo: 'ambiguo', detalle: `Hay ${candidatos.length} coincidencias para "${nombre}".`, opciones: candidatos };
  return { ok: true, id: candidatos[0].id, nombre: candidatos[0].nombre };
}

function resolverVariasEntidades(core, tipo, nombres = []) {
  const ids = [];
  for (const n of nombres) {
    const r = resolverUnaEntidad(core, tipo, n);
    if (!r.ok) return r;
    ids.push(r.id);
  }
  return { ok: true, ids };
}

function resolverPorNombreEnLista(lista, campo, nombre, etiquetaError) {
  if (!nombre || !nombre.trim()) return { ok: false, motivo: 'falta_dato', detalle: `Falta ${etiquetaError}.` };
  const q = nombre.trim().toLowerCase();
  const candidatos = lista.filter((x) => (x[campo] || '').toLowerCase().includes(q));
  const exacto = candidatos.find((x) => (x[campo] || '').trim().toLowerCase() === q);
  if (exacto) return { ok: true, id: exacto.id, nombre: exacto[campo] };
  if (candidatos.length === 0) return { ok: false, motivo: 'no_encontrado', detalle: `No encontré "${nombre}" (${etiquetaError}).` };
  if (candidatos.length > 1) return { ok: false, motivo: 'ambiguo', detalle: `Hay ${candidatos.length} coincidencias para "${nombre}" (${etiquetaError}).`, opciones: candidatos.map((c) => ({ id: c.id, nombre: c[campo] })) };
  return { ok: true, id: candidatos[0].id, nombre: candidatos[0][campo] };
}

// ---------------------------------------------------------------------------
// Un resolvedor por acción: (core, acciones, parametrosIA) -> { ok, parametros } | { ok:false, motivo, detalle }
// ---------------------------------------------------------------------------
const RESOLVEDORES = {
  crearPersona(core, acciones, p) {
    const empresas = resolverVariasEntidades(core, 'Empresa', p.empresaNombres || []);
    if (!empresas.ok) return empresas;
    const obras = resolverVariasEntidades(core, 'Obra', p.obraNombres || []);
    if (!obras.ok) return obras;
    if (!p.nombre || !p.nombre.trim()) return { ok: false, motivo: 'falta_dato', detalle: 'Falta el nombre de la persona.' };
    return {
      ok: true,
      parametros: { nombre: p.nombre, whatsapp: p.whatsapp || '', direccion: p.direccion || '', ciudad: p.ciudad || '', notas: p.notas || '', empresaIds: empresas.ids, obraIds: obras.ids },
    };
  },

  crearEmpresa(core, acciones, p) {
    if (!p.denominacion || !p.denominacion.trim()) return { ok: false, motivo: 'falta_dato', detalle: 'Falta la denominación de la empresa.' };
    let personaId = null;
    if (p.personaNombre) {
      const r = resolverUnaEntidad(core, 'Persona', p.personaNombre);
      if (!r.ok) return r;
      personaId = r.id;
    }
    return { ok: true, parametros: { denominacion: p.denominacion, cuit: p.cuit || '', direccion: p.direccion || '', ciudad: p.ciudad || '', personaId } };
  },

  crearObra(core, acciones, p) {
    if (!p.nombre || !p.nombre.trim()) return { ok: false, motivo: 'falta_dato', detalle: 'Falta el nombre de la obra.' };
    let empresaId = null;
    if (p.empresaNombre) {
      const r = resolverUnaEntidad(core, 'Empresa', p.empresaNombre);
      if (!r.ok) return r;
      empresaId = r.id;
    }
    return { ok: true, parametros: { nombre: p.nombre, descripcion: p.descripcion || '', metros2: p.metros2 || 0, direccion: p.direccion || '', ciudad: p.ciudad || '', empresaId } };
  },

  crearHiloSeguimiento(core, acciones, p) {
    if (!p.titulo || !p.titulo.trim()) return { ok: false, motivo: 'falta_dato', detalle: 'Falta el título del hilo.' };
    let personaId = null;
    if (p.personaNombre) {
      const r = resolverUnaEntidad(core, 'Persona', p.personaNombre);
      if (!r.ok) return r;
      personaId = r.id;
    }
    const empresas = resolverVariasEntidades(core, 'Empresa', p.empresaNombres || []);
    if (!empresas.ok) return empresas;
    const obras = resolverVariasEntidades(core, 'Obra', p.obraNombres || []);
    if (!obras.ok) return obras;
    return { ok: true, parametros: { titulo: p.titulo, personaId, empresaIds: empresas.ids, obraIds: obras.ids } };
  },

  crearTarea(core, acciones, p) {
    if (!p.titulo || !p.titulo.trim()) return { ok: false, motivo: 'falta_dato', detalle: 'Falta el título de la tarea.' };
    return { ok: true, parametros: { titulo: p.titulo, fecha: p.fecha || '', hora: p.hora || '', aviso: p.aviso || null } };
  },

  avanzarHilo(core, acciones, p) {
    const hilo = resolverUnaEntidad(core, 'Hilo', p.hiloNombre);
    if (!hilo.ok) return hilo;
    const tipoAccion = resolverPorNombreEnLista(core.tiposAccion, 'nombre', p.tipoAccionNombre, 'el tipo de acción');
    if (!tipoAccion.ok) return tipoAccion;
    const pendiente = acciones.find((a) => a.hiloId === hilo.id && a.estado === 'Pendiente');
    const parametros = {
      hiloId: hilo.id,
      pendienteId: pendiente ? pendiente.id : null,
      tipoAccionId: tipoAccion.id,
      notaHecho: p.notaHecho || '',
      fechaHecho: p.fechaHecho || undefined,
      programarProxima: !!p.programarProxima,
      prioridad: p.prioridad || 'Media',
      notaPlanificada: p.notaPlanificada || '',
      fechaProxima: p.fechaProxima || '',
      horaProxima: p.horaProxima || '',
      aviso: p.aviso || null,
    };
    if (p.programarProxima) {
      if (!p.fechaProxima) return { ok: false, motivo: 'falta_dato', detalle: 'Falta la fecha de la próxima acción.' };
      if (p.tipoAccionNombreProxima) {
        const tipoProx = resolverPorNombreEnLista(core.tiposAccion, 'nombre', p.tipoAccionNombreProxima, 'el tipo de la próxima acción');
        if (!tipoProx.ok) return tipoProx;
        parametros.tipoAccionIdProxima = tipoProx.id;
      }
    }
    return { ok: true, parametros };
  },

  vincularEntidades(core, acciones, p) {
    const resolverLado = (lado) => {
      const out = [];
      for (const item of lado || []) {
        const r = resolverUnaEntidad(core, item.tipo, item.nombre);
        if (!r.ok) return r;
        out.push({ tipo: item.tipo, id: r.id });
      }
      return { ok: true, lista: out };
    };
    const origenes = resolverLado(p.origenes);
    if (!origenes.ok) return origenes;
    const destinos = resolverLado(p.destinos);
    if (!destinos.ok) return destinos;
    if (origenes.lista.length === 0 || destinos.lista.length === 0) return { ok: false, motivo: 'falta_dato', detalle: 'Faltan las entidades a vincular.' };
    return { ok: true, parametros: { origenes: origenes.lista, destinos: destinos.lista, nota: p.nota || '' } };
  },

  asignarEtiqueta(core, acciones, p) {
    if (!p.entidadTipo || !p.entidadNombres?.length) return { ok: false, motivo: 'falta_dato', detalle: 'Falta a qué entidad asignar la etiqueta.' };
    const entidades = resolverVariasEntidades(core, p.entidadTipo, p.entidadNombres);
    if (!entidades.ok) return entidades;
    if (!p.nombreEtiqueta || !p.nombreEtiqueta.trim()) return { ok: false, motivo: 'falta_dato', detalle: 'Falta el nombre de la etiqueta.' };

    const q = p.nombreEtiqueta.trim().toLowerCase();
    const etiquetaExistente = (core.etiquetas || []).find((e) => {
      const cat = (core.categorias || []).find((c) => c.id === e.categoriaId);
      return cat?.aplicaA === p.entidadTipo && e.etiqueta.trim().toLowerCase() === q;
    });

    const parametros = { entidadTipo: p.entidadTipo, entidadIds: entidades.ids };
    if (etiquetaExistente) {
      parametros.etiquetaId = etiquetaExistente.id;
    } else {
      parametros.nombreEtiquetaNueva = p.nombreEtiqueta;
      if (p.categoriaNombre) {
        const cat = resolverPorNombreEnLista((core.categorias || []).filter((c) => c.aplicaA === p.entidadTipo), 'nombre', p.categoriaNombre, 'la categoría');
        if (!cat.ok) return cat;
        parametros.categoriaId = cat.id;
      }
    }
    return { ok: true, parametros };
  },
};

// ---------------------------------------------------------------------------
// Punto de entrada: recibe lo que devolvió la IA (accion + parametros con nombres) y
// devuelve, o bien los parámetros ya resueltos con ids reales listos para ejecutar, o bien
// el motivo por el que no se pudo (para mostrárselo al usuario y que aclare).
// ---------------------------------------------------------------------------
export function resolverPedido(core, acciones, accion, parametrosIA) {
  if (accion === 'ninguna') return { ok: false, motivo: 'sin_interpretar' };
  const entradaCatalogo = CATALOGO_ACCIONES.find((a) => a.nombre === accion);
  if (!entradaCatalogo) return { ok: false, motivo: 'accion_desconocida', detalle: `"${accion}" no es una acción válida.` };
  const resolvedor = RESOLVEDORES[accion];
  if (!resolvedor) return { ok: false, motivo: 'accion_desconocida', detalle: `No hay resolución implementada para "${accion}".` };
  const resultado = resolvedor(core, acciones, parametrosIA || {});
  if (!resultado.ok) return resultado;
  return { ok: true, accion, parametros: resultado.parametros };
}
