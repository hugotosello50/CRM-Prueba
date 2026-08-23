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
const TR_CABECERA = 'TR_CABECERA';
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

// ¿El vínculo "v" es un participante (Persona) activo del hilo "hiloId"?
function esParticipanteActivoDeHilo(v, hiloId) {
  return !v.hasta && ((v.origenTipo === 'Hilo' && v.origenId === hiloId && v.destinoTipo === 'Persona') || (v.destinoTipo === 'Hilo' && v.destinoId === hiloId && v.origenTipo === 'Persona'));
}
// ¿El vínculo "v" conecta al hilo "hiloId" con la entidad (tipo, entId) dada?
function esVinculoEntreHiloYEntidad(v, hiloId, tipo, entId) {
  return (v.origenTipo === 'Hilo' && v.origenId === hiloId && v.destinoTipo === tipo && v.destinoId === entId) || (v.destinoTipo === 'Hilo' && v.destinoId === hiloId && v.origenTipo === tipo && v.origenId === entId);
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
// 1b. Editar / eliminar persona
// ---------------------------------------------------------------------------
function editarPersona(core, acciones, { personaId, nombre, whatsapp, direccion, ciudad }) {
  if (!personaId) throw new Error('Falta la persona a editar.');
  if (!core.personas.find((p) => p.id === personaId)) throw new Error('No se encontró la persona.');
  const patch = {};
  if (nombre !== undefined && nombre.trim()) patch.nombre = nombre.trim();
  if (whatsapp !== undefined) patch.whatsapp = whatsapp;
  if (direccion !== undefined) patch.direccion = direccion;
  if (ciudad !== undefined) patch.ciudad = ciudad;
  return {
    core: { ...core, personas: core.personas.map((p) => (p.id === personaId ? { ...p, ...patch } : p)) },
    acciones,
    resultado: { personaId },
  };
}

function eliminarPersona(core, acciones, { personaId }) {
  if (!personaId) throw new Error('Falta la persona a eliminar.');
  if (!core.personas.find((p) => p.id === personaId)) throw new Error('No se encontró la persona.');
  return {
    core: {
      ...core,
      personas: core.personas.filter((p) => p.id !== personaId),
      vinculos: (core.vinculos || []).filter((v) => !(v.origenTipo === 'Persona' && v.origenId === personaId) && !(v.destinoTipo === 'Persona' && v.destinoId === personaId)),
      entidadEtiqueta: core.entidadEtiqueta.filter((r) => !(r.entidadTipo === 'Persona' && r.entidadId === personaId)),
    },
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
// 2b. Editar / eliminar empresa, jerarquía de grupo (cabecera)
// ---------------------------------------------------------------------------
function editarEmpresa(core, acciones, { empresaId, denominacion, cuit, direccion, ciudad }) {
  if (!empresaId) throw new Error('Falta la empresa a editar.');
  if (!core.empresas.find((e) => e.id === empresaId)) throw new Error('No se encontró la empresa.');
  const patch = {};
  if (denominacion !== undefined && denominacion.trim()) patch.denominacion = denominacion.trim();
  if (cuit !== undefined) patch.cuit = cuit;
  if (direccion !== undefined) patch.direccion = direccion;
  if (ciudad !== undefined) patch.ciudad = ciudad;
  return {
    core: { ...core, empresas: core.empresas.map((e) => (e.id === empresaId ? { ...e, ...patch } : e)) },
    acciones,
    resultado: { empresaId },
  };
}

function eliminarEmpresa(core, acciones, { empresaId }) {
  if (!empresaId) throw new Error('Falta la empresa a eliminar.');
  if (!core.empresas.find((e) => e.id === empresaId)) throw new Error('No se encontró la empresa.');
  return {
    core: {
      ...core,
      empresas: core.empresas.filter((e) => e.id !== empresaId),
      vinculos: (core.vinculos || []).filter((v) => !(v.origenTipo === 'Empresa' && v.origenId === empresaId) && !(v.destinoTipo === 'Empresa' && v.destinoId === empresaId)),
      entidadEtiqueta: core.entidadEtiqueta.filter((r) => !(r.entidadTipo === 'Empresa' && r.entidadId === empresaId)),
    },
    acciones,
    resultado: { empresaId },
  };
}

// Asigna (o reemplaza) la empresa cabecera de otra — jerarquía de grupo.
function asignarCabeceraEmpresa(core, acciones, { empresaId, cabeceraId }) {
  if (!empresaId || !cabeceraId) throw new Error('Faltan las empresas para asignar la jerarquía.');
  if (empresaId === cabeceraId) throw new Error('Una empresa no puede ser cabecera de sí misma.');
  const hoy = todayISO();
  const vinculos = (core.vinculos || []).map((v) =>
    v.tipoRelacionId === TR_CABECERA && v.destinoTipo === 'Empresa' && v.destinoId === empresaId && !v.hasta ? { ...v, hasta: hoy } : v
  );
  vinculos.push(vinc('Empresa', cabeceraId, 'Empresa', empresaId, TR_CABECERA, false, hoy));
  return { core: { ...core, vinculos }, acciones, resultado: { empresaId, cabeceraId } };
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
// 3b. Editar / eliminar obra
// ---------------------------------------------------------------------------
function editarObra(core, acciones, { obraId, nombre, descripcion, metros2, direccion, ciudad }) {
  if (!obraId) throw new Error('Falta la obra a editar.');
  if (!core.obras.find((o) => o.id === obraId)) throw new Error('No se encontró la obra.');
  const patch = {};
  if (nombre !== undefined && nombre.trim()) patch.nombre = nombre.trim();
  if (descripcion !== undefined) patch.descripcion = descripcion;
  if (metros2 !== undefined) patch.metros2 = Number(metros2) || 0;
  if (direccion !== undefined) patch.direccion = direccion;
  if (ciudad !== undefined) patch.ciudad = ciudad;
  return {
    core: { ...core, obras: core.obras.map((o) => (o.id === obraId ? { ...o, ...patch } : o)) },
    acciones,
    resultado: { obraId },
  };
}

function eliminarObra(core, acciones, { obraId }) {
  if (!obraId) throw new Error('Falta la obra a eliminar.');
  if (!core.obras.find((o) => o.id === obraId)) throw new Error('No se encontró la obra.');
  return {
    core: {
      ...core,
      obras: core.obras.filter((o) => o.id !== obraId),
      vinculos: (core.vinculos || []).filter((v) => !(v.origenTipo === 'Obra' && v.origenId === obraId) && !(v.destinoTipo === 'Obra' && v.destinoId === obraId)),
      entidadEtiqueta: core.entidadEtiqueta.filter((r) => !(r.entidadTipo === 'Obra' && r.entidadId === obraId)),
    },
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
// 4b. Editar título/vínculos de un hilo de seguimiento (mismo criterio que el formulario
// real: la persona se reemplaza cerrando la anterior con historial, no se borra; empresas y
// obras se agregan/quitan por diferencia). Cerrar / reabrir aplica igual a hilos de cliente y
// tareas (mismo campo "estado" en ambos).
// ---------------------------------------------------------------------------
function editarHiloSeguimiento(core, acciones, { hiloId, titulo, personaId, empresaIds, obraIds }) {
  if (!hiloId) throw new Error('Falta el hilo a editar.');
  if (!core.hilos.find((h) => h.id === hiloId)) throw new Error('No se encontró el hilo.');
  const hoy = todayISO();
  let hilos = core.hilos;
  let vinculos = core.vinculos || [];
  if (titulo !== undefined && titulo.trim()) {
    hilos = hilos.map((h) => (h.id === hiloId ? { ...h, titulo: titulo.trim() } : h));
  }
  if (personaId !== undefined) {
    vinculos = vinculos.map((v) => (esParticipanteActivoDeHilo(v, hiloId) ? { ...v, hasta: hoy, principal: false } : v));
    if (personaId) vinculos = [...vinculos, vinc('Persona', personaId, 'Hilo', hiloId, null, true, hoy)];
  }
  if (empresaIds !== undefined) {
    const actuales = contrapartesActivasDe(core, 'Hilo', hiloId, 'Empresa');
    const aQuitar = actuales.filter((eid) => !empresaIds.includes(eid));
    vinculos = vinculos.filter((v) => !aQuitar.some((eid) => esVinculoEntreHiloYEntidad(v, hiloId, 'Empresa', eid)));
    for (const eid of empresaIds.filter((eid) => !actuales.includes(eid))) vinculos.push(vinc('Hilo', hiloId, 'Empresa', eid, null, false, hoy));
  }
  if (obraIds !== undefined) {
    const actuales = contrapartesActivasDe(core, 'Hilo', hiloId, 'Obra');
    const aQuitar = actuales.filter((oid) => !obraIds.includes(oid));
    vinculos = vinculos.filter((v) => !aQuitar.some((oid) => esVinculoEntreHiloYEntidad(v, hiloId, 'Obra', oid)));
    for (const oid of obraIds.filter((oid) => !actuales.includes(oid))) vinculos.push(vinc('Hilo', hiloId, 'Obra', oid, null, false, hoy));
  }
  return { core: { ...core, hilos, vinculos }, acciones, resultado: { hiloId } };
}

function cerrarHilo(core, acciones, { hiloId, notaCierre = '' }) {
  if (!hiloId) throw new Error('Falta el hilo a cerrar.');
  if (!core.hilos.find((h) => h.id === hiloId)) throw new Error('No se encontró el hilo.');
  return {
    core: { ...core, hilos: core.hilos.map((h) => (h.id === hiloId ? { ...h, estado: 'Cerrado', notaCierre } : h)) },
    acciones,
    resultado: { hiloId },
  };
}

function reabrirHilo(core, acciones, { hiloId }) {
  if (!hiloId) throw new Error('Falta el hilo a reabrir.');
  if (!core.hilos.find((h) => h.id === hiloId)) throw new Error('No se encontró el hilo.');
  return {
    core: { ...core, hilos: core.hilos.map((h) => (h.id === hiloId ? { ...h, estado: 'Activo' } : h)) },
    acciones,
    resultado: { hiloId },
  };
}

// ---------------------------------------------------------------------------
// 5. Crear tarea
// ---------------------------------------------------------------------------
function crearTarea(core, acciones, { titulo, fecha = '', hora = '', aviso = null, columnaTareaId = null, personaId = null, empresaIds = [], obraIds = [], notaInicial = '', subtareasIniciales = [], recurrente = false, repiteCadaN = null, repiteUnidad = null }) {
  if (!titulo || !titulo.trim()) throw new Error('Falta el título de la tarea.');
  const hiloId = uid('H');
  const notas = notaInicial && notaInicial.trim() ? [{ id: uid('NT'), texto: notaInicial.trim(), fecha: todayISO() }] : [];
  const subtareas = (subtareasIniciales || [])
    .filter((s) => s && s.texto && s.texto.trim())
    .map((s) => ({ id: uid('ST'), hecha: false, texto: s.texto.trim(), fecha: s.fecha || '', hora: s.hora || '', nota: s.nota || '', aviso: null }));
  const nuevaTarea = {
    id: hiloId, titulo: titulo.trim(), notas, fecha, hora,
    aviso: aviso || { ...AVISO_DEFAULT }, avisoEnviado: false, avisoVistoEnApp: false,
    estado: 'Activo', fechaCreacion: todayISO(), tipo: 'tarea', columnaTareaId,
    hiloRelacionadoId: null, notaCierre: '', subtareas,
    recurrente: !!recurrente, repiteCadaN: recurrente ? repiteCadaN : null, repiteUnidad: recurrente ? repiteUnidad : null,
  };
  // Mismo criterio que crear la tarea desde la ficha de una persona/empresa/obra (único lugar
  // de la UI que hoy vincula una tarea al crearla): se agrega el vínculo genérico Hilo<->entidad.
  const nuevosVinculos = [];
  if (personaId) nuevosVinculos.push(vinc('Persona', personaId, 'Hilo', hiloId, null, false, todayISO()));
  for (const empresaId of empresaIds) nuevosVinculos.push(vinc('Hilo', hiloId, 'Empresa', empresaId, null, false, todayISO()));
  for (const obraId of obraIds) nuevosVinculos.push(vinc('Hilo', hiloId, 'Obra', obraId, null, false, todayISO()));
  return {
    core: { ...core, hilos: [nuevaTarea, ...core.hilos], vinculos: [...(core.vinculos || []), ...nuevosVinculos] },
    acciones,
    resultado: { hiloId },
  };
}

// ---------------------------------------------------------------------------
// 5b. Editar título/fecha/hora de una tarea, y moverla de columna en el Kanban de Tareas.
// ---------------------------------------------------------------------------
function editarTarea(core, acciones, { hiloId, titulo, fecha, hora, aviso, recurrente, repiteCadaN, repiteUnidad }) {
  if (!hiloId) throw new Error('Falta la tarea a editar.');
  if (!core.hilos.find((h) => h.id === hiloId)) throw new Error('No se encontró la tarea.');
  const patch = {};
  if (titulo !== undefined && titulo.trim()) patch.titulo = titulo.trim();
  if (fecha !== undefined) patch.fecha = fecha;
  if (hora !== undefined) patch.hora = hora;
  if (aviso !== undefined) patch.aviso = aviso;
  if (recurrente !== undefined) {
    patch.recurrente = !!recurrente;
    patch.repiteCadaN = recurrente ? repiteCadaN : null;
    patch.repiteUnidad = recurrente ? repiteUnidad : null;
  }
  return {
    core: { ...core, hilos: core.hilos.map((h) => (h.id === hiloId ? { ...h, ...patch } : h)) },
    acciones,
    resultado: { hiloId },
  };
}

function moverColumnaTarea(core, acciones, { hiloId, columnaTareaId }) {
  if (!hiloId) throw new Error('Falta la tarea a mover.');
  if (!core.hilos.find((h) => h.id === hiloId)) throw new Error('No se encontró la tarea.');
  return {
    core: { ...core, hilos: core.hilos.map((h) => (h.id === hiloId ? { ...h, columnaTareaId: columnaTareaId || null } : h)) },
    acciones,
    resultado: { hiloId },
  };
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
// 6b. Editar (corregir tipo/nota/fecha/hora/prioridad/aviso, o pasar de Pendiente a Realizada
// y viceversa) o eliminar una acción ya cargada en el historial de un hilo.
// ---------------------------------------------------------------------------
function editarAccion(core, acciones, { accionId, tipoAccionId, estado, fecha, hora, prioridad, notaPlanificada, notaHecho, aviso }) {
  if (!accionId) throw new Error('Falta la acción a editar.');
  const accion = acciones.find((a) => a.id === accionId);
  if (!accion) throw new Error('No se encontró la acción.');
  const patch = {};
  if (tipoAccionId !== undefined) patch.tipoAccionId = tipoAccionId;
  if (notaPlanificada !== undefined) patch.notaPlanificada = notaPlanificada;
  if (notaHecho !== undefined) patch.notaHecho = notaHecho;
  if (estado !== undefined) patch.estado = estado;
  const estadoFinal = estado || accion.estado;
  if (estadoFinal === 'Realizada') {
    if (fecha !== undefined) patch.fechaRealizada = fecha;
    if (estado === 'Realizada' && accion.estado !== 'Realizada') {
      patch.fechaProgramada = ''; patch.horaProgramada = ''; patch.prioridad = ''; patch.aviso = null;
    }
  } else {
    if (fecha !== undefined) patch.fechaProgramada = fecha;
    if (hora !== undefined) patch.horaProgramada = hora;
    if (prioridad !== undefined) patch.prioridad = prioridad;
    if (aviso !== undefined) patch.aviso = aviso;
    if (estado === 'Pendiente' && accion.estado !== 'Pendiente') patch.fechaRealizada = '';
    if (fecha !== undefined || hora !== undefined || aviso !== undefined) { patch.avisoEnviado = false; patch.avisoVistoEnApp = false; }
  }
  return { core, acciones: acciones.map((a) => (a.id === accionId ? { ...a, ...patch } : a)), resultado: { accionId } };
}

function eliminarAccion(core, acciones, { accionId }) {
  if (!accionId) throw new Error('Falta la acción a eliminar.');
  if (!acciones.find((a) => a.id === accionId)) throw new Error('No se encontró la acción.');
  return { core, acciones: acciones.filter((a) => a.id !== accionId), resultado: { accionId } };
}

// ---------------------------------------------------------------------------
// 6c. Notas: lista de notas libres, mismo modelo { id, texto, fecha } tanto en un hilo
// (seguimiento o tarea) como en una persona.
// ---------------------------------------------------------------------------
function agregarNota(core, acciones, { entidadTipo, entidadId, texto }) {
  if (!entidadTipo || !entidadId) throw new Error('Falta a qué agregar la nota.');
  if (!texto || !texto.trim()) throw new Error('Falta el texto de la nota.');
  const nuevaNota = { id: uid('NT'), texto: texto.trim(), fecha: todayISO() };
  if (entidadTipo === 'Hilo') {
    if (!core.hilos.find((h) => h.id === entidadId)) throw new Error('No se encontró el hilo.');
    return { core: { ...core, hilos: core.hilos.map((h) => (h.id === entidadId ? { ...h, notas: [...(h.notas || []), nuevaNota] } : h)) }, acciones, resultado: { notaId: nuevaNota.id } };
  }
  if (!core.personas.find((p) => p.id === entidadId)) throw new Error('No se encontró la persona.');
  return { core: { ...core, personas: core.personas.map((p) => (p.id === entidadId ? { ...p, notas: [...(p.notas || []), nuevaNota] } : p)) }, acciones, resultado: { notaId: nuevaNota.id } };
}

function editarNota(core, acciones, { entidadTipo, entidadId, notaId, texto }) {
  if (!entidadTipo || !entidadId || !notaId) throw new Error('Falta la nota a editar.');
  if (!texto || !texto.trim()) throw new Error('Falta el nuevo texto de la nota.');
  const patchNotas = (notas) => (notas || []).map((n) => (n.id === notaId ? { ...n, texto: texto.trim() } : n));
  if (entidadTipo === 'Hilo') {
    if (!core.hilos.find((h) => h.id === entidadId)) throw new Error('No se encontró el hilo.');
    return { core: { ...core, hilos: core.hilos.map((h) => (h.id === entidadId ? { ...h, notas: patchNotas(h.notas) } : h)) }, acciones, resultado: { notaId } };
  }
  if (!core.personas.find((p) => p.id === entidadId)) throw new Error('No se encontró la persona.');
  return { core: { ...core, personas: core.personas.map((p) => (p.id === entidadId ? { ...p, notas: patchNotas(p.notas) } : p)) }, acciones, resultado: { notaId } };
}

function eliminarNota(core, acciones, { entidadTipo, entidadId, notaId }) {
  if (!entidadTipo || !entidadId || !notaId) throw new Error('Falta la nota a eliminar.');
  const filtrarNotas = (notas) => (notas || []).filter((n) => n.id !== notaId);
  if (entidadTipo === 'Hilo') {
    if (!core.hilos.find((h) => h.id === entidadId)) throw new Error('No se encontró el hilo.');
    return { core: { ...core, hilos: core.hilos.map((h) => (h.id === entidadId ? { ...h, notas: filtrarNotas(h.notas) } : h)) }, acciones, resultado: { notaId } };
  }
  if (!core.personas.find((p) => p.id === entidadId)) throw new Error('No se encontró la persona.');
  return { core: { ...core, personas: core.personas.map((p) => (p.id === entidadId ? { ...p, notas: filtrarNotas(p.notas) } : p)) }, acciones, resultado: { notaId } };
}

// ---------------------------------------------------------------------------
// 6d. Subtareas: checklist dentro de una tarea.
// ---------------------------------------------------------------------------
function agregarSubtarea(core, acciones, { hiloId, texto, fecha = '', hora = '', nota = '', aviso = null }) {
  if (!hiloId) throw new Error('Falta la tarea.');
  if (!texto || !texto.trim()) throw new Error('Falta el texto de la subtarea.');
  if (!core.hilos.find((h) => h.id === hiloId)) throw new Error('No se encontró la tarea.');
  const nueva = { id: uid('ST'), hecha: false, texto: texto.trim(), fecha, hora, nota, aviso };
  return { core: { ...core, hilos: core.hilos.map((h) => (h.id === hiloId ? { ...h, subtareas: [...(h.subtareas || []), nueva] } : h)) }, acciones, resultado: { subtareaId: nueva.id } };
}

function editarSubtarea(core, acciones, { hiloId, subtareaId, texto, fecha, hora, nota, aviso, hecha }) {
  if (!hiloId || !subtareaId) throw new Error('Falta la subtarea a editar.');
  if (!core.hilos.find((h) => h.id === hiloId)) throw new Error('No se encontró la tarea.');
  const patch = {};
  if (texto !== undefined && texto.trim()) patch.texto = texto.trim();
  if (fecha !== undefined) patch.fecha = fecha;
  if (hora !== undefined) patch.hora = hora;
  if (nota !== undefined) patch.nota = nota;
  if (aviso !== undefined) patch.aviso = aviso;
  if (hecha !== undefined) patch.hecha = hecha;
  return {
    core: { ...core, hilos: core.hilos.map((h) => (h.id === hiloId ? { ...h, subtareas: (h.subtareas || []).map((s) => (s.id === subtareaId ? { ...s, ...patch } : s)) } : h)) },
    acciones,
    resultado: { subtareaId },
  };
}

function eliminarSubtarea(core, acciones, { hiloId, subtareaId }) {
  if (!hiloId || !subtareaId) throw new Error('Falta la subtarea a eliminar.');
  if (!core.hilos.find((h) => h.id === hiloId)) throw new Error('No se encontró la tarea.');
  return {
    core: { ...core, hilos: core.hilos.map((h) => (h.id === hiloId ? { ...h, subtareas: (h.subtareas || []).filter((s) => s.id !== subtareaId) } : h)) },
    acciones,
    resultado: { subtareaId },
  };
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
// 7b. Finalizar (no borrar) un vínculo activo — mismo criterio que "Finalizar vínculo" en la
// ficha de cada entidad: le pone fecha de "hasta" y deja de contar como activo.
// ---------------------------------------------------------------------------
function finalizarVinculo(core, acciones, { vinculoId, hasta }) {
  if (!vinculoId) throw new Error('Falta el vínculo a finalizar.');
  if (!(core.vinculos || []).find((v) => v.id === vinculoId)) throw new Error('No se encontró el vínculo.');
  const fechaHasta = hasta || todayISO();
  return {
    core: { ...core, vinculos: core.vinculos.map((v) => (v.id === vinculoId ? { ...v, hasta: fechaHasta, principal: false } : v)) },
    acciones,
    resultado: { vinculoId },
  };
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
// 8b. Quitar una etiqueta de una entidad puntual, y eliminar una etiqueta o categoría de raíz.
// Eliminar una categoría no borra las etiquetas que la usaban (quedan sin categoría, igual que
// en la pantalla de Categorías).
// ---------------------------------------------------------------------------
function quitarEtiqueta(core, acciones, { entidadTipo, entidadId, etiquetaId }) {
  if (!entidadTipo || !entidadId || !etiquetaId) throw new Error('Falta la etiqueta a quitar.');
  return {
    core: { ...core, entidadEtiqueta: core.entidadEtiqueta.filter((r) => !(r.entidadTipo === entidadTipo && r.entidadId === entidadId && r.etiquetaId === etiquetaId)) },
    acciones,
    resultado: {},
  };
}

function eliminarEtiqueta(core, acciones, { etiquetaId }) {
  if (!etiquetaId) throw new Error('Falta la etiqueta a eliminar.');
  if (!core.etiquetas.find((e) => e.id === etiquetaId)) throw new Error('No se encontró la etiqueta.');
  return {
    core: {
      ...core,
      etiquetas: core.etiquetas.filter((e) => e.id !== etiquetaId),
      entidadEtiqueta: core.entidadEtiqueta.filter((r) => r.etiquetaId !== etiquetaId),
    },
    acciones,
    resultado: { etiquetaId },
  };
}

function eliminarCategoria(core, acciones, { categoriaId }) {
  if (!categoriaId) throw new Error('Falta la categoría a eliminar.');
  if (!(core.categorias || []).find((c) => c.id === categoriaId)) throw new Error('No se encontró la categoría.');
  return { core: { ...core, categorias: (core.categorias || []).filter((c) => c.id !== categoriaId) }, acciones, resultado: { categoriaId } };
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
    nombre: 'editarPersona',
    descripcion: 'Edita los datos de una persona existente (solo los campos que se pasen; los demás quedan igual).',
    parametros: {
      type: 'object',
      properties: {
        personaId: { type: 'string' },
        nombre: { type: 'string' },
        whatsapp: { type: 'string' },
        direccion: { type: 'string' },
        ciudad: { type: 'string' },
      },
      required: ['personaId'],
    },
    ejecutar: editarPersona,
  },
  {
    nombre: 'eliminarPersona',
    descripcion: 'Elimina una persona existente y sus vínculos con otras entidades.',
    parametros: { type: 'object', properties: { personaId: { type: 'string' } }, required: ['personaId'] },
    ejecutar: eliminarPersona,
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
    nombre: 'editarEmpresa',
    descripcion: 'Edita los datos de una empresa existente (solo los campos que se pasen; los demás quedan igual).',
    parametros: {
      type: 'object',
      properties: {
        empresaId: { type: 'string' },
        denominacion: { type: 'string' },
        cuit: { type: 'string' },
        direccion: { type: 'string' },
        ciudad: { type: 'string' },
      },
      required: ['empresaId'],
    },
    ejecutar: editarEmpresa,
  },
  {
    nombre: 'eliminarEmpresa',
    descripcion: 'Elimina una empresa existente y sus vínculos con otras entidades.',
    parametros: { type: 'object', properties: { empresaId: { type: 'string' } }, required: ['empresaId'] },
    ejecutar: eliminarEmpresa,
  },
  {
    nombre: 'asignarCabeceraEmpresa',
    descripcion: 'Asigna (o reemplaza) la empresa cabecera de otra, para la jerarquía de grupo.',
    parametros: {
      type: 'object',
      properties: { empresaId: { type: 'string', description: 'La empresa subsidiaria.' }, cabeceraId: { type: 'string', description: 'La empresa cabecera del grupo.' } },
      required: ['empresaId', 'cabeceraId'],
    },
    ejecutar: asignarCabeceraEmpresa,
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
    nombre: 'editarObra',
    descripcion: 'Edita los datos de una obra existente (solo los campos que se pasen; los demás quedan igual).',
    parametros: {
      type: 'object',
      properties: {
        obraId: { type: 'string' },
        nombre: { type: 'string' },
        descripcion: { type: 'string' },
        metros2: { type: 'number' },
        direccion: { type: 'string' },
        ciudad: { type: 'string' },
      },
      required: ['obraId'],
    },
    ejecutar: editarObra,
  },
  {
    nombre: 'eliminarObra',
    descripcion: 'Elimina una obra existente y sus vínculos con otras entidades.',
    parametros: { type: 'object', properties: { obraId: { type: 'string' } }, required: ['obraId'] },
    ejecutar: eliminarObra,
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
    nombre: 'editarHiloSeguimiento',
    descripcion: 'Edita el título y/o los vínculos (persona/empresas/obras) de un hilo de seguimiento existente. Cada campo que se pasa reemplaza por completo el vínculo de ese tipo (ej: si se pasa empresaIds, esas quedan como las únicas empresas vinculadas); el que no se pasa queda como estaba.',
    parametros: {
      type: 'object',
      properties: {
        hiloId: { type: 'string' },
        titulo: { type: 'string' },
        personaId: { type: 'string', description: 'Persona a dejar como principal del hilo, o "" para quitarla.' },
        empresaIds: { type: 'array', items: { type: 'string' } },
        obraIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['hiloId'],
    },
    ejecutar: editarHiloSeguimiento,
  },
  {
    nombre: 'cerrarHilo',
    descripcion: 'Cierra un hilo (de seguimiento o tarea), opcionalmente con una nota de cómo se cerró.',
    parametros: {
      type: 'object',
      properties: { hiloId: { type: 'string' }, notaCierre: { type: 'string' } },
      required: ['hiloId'],
    },
    ejecutar: cerrarHilo,
  },
  {
    nombre: 'reabrirHilo',
    descripcion: 'Reabre un hilo (de seguimiento o tarea) que estaba cerrado.',
    parametros: { type: 'object', properties: { hiloId: { type: 'string' } }, required: ['hiloId'] },
    ejecutar: reabrirHilo,
  },
  {
    nombre: 'crearTarea',
    descripcion: 'Crea una tarea nueva (Kanban de Tareas), con fecha/hora y aviso opcionales, opcionalmente vinculada a una persona y/o empresas/obras existentes.',
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
        personaId: { type: 'string' },
        empresaIds: { type: 'array', items: { type: 'string' } },
        obraIds: { type: 'array', items: { type: 'string' } },
        notaInicial: { type: 'string' },
        subtareasIniciales: {
          type: 'array',
          items: {
            type: 'object',
            properties: { texto: { type: 'string' }, fecha: { type: 'string' }, hora: { type: 'string' }, nota: { type: 'string' } },
            required: ['texto'],
          },
        },
        recurrente: { type: 'boolean' },
        repiteCadaN: { type: 'number' },
        repiteUnidad: { type: 'string', enum: ['dias', 'semanas', 'meses'] },
      },
      required: ['titulo'],
    },
    ejecutar: crearTarea,
  },
  {
    nombre: 'editarTarea',
    descripcion: 'Edita el título, fecha, hora, aviso y/o repetición de una tarea existente (solo los campos que se pasen).',
    parametros: {
      type: 'object',
      properties: {
        hiloId: { type: 'string' },
        titulo: { type: 'string' },
        fecha: { type: 'string', description: 'Fecha ISO (AAAA-MM-DD), o "" para quitarla.' },
        hora: { type: 'string', description: 'Hora HH:MM (24hs), o "" para quitarla.' },
        aviso: {
          type: 'object',
          properties: { activo: { type: 'boolean' }, cantidad: { type: 'number' }, unidad: { type: 'string', enum: ['minutos', 'horas', 'dias'] } },
        },
        recurrente: { type: 'boolean' },
        repiteCadaN: { type: 'number' },
        repiteUnidad: { type: 'string', enum: ['dias', 'semanas', 'meses'] },
      },
      required: ['hiloId'],
    },
    ejecutar: editarTarea,
  },
  {
    nombre: 'moverColumnaTarea',
    descripcion: 'Mueve una tarea a otra columna del Kanban de Tareas.',
    parametros: {
      type: 'object',
      properties: { hiloId: { type: 'string' }, columnaTareaId: { type: 'string', description: 'Id de la columna destino, o "" para "Sin columna".' } },
      required: ['hiloId'],
    },
    ejecutar: moverColumnaTarea,
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
    nombre: 'editarAccion',
    descripcion: 'Corrige una acción ya cargada en el historial de un hilo (tipo, nota, fecha, hora, prioridad, aviso), o cambia su estado entre Pendiente y Realizada. Solo los campos que se pasen se modifican.',
    parametros: {
      type: 'object',
      properties: {
        accionId: { type: 'string' },
        tipoAccionId: { type: 'string' },
        estado: { type: 'string', enum: ['Pendiente', 'Realizada'] },
        fecha: { type: 'string', description: 'Fecha ISO — realizada si estado final es Realizada, programada si es Pendiente.' },
        hora: { type: 'string', description: 'Hora HH:MM, solo aplica si es Pendiente.' },
        prioridad: { type: 'string', enum: ['Alta', 'Media', 'Baja'] },
        notaPlanificada: { type: 'string' },
        notaHecho: { type: 'string' },
        aviso: {
          type: 'object',
          properties: { activo: { type: 'boolean' }, cantidad: { type: 'number' }, unidad: { type: 'string', enum: ['minutos', 'horas', 'dias'] } },
        },
      },
      required: ['accionId'],
    },
    ejecutar: editarAccion,
  },
  {
    nombre: 'eliminarAccion',
    descripcion: 'Elimina un registro de acción (pendiente o realizada) del historial de un hilo.',
    parametros: { type: 'object', properties: { accionId: { type: 'string' } }, required: ['accionId'] },
    ejecutar: eliminarAccion,
  },
  {
    nombre: 'agregarNota',
    descripcion: 'Agrega una nota nueva a la lista de notas de un hilo (seguimiento o tarea) o de una persona.',
    parametros: {
      type: 'object',
      properties: { entidadTipo: { type: 'string', enum: ['Persona', 'Hilo'] }, entidadId: { type: 'string' }, texto: { type: 'string' } },
      required: ['entidadTipo', 'entidadId', 'texto'],
    },
    ejecutar: agregarNota,
  },
  {
    nombre: 'editarNota',
    descripcion: 'Edita el texto de una nota existente de un hilo o una persona.',
    parametros: {
      type: 'object',
      properties: { entidadTipo: { type: 'string', enum: ['Persona', 'Hilo'] }, entidadId: { type: 'string' }, notaId: { type: 'string' }, texto: { type: 'string' } },
      required: ['entidadTipo', 'entidadId', 'notaId', 'texto'],
    },
    ejecutar: editarNota,
  },
  {
    nombre: 'eliminarNota',
    descripcion: 'Elimina una nota existente de un hilo o una persona.',
    parametros: {
      type: 'object',
      properties: { entidadTipo: { type: 'string', enum: ['Persona', 'Hilo'] }, entidadId: { type: 'string' }, notaId: { type: 'string' } },
      required: ['entidadTipo', 'entidadId', 'notaId'],
    },
    ejecutar: eliminarNota,
  },
  {
    nombre: 'agregarSubtarea',
    descripcion: 'Agrega una subtarea nueva al checklist de una tarea.',
    parametros: {
      type: 'object',
      properties: {
        hiloId: { type: 'string' }, texto: { type: 'string' }, fecha: { type: 'string' }, hora: { type: 'string' }, nota: { type: 'string' },
        aviso: { type: 'object', properties: { activo: { type: 'boolean' }, cantidad: { type: 'number' }, unidad: { type: 'string', enum: ['minutos', 'horas', 'dias'] } } },
      },
      required: ['hiloId', 'texto'],
    },
    ejecutar: agregarSubtarea,
  },
  {
    nombre: 'editarSubtarea',
    descripcion: 'Edita una subtarea existente (texto, fecha/hora, nota, aviso), o la marca como hecha/pendiente.',
    parametros: {
      type: 'object',
      properties: {
        hiloId: { type: 'string' }, subtareaId: { type: 'string' }, texto: { type: 'string' }, fecha: { type: 'string' }, hora: { type: 'string' }, nota: { type: 'string' },
        aviso: { type: 'object', properties: { activo: { type: 'boolean' }, cantidad: { type: 'number' }, unidad: { type: 'string', enum: ['minutos', 'horas', 'dias'] } } },
        hecha: { type: 'boolean' },
      },
      required: ['hiloId', 'subtareaId'],
    },
    ejecutar: editarSubtarea,
  },
  {
    nombre: 'eliminarSubtarea',
    descripcion: 'Elimina una subtarea existente.',
    parametros: { type: 'object', properties: { hiloId: { type: 'string' }, subtareaId: { type: 'string' } }, required: ['hiloId', 'subtareaId'] },
    ejecutar: eliminarSubtarea,
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
    nombre: 'finalizarVinculo',
    descripcion: 'Finaliza (le pone fecha de fin, no lo borra) un vínculo activo entre dos entidades existentes.',
    parametros: { type: 'object', properties: { vinculoId: { type: 'string' }, hasta: { type: 'string', description: 'Fecha ISO de fin (por defecto hoy).' } }, required: ['vinculoId'] },
    ejecutar: finalizarVinculo,
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
  {
    nombre: 'quitarEtiqueta',
    descripcion: 'Quita una etiqueta asignada a una entidad puntual (no borra la etiqueta en sí).',
    parametros: {
      type: 'object',
      properties: { entidadTipo: ENTIDAD_ENUM, entidadId: { type: 'string' }, etiquetaId: { type: 'string' } },
      required: ['entidadTipo', 'entidadId', 'etiquetaId'],
    },
    ejecutar: quitarEtiqueta,
  },
  {
    nombre: 'eliminarEtiqueta',
    descripcion: 'Elimina una etiqueta de raíz: se le quita a todas las entidades que la tenían asignada.',
    parametros: { type: 'object', properties: { etiquetaId: { type: 'string' } }, required: ['etiquetaId'] },
    ejecutar: eliminarEtiqueta,
  },
  {
    nombre: 'eliminarCategoria',
    descripcion: 'Elimina una categoría de etiquetas. Las etiquetas que la usaban no se borran, quedan sin categoría.',
    parametros: { type: 'object', properties: { categoriaId: { type: 'string' } }, required: ['categoriaId'] },
    ejecutar: eliminarCategoria,
  },
];
