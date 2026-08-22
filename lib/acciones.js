// Catálogo de acciones para el futuro "frente de IA" (Fase 1 del plan — ver conversación
// donde se armó). Son funciones puras, sin React: reciben el estado actual (core, acciones)
// y los parámetros de la acción, y devuelven el estado nuevo. A propósito no dependen de nada
// de components/CRM.jsx, para poder usarse tanto desde el navegador como desde una futura API
// route de servidor sin arrastrar código de UI.
//
// Cada entrada de CATALOGO_ACCIONES describe la acción en formato neutral (nombre,
// descripción, parámetros en JSON Schema) pensado para pasarle tal cual a cualquier
// proveedor de IA con "tool calling" (Claude, OpenAI, Gemini, etc.). Agregar una acción
// nueva es sumar una entrada acá — no hace falta tocar las demás.
//
// Estas funciones reproducen la misma lógica que ya usan los formularios de la app (mismo
// formato de datos, mismos ids con prefijo), pero no reemplazan esos formularios: son una
// segunda puerta de entrada a las mismas mutaciones.

const TR_DUENA = 'TR_DUENA';
const AVISO_DEFAULT = { activo: false, cantidad: 30, unidad: 'minutos' };
const ENTIDAD_LABEL = {
  Persona: ['personas', 'nombre'],
  Empresa: ['empresas', 'denominacion'],
  Obra: ['obras', 'nombre'],
  Hilo: ['hilos', 'titulo'],
};

function uid(prefijo) {
  return prefijo + '-' + Math.random().toString(36).slice(2, 9);
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function vinc(origenTipo, origenId, destinoTipo, destinoId, tipoRelacionId, principal, desde) {
  return {
    id: uid('V'),
    origenTipo,
    origenId,
    destinoTipo,
    destinoId,
    tipoRelacionId: tipoRelacionId || null,
    principal: !!principal,
    desde: desde || todayISO(),
    hasta: null,
    nota: '',
  };
}

function empresaDueñaDeObra(core, obraId) {
  const v = (core.vinculos || []).find(
    (x) => x.tipoRelacionId === TR_DUENA && x.destinoTipo === 'Obra' && x.destinoId === obraId && x.origenTipo === 'Empresa' && !x.hasta
  );
  return v ? v.origenId : null;
}

// Contrapartes activas de tipo "tipoDestino" vinculadas directamente a (tipo, id).
function contrapartesActivasDe(core, tipo, id, tipoDestino) {
  return (core.vinculos || [])
    .filter((v) => !v.hasta && (
      (v.origenTipo === tipo && v.origenId === id && v.destinoTipo === tipoDestino) ||
      (v.destinoTipo === tipo && v.destinoId === id && v.origenTipo === tipoDestino)
    ))
    .map((v) => (v.origenTipo === tipo && v.origenId === id ? v.destinoId : v.origenId));
}

// Nombre "visible" de un hilo, igual al que arma la app para el título de la tarjeta
// (etiquetaVinculoHilo en components/CRM.jsx): para una tarea es directamente su título;
// para un seguimiento, el nombre de la(s) persona(s) vinculada(s) — o si no hay, empresa(s) —
// o si no hay, obra(s) — y recién si no hay nada de eso, el título ("Tema del hilo"). La IA
// necesita esto para reconocer un hilo por el mismo nombre que el usuario ve en la tarjeta,
// que casi nunca es el "Tema del hilo".
export function nombreVisibleHilo(hilo, core) {
  if (hilo.tipo === 'tarea') return hilo.titulo;
  const personas = contrapartesActivasDe(core, 'Hilo', hilo.id, 'Persona').map((id) => core.personas.find((p) => p.id === id)).filter(Boolean);
  if (personas.length > 0) return personas.map((p) => p.nombre).join(', ');
  const empresas = contrapartesActivasDe(core, 'Hilo', hilo.id, 'Empresa').map((id) => core.empresas.find((e) => e.id === id)).filter(Boolean);
  if (empresas.length > 0) return empresas.map((e) => e.denominacion).join(', ');
  const obras = contrapartesActivasDe(core, 'Hilo', hilo.id, 'Obra').map((id) => core.obras.find((o) => o.id === id)).filter(Boolean);
  if (obras.length > 0) return obras.map((o) => o.nombre).join(', ');
  return hilo.titulo;
}

// ---------------------------------------------------------------------------
// Buscador de entidades por nombre (no modifica nada) — la IA lo usa para resolver un
// nombre libre ("Juan Pérez") al id real antes de poder operar sobre esa entidad.
// Para "Hilo" busca tanto por el nombre visible en la tarjeta (personas/empresas/obras
// vinculadas) como por el "Tema del hilo", porque el usuario puede referirse a cualquiera
// de los dos.
// ---------------------------------------------------------------------------
export function buscarEntidad(core, texto, tipos = ['Persona', 'Empresa', 'Obra', 'Hilo']) {
  const q = (texto || '').trim().toLowerCase();
  if (!q) return [];
  const resultados = [];
  for (const tipo of tipos) {
    if (tipo === 'Hilo') {
      for (const item of core.hilos || []) {
        const nombreVisible = nombreVisibleHilo(item, core);
        if ((nombreVisible || '').toLowerCase().includes(q) || (item.titulo || '').toLowerCase().includes(q)) {
          resultados.push({ tipo, id: item.id, nombre: nombreVisible || item.titulo });
        }
      }
      continue;
    }
    const [coleccion, campo] = ENTIDAD_LABEL[tipo];
    for (const item of core[coleccion] || []) {
      const nombre = item[campo] || '';
      if (nombre.toLowerCase().includes(q)) resultados.push({ tipo, id: item.id, nombre });
    }
  }
  return resultados;
}

// ---------------------------------------------------------------------------
// 1. Crear persona
// ---------------------------------------------------------------------------
function crearPersona(core, acciones, { nombre, whatsapp = '', direccion = '', ciudad = '', notas = '', empresaIds = [], obraIds = [] }) {
  if (!nombre || !nombre.trim()) throw new Error('Falta el nombre de la persona.');
  const personaId = uid('P');
  const nuevaPersona = { id: personaId, nombre: nombre.trim(), whatsapp, direccion, ciudad, notas };
  const nuevosVinculos = [];
  const empresasYaLinkeadas = new Set(empresaIds);
  for (const empresaId of empresaIds) {
    nuevosVinculos.push(vinc('Persona', personaId, 'Empresa', empresaId, null, false, todayISO()));
  }
  for (const obraId of obraIds) {
    nuevosVinculos.push(vinc('Persona', personaId, 'Obra', obraId, null, false, todayISO()));
    const dueña = empresaDueñaDeObra(core, obraId);
    if (dueña && !empresasYaLinkeadas.has(dueña)) {
      nuevosVinculos.push(vinc('Persona', personaId, 'Empresa', dueña, null, false, todayISO()));
      empresasYaLinkeadas.add(dueña);
    }
  }
  return {
    core: { ...core, personas: [nuevaPersona, ...core.personas], vinculos: [...(core.vinculos || []), ...nuevosVinculos] },
    acciones,
    resultado: { personaId },
  };
}

// ---------------------------------------------------------------------------
// 2. Crear empresa
// ---------------------------------------------------------------------------
function crearEmpresa(core, acciones, { denominacion, cuit = '', direccion = '', ciudad = '', personaId = null, tipoRelacionId = null }) {
  if (!denominacion || !denominacion.trim()) throw new Error('Falta la denominación de la empresa.');
  const empresaId = uid('E');
  const nuevaEmpresa = { id: empresaId, denominacion: denominacion.trim(), cuit, direccion, ciudad };
  const nuevosVinculos = [];
  if (personaId) nuevosVinculos.push(vinc('Persona', personaId, 'Empresa', empresaId, tipoRelacionId, true, todayISO()));
  return {
    core: { ...core, empresas: [nuevaEmpresa, ...core.empresas], vinculos: [...(core.vinculos || []), ...nuevosVinculos] },
    acciones,
    resultado: { empresaId },
  };
}

// ---------------------------------------------------------------------------
// 3. Crear obra
// ---------------------------------------------------------------------------
function crearObra(core, acciones, { nombre, descripcion = '', metros2 = 0, direccion = '', ciudad = '', empresaId = null }) {
  if (!nombre || !nombre.trim()) throw new Error('Falta el nombre de la obra.');
  const obraId = uid('O');
  const nuevaObra = { id: obraId, nombre: nombre.trim(), descripcion, metros2: Number(metros2) || 0, direccion, ciudad };
  const nuevosVinculos = [];
  if (empresaId) nuevosVinculos.push(vinc('Empresa', empresaId, 'Obra', obraId, TR_DUENA, false, todayISO()));
  return {
    core: { ...core, obras: [nuevaObra, ...core.obras], vinculos: [...(core.vinculos || []), ...nuevosVinculos] },
    acciones,
    resultado: { obraId },
  };
}

// ---------------------------------------------------------------------------
// 4. Crear hilo de seguimiento (versión simple: sin primera/próxima acción combinada,
// eso se agrega llamando después a "avanzarHilo" si hace falta).
// ---------------------------------------------------------------------------
function crearHiloSeguimiento(core, acciones, { titulo, personaId = null, empresaIds = [], obraIds = [] }) {
  if (!titulo || !titulo.trim()) throw new Error('Falta el título del hilo.');
  const hiloId = uid('H');
  const nuevoHilo = {
    id: hiloId, titulo: titulo.trim(), estado: 'Activo', fechaCreacion: todayISO(),
    tipo: 'cliente', columnaTareaId: null, hiloRelacionadoId: null, notaCierre: '',
  };
  const nuevosVinculos = [];
  if (personaId) nuevosVinculos.push(vinc('Persona', personaId, 'Hilo', hiloId, null, true, todayISO()));
  for (const empresaId of empresaIds) nuevosVinculos.push(vinc('Hilo', hiloId, 'Empresa', empresaId, null, false, todayISO()));
  for (const obraId of obraIds) nuevosVinculos.push(vinc('Hilo', hiloId, 'Obra', obraId, null, false, todayISO()));
  return {
    core: { ...core, hilos: [nuevoHilo, ...core.hilos], vinculos: [...(core.vinculos || []), ...nuevosVinculos] },
    acciones,
    resultado: { hiloId },
  };
}

// ---------------------------------------------------------------------------
// 5. Crear tarea
// ---------------------------------------------------------------------------
function crearTarea(core, acciones, { titulo, fecha = '', hora = '', aviso = null, columnaTareaId = null }) {
  if (!titulo || !titulo.trim()) throw new Error('Falta el título de la tarea.');
  const hiloId = uid('H');
  const nuevaTarea = {
    id: hiloId, titulo: titulo.trim(), notas: '', fecha, hora,
    aviso: aviso || { ...AVISO_DEFAULT }, avisoEnviado: false, avisoVistoEnApp: false,
    estado: 'Activo', fechaCreacion: todayISO(), tipo: 'tarea', columnaTareaId,
    hiloRelacionadoId: null, notaCierre: '',
  };
  return { core: { ...core, hilos: [nuevaTarea, ...core.hilos] }, acciones, resultado: { hiloId } };
}

// ---------------------------------------------------------------------------
// 6. Avanzar un hilo: registra qué se hizo (sobre una acción pendiente existente, o crea
// un registro "Realizada" directo) y, opcionalmente, programa la próxima acción.
// ---------------------------------------------------------------------------
function avanzarHilo(core, acciones, {
  hiloId, pendienteId = null, tipoAccionId, notaHecho = '', fechaHecho = todayISO(),
  programarProxima = false, tipoAccionIdProxima = null, notaPlanificada = '',
  fechaProxima = '', horaProxima = '', prioridad = 'Media', aviso = null,
}) {
  if (!hiloId) throw new Error('Falta el hilo.');
  if (!tipoAccionId) throw new Error('Falta el tipo de acción.');
  const siguienteNumero = acciones.reduce((max, a) => Math.max(max, a.numero || 0), 0) + 1;
  let nuevasAcciones = acciones;
  let idCompletada;

  if (pendienteId) {
    idCompletada = pendienteId;
    nuevasAcciones = nuevasAcciones.map((a) =>
      a.id === pendienteId
        ? { ...a, estado: 'Realizada', fechaRealizada: fechaHecho, fechaProgramada: '', horaProgramada: '', prioridad: '', tipoAccionId, notaHecho, secuencia: Date.now() }
        : a
    );
  } else {
    idCompletada = uid('A');
    nuevasAcciones = [{
      id: idCompletada, hiloId, tipoAccionId, estado: 'Realizada', fechaRealizada: fechaHecho,
      fechaProgramada: '', horaProgramada: '', prioridad: '', notaPlanificada: '', notaHecho,
      origenId: null, destinoId: null, numero: siguienteNumero, recurrente: false,
      repiteCadaN: null, repiteUnidad: null, fechaCreacion: todayISO(), secuencia: Date.now(),
    }, ...nuevasAcciones];
  }

  if (programarProxima) {
    if (!fechaProxima) throw new Error('Falta la fecha de la próxima acción.');
    const idProxima = uid('A');
    const nuevaPendiente = {
      id: idProxima, hiloId, tipoAccionId: tipoAccionIdProxima || tipoAccionId, estado: 'Pendiente',
      fechaRealizada: '', fechaProgramada: fechaProxima, horaProgramada: horaProxima, prioridad,
      notaPlanificada, notaHecho: '', origenId: idCompletada, destinoId: null,
      numero: pendienteId ? siguienteNumero : siguienteNumero + 1, recurrente: false, repiteCadaN: null,
      repiteUnidad: null, fechaCreacion: todayISO(), secuencia: Date.now(),
      aviso: aviso || null, avisoEnviado: false, avisoVistoEnApp: false,
    };
    nuevasAcciones = nuevasAcciones.map((a) => (a.id === idCompletada ? { ...a, destinoId: idProxima } : a));
    nuevasAcciones = [nuevaPendiente, ...nuevasAcciones];
  }

  return { core, acciones: nuevasAcciones, resultado: { idCompletada } };
}

// ---------------------------------------------------------------------------
// 7. Vincular dos (o más) entidades existentes entre sí
// ---------------------------------------------------------------------------
function vincularEntidades(core, acciones, { origenes = [], destinos = [], tipoRelacionId = null, desde = todayISO(), hasta = null, nota = '' }) {
  if (origenes.length === 0 || destinos.length === 0) throw new Error('Faltan las entidades a vincular.');
  const nuevosVinculos = [];
  for (const o of origenes) {
    for (const d of destinos) {
      if (o.tipo === d.tipo && o.id === d.id) continue;
      nuevosVinculos.push({ ...vinc(o.tipo, o.id, d.tipo, d.id, tipoRelacionId, false, desde), hasta, nota });
    }
  }
  return { core: { ...core, vinculos: [...(core.vinculos || []), ...nuevosVinculos] }, acciones, resultado: { creados: nuevosVinculos.length } };
}

// ---------------------------------------------------------------------------
// 8. Asignar etiqueta a una o varias entidades (existente, o creando una nueva)
// ---------------------------------------------------------------------------
function asignarEtiqueta(core, acciones, { entidadTipo, entidadIds = [], etiquetaId = null, nombreEtiquetaNueva = null, categoriaId = null }) {
  if (entidadIds.length === 0) throw new Error('Falta a qué entidad asignar la etiqueta.');
  let categorias = core.categorias || [];
  let etiquetas = core.etiquetas;
  let etId = etiquetaId;

  if (!etId) {
    if (!nombreEtiquetaNueva || !nombreEtiquetaNueva.trim()) throw new Error('Falta la etiqueta a asignar.');
    let catId = categoriaId;
    if (!catId) {
      const catExistente = categorias.find((c) => c.aplicaA === entidadTipo);
      if (catExistente) {
        catId = catExistente.id;
      } else {
        const nuevaCat = { id: uid('CAT'), nombre: 'General', aplicaA: entidadTipo };
        categorias = [...categorias, nuevaCat];
        catId = nuevaCat.id;
      }
    }
    const nuevaEtiqueta = { id: uid('ET'), etiqueta: nombreEtiquetaNueva.trim(), categoriaId: catId };
    etiquetas = [...etiquetas, nuevaEtiqueta];
    etId = nuevaEtiqueta.id;
  }

  const yaAsignadas = new Set(
    (core.entidadEtiqueta || []).filter((r) => r.etiquetaId === etId && r.entidadTipo === entidadTipo).map((r) => r.entidadId)
  );
  const nuevasAsignaciones = entidadIds.filter((id) => !yaAsignadas.has(id)).map((entidadId) => ({ id: uid('et'), etiquetaId: etId, entidadTipo, entidadId }));

  return {
    core: { ...core, categorias, etiquetas, entidadEtiqueta: [...core.entidadEtiqueta, ...nuevasAsignaciones] },
    acciones,
    resultado: { etiquetaId: etId },
  };
}

// ---------------------------------------------------------------------------
// Catálogo: formato neutral (JSON Schema en "parametros") listo para pasarle a cualquier
// proveedor de IA con tool calling. Agregar una acción nueva = sumar una entrada acá.
// ---------------------------------------------------------------------------
const ENTIDAD_ENUM = { type: 'string', enum: ['Persona', 'Empresa', 'Obra', 'Hilo'] };

export const CATALOGO_ACCIONES = [
  {
    nombre: 'crearPersona',
    descripcion: 'Crea una persona nueva, opcionalmente vinculada a una o más empresas/obras existentes.',
    parametros: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        whatsapp: { type: 'string' },
        direccion: { type: 'string' },
        ciudad: { type: 'string' },
        notas: { type: 'string' },
        empresaIds: { type: 'array', items: { type: 'string' } },
        obraIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['nombre'],
    },
    ejecutar: crearPersona,
  },
  {
    nombre: 'crearEmpresa',
    descripcion: 'Crea una empresa nueva, opcionalmente con una persona representante ya existente.',
    parametros: {
      type: 'object',
      properties: {
        denominacion: { type: 'string' },
        cuit: { type: 'string' },
        direccion: { type: 'string' },
        ciudad: { type: 'string' },
        personaId: { type: 'string' },
        tipoRelacionId: { type: 'string' },
      },
      required: ['denominacion'],
    },
    ejecutar: crearEmpresa,
  },
  {
    nombre: 'crearObra',
    descripcion: 'Crea una obra nueva, opcionalmente perteneciente a una empresa existente.',
    parametros: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        descripcion: { type: 'string' },
        metros2: { type: 'number' },
        direccion: { type: 'string' },
        ciudad: { type: 'string' },
        empresaId: { type: 'string' },
      },
      required: ['nombre'],
    },
    ejecutar: crearObra,
  },
  {
    nombre: 'crearHiloSeguimiento',
    descripcion: 'Crea un hilo de seguimiento (Seguimientos) nuevo, vinculado a una persona y/o empresas/obras existentes.',
    parametros: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        personaId: { type: 'string' },
        empresaIds: { type: 'array', items: { type: 'string' } },
        obraIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['titulo'],
    },
    ejecutar: crearHiloSeguimiento,
  },
  {
    nombre: 'crearTarea',
    descripcion: 'Crea una tarea nueva (Kanban de Tareas), con fecha/hora y aviso opcionales.',
    parametros: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        fecha: { type: 'string', description: 'Fecha en formato ISO (AAAA-MM-DD), o vacío.' },
        hora: { type: 'string', description: 'Hora en formato HH:MM (24hs), o vacío.' },
        aviso: {
          type: 'object',
          properties: { activo: { type: 'boolean' }, cantidad: { type: 'number' }, unidad: { type: 'string', enum: ['minutos', 'horas', 'dias'] } },
        },
        columnaTareaId: { type: 'string' },
      },
      required: ['titulo'],
    },
    ejecutar: crearTarea,
  },
  {
    nombre: 'avanzarHilo',
    descripcion: 'Registra qué se hizo en un hilo (cierra una acción pendiente o crea un registro "Realizada" directo) y, opcionalmente, programa la próxima acción.',
    parametros: {
      type: 'object',
      properties: {
        hiloId: { type: 'string' },
        pendienteId: { type: 'string', description: 'Id de la acción pendiente que se está cerrando, si existe.' },
        tipoAccionId: { type: 'string' },
        notaHecho: { type: 'string' },
        fechaHecho: { type: 'string', description: 'Fecha ISO en que se hizo (por defecto hoy).' },
        programarProxima: { type: 'boolean' },
        tipoAccionIdProxima: { type: 'string' },
        notaPlanificada: { type: 'string' },
        fechaProxima: { type: 'string', description: 'Fecha ISO de la próxima acción (obligatoria si programarProxima=true).' },
        horaProxima: { type: 'string' },
        prioridad: { type: 'string', enum: ['Alta', 'Media', 'Baja'] },
        aviso: {
          type: 'object',
          properties: { activo: { type: 'boolean' }, cantidad: { type: 'number' }, unidad: { type: 'string', enum: ['minutos', 'horas', 'dias'] } },
        },
      },
      required: ['hiloId', 'tipoAccionId'],
    },
    ejecutar: avanzarHilo,
  },
  {
    nombre: 'vincularEntidades',
    descripcion: 'Crea un vínculo entre dos o más entidades existentes (Persona/Empresa/Obra), opcionalmente con un tipo de relación.',
    parametros: {
      type: 'object',
      properties: {
        origenes: { type: 'array', items: { type: 'object', properties: { tipo: ENTIDAD_ENUM, id: { type: 'string' } }, required: ['tipo', 'id'] } },
        destinos: { type: 'array', items: { type: 'object', properties: { tipo: ENTIDAD_ENUM, id: { type: 'string' } }, required: ['tipo', 'id'] } },
        tipoRelacionId: { type: 'string' },
        desde: { type: 'string' },
        hasta: { type: 'string' },
        nota: { type: 'string' },
      },
      required: ['origenes', 'destinos'],
    },
    ejecutar: vincularEntidades,
  },
  {
    nombre: 'asignarEtiqueta',
    descripcion: 'Asigna una etiqueta existente (o crea una nueva) a una o varias entidades del mismo tipo.',
    parametros: {
      type: 'object',
      properties: {
        entidadTipo: ENTIDAD_ENUM,
        entidadIds: { type: 'array', items: { type: 'string' } },
        etiquetaId: { type: 'string', description: 'Id de una etiqueta ya existente.' },
        nombreEtiquetaNueva: { type: 'string', description: 'Nombre para crear una etiqueta nueva, si no se pasa etiquetaId.' },
        categoriaId: { type: 'string', description: 'Categoría para la etiqueta nueva (opcional; si no se pasa, usa/crea una categoría "General" para ese tipo).' },
      },
      required: ['entidadTipo', 'entidadIds'],
    },
    ejecutar: asignarEtiqueta,
  },
];
