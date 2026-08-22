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
  editarPersona: {
    type: 'object',
    properties: { personaNombre: { type: 'string' }, nombre: { type: 'string' }, whatsapp: { type: 'string' }, direccion: { type: 'string' }, ciudad: { type: 'string' } },
    required: ['personaNombre'],
  },
  eliminarPersona: { type: 'object', properties: { personaNombre: { type: 'string' } }, required: ['personaNombre'] },
  crearEmpresa: {
    type: 'object',
    properties: { denominacion: { type: 'string' }, cuit: { type: 'string' }, direccion: { type: 'string' }, ciudad: { type: 'string' }, personaNombre: { type: 'string' } },
    required: ['denominacion'],
  },
  editarEmpresa: {
    type: 'object',
    properties: { empresaNombre: { type: 'string' }, denominacion: { type: 'string' }, cuit: { type: 'string' }, direccion: { type: 'string' }, ciudad: { type: 'string' } },
    required: ['empresaNombre'],
  },
  eliminarEmpresa: { type: 'object', properties: { empresaNombre: { type: 'string' } }, required: ['empresaNombre'] },
  asignarCabeceraEmpresa: { type: 'object', properties: { empresaNombre: { type: 'string' }, cabeceraNombre: { type: 'string' } }, required: ['empresaNombre', 'cabeceraNombre'] },
  crearObra: {
    type: 'object',
    properties: { nombre: { type: 'string' }, descripcion: { type: 'string' }, metros2: { type: 'number' }, direccion: { type: 'string' }, ciudad: { type: 'string' }, empresaNombre: { type: 'string' } },
    required: ['nombre'],
  },
  editarObra: {
    type: 'object',
    properties: { obraNombre: { type: 'string' }, nombre: { type: 'string' }, descripcion: { type: 'string' }, metros2: { type: 'number' }, direccion: { type: 'string' }, ciudad: { type: 'string' } },
    required: ['obraNombre'],
  },
  eliminarObra: { type: 'object', properties: { obraNombre: { type: 'string' } }, required: ['obraNombre'] },
  crearHiloSeguimiento: {
    type: 'object',
    properties: {
      titulo: { type: 'string' }, personaNombre: { type: 'string' },
      empresaNombres: { type: 'array', items: { type: 'string' } }, obraNombres: { type: 'array', items: { type: 'string' } },
    },
    required: ['titulo'],
  },
  editarHiloSeguimiento: {
    type: 'object',
    properties: {
      hiloNombre: { type: 'string' }, titulo: { type: 'string' }, personaNombre: { type: 'string' },
      empresaNombres: { type: 'array', items: { type: 'string' } }, obraNombres: { type: 'array', items: { type: 'string' } },
    },
    required: ['hiloNombre'],
  },
  cerrarHilo: { type: 'object', properties: { hiloNombre: { type: 'string' }, notaCierre: { type: 'string' } }, required: ['hiloNombre'] },
  reabrirHilo: { type: 'object', properties: { hiloNombre: { type: 'string' } }, required: ['hiloNombre'] },
  crearTarea: {
    type: 'object',
    properties: { titulo: { type: 'string' }, fecha: { type: 'string' }, hora: { type: 'string' }, aviso: AVISO_SCHEMA },
    required: ['titulo'],
  },
  editarTarea: {
    type: 'object',
    properties: { hiloNombre: { type: 'string' }, titulo: { type: 'string' }, fecha: { type: 'string' }, hora: { type: 'string' }, aviso: AVISO_SCHEMA },
    required: ['hiloNombre'],
  },
  moverColumnaTarea: { type: 'object', properties: { hiloNombre: { type: 'string' }, columnaNombre: { type: 'string' } }, required: ['hiloNombre', 'columnaNombre'] },
  avanzarHilo: {
    type: 'object',
    properties: {
      hiloNombre: { type: 'string' }, tipoAccionNombre: { type: 'string' }, notaHecho: { type: 'string' }, fechaHecho: { type: 'string' },
      programarProxima: { type: 'boolean' }, tipoAccionNombreProxima: { type: 'string' }, notaPlanificada: { type: 'string' },
      fechaProxima: { type: 'string' }, horaProxima: { type: 'string' }, prioridad: { type: 'string', enum: ['Alta', 'Media', 'Baja'] }, aviso: AVISO_SCHEMA,
    },
    required: ['hiloNombre', 'tipoAccionNombre'],
  },
  editarAccion: {
    type: 'object',
    properties: {
      hiloNombre: { type: 'string' }, cual: { type: 'string', enum: ['pendiente', 'ultima_realizada'] },
      tipoAccionNombre: { type: 'string' }, estado: { type: 'string', enum: ['Pendiente', 'Realizada'] },
      fecha: { type: 'string' }, hora: { type: 'string' }, prioridad: { type: 'string', enum: ['Alta', 'Media', 'Baja'] },
      notaPlanificada: { type: 'string' }, notaHecho: { type: 'string' }, aviso: AVISO_SCHEMA,
    },
    required: ['hiloNombre'],
  },
  eliminarAccion: { type: 'object', properties: { hiloNombre: { type: 'string' }, cual: { type: 'string', enum: ['pendiente', 'ultima_realizada'] } }, required: ['hiloNombre'] },
  agregarNota: {
    type: 'object',
    properties: { entidadTipo: { type: 'string', enum: ['Persona', 'Hilo'] }, entidadNombre: { type: 'string' }, texto: { type: 'string' } },
    required: ['entidadTipo', 'entidadNombre', 'texto'],
  },
  editarNota: {
    type: 'object',
    properties: { entidadTipo: { type: 'string', enum: ['Persona', 'Hilo'] }, entidadNombre: { type: 'string' }, notaBuscada: { type: 'string' }, textoNuevo: { type: 'string' } },
    required: ['entidadTipo', 'entidadNombre', 'textoNuevo'],
  },
  eliminarNota: {
    type: 'object',
    properties: { entidadTipo: { type: 'string', enum: ['Persona', 'Hilo'] }, entidadNombre: { type: 'string' }, notaBuscada: { type: 'string' } },
    required: ['entidadTipo', 'entidadNombre'],
  },
  agregarSubtarea: {
    type: 'object',
    properties: { hiloNombre: { type: 'string' }, texto: { type: 'string' }, fecha: { type: 'string' }, hora: { type: 'string' }, nota: { type: 'string' }, aviso: AVISO_SCHEMA },
    required: ['hiloNombre', 'texto'],
  },
  editarSubtarea: {
    type: 'object',
    properties: {
      hiloNombre: { type: 'string' }, subtareaBuscada: { type: 'string' }, texto: { type: 'string' }, fecha: { type: 'string' }, hora: { type: 'string' },
      nota: { type: 'string' }, aviso: AVISO_SCHEMA, hecha: { type: 'boolean' },
    },
    required: ['hiloNombre'],
  },
  eliminarSubtarea: { type: 'object', properties: { hiloNombre: { type: 'string' }, subtareaBuscada: { type: 'string' } }, required: ['hiloNombre'] },
  vincularEntidades: {
    type: 'object',
    properties: {
      origenes: { type: 'array', items: NOMBRE_ENTIDAD_SCHEMA }, destinos: { type: 'array', items: NOMBRE_ENTIDAD_SCHEMA }, nota: { type: 'string' },
      tipoRelacionNombre: { type: 'string' },
    },
    required: ['origenes', 'destinos'],
  },
  finalizarVinculo: {
    type: 'object',
    properties: { origen: NOMBRE_ENTIDAD_SCHEMA, destino: NOMBRE_ENTIDAD_SCHEMA, tipoRelacionNombre: { type: 'string' } },
    required: ['origen', 'destino'],
  },
  quitarEtiqueta: {
    type: 'object',
    properties: { entidadTipo: ENTIDAD_ENUM, entidadNombre: { type: 'string' }, etiquetaNombre: { type: 'string' } },
    required: ['entidadTipo', 'entidadNombre', 'etiquetaNombre'],
  },
  eliminarEtiqueta: { type: 'object', properties: { etiquetaNombre: { type: 'string' } }, required: ['etiquetaNombre'] },
  eliminarCategoria: { type: 'object', properties: { categoriaNombre: { type: 'string' } }, required: ['categoriaNombre'] },
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
- Para cualquier campo que haga referencia a una persona, empresa, obra o hilo existente
  (incluye hiloNombre, personaNombre, empresaNombre(s), obraNombre(s), cabeceraNombre),
  devolvé el NOMBRE tal como lo dijo el usuario (texto libre), nunca un id — no los conocés.
  Para un hilo, el nombre es el que ve el usuario en la tarjeta: la persona/empresa/obra
  vinculada, o el título si no tiene ninguna vinculada.
- Todo campo llamado tipoAccionNombre (tipoAccionNombre, tipoAccionNombreProxima) es DISTINTO:
  no es texto libre. Te paso más abajo la lista real de tipos de acción que existen en esta
  cuenta — tenés que devolver EXACTAMENTE uno de esos textos, tal cual está escrito, eligiendo
  el que mejor corresponda a lo que pidió el usuario aunque haya usado otra palabra o variante
  (ej: si el usuario dice "una llamada" y la lista real tiene "Llamado telefónico", devolvé
  "Llamado telefónico", no "Llamada"). Nunca inventes un tipo que no esté en esa lista.
- Para editar/eliminar una acción de un hilo (editarAccion, eliminarAccion) que no diste vos
  mismo un id: el parámetro "cual" indica a qué acción del hilo se refiere el usuario —
  "pendiente" (la próxima acción programada, es el valor por defecto si no se aclara) o
  "ultima_realizada" (el último registro de "lo hecho" en el historial).
- Para editar un hilo de seguimiento (editarHiloSeguimiento) o mover una tarea de columna
  (moverColumnaTarea): solo se modifica lo que el usuario pidió cambiar — no repitas datos que
  no mencionó. Para personaNombre, empresaNombres u obraNombres, si el usuario pide "sacar" o
  "quitar" el vínculo sin reemplazarlo, devolvé "" (para personaNombre) o [] (para las listas).
- Una nota o una subtarea no tienen nombre propio — se ubican por notaBuscada/subtareaBuscada:
  un fragmento del texto actual de la nota/subtarea que el usuario quiere editar o eliminar. Si
  el usuario no da ninguna pista de cuál (ej. "agregále una nota" recién dicha, o "marcá la
  última subtarea como hecha"), dejalo vacío — se toma automáticamente la más reciente.
- Si el pedido no corresponde a ninguna acción del catálogo, o falta un dato imprescindible
  (por ejemplo el nombre de la persona a crear), respondé accion:"ninguna" y explicá por qué
  en "aclaracion", en una frase breve y clara para alguien sin conocimientos técnicos.
- Las fechas van en formato AAAA-MM-DD y las horas en HH:MM (24hs). Si el usuario dice "mañana",
  "el jueves que viene", etc., convertilo a fecha concreta vos mismo usando la fecha de hoy que
  se te pasa más abajo.
- prioridad es siempre uno de: "Alta", "Media", "Baja".

Acciones disponibles y sus parámetros (formato "IA", con nombres en vez de ids):

1. crearPersona: { nombre*, whatsapp?, direccion?, ciudad?, notas?, empresaNombres?: string[], obraNombres?: string[] }
2. editarPersona: { personaNombre*, nombre?, whatsapp?, direccion?, ciudad? }
3. eliminarPersona: { personaNombre* }
4. crearEmpresa: { denominacion*, cuit?, direccion?, ciudad?, personaNombre? }
5. editarEmpresa: { empresaNombre*, denominacion?, cuit?, direccion?, ciudad? }
6. eliminarEmpresa: { empresaNombre* }
7. asignarCabeceraEmpresa: { empresaNombre* (la subsidiaria), cabeceraNombre* (la cabecera del grupo) }
8. crearObra: { nombre*, descripcion?, metros2?, direccion?, ciudad?, empresaNombre? }
9. editarObra: { obraNombre*, nombre?, descripcion?, metros2?, direccion?, ciudad? }
10. eliminarObra: { obraNombre* }
11. crearHiloSeguimiento: { titulo*, personaNombre?, empresaNombres?: string[], obraNombres?: string[] }
12. editarHiloSeguimiento: { hiloNombre*, titulo?, personaNombre?, empresaNombres?: string[], obraNombres?: string[] }
13. cerrarHilo: { hiloNombre*, notaCierre? } (aplica a hilos de seguimiento y tareas)
14. reabrirHilo: { hiloNombre* } (aplica a hilos de seguimiento y tareas)
15. crearTarea: { titulo*, fecha?, hora?, aviso?: { activo: boolean, cantidad: number, unidad: "minutos"|"horas"|"dias" } }
16. editarTarea: { hiloNombre*, titulo?, fecha?, hora?, aviso? }
17. moverColumnaTarea: { hiloNombre*, columnaNombre* (nombre real de la columna del Kanban de Tareas, o "Sin columna") }
18. avanzarHilo: { hiloNombre*, tipoAccionNombre* (ver regla de arriba: exacto de la lista real),
    notaHecho?, fechaHecho?, programarProxima?: boolean, tipoAccionNombreProxima? (misma regla),
    notaPlanificada?, fechaProxima? (obligatoria si programarProxima), horaProxima?, prioridad?, aviso? }
19. editarAccion: { hiloNombre*, cual? ("pendiente"|"ultima_realizada"), tipoAccionNombre?,
    estado? ("Pendiente"|"Realizada"), fecha?, hora?, prioridad?, notaPlanificada?, notaHecho?, aviso? }
20. eliminarAccion: { hiloNombre*, cual? ("pendiente"|"ultima_realizada") }
21. agregarNota: { entidadTipo* ("Persona"|"Hilo"), entidadNombre*, texto* }
22. editarNota: { entidadTipo* ("Persona"|"Hilo"), entidadNombre*, notaBuscada? (ver regla de abajo), textoNuevo* }
23. eliminarNota: { entidadTipo* ("Persona"|"Hilo"), entidadNombre*, notaBuscada? (ver regla de abajo) }
24. agregarSubtarea: { hiloNombre* (de una tarea), texto*, fecha?, hora?, nota?, aviso? }
25. editarSubtarea: { hiloNombre*, subtareaBuscada? (ver regla de abajo), texto?, fecha?, hora?, nota?, aviso?, hecha? (boolean, para marcarla hecha o pendiente) }
26. eliminarSubtarea: { hiloNombre*, subtareaBuscada? (ver regla de abajo) }
27. vincularEntidades: { origenes*: {tipo: "Persona"|"Empresa"|"Obra", nombre}[], destinos*: (mismo formato), nota?, tipoRelacionNombre? (nombre real de un tipo de relación, ej: "Es dueña de", "Gerente de" — opcional, un vínculo puede no tener tipo) }
28. finalizarVinculo: { origen*: {tipo: "Persona"|"Empresa"|"Obra", nombre}, destino*: (mismo formato), tipoRelacionNombre? (para desambiguar si hay más de un vínculo activo entre las mismas dos entidades) }
29. quitarEtiqueta: { entidadTipo* ("Persona"|"Empresa"|"Obra"), entidadNombre*, etiquetaNombre* (una de las que ya tiene asignadas) }
30. eliminarEtiqueta: { etiquetaNombre* } (borra la etiqueta de raíz, se les quita a todas las entidades que la tenían)
31. eliminarCategoria: { categoriaNombre* } (las etiquetas de esa categoría quedan sin categoría, no se borran)
32. asignarEtiqueta: { entidadTipo* ("Persona"|"Empresa"|"Obra"), entidadNombres*: string[], nombreEtiqueta*, categoriaNombre? }

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

// Para ítems sin nombre propio (una nota, una subtarea): ubica el que contiene el texto
// buscado, o el último cargado si no se especifica ninguno (caso más común — "la nota que
// acabo de agregar", "la última subtarea").
function resolverItemPorTexto(items, campo, textoBuscado, etiquetaError) {
  if (items.length === 0) return { ok: false, motivo: 'no_encontrado', detalle: `No hay ninguna ${etiquetaError} cargada.` };
  if (!textoBuscado || !textoBuscado.trim()) return { ok: true, item: items[items.length - 1] };
  const q = textoBuscado.trim().toLowerCase();
  const candidatos = items.filter((it) => (it[campo] || '').toLowerCase().includes(q));
  if (candidatos.length === 0) return { ok: false, motivo: 'no_encontrado', detalle: `No encontré ninguna ${etiquetaError} que contenga "${textoBuscado}".` };
  if (candidatos.length > 1) return { ok: false, motivo: 'ambiguo', detalle: `Hay ${candidatos.length} coincidencias para "${textoBuscado}" (${etiquetaError}).`, opciones: candidatos.map((it) => ({ id: it.id, nombre: it[campo] })) };
  return { ok: true, item: candidatos[0] };
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

  editarPersona(core, acciones, p) {
    const persona = resolverUnaEntidad(core, 'Persona', p.personaNombre);
    if (!persona.ok) return persona;
    const parametros = { personaId: persona.id };
    if (p.nombre !== undefined) parametros.nombre = p.nombre;
    if (p.whatsapp !== undefined) parametros.whatsapp = p.whatsapp;
    if (p.direccion !== undefined) parametros.direccion = p.direccion;
    if (p.ciudad !== undefined) parametros.ciudad = p.ciudad;
    return { ok: true, parametros };
  },

  eliminarPersona(core, acciones, p) {
    const persona = resolverUnaEntidad(core, 'Persona', p.personaNombre);
    if (!persona.ok) return persona;
    return { ok: true, parametros: { personaId: persona.id } };
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

  editarEmpresa(core, acciones, p) {
    const empresa = resolverUnaEntidad(core, 'Empresa', p.empresaNombre);
    if (!empresa.ok) return empresa;
    const parametros = { empresaId: empresa.id };
    if (p.denominacion !== undefined) parametros.denominacion = p.denominacion;
    if (p.cuit !== undefined) parametros.cuit = p.cuit;
    if (p.direccion !== undefined) parametros.direccion = p.direccion;
    if (p.ciudad !== undefined) parametros.ciudad = p.ciudad;
    return { ok: true, parametros };
  },

  eliminarEmpresa(core, acciones, p) {
    const empresa = resolverUnaEntidad(core, 'Empresa', p.empresaNombre);
    if (!empresa.ok) return empresa;
    return { ok: true, parametros: { empresaId: empresa.id } };
  },

  asignarCabeceraEmpresa(core, acciones, p) {
    const empresa = resolverUnaEntidad(core, 'Empresa', p.empresaNombre);
    if (!empresa.ok) return empresa;
    const cabecera = resolverUnaEntidad(core, 'Empresa', p.cabeceraNombre);
    if (!cabecera.ok) return cabecera;
    if (empresa.id === cabecera.id) return { ok: false, motivo: 'falta_dato', detalle: 'Una empresa no puede ser cabecera de sí misma.' };
    return { ok: true, parametros: { empresaId: empresa.id, cabeceraId: cabecera.id } };
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

  editarObra(core, acciones, p) {
    const obra = resolverUnaEntidad(core, 'Obra', p.obraNombre);
    if (!obra.ok) return obra;
    const parametros = { obraId: obra.id };
    if (p.nombre !== undefined) parametros.nombre = p.nombre;
    if (p.descripcion !== undefined) parametros.descripcion = p.descripcion;
    if (p.metros2 !== undefined) parametros.metros2 = p.metros2;
    if (p.direccion !== undefined) parametros.direccion = p.direccion;
    if (p.ciudad !== undefined) parametros.ciudad = p.ciudad;
    return { ok: true, parametros };
  },

  eliminarObra(core, acciones, p) {
    const obra = resolverUnaEntidad(core, 'Obra', p.obraNombre);
    if (!obra.ok) return obra;
    return { ok: true, parametros: { obraId: obra.id } };
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

  editarHiloSeguimiento(core, acciones, p) {
    const hilo = resolverUnaEntidad(core, 'Hilo', p.hiloNombre);
    if (!hilo.ok) return hilo;
    const parametros = { hiloId: hilo.id };
    if (p.titulo !== undefined) parametros.titulo = p.titulo;
    if (p.personaNombre !== undefined) {
      if (!p.personaNombre) {
        parametros.personaId = '';
      } else {
        const r = resolverUnaEntidad(core, 'Persona', p.personaNombre);
        if (!r.ok) return r;
        parametros.personaId = r.id;
      }
    }
    if (p.empresaNombres !== undefined) {
      const empresas = resolverVariasEntidades(core, 'Empresa', p.empresaNombres);
      if (!empresas.ok) return empresas;
      parametros.empresaIds = empresas.ids;
    }
    if (p.obraNombres !== undefined) {
      const obras = resolverVariasEntidades(core, 'Obra', p.obraNombres);
      if (!obras.ok) return obras;
      parametros.obraIds = obras.ids;
    }
    return { ok: true, parametros };
  },

  cerrarHilo(core, acciones, p) {
    const hilo = resolverUnaEntidad(core, 'Hilo', p.hiloNombre);
    if (!hilo.ok) return hilo;
    return { ok: true, parametros: { hiloId: hilo.id, notaCierre: p.notaCierre || '' } };
  },

  reabrirHilo(core, acciones, p) {
    const hilo = resolverUnaEntidad(core, 'Hilo', p.hiloNombre);
    if (!hilo.ok) return hilo;
    return { ok: true, parametros: { hiloId: hilo.id } };
  },

  crearTarea(core, acciones, p) {
    if (!p.titulo || !p.titulo.trim()) return { ok: false, motivo: 'falta_dato', detalle: 'Falta el título de la tarea.' };
    return { ok: true, parametros: { titulo: p.titulo, fecha: p.fecha || '', hora: p.hora || '', aviso: p.aviso || null } };
  },

  editarTarea(core, acciones, p) {
    const hilo = resolverUnaEntidad(core, 'Hilo', p.hiloNombre);
    if (!hilo.ok) return hilo;
    const parametros = { hiloId: hilo.id };
    if (p.titulo !== undefined) parametros.titulo = p.titulo;
    if (p.fecha !== undefined) parametros.fecha = p.fecha;
    if (p.hora !== undefined) parametros.hora = p.hora;
    if (p.aviso !== undefined) parametros.aviso = p.aviso;
    return { ok: true, parametros };
  },

  moverColumnaTarea(core, acciones, p) {
    const hilo = resolverUnaEntidad(core, 'Hilo', p.hiloNombre);
    if (!hilo.ok) return hilo;
    if (!p.columnaNombre || !p.columnaNombre.trim()) return { ok: false, motivo: 'falta_dato', detalle: 'Falta la columna destino.' };
    const sinColumna = (core.parametros?.nombreSinColumnaTareas || 'Sin columna').trim().toLowerCase();
    if (p.columnaNombre.trim().toLowerCase() === sinColumna) {
      return { ok: true, parametros: { hiloId: hilo.id, columnaTareaId: '' } };
    }
    const col = resolverPorNombreEnLista(core.kanbanColumnasTareas || [], 'nombre', p.columnaNombre, 'la columna');
    if (!col.ok) return col;
    return { ok: true, parametros: { hiloId: hilo.id, columnaTareaId: col.id } };
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

  editarAccion(core, acciones, p) {
    const hilo = resolverUnaEntidad(core, 'Hilo', p.hiloNombre);
    if (!hilo.ok) return hilo;
    const estadoBuscado = p.cual === 'ultima_realizada' ? 'Realizada' : 'Pendiente';
    const candidatas = acciones.filter((a) => a.hiloId === hilo.id && a.estado === estadoBuscado).sort((a, b) => (b.secuencia || 0) - (a.secuencia || 0));
    const accion = candidatas[0];
    if (!accion) return { ok: false, motivo: 'no_encontrado', detalle: `El hilo "${hilo.nombre}" no tiene ninguna acción ${estadoBuscado === 'Realizada' ? 'realizada' : 'pendiente'}.` };
    const parametros = { accionId: accion.id };
    if (p.tipoAccionNombre) {
      const tipo = resolverPorNombreEnLista(core.tiposAccion, 'nombre', p.tipoAccionNombre, 'el tipo de acción');
      if (!tipo.ok) return tipo;
      parametros.tipoAccionId = tipo.id;
    }
    if (p.estado !== undefined) parametros.estado = p.estado;
    if (p.fecha !== undefined) parametros.fecha = p.fecha;
    if (p.hora !== undefined) parametros.hora = p.hora;
    if (p.prioridad !== undefined) parametros.prioridad = p.prioridad;
    if (p.notaPlanificada !== undefined) parametros.notaPlanificada = p.notaPlanificada;
    if (p.notaHecho !== undefined) parametros.notaHecho = p.notaHecho;
    if (p.aviso !== undefined) parametros.aviso = p.aviso;
    return { ok: true, parametros };
  },

  eliminarAccion(core, acciones, p) {
    const hilo = resolverUnaEntidad(core, 'Hilo', p.hiloNombre);
    if (!hilo.ok) return hilo;
    const estadoBuscado = p.cual === 'ultima_realizada' ? 'Realizada' : 'Pendiente';
    const candidatas = acciones.filter((a) => a.hiloId === hilo.id && a.estado === estadoBuscado).sort((a, b) => (b.secuencia || 0) - (a.secuencia || 0));
    const accion = candidatas[0];
    if (!accion) return { ok: false, motivo: 'no_encontrado', detalle: `El hilo "${hilo.nombre}" no tiene ninguna acción ${estadoBuscado === 'Realizada' ? 'realizada' : 'pendiente'}.` };
    return { ok: true, parametros: { accionId: accion.id } };
  },

  agregarNota(core, acciones, p) {
    if (p.entidadTipo !== 'Persona' && p.entidadTipo !== 'Hilo') return { ok: false, motivo: 'falta_dato', detalle: 'Las notas solo aplican a personas o hilos (seguimientos y tareas).' };
    const entidad = resolverUnaEntidad(core, p.entidadTipo, p.entidadNombre);
    if (!entidad.ok) return entidad;
    if (!p.texto || !p.texto.trim()) return { ok: false, motivo: 'falta_dato', detalle: 'Falta el texto de la nota.' };
    return { ok: true, parametros: { entidadTipo: p.entidadTipo, entidadId: entidad.id, texto: p.texto } };
  },

  editarNota(core, acciones, p) {
    if (p.entidadTipo !== 'Persona' && p.entidadTipo !== 'Hilo') return { ok: false, motivo: 'falta_dato', detalle: 'Las notas solo aplican a personas o hilos (seguimientos y tareas).' };
    const entidad = resolverUnaEntidad(core, p.entidadTipo, p.entidadNombre);
    if (!entidad.ok) return entidad;
    const notas = p.entidadTipo === 'Hilo' ? core.hilos.find((h) => h.id === entidad.id)?.notas : core.personas.find((x) => x.id === entidad.id)?.notas;
    const item = resolverItemPorTexto(notas || [], 'texto', p.notaBuscada, 'nota');
    if (!item.ok) return item;
    if (!p.textoNuevo || !p.textoNuevo.trim()) return { ok: false, motivo: 'falta_dato', detalle: 'Falta el nuevo texto de la nota.' };
    return { ok: true, parametros: { entidadTipo: p.entidadTipo, entidadId: entidad.id, notaId: item.item.id, texto: p.textoNuevo } };
  },

  eliminarNota(core, acciones, p) {
    if (p.entidadTipo !== 'Persona' && p.entidadTipo !== 'Hilo') return { ok: false, motivo: 'falta_dato', detalle: 'Las notas solo aplican a personas o hilos (seguimientos y tareas).' };
    const entidad = resolverUnaEntidad(core, p.entidadTipo, p.entidadNombre);
    if (!entidad.ok) return entidad;
    const notas = p.entidadTipo === 'Hilo' ? core.hilos.find((h) => h.id === entidad.id)?.notas : core.personas.find((x) => x.id === entidad.id)?.notas;
    const item = resolverItemPorTexto(notas || [], 'texto', p.notaBuscada, 'nota');
    if (!item.ok) return item;
    return { ok: true, parametros: { entidadTipo: p.entidadTipo, entidadId: entidad.id, notaId: item.item.id } };
  },

  agregarSubtarea(core, acciones, p) {
    const hilo = resolverUnaEntidad(core, 'Hilo', p.hiloNombre);
    if (!hilo.ok) return hilo;
    if (!p.texto || !p.texto.trim()) return { ok: false, motivo: 'falta_dato', detalle: 'Falta el texto de la subtarea.' };
    return { ok: true, parametros: { hiloId: hilo.id, texto: p.texto, fecha: p.fecha || '', hora: p.hora || '', nota: p.nota || '', aviso: p.aviso || null } };
  },

  editarSubtarea(core, acciones, p) {
    const hilo = resolverUnaEntidad(core, 'Hilo', p.hiloNombre);
    if (!hilo.ok) return hilo;
    const hiloObj = core.hilos.find((h) => h.id === hilo.id);
    const item = resolverItemPorTexto(hiloObj?.subtareas || [], 'texto', p.subtareaBuscada, 'subtarea');
    if (!item.ok) return item;
    const parametros = { hiloId: hilo.id, subtareaId: item.item.id };
    if (p.texto !== undefined) parametros.texto = p.texto;
    if (p.fecha !== undefined) parametros.fecha = p.fecha;
    if (p.hora !== undefined) parametros.hora = p.hora;
    if (p.nota !== undefined) parametros.nota = p.nota;
    if (p.aviso !== undefined) parametros.aviso = p.aviso;
    if (p.hecha !== undefined) parametros.hecha = p.hecha;
    return { ok: true, parametros };
  },

  eliminarSubtarea(core, acciones, p) {
    const hilo = resolverUnaEntidad(core, 'Hilo', p.hiloNombre);
    if (!hilo.ok) return hilo;
    const hiloObj = core.hilos.find((h) => h.id === hilo.id);
    const item = resolverItemPorTexto(hiloObj?.subtareas || [], 'texto', p.subtareaBuscada, 'subtarea');
    if (!item.ok) return item;
    return { ok: true, parametros: { hiloId: hilo.id, subtareaId: item.item.id } };
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
    const parametros = { origenes: origenes.lista, destinos: destinos.lista, nota: p.nota || '' };
    if (p.tipoRelacionNombre) {
      const tipo = resolverPorNombreEnLista(core.tiposRelacion || [], 'nombre', p.tipoRelacionNombre, 'el tipo de relación');
      if (!tipo.ok) return tipo;
      parametros.tipoRelacionId = tipo.id;
    }
    return { ok: true, parametros };
  },

  finalizarVinculo(core, acciones, p) {
    const origen = resolverUnaEntidad(core, p.origen?.tipo, p.origen?.nombre);
    if (!origen.ok) return origen;
    const destino = resolverUnaEntidad(core, p.destino?.tipo, p.destino?.nombre);
    if (!destino.ok) return destino;
    let candidatos = (core.vinculos || []).filter((v) => !v.hasta && (
      (v.origenTipo === p.origen.tipo && v.origenId === origen.id && v.destinoTipo === p.destino.tipo && v.destinoId === destino.id) ||
      (v.origenTipo === p.destino.tipo && v.origenId === destino.id && v.destinoTipo === p.origen.tipo && v.destinoId === origen.id)
    ));
    if (p.tipoRelacionNombre) {
      const tipo = resolverPorNombreEnLista(core.tiposRelacion || [], 'nombre', p.tipoRelacionNombre, 'el tipo de relación');
      if (!tipo.ok) return tipo;
      candidatos = candidatos.filter((v) => v.tipoRelacionId === tipo.id);
    }
    if (candidatos.length === 0) return { ok: false, motivo: 'no_encontrado', detalle: `No encontré un vínculo activo entre "${origen.nombre}" y "${destino.nombre}".` };
    if (candidatos.length > 1) {
      return {
        ok: false, motivo: 'ambiguo',
        detalle: `Hay ${candidatos.length} vínculos activos entre "${origen.nombre}" y "${destino.nombre}" — especificá el tipo de relación.`,
        opciones: candidatos.map((v) => ({ id: v.id, nombre: core.tiposRelacion?.find((t) => t.id === v.tipoRelacionId)?.nombre || '(sin tipo)' })),
      };
    }
    return { ok: true, parametros: { vinculoId: candidatos[0].id } };
  },

  quitarEtiqueta(core, acciones, p) {
    const entidad = resolverUnaEntidad(core, p.entidadTipo, p.entidadNombre);
    if (!entidad.ok) return entidad;
    const asignadas = (core.entidadEtiqueta || [])
      .filter((r) => r.entidadTipo === p.entidadTipo && r.entidadId === entidad.id)
      .map((r) => core.etiquetas.find((e) => e.id === r.etiquetaId))
      .filter(Boolean);
    const etiqueta = resolverPorNombreEnLista(asignadas, 'etiqueta', p.etiquetaNombre, 'la etiqueta asignada');
    if (!etiqueta.ok) return etiqueta;
    return { ok: true, parametros: { entidadTipo: p.entidadTipo, entidadId: entidad.id, etiquetaId: etiqueta.id } };
  },

  eliminarEtiqueta(core, acciones, p) {
    const etiqueta = resolverPorNombreEnLista(core.etiquetas || [], 'etiqueta', p.etiquetaNombre, 'la etiqueta');
    if (!etiqueta.ok) return etiqueta;
    return { ok: true, parametros: { etiquetaId: etiqueta.id } };
  },

  eliminarCategoria(core, acciones, p) {
    const categoria = resolverPorNombreEnLista(core.categorias || [], 'nombre', p.categoriaNombre, 'la categoría');
    if (!categoria.ok) return categoria;
    return { ok: true, parametros: { categoriaId: categoria.id } };
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
function nombreTipoRelacion(core, id) { return (core.tiposRelacion || []).find((t) => t.id === id)?.nombre || ''; }
function nombreCategoria(core, id) { return (core.categorias || []).find((c) => c.id === id)?.nombre || '(categoría no encontrada)'; }
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
// Arma "campo: valor, campo: valor" solo con los campos presentes en p (undefined = no se toca).
function textoPatch(p, etiquetas) {
  const partes = [];
  for (const [campo, etiqueta] of Object.entries(etiquetas)) {
    if (p[campo] !== undefined) partes.push(`${etiqueta}: "${p[campo]}"`);
  }
  return partes.join(', ');
}
// Para el aviso de "esto está siendo usado" antes de eliminar (mismo criterio que la UI):
// cuenta vínculos y etiquetas asignadas a una entidad Persona/Empresa/Obra.
function textoUsoEntidad(core, tipo, id) {
  const vinculos = (core.vinculos || []).filter((v) => (v.origenTipo === tipo && v.origenId === id) || (v.destinoTipo === tipo && v.destinoId === id)).length;
  const etiquetas = (core.entidadEtiqueta || []).filter((r) => r.entidadTipo === tipo && r.entidadId === id).length;
  const partes = [];
  if (vinculos) partes.push(`${vinculos} vínculo${vinculos === 1 ? '' : 's'}`);
  if (etiquetas) partes.push(`${etiquetas} etiqueta${etiquetas === 1 ? '' : 's'} asignada${etiquetas === 1 ? '' : 's'}`);
  return partes.length ? ` (se pierden ${partes.join(' y ')})` : '';
}

export function resumenLegible(core, acciones, accion, p) {
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
    case 'editarPersona': {
      const cambios = textoPatch(p, { nombre: 'nombre', whatsapp: 'WhatsApp', direccion: 'dirección', ciudad: 'ciudad' });
      return `Editar a ${nombrePersona(core, p.personaId)}${cambios ? ` — ${cambios}` : ''}.`;
    }
    case 'eliminarPersona':
      return `Eliminar a ${nombrePersona(core, p.personaId)}${textoUsoEntidad(core, 'Persona', p.personaId)}.`;
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
    case 'editarEmpresa': {
      const cambios = textoPatch(p, { denominacion: 'denominación', cuit: 'CUIT', direccion: 'dirección', ciudad: 'ciudad' });
      return `Editar la empresa ${nombreEmpresa(core, p.empresaId)}${cambios ? ` — ${cambios}` : ''}.`;
    }
    case 'eliminarEmpresa':
      return `Eliminar la empresa ${nombreEmpresa(core, p.empresaId)}${textoUsoEntidad(core, 'Empresa', p.empresaId)}.`;
    case 'asignarCabeceraEmpresa':
      return `Asignar a ${nombreEmpresa(core, p.cabeceraId)} como cabecera del grupo de ${nombreEmpresa(core, p.empresaId)}.`;
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
    case 'editarObra': {
      const cambios = textoPatch(p, { nombre: 'nombre', descripcion: 'descripción', metros2: 'm²', direccion: 'dirección', ciudad: 'ciudad' });
      return `Editar la obra ${nombreObra(core, p.obraId)}${cambios ? ` — ${cambios}` : ''}.`;
    }
    case 'eliminarObra':
      return `Eliminar la obra ${nombreObra(core, p.obraId)}${textoUsoEntidad(core, 'Obra', p.obraId)}.`;
    case 'crearHiloSeguimiento': {
      const vinculos = [];
      if (p.personaId) vinculos.push(nombrePersona(core, p.personaId));
      vinculos.push(...(p.empresaIds || []).map((id) => nombreEmpresa(core, id)));
      vinculos.push(...(p.obraIds || []).map((id) => nombreObra(core, id)));
      let texto = `Crear el hilo de seguimiento "${p.titulo}"`;
      if (vinculos.length) texto += `, vinculado a ${vinculos.join(', ')}`;
      return texto + '.';
    }
    case 'editarHiloSeguimiento': {
      const cambios = [];
      if (p.titulo !== undefined) cambios.push(`título: "${p.titulo}"`);
      if (p.personaId !== undefined) cambios.push(`persona: ${p.personaId ? nombrePersona(core, p.personaId) : '(sin persona)'}`);
      if (p.empresaIds !== undefined) cambios.push(`empresas: ${p.empresaIds.length ? p.empresaIds.map((id) => nombreEmpresa(core, id)).join(', ') : '(ninguna)'}`);
      if (p.obraIds !== undefined) cambios.push(`obras: ${p.obraIds.length ? p.obraIds.map((id) => nombreObra(core, id)).join(', ') : '(ninguna)'}`);
      return `Editar el hilo "${nombreHilo(core, p.hiloId)}" — ${cambios.join(', ')}.`;
    }
    case 'cerrarHilo':
      return `Cerrar el hilo "${nombreHilo(core, p.hiloId)}"${p.notaCierre ? `, nota: "${p.notaCierre}"` : ''}.`;
    case 'reabrirHilo':
      return `Reabrir el hilo "${nombreHilo(core, p.hiloId)}".`;
    case 'crearTarea': {
      let texto = `Crear la tarea "${p.titulo}"`;
      if (p.fecha) texto += ` para el ${fmtFechaHora(p.fecha, p.hora)}`;
      if (p.aviso?.activo) texto += `, con aviso ${p.aviso.cantidad} ${p.aviso.unidad} antes`;
      return texto + '.';
    }
    case 'editarTarea': {
      const cambios = textoPatch(p, { titulo: 'título', fecha: 'fecha', hora: 'hora' });
      return `Editar la tarea "${nombreHilo(core, p.hiloId)}"${cambios ? ` — ${cambios}` : ''}.`;
    }
    case 'moverColumnaTarea': {
      const columna = p.columnaTareaId ? (core.kanbanColumnasTareas || []).find((c) => c.id === p.columnaTareaId)?.nombre || '(columna no encontrada)' : (core.parametros?.nombreSinColumnaTareas || 'Sin columna');
      return `Mover la tarea "${nombreHilo(core, p.hiloId)}" a la columna "${columna}".`;
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
    case 'editarAccion': {
      const accionObj = acciones.find((a) => a.id === p.accionId);
      const cambios = [];
      if (p.tipoAccionId !== undefined) cambios.push(`tipo: ${nombreTipoAccion(core, p.tipoAccionId)}`);
      if (p.estado !== undefined) cambios.push(`estado: ${p.estado}`);
      if (p.fecha !== undefined) cambios.push(`fecha: ${fmtFecha(p.fecha)}`);
      if (p.hora !== undefined) cambios.push(`hora: ${p.hora}`);
      if (p.prioridad !== undefined) cambios.push(`prioridad: ${p.prioridad}`);
      if (p.notaPlanificada !== undefined) cambios.push(`nota: "${p.notaPlanificada}"`);
      if (p.notaHecho !== undefined) cambios.push(`nota: "${p.notaHecho}"`);
      return `Editar la acción de "${nombreHilo(core, accionObj?.hiloId)}" — ${cambios.join(', ')}.`;
    }
    case 'eliminarAccion': {
      const accionObj = acciones.find((a) => a.id === p.accionId);
      return `Eliminar la acción ${accionObj ? nombreTipoAccion(core, accionObj.tipoAccionId) : ''} del hilo "${nombreHilo(core, accionObj?.hiloId)}".`;
    }
    case 'agregarNota':
      return `Agregar una nota a ${p.entidadTipo === 'Hilo' ? `"${nombreHilo(core, p.entidadId)}"` : nombrePersona(core, p.entidadId)}: "${p.texto}".`;
    case 'editarNota':
      return `Editar una nota de ${p.entidadTipo === 'Hilo' ? `"${nombreHilo(core, p.entidadId)}"` : nombrePersona(core, p.entidadId)} — nuevo texto: "${p.texto}".`;
    case 'eliminarNota':
      return `Eliminar una nota de ${p.entidadTipo === 'Hilo' ? `"${nombreHilo(core, p.entidadId)}"` : nombrePersona(core, p.entidadId)}.`;
    case 'agregarSubtarea': {
      let texto = `Agregar la subtarea "${p.texto}" a la tarea "${nombreHilo(core, p.hiloId)}"`;
      if (p.fecha) texto += `, para el ${fmtFechaHora(p.fecha, p.hora)}`;
      if (p.nota) texto += `, nota: "${p.nota}"`;
      return texto + '.';
    }
    case 'editarSubtarea': {
      const cambios = textoPatch(p, { texto: 'texto', fecha: 'fecha', hora: 'hora', nota: 'nota' });
      const partes = cambios ? [cambios] : [];
      if (p.hecha !== undefined) partes.push(`estado: ${p.hecha ? 'hecha' : 'pendiente'}`);
      return `Editar una subtarea de la tarea "${nombreHilo(core, p.hiloId)}"${partes.length ? ` — ${partes.join(', ')}` : ''}.`;
    }
    case 'eliminarSubtarea':
      return `Eliminar una subtarea de la tarea "${nombreHilo(core, p.hiloId)}".`;
    case 'vincularEntidades': {
      const origenes = p.origenes.map((o) => nombreEntidad(core, o.tipo, o.id)).join(', ');
      const destinos = p.destinos.map((d) => nombreEntidad(core, d.tipo, d.id)).join(', ');
      let texto = `Vincular ${origenes} con ${destinos}`;
      if (p.tipoRelacionId) texto += ` (${nombreTipoRelacion(core, p.tipoRelacionId)})`;
      if (p.nota) texto += `, nota: "${p.nota}"`;
      return texto + '.';
    }
    case 'finalizarVinculo': {
      const v = (core.vinculos || []).find((x) => x.id === p.vinculoId);
      if (!v) return 'Finalizar un vínculo.';
      const origen = nombreEntidad(core, v.origenTipo, v.origenId);
      const destino = nombreEntidad(core, v.destinoTipo, v.destinoId);
      const tipo = nombreTipoRelacion(core, v.tipoRelacionId);
      return `Finalizar el vínculo entre ${origen} y ${destino}${tipo ? ` (${tipo})` : ''}.`;
    }
    case 'quitarEtiqueta':
      return `Quitar la etiqueta "${nombreEtiqueta(core, p.etiquetaId)}" de ${nombreEntidad(core, p.entidadTipo, p.entidadId)}.`;
    case 'eliminarEtiqueta': {
      const usos = (core.entidadEtiqueta || []).filter((r) => r.etiquetaId === p.etiquetaId).length;
      return `Eliminar la etiqueta "${nombreEtiqueta(core, p.etiquetaId)}"${usos ? ` (se les quita a ${usos} registro${usos === 1 ? '' : 's'})` : ''}.`;
    }
    case 'eliminarCategoria': {
      const usos = (core.etiquetas || []).filter((e) => e.categoriaId === p.categoriaId).length;
      return `Eliminar la categoría "${nombreCategoria(core, p.categoriaId)}"${usos ? ` (${usos} etiqueta${usos === 1 ? '' : 's'} quedan sin categoría)` : ''}.`;
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
