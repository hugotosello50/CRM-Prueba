// Traductor entre lenguaje natural y el catálogo de acciones de lib/acciones.js (Fase 2 del
// plan de "frente de IA" — ver conversación donde se armó).
//
// La IA nunca conoce los ids reales de las entidades (personas, empresas, hilos...) — le
// pedimos que devuelva una acción del catálogo con los datos de referencia en TEXTO (nombres),
// y acá los resolvemos a ids reales antes de poder ejecutar la acción. Este archivo no hace
// ninguna llamada a la IA en sí (eso vive en la API route) — solo arma el pedido (esquema +
// instrucciones) y resuelve la respuesta.

import { CATALOGO_ACCIONES, buscarEntidad, nombreVisibleHilo } from './acciones';

// ---------------------------------------------------------------------------
// Esquema de respuesta que le exigimos a la IA (JSON Schema — Gemini lo hace cumplir).
// "parametros" tiene que declarar los campos reales de cada acción (con "anyOf", una forma
// por acción) — dejarlo como objeto libre y confiar solo en el texto del prompt hace que la
// IA, al forzar una salida con esquema, devuelva un objeto vacío (no tiene ningún campo
// declarado adonde poner los datos, aunque el prompt se los pida en prosa).
// ---------------------------------------------------------------------------
const ENTIDAD_ENUM = { type: 'string', enum: ['Persona', 'Empresa', 'Obra', 'Hilo'] };
const NOMBRE_ENTIDAD_SCHEMA = { type: 'object', properties: { tipo: ENTIDAD_ENUM, nombre: { type: 'string' } }, required: ['tipo', 'nombre'] };
const AVISO_SCHEMA = { type: 'object', properties: { activo: { type: 'boolean' }, cantidad: { type: 'number' }, unidad: { type: 'string', enum: ['minutos', 'horas', 'dias'] } } };

const FORMAS_PARAMETROS = {
  crearPersona: {
    type: 'object',
    properties: {
      nombre: { type: 'string' }, whatsapp: { type: 'string' }, direccion: { type: 'string' }, ciudad: { type: 'string' }, notas: { type: 'string' },
      empresaNombres: { type: 'array', items: { type: 'string' } }, obraNombres: { type: 'array', items: { type: 'string' } },
    },
    required: ['nombre'],
  },
  crearEmpresa: {
    type: 'object',
    properties: { denominacion: { type: 'string' }, cuit: { type: 'string' }, direccion: { type: 'string' }, ciudad: { type: 'string' }, personaNombre: { type: 'string' } },
    required: ['denominacion'],
  },
  crearObra: {
    type: 'object',
    properties: { nombre: { type: 'string' }, descripcion: { type: 'string' }, metros2: { type: 'number' }, direccion: { type: 'string' }, ciudad: { type: 'string' }, empresaNombre: { type: 'string' } },
    required: ['nombre'],
  },
  crearHiloSeguimiento: {
    type: 'object',
    properties: {
      titulo: { type: 'string' }, personaNombre: { type: 'string' },
      empresaNombres: { type: 'array', items: { type: 'string' } }, obraNombres: { type: 'array', items: { type: 'string' } },
    },
    required: ['titulo'],
  },
  crearTarea: {
    type: 'object',
    properties: { titulo: { type: 'string' }, fecha: { type: 'string' }, hora: { type: 'string' }, aviso: AVISO_SCHEMA },
    required: ['titulo'],
  },
  avanzarHilo: {
    type: 'object',
    properties: {
      hiloNombre: { type: 'string' }, tipoAccionNombre: { type: 'string' }, notaHecho: { type: 'string' }, fechaHecho: { type: 'string' },
      programarProxima: { type: 'boolean' }, tipoAccionNombreProxima: { type: 'string' }, notaPlanificada: { type: 'string' },
      fechaProxima: { type: 'string' }, horaProxima: { type: 'string' }, prioridad: { type: 'string', enum: ['Alta', 'Media', 'Baja'] }, aviso: AVISO_SCHEMA,
    },
    required: ['hiloNombre', 'tipoAccionNombre'],
  },
  vincularEntidades: {
    type: 'object',
    properties: {
      origenes: { type: 'array', items: NOMBRE_ENTIDAD_SCHEMA }, destinos: { type: 'array', items: NOMBRE_ENTIDAD_SCHEMA }, nota: { type: 'string' },
    },
    required: ['origenes', 'destinos'],
  },
  asignarEtiqueta: {
    type: 'object',
    properties: {
      entidadTipo: ENTIDAD_ENUM, entidadNombres: { type: 'array', items: { type: 'string' } }, nombreEtiqueta: { type: 'string' }, categoriaNombre: { type: 'string' },
    },
    required: ['entidadTipo', 'entidadNombres', 'nombreEtiqueta'],
  },
  ninguna: { type: 'object' },
};

export const ESQUEMA_RESPUESTA_IA = {
  type: 'object',
  properties: {
    accion: {
      type: 'string',
      enum: [...CATALOGO_ACCIONES.map((a) => a.nombre), 'ninguna'],
      description: '"ninguna" si el pedido no corresponde a ninguna acción del catálogo, o si falta información imprescindible.',
    },
    parametros: {
      anyOf: Object.values(FORMAS_PARAMETROS),
      description: 'Los datos de la acción elegida (la forma tiene que coincidir con la acción de "accion"), con nombres en texto libre (no ids) para todo lo que haga referencia a una entidad existente.',
    },
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
- Para tipoAccionNombre y tipoAccionNombreProxima es DISTINTO: no son texto libre. Te paso más
  abajo la lista real de tipos de acción que existen en esta cuenta — tenés que devolver
  EXACTAMENTE uno de esos textos, tal cual está escrito, eligiendo el que mejor corresponda a lo
  que pidió el usuario aunque haya usado otra palabra o variante (ej: si el usuario dice "una
  llamada" y la lista real tiene "Llamado telefónico", devolvé "Llamado telefónico", no
  "Llamada"). Nunca inventes un tipo que no esté en esa lista.
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
6. avanzarHilo: { hiloNombre* (el hilo o tarea, con el mismo nombre que ve el usuario en la tarjeta —
   la persona/empresa/obra vinculada, o el título si no tiene ninguna), tipoAccionNombre* (ver regla
   de arriba: exacto de la lista real), notaHecho?, fechaHecho?, programarProxima?: boolean,
   tipoAccionNombreProxima? (misma regla que tipoAccionNombre), notaPlanificada?,
   fechaProxima? (obligatoria si programarProxima), horaProxima?, prioridad?, aviso? }
7. vincularEntidades: { origenes*: {tipo: "Persona"|"Empresa"|"Obra", nombre}[], destinos*: (mismo formato), nota? }
8. asignarEtiqueta: { entidadTipo* ("Persona"|"Empresa"|"Obra"), entidadNombres*: string[], nombreEtiqueta*, categoriaNombre? }

(* = obligatorio, ? = opcional)`;

// Texto con los tipos de acción reales de esta cuenta, para agregar al prompt de sistema en
// cada pedido (ver PROMPT_SISTEMA arriba: tipoAccionNombre tiene que ser exacto de esta lista).
export function promptTiposAccionReales(core) {
  const nombres = (core.tiposAccion || []).map((t) => `"${t.nombre}"`);
  if (nombres.length === 0) return 'Tipos de acción reales disponibles: (todavía no hay ninguno cargado).';
  return `Tipos de acción reales disponibles en esta cuenta (usá EXACTAMENTE uno de estos textos para tipoAccionNombre / tipoAccionNombreProxima): ${nombres.join(', ')}.`;
}

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

// ---------------------------------------------------------------------------
// Resumen legible de lo que se va a ejecutar (parametros ya resueltos, con ids) — para
// mostrarle al usuario antes de que confirme, en vez de un volcado de JSON.
// ---------------------------------------------------------------------------
function nombrePersona(core, id) { return core.personas.find((p) => p.id === id)?.nombre || '(persona no encontrada)'; }
function nombreEmpresa(core, id) { return core.empresas.find((e) => e.id === id)?.denominacion || '(empresa no encontrada)'; }
function nombreObra(core, id) { return core.obras.find((o) => o.id === id)?.nombre || '(obra no encontrada)'; }
function nombreHilo(core, id) { const h = core.hilos.find((x) => x.id === id); return h ? nombreVisibleHilo(h, core) : '(hilo no encontrado)'; }
function nombreTipoAccion(core, id) { return core.tiposAccion.find((t) => t.id === id)?.nombre || '(tipo no encontrado)'; }
function nombreEtiqueta(core, id) { return core.etiquetas.find((e) => e.id === id)?.etiqueta || '(etiqueta no encontrada)'; }
function nombreEntidad(core, tipo, id) {
  if (tipo === 'Persona') return nombrePersona(core, id);
  if (tipo === 'Empresa') return nombreEmpresa(core, id);
  if (tipo === 'Obra') return nombreObra(core, id);
  return nombreHilo(core, id);
}
function fmtFecha(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function fmtFechaHora(iso, hora) {
  return fmtFecha(iso) + (hora ? ` ${hora}hs` : '');
}

export function resumenLegible(core, accion, p) {
  switch (accion) {
    case 'crearPersona': {
      const detalles = [];
      if (p.whatsapp) detalles.push(`WhatsApp ${p.whatsapp}`);
      if (p.direccion) detalles.push(`dirección ${p.direccion}`);
      if (p.ciudad) detalles.push(`ciudad ${p.ciudad}`);
      if (p.notas) detalles.push(`nota: "${p.notas}"`);
      const vinculos = [...(p.empresaIds || []).map((id) => nombreEmpresa(core, id)), ...(p.obraIds || []).map((id) => nombreObra(core, id))];
      let texto = `Crear la persona "${p.nombre}"`;
      if (detalles.length) texto += ` (${detalles.join(', ')})`;
      if (vinculos.length) texto += `, vinculada a ${vinculos.join(', ')}`;
      return texto + '.';
    }
    case 'crearEmpresa': {
      const detalles = [];
      if (p.cuit) detalles.push(`CUIT ${p.cuit}`);
      if (p.direccion) detalles.push(`dirección ${p.direccion}`);
      if (p.ciudad) detalles.push(`ciudad ${p.ciudad}`);
      let texto = `Crear la empresa "${p.denominacion}"`;
      if (detalles.length) texto += ` (${detalles.join(', ')})`;
      if (p.personaId) texto += `, con ${nombrePersona(core, p.personaId)} como representante`;
      return texto + '.';
    }
    case 'crearObra': {
      const detalles = [];
      if (p.descripcion) detalles.push(p.descripcion);
      if (p.metros2) detalles.push(`${p.metros2} m²`);
      if (p.direccion) detalles.push(`dirección ${p.direccion}`);
      if (p.ciudad) detalles.push(`ciudad ${p.ciudad}`);
      let texto = `Crear la obra "${p.nombre}"`;
      if (detalles.length) texto += ` (${detalles.join(', ')})`;
      if (p.empresaId) texto += `, de la empresa ${nombreEmpresa(core, p.empresaId)}`;
      return texto + '.';
    }
    case 'crearHiloSeguimiento': {
      const vinculos = [];
      if (p.personaId) vinculos.push(nombrePersona(core, p.personaId));
      vinculos.push(...(p.empresaIds || []).map((id) => nombreEmpresa(core, id)));
      vinculos.push(...(p.obraIds || []).map((id) => nombreObra(core, id)));
      let texto = `Crear el hilo de seguimiento "${p.titulo}"`;
      if (vinculos.length) texto += `, vinculado a ${vinculos.join(', ')}`;
      return texto + '.';
    }
    case 'crearTarea': {
      let texto = `Crear la tarea "${p.titulo}"`;
      if (p.fecha) texto += ` para el ${fmtFechaHora(p.fecha, p.hora)}`;
      if (p.aviso?.activo) texto += `, con aviso ${p.aviso.cantidad} ${p.aviso.unidad} antes`;
      return texto + '.';
    }
    case 'avanzarHilo': {
      let texto = `En el hilo "${nombreHilo(core, p.hiloId)}": registrar ${nombreTipoAccion(core, p.tipoAccionId)}${p.fechaHecho ? ` el ${fmtFecha(p.fechaHecho)}` : ''}`;
      if (p.notaHecho) texto += `, nota: "${p.notaHecho}"`;
      texto += '.';
      if (p.programarProxima) {
        texto += ` Programar próxima acción: ${nombreTipoAccion(core, p.tipoAccionIdProxima || p.tipoAccionId)} para el ${fmtFechaHora(p.fechaProxima, p.horaProxima)}, prioridad ${p.prioridad}`;
        if (p.notaPlanificada) texto += `, nota: "${p.notaPlanificada}"`;
        if (p.aviso?.activo) texto += `, con aviso ${p.aviso.cantidad} ${p.aviso.unidad} antes`;
        texto += '.';
      }
      return texto;
    }
    case 'vincularEntidades': {
      const origenes = p.origenes.map((o) => nombreEntidad(core, o.tipo, o.id)).join(', ');
      const destinos = p.destinos.map((d) => nombreEntidad(core, d.tipo, d.id)).join(', ');
      let texto = `Vincular ${origenes} con ${destinos}`;
      if (p.nota) texto += `, nota: "${p.nota}"`;
      return texto + '.';
    }
    case 'asignarEtiqueta': {
      const etiqueta = p.etiquetaId ? nombreEtiqueta(core, p.etiquetaId) : `${p.nombreEtiquetaNueva} (etiqueta nueva)`;
      const entidades = p.entidadIds.map((id) => nombreEntidad(core, p.entidadTipo, id)).join(', ');
      return `Asignar la etiqueta "${etiqueta}" a ${entidades}.`;
    }
    default:
      return `Acción: ${accion}.`;
  }
}
