'use client';

import { useState, useEffect, useMemo, useCallback, useRef, Fragment, Component } from "react";
import * as XLSX from "xlsx";
import { HexColorPicker } from "react-colorful";
import {
  Plus, X, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Search, Settings, Users, Building2,
  HardHat, CalendarClock, Trash2, Pencil, Check, AlertTriangle,
  Tag, Star, Clock3, ListChecks, Repeat, ArrowLeft, ArrowDownAZ, ArrowUpAZ, GitBranch,
  BarChart3, FileSpreadsheet, Download, Trello, GripVertical, LogOut, Menu, Tags, FolderKanban, Layers,
  FileText, Image as ImageIcon,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

// ---------------------------------------------------------------------------
// Storage (Supabase, una fila por usuario en la tabla crm_data)
// ---------------------------------------------------------------------------
const APP_VERSION = "2.24.0";

// Tipos de relación con id fijo (los usa el código para auto-vincular y para los informes):
// la empresa dueña de una obra, y la jerarquía de grupo (cabecera/subsidiaria).
const TR_DUENA = "TR_DUENA";
const TR_CABECERA = "TR_CABECERA";

const uid = (p) => p + "-" + Math.random().toString(36).slice(2, 9);

// Adjuntos de hilos (Seguimientos y Tareas): se admite cualquier tipo de archivo, solo con
// límite de tamaño (mismo límite configurado en el bucket "adjuntos" de Supabase Storage, ver
// supabase/schema.sql — si se cambia acá, hay que cambiarlo también ahí para que coincidan).
// Este mapa solo decide qué ícono mostrar para los tipos más comunes; el resto usa uno genérico.
const ADJUNTO_ICONOS = {
  "image/png": "imagen",
  "image/jpeg": "imagen",
  "image/webp": "imagen",
  "image/gif": "imagen",
  "application/vnd.ms-excel": "excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "excel",
};
const ADJUNTO_TAMANO_MAX = 25 * 1024 * 1024; // 25 MB

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function IconoAdjunto({ tipo, size = 14, className }) {
  const cat = ADJUNTO_ICONOS[tipo];
  if (cat === "imagen") return <ImageIcon size={size} className={className} />;
  if (cat === "excel") return <FileSpreadsheet size={size} className={className} />;
  return <FileText size={size} className={className} />;
}

// ---------------------------------------------------------------------------
// Esquema de colores de la app (Configuración > Apariencia)
// ---------------------------------------------------------------------------
// Estructura: fondo, tarjetas, texto, bordes y botones principales de la app.
// Vínculos y acciones: menciones @, "Ver/Ocultar X", abrir ficha, eliminar, confirmar, "+ agregar".
// Estados y semántica: urgencia de Seguimientos, prioridad de acciones, y estado de hilos/acciones.
// Cada grupo se separa con una línea en el desplegable de Apariencia, pero cada color se elige
// individualmente — el agrupamiento es solo porque hoy comparten un mismo color de origen.
const TEMA_DEFAULT = {
  botonActivo: "#1B4D2E", botonInactivo: "#D9F0DE", tarjeta: "#FFFFFF", linea: "#E4DECF", fondo: "#F7F5F0", ink: "#2A2118", mutedBase: "#6B6352",
  mencion: "#B0452E", vinculo: "#B0452E", peligro: "#B0452E", exito: "#3F6B4A", acento: "#E8871E",
  urgenciaVencida: "#B0452E", urgenciaProxima: "#E8871E", urgenciaLejana: "#3F6B4A", urgenciaSinFecha: "#C9C1AE",
  prioridadAlta: "#B0452E", prioridadMedia: "#F4A742", prioridadBaja: "#E7E2D8",
  estadoActivo: "#3F6B4A", estadoCerradoInactivo: "#E7E2D8", estadoPendiente: "#F4A742", estadoRealizada: "#3F6B4A",
  marcadorTareas: "#6B4FA0",
};

// Metadatos para renderizar los selectores en Configuración > Apariencia: cada grupo se
// separa con una línea, pero cada color adentro se elige individualmente.
const TEMA_GRUPOS = [
  {
    titulo: "Vínculos y acciones",
    ayuda: "Menciones @, \"Ver/Ocultar X\", abrir una ficha, eliminar, confirmar y los botones \"+\".",
    subgrupos: [
      [
        { clave: "mencion", label: "Menciones @ (a Persona/Empresa/Obra en un texto)" },
      ],
      [
        { clave: "vinculo", label: "Otros vínculos (\"Ver/Ocultar\", abrir ficha)" },
        { clave: "peligro", label: "Peligro (eliminar, cancelar, error)" },
        { clave: "exito", label: "Éxito (confirmaciones)" },
        { clave: "acento", label: "Acento (botones \"+\" de agregar)" },
      ],
    ],
  },
  {
    titulo: "Urgencia en Seguimientos",
    ayuda: "El color de la solapa según qué tan cerca está la fecha programada.",
    subgrupos: [
      [
        { clave: "urgenciaVencida", label: "Vencida" },
        { clave: "prioridadAlta", label: "Prioridad alta" },
      ],
      [
        { clave: "urgenciaProxima", label: "Próxima a vencer" },
        { clave: "prioridadMedia", label: "Prioridad media" },
        { clave: "estadoPendiente", label: "Estado: pendiente" },
      ],
      [
        { clave: "urgenciaLejana", label: "Con tiempo" },
        { clave: "estadoActivo", label: "Estado: activo" },
        { clave: "estadoRealizada", label: "Estado: realizada" },
      ],
      [
        { clave: "urgenciaSinFecha", label: "Sin fecha programada" },
        { clave: "prioridadBaja", label: "Prioridad baja" },
        { clave: "estadoCerradoInactivo", label: "Estado: cerrado / inactivo" },
      ],
      [
        { clave: "marcadorTareas", label: "Marcador de Tareas" },
      ],
    ],
  },
];

// Tipos de relación de ejemplo: los dos fijos (dueña / cabecera) + los que salen de los
// cargos clásicos, ya convertidos a relación asimétrica ("{Cargo} de" / "Tiene como {Cargo} a").
const seedTiposRelacion = () => [
  { id: TR_DUENA, cualidad: "asimetrica", nombre: "Es dueña de", nombreInverso: "Pertenece a", implicaJerarquia: false },
  { id: TR_CABECERA, cualidad: "asimetrica", nombre: "Es cabecera de", nombreInverso: "Es subsidiaria de", implicaJerarquia: true },
  { id: "TRC_C01", cualidad: "asimetrica", nombre: "Dueño de", nombreInverso: "Tiene como Dueño a", implicaJerarquia: false },
  { id: "TRC_C02", cualidad: "asimetrica", nombre: "Gerente de", nombreInverso: "Tiene como Gerente a", implicaJerarquia: false },
  { id: "TRC_C03", cualidad: "asimetrica", nombre: "Jefe de Compras de", nombreInverso: "Tiene como Jefe de Compras a", implicaJerarquia: false },
  { id: "TRC_C04", cualidad: "asimetrica", nombre: "Administración de", nombreInverso: "Tiene como Administración a", implicaJerarquia: false },
];

const vinc = (origenTipo, origenId, destinoTipo, destinoId, tipoRelacionId, principal, desde) =>
  ({ id: uid("V"), origenTipo, origenId, destinoTipo, destinoId, tipoRelacionId: tipoRelacionId || null, principal: !!principal, desde: desde || todayISO(), hasta: null, nota: "" });

const seedCore = () => ({
  personas: [
    { id: "P001", nombre: "Juan Pérez", whatsapp: "0351 15-555-1234", direccion: "Av. Colón 1234", ciudad: "Córdoba", notas: "Prefiere contacto por la tarde" },
    { id: "P002", nombre: "María Gómez", whatsapp: "0351 15-666-4321", direccion: "Bv. San Juan 550", ciudad: "Córdoba", notas: "" },
    { id: "P003", nombre: "Roberto Díaz", whatsapp: "011 15-777-8899", direccion: "Av. Rivadavia 900", ciudad: "CABA", notas: "Dueño, muy ocupado, mejor mail primero" },
  ],
  empresas: [
    { id: "E001", denominacion: "Constructora del Sur S.A.", cuit: "", direccion: "Ruta 20 Km 8", ciudad: "Córdoba" },
    { id: "E002", denominacion: "Grupo Díaz Desarrollos", cuit: "", direccion: "Av. Rivadavia 900", ciudad: "CABA" },
  ],
  obras: [
    { id: "O001", nombre: "Anatonia Village", descripcion: "Barrio cerrado, 40 lotes", metros2: 12000, direccion: "Camino a Argüello s/n", ciudad: "Córdoba" },
  ],
  tiposAccion: [
    { id: "TA01", nombre: "Llamado telefónico" },
    { id: "TA02", nombre: "Visita" },
    { id: "TA03", nombre: "WhatsApp" },
    { id: "TA04", nombre: "Email" },
    { id: "TA05", nombre: "Reunión" },
  ],
  etiquetas: [
    { id: "ET01", etiqueta: "Zona Norte", categoriaId: "CAT1", aplicaA: "Empresa" },
    { id: "ET02", etiqueta: "Solar", categoriaId: "CAT2", aplicaA: "Obra" },
    { id: "ET03", etiqueta: "Cliente clave", categoriaId: "CAT3", aplicaA: "Empresa" },
  ],
  categorias: [
    { id: "CAT1", nombre: "Zona" },
    { id: "CAT2", nombre: "Rubro" },
    { id: "CAT3", nombre: "Prioridad" },
  ],
  tiposRelacion: seedTiposRelacion(),
  // Único sistema de relaciones de la app (Red de relaciones). Cada vínculo tiene origen y
  // destino (Persona/Empresa/Obra/Hilo), un tipo de relación opcional (sin tipo = genérico,
  // como los vínculos a un hilo), si es el vínculo "principal", y su vigencia (desde/hasta).
  vinculos: [
    vinc("Persona", "P001", "Empresa", "E001", "TRC_C03", true, todayISO()),
    vinc("Persona", "P002", "Empresa", "E001", "TRC_C04", false, todayISO()),
    vinc("Persona", "P003", "Empresa", "E002", "TRC_C01", true, todayISO()),
    vinc("Empresa", "E001", "Obra", "O001", TR_DUENA, false, todayISO()),
    vinc("Persona", "P001", "Hilo", "H001", null, true, addDaysISO(todayISO(), -15)),
    vinc("Persona", "P001", "Hilo", "H002", null, true, addDaysISO(todayISO(), -20)),
    vinc("Persona", "P002", "Hilo", "H003", null, true, addDaysISO(todayISO(), -6)),
    vinc("Persona", "P003", "Hilo", "H004", null, true, addDaysISO(todayISO(), -10)),
    vinc("Hilo", "H001", "Empresa", "E001", null, false, addDaysISO(todayISO(), -15)),
    vinc("Hilo", "H002", "Empresa", "E001", null, false, addDaysISO(todayISO(), -20)),
    vinc("Hilo", "H003", "Empresa", "E001", null, false, addDaysISO(todayISO(), -6)),
    vinc("Hilo", "H004", "Empresa", "E002", null, false, addDaysISO(todayISO(), -10)),
    vinc("Hilo", "H002", "Obra", "O001", null, false, addDaysISO(todayISO(), -20)),
  ],
  entidadEtiqueta: [
    { id: uid("et"), etiquetaId: "ET01", entidadTipo: "Empresa", entidadId: "E001" },
    { id: uid("et"), etiquetaId: "ET03", entidadTipo: "Empresa", entidadId: "E001" },
    { id: uid("et"), etiquetaId: "ET02", entidadTipo: "Obra", entidadId: "O001" },
  ],
  parametros: { umbralDiaLleno: 8, diasHabiles: [1, 2, 3, 4, 5], fechasNoHabiles: [], diasUrgente: 3, diasProximos: 7, googleContactsLabel: "CRM", tituloApp: "Seguimiento comercial", nombreSinColumnaSeguimientos: "Sin columna", nombreSinColumnaTareas: "Sin columna" },
  tema: { ...TEMA_DEFAULT },
  kanbanColumnas: [
    { id: "K1", nombre: "Por hacer", orden: 0 },
    { id: "K2", nombre: "En curso", orden: 1 },
    { id: "K3", nombre: "Esperando respuesta", orden: 2 },
  ],
  kanbanColumnasTareas: [
    { id: "T1", nombre: "Por hacer", orden: 0 },
    { id: "T2", nombre: "En curso", orden: 1 },
    { id: "T3", nombre: "Hecho", orden: 2 },
  ],
  hilos: [
    { id: "H001", titulo: "Presupuesto cables solares", estado: "Activo", fechaCreacion: addDaysISO(todayISO(), -15), tipo: "cliente", columnaTareaId: null, hiloRelacionadoId: null, notaCierre: "" },
    { id: "H002", titulo: "Avance obra Anatonia Village", estado: "Activo", fechaCreacion: addDaysISO(todayISO(), -20), tipo: "cliente", columnaTareaId: null, hiloRelacionadoId: null, notaCierre: "" },
    { id: "H003", titulo: "Datos de facturación", estado: "Activo", fechaCreacion: addDaysISO(todayISO(), -6), tipo: "cliente", columnaTareaId: null, hiloRelacionadoId: null, notaCierre: "" },
    { id: "H004", titulo: "Propuesta anual", estado: "Activo", fechaCreacion: addDaysISO(todayISO(), -10), tipo: "cliente", columnaTareaId: null, hiloRelacionadoId: null, notaCierre: "" },
    { id: "H005", titulo: "Comprar resma de hojas", estado: "Activo", fechaCreacion: todayISO(), tipo: "tarea", columnaTareaId: "T1", hiloRelacionadoId: null, notaCierre: "" },
  ],
});

const seedAcciones = () => {
  const t = todayISO();
  return [
    { id: "A001", hiloId: "H001", tipoAccionId: "TA01", estado: "Realizada", fechaRealizada: addDaysISO(t, -15), fechaProgramada: "", prioridad: "", notaPlanificada: "", notaHecho: "Primer contacto, interesado.", origenId: null, destinoId: "A002", numero: 1, recurrente: false, repiteCadaN: null, repiteUnidad: null, fechaCreacion: addDaysISO(t, -15), secuencia: 1 },
    { id: "A002", hiloId: "H001", tipoAccionId: "TA01", estado: "Realizada", fechaRealizada: addDaysISO(t, -8), fechaProgramada: "", prioridad: "", notaPlanificada: "Confirmar interés y avanzar con una cotización.", notaHecho: "Habló bien, pidió cotización de cables solares.", origenId: "A001", destinoId: "A003", numero: 2, recurrente: false, repiteCadaN: null, repiteUnidad: null, fechaCreacion: addDaysISO(t, -8), secuencia: 2 },
    { id: "A003", hiloId: "H001", tipoAccionId: "TA04", estado: "Pendiente", fechaRealizada: "", fechaProgramada: addDaysISO(t, -3), prioridad: "Alta", notaPlanificada: "Enviar cotización final de cables.", notaHecho: "", origenId: "A002", destinoId: null, numero: 3, recurrente: false, repiteCadaN: null, repiteUnidad: null, fechaCreacion: addDaysISO(t, -3), secuencia: 3 },
    { id: "A004", hiloId: "H002", tipoAccionId: "TA05", estado: "Pendiente", fechaRealizada: "", fechaProgramada: addDaysISO(t, 4), prioridad: "Alta", notaPlanificada: "Reunión de avance de obra.", notaHecho: "", origenId: null, destinoId: null, numero: 4, recurrente: false, repiteCadaN: null, repiteUnidad: null, fechaCreacion: addDaysISO(t, -1), secuencia: 4 },
    { id: "A005", hiloId: "H003", tipoAccionId: "TA01", estado: "Pendiente", fechaRealizada: "", fechaProgramada: addDaysISO(t, -2), prioridad: "Media", notaPlanificada: "Confirmar datos de facturación.", notaHecho: "", origenId: null, destinoId: null, numero: 5, recurrente: false, repiteCadaN: null, repiteUnidad: null, fechaCreacion: addDaysISO(t, -6), secuencia: 5 },
    { id: "A006", hiloId: "H004", tipoAccionId: "TA05", estado: "Pendiente", fechaRealizada: "", fechaProgramada: addDaysISO(t, 4), prioridad: "Alta", notaPlanificada: "Reunión para presentar propuesta anual.", notaHecho: "", origenId: null, destinoId: null, numero: 6, recurrente: false, repiteCadaN: null, repiteUnidad: null, fechaCreacion: addDaysISO(t, -1), secuencia: 6 },
    { id: "A007", hiloId: "H004", tipoAccionId: "TA01", estado: "Pendiente", fechaRealizada: "", fechaProgramada: addDaysISO(t, 20), prioridad: "Baja", notaPlanificada: "Llamado de seguimiento trimestral.", notaHecho: "", origenId: null, destinoId: null, numero: 7, recurrente: true, repiteCadaN: 3, repiteUnidad: "meses", fechaCreacion: t, secuencia: 7 },
  ];
};

// Migra el modelo viejo (tablas separadas: cargos, personaEmpresa, empresaObra, personaObra,
// hiloEmpresa, hiloObra, empresa.cabeceraId, hilo.participantes) al sistema único de "vinculos".
// Es idempotente: una vez migrado, las tablas viejas ya no están y no vuelve a migrar nada.
function migrarAVinculos(out) {
  const tipos = Array.isArray(out.tiposRelacion) ? [...out.tiposRelacion] : [];
  const ensureTR = (t) => { if (!tipos.some((x) => x.id === t.id)) tipos.push(t); };
  ensureTR({ id: TR_DUENA, cualidad: "asimetrica", nombre: "Es dueña de", nombreInverso: "Pertenece a", implicaJerarquia: false });
  ensureTR({ id: TR_CABECERA, cualidad: "asimetrica", nombre: "Es cabecera de", nombreInverso: "Es subsidiaria de", implicaJerarquia: true });

  // Cada cargo del catálogo viejo pasa a ser un tipo de relación asimétrico.
  const cargoTR = {};
  for (const c of (out.cargos || [])) {
    const id = "TRC_" + c.id;
    ensureTR({ id, cualidad: "asimetrica", nombre: `${c.nombre} de`, nombreInverso: `Tiene como ${c.nombre} a`, implicaJerarquia: false });
    cargoTR[c.id] = id;
  }

  // Vínculos que ya existían (del sistema nuevo parcial): normaliza campos (fecha -> desde, etc.).
  const yaV = (out.vinculos || []).map((v) => ({
    id: v.id || uid("V"),
    origenTipo: v.origenTipo, origenId: v.origenId,
    destinoTipo: v.destinoTipo, destinoId: v.destinoId,
    tipoRelacionId: v.tipoRelacionId ?? null,
    principal: !!v.principal,
    desde: v.desde || v.fecha || todayISO(),
    hasta: v.hasta ?? null,
    nota: v.nota || "",
  }));

  const nuevos = [];
  const push = (o, oid, d, did, tr, principal, desde, hasta) =>
    nuevos.push({ id: uid("V"), origenTipo: o, origenId: oid, destinoTipo: d, destinoId: did, tipoRelacionId: tr || null, principal: !!principal, desde: desde || todayISO(), hasta: hasta ?? null, nota: "" });

  for (const r of (out.personaEmpresa || [])) push("Persona", r.personaId, "Empresa", r.empresaId, cargoTR[r.cargoId] || null, r.principal, r.desde);
  for (const r of (out.empresaObra || [])) push("Empresa", r.empresaId, "Obra", r.obraId, TR_DUENA, false, r.desde);
  for (const r of (out.personaObra || [])) push("Persona", r.personaId, "Obra", r.obraId, null, false, r.desde);
  for (const e of (out.empresas || [])) if (e.cabeceraId) push("Empresa", e.cabeceraId, "Empresa", e.id, TR_CABECERA, false);
  for (const h of (out.hilos || [])) for (const p of (h.participantes || [])) push("Persona", p.personaId, "Hilo", h.id, null, p.principal, p.desde || h.fechaCreacion, p.hasta);
  for (const r of (out.hiloEmpresa || [])) push("Hilo", r.hiloId, "Empresa", r.empresaId, null, false);
  for (const r of (out.hiloObra || [])) push("Hilo", r.hiloId, "Obra", r.obraId, null, false);

  out.tiposRelacion = tipos;
  out.vinculos = [...yaV, ...nuevos];
  out.hilos = (out.hilos || []).map(({ participantes, empresaId, obraId, personaId, ...h }) => h);
  out.empresas = (out.empresas || []).map(({ cabeceraId, ...e }) => e);
  delete out.cargos;
  delete out.personaEmpresa;
  delete out.empresaObra;
  delete out.personaObra;
  delete out.hiloEmpresa;
  delete out.hiloObra;
  return out;
}

function normalizeCore(c) {
  const seed = seedCore();
  const out = { ...seed, ...c };
  if (!Array.isArray(out.categorias) || out.categorias.length === 0) out.categorias = seed.categorias;
  out.empresas = (out.empresas || []).map((e) => ({ ciudad: "", cuit: "", ...e }));
  out.etiquetas = (out.etiquetas || []).map((e) => {
    if (e.categoriaId) return e;
    // dato viejo: tenía "categoria" como texto libre -> lo mapeamos a una categoría de la tabla (o la creamos)
    const nombreCat = (e.categoria || "").trim();
    let match = out.categorias.find((c2) => c2.nombre.toLowerCase() === nombreCat.toLowerCase());
    if (!match && nombreCat) {
      match = { id: uid("CAT"), nombre: nombreCat };
      out.categorias = [...out.categorias, match];
    }
    const { categoria, ...rest } = e;
    return { ...rest, categoriaId: match ? match.id : out.categorias[0].id };
  });
  if (!Array.isArray(out.hilos)) out.hilos = [];
  out.hilos = out.hilos.map((h) => ({ tipo: "cliente", columnaTareaId: null, hiloRelacionadoId: null, notaCierre: "", ...h }));
  if (!Array.isArray(out.tiposRelacion)) out.tiposRelacion = [];
  if (!Array.isArray(out.vinculos)) out.vinculos = [];
  // Unifica todo al sistema de vínculos (migra las tablas viejas si todavía están).
  migrarAVinculos(out);
  out.parametros = { umbralDiaLleno: 8, diasHabiles: [1, 2, 3, 4, 5], fechasNoHabiles: [], diasUrgente: 3, diasProximos: 7, googleContactsLabel: "CRM", tituloApp: "Seguimiento comercial", nombreSinColumnaSeguimientos: "Sin columna", nombreSinColumnaTareas: "Sin columna", ...(out.parametros || {}) };
  out.tema = { ...TEMA_DEFAULT, ...(out.tema || {}) };
  if (!Array.isArray(out.kanbanColumnas)) out.kanbanColumnas = seed.kanbanColumnas;
  if (!Array.isArray(out.kanbanColumnasTareas)) out.kanbanColumnasTareas = seed.kanbanColumnasTareas;
  return out;
}

async function loadCrmRow(userId) {
  const { data, error } = await supabase
    .from("crm_data")
    .select("core, acciones, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function insertCrmRow(userId, core, acciones) {
  const { error } = await supabase.from("crm_data").insert({ user_id: userId, core, acciones });
  if (error) throw error;
}

// Devuelve la fecha (updated_at) que efectivamente quedó guardada, o null si falló — el
// llamador la usa para saber qué avisos de tiempo real son más nuevos que su propio guardado.
async function saveCrmField(userId, field, value, intento = 0, ts) {
  const updatedAt = ts || new Date().toISOString();
  try {
    const { error } = await supabase
      .from("crm_data")
      .update({ [field]: value, updated_at: updatedAt })
      .eq("user_id", userId);
    if (error) throw error;
    return updatedAt;
  } catch {
    if (intento < 2) {
      await new Promise((r) => setTimeout(r, 400));
      return saveCrmField(userId, field, value, intento + 1, updatedAt);
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function todayISO() { return toISO(new Date()); }
function parseISO(s) { return new Date(s + "T00:00:00"); }
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function addDaysISO(iso, n) { return toISO(addDays(parseISO(iso), n)); }
function isWeekend(d) { const g = d.getDay(); return g === 0 || g === 6; }
function esDiaHabil(d, parametros) {
  const diasHabiles = parametros?.diasHabiles || [1, 2, 3, 4, 5];
  if (!diasHabiles.includes(d.getDay())) return false;
  const fechasNoHabiles = parametros?.fechasNoHabiles || [];
  if (fechasNoHabiles.includes(toISO(d))) return false;
  return true;
}
function esFechaInhabil(iso, parametros) {
  if (!iso) return false;
  return !esDiaHabil(parseISO(iso), parametros);
}
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function fmtDateHora(iso, hora) {
  return fmtDate(iso) + (hora ? ` · ${hora} hs` : "");
}
// Ordena acciones realizadas de más reciente a más antigua. Si dos comparten fecha,
// desempata por el número de secuencia asignado al crearlas (orden real en que ocurrieron).
function compararRecientePrimero(a, b) {
  if (a.fechaRealizada !== b.fechaRealizada) return a.fechaRealizada < b.fechaRealizada ? 1 : -1;
  return (b.secuencia || 0) - (a.secuencia || 0);
}

// Datos de antes de esta versión: no tenían número correlativo ni las notas separadas
// en "lo que se planificó" / "lo que se hizo". Se completa una sola vez, sin pisar nada existente.
function migrarNumerosYNotas(acciones) {
  const ordenadas = [...acciones].sort((a, b) => (a.secuencia || 0) - (b.secuencia || 0) || String(a.fechaCreacion || "").localeCompare(String(b.fechaCreacion || "")));
  let siguiente = 1;
  return acciones.map((orig) => {
    const a = { ...orig };
    if (typeof a.numero !== "number") {
      a.numero = ordenadas.findIndex((x) => x.id === a.id) + 1 || siguiente++;
    }
    if (a.notaPlanificada === undefined) a.notaPlanificada = a.estado === "Pendiente" ? (a.notas || "") : "";
    if (a.notaHecho === undefined) a.notaHecho = a.estado === "Realizada" ? (a.notas || "") : "";
    if (a.origenId === undefined) a.origenId = null;
    if (a.destinoId === undefined) a.destinoId = null;
    return a;
  });
}
function fmtNumero(n) {
  return "#" + String(n || 0).padStart(4, "0");
}
// Tipo de acción sugerido por defecto para hilos de cliente: WhatsApp si existe, si no el primero de la lista.
function tipoDefaultId(core) {
  return core.tiposAccion.find((t) => t.nombre.toLowerCase().includes("whatsapp"))?.id || core.tiposAccion[0]?.id || "";
}
// -------- Helpers de vínculos: consultas genéricas sobre core.vinculos --------
// Todos los vínculos que tocan una entidad (como origen o destino).
function vinculosDeEntidad(core, tipo, id, soloActivos = false) {
  return (core.vinculos || []).filter((v) =>
    ((v.origenTipo === tipo && v.origenId === id) || (v.destinoTipo === tipo && v.destinoId === id)) &&
    (!soloActivos || !v.hasta));
}
// Dado un vínculo y una de sus puntas (la "ancla"), devuelve la otra punta y si la ancla era el origen.
function contraparteVinculo(v, tipo, id) {
  const esOrigen = v.origenTipo === tipo && v.origenId === id;
  return esOrigen
    ? { tipo: v.destinoTipo, id: v.destinoId, esOrigen: true }
    : { tipo: v.origenTipo, id: v.origenId, esOrigen: false };
}
// Contrapartes de un tipo dado vinculadas a (tipo,id): [{ v, c }].
function contrapartesDe(core, tipo, id, tipoDestino, soloActivos = false) {
  return vinculosDeEntidad(core, tipo, id, soloActivos)
    .map((v) => ({ v, c: contraparteVinculo(v, tipo, id) }))
    .filter(({ c }) => c.tipo === tipoDestino);
}

// -------- Helpers de hilo (personas/empresas/obras derivadas de vínculos) --------
// ¿El vínculo "v" es un participante (Persona) activo del hilo "hiloId"?
function esParticipanteActivoDeHilo(v, hiloId) {
  return !v.hasta && ((v.origenTipo === "Hilo" && v.origenId === hiloId && v.destinoTipo === "Persona") || (v.destinoTipo === "Hilo" && v.destinoId === hiloId && v.origenTipo === "Persona"));
}
// ¿El vínculo "v" conecta al hilo "hiloId" con la entidad (tipo, entId) dada?
function esVinculoEntreHiloYEntidad(v, hiloId, tipo, entId) {
  return (v.origenTipo === "Hilo" && v.origenId === hiloId && v.destinoTipo === tipo && v.destinoId === entId) || (v.destinoTipo === "Hilo" && v.destinoId === hiloId && v.origenTipo === tipo && v.origenId === entId);
}
// Participantes activos de un hilo (personas sin fecha "hasta"). id = id del vínculo.
function participantesActivos(hilo, core) {
  return contrapartesDe(core, "Hilo", hilo.id, "Persona", true)
    .map(({ v, c }) => ({ id: v.id, personaId: c.id, desde: v.desde, hasta: v.hasta, principal: !!v.principal }));
}
// Todos los participantes (activos + históricos, con "hasta").
function participantesDeHilo(hilo, core) {
  return contrapartesDe(core, "Hilo", hilo.id, "Persona")
    .map(({ v, c }) => ({ id: v.id, personaId: c.id, desde: v.desde, hasta: v.hasta, principal: !!v.principal }));
}
function personasActivasDeHilo(hilo, core) {
  const activos = participantesActivos(hilo, core).sort((a, b) => (b.principal ? 1 : 0) - (a.principal ? 1 : 0));
  return activos.map((p) => core.personas.find((pp) => pp.id === p.personaId)).filter(Boolean);
}
function personaPrincipalDeHilo(hilo, core) {
  return personasActivasDeHilo(hilo, core)[0] || null;
}
function empresasDeHilo(hilo, core) {
  return contrapartesDe(core, "Hilo", hilo.id, "Empresa", true)
    .map(({ c }) => core.empresas.find((e) => e.id === c.id)).filter(Boolean);
}
function obrasDeHilo(hilo, core) {
  return contrapartesDe(core, "Hilo", hilo.id, "Obra", true)
    .map(({ c }) => core.obras.find((o) => o.id === c.id)).filter(Boolean);
}
// -------- Jerarquía de grupo (relación TR_CABECERA: cabecera = origen, subsidiaria = destino) --------
function subsidiariasDeEmpresa(empresaId, core) {
  return (core.vinculos || [])
    .filter((v) => v.tipoRelacionId === TR_CABECERA && v.origenTipo === "Empresa" && v.origenId === empresaId && v.destinoTipo === "Empresa" && !v.hasta)
    .map((v) => core.empresas.find((e) => e.id === v.destinoId)).filter(Boolean);
}
function cabecerasDeEmpresa(empresaId, core) {
  return (core.vinculos || [])
    .filter((v) => v.tipoRelacionId === TR_CABECERA && v.destinoTipo === "Empresa" && v.destinoId === empresaId && v.origenTipo === "Empresa" && !v.hasta)
    .map((v) => core.empresas.find((e) => e.id === v.origenId)).filter(Boolean);
}
// Primera cabecera de una empresa (la app muestra "Grupo X" con esta).
function cabeceraDeEmpresa(empresaId, core) {
  return cabecerasDeEmpresa(empresaId, core)[0] || null;
}
// Multinivel libre: cualquier empresa distinta de ella misma puede ser su cabecera.
function candidatasACabecera(empresaId, core) {
  return core.empresas.filter((e) => e.id !== empresaId);
}
// -------- Consultas persona↔empresa y empresa↔obra (para cascadas e informes) --------
function empresaIdsDePersona(core, personaId) {
  return [...new Set(contrapartesDe(core, "Persona", personaId, "Empresa", true).map(({ c }) => c.id))];
}
function personaIdsDeEmpresa(core, empresaId) {
  return [...new Set(contrapartesDe(core, "Empresa", empresaId, "Persona", true).map(({ c }) => c.id))];
}
function obraIdsDeEmpresa(core, empresaId) {
  return (core.vinculos || [])
    .filter((v) => v.tipoRelacionId === TR_DUENA && v.origenTipo === "Empresa" && v.origenId === empresaId && v.destinoTipo === "Obra" && !v.hasta)
    .map((v) => v.destinoId);
}
function empresaDueñaDeObra(core, obraId) {
  const v = (core.vinculos || []).find((x) => x.tipoRelacionId === TR_DUENA && x.destinoTipo === "Obra" && x.destinoId === obraId && x.origenTipo === "Empresa" && !x.hasta);
  return v ? v.origenId : null;
}
function obraIdsDirectasDePersona(core, personaId) {
  return contrapartesDe(core, "Persona", personaId, "Obra", true).map(({ c }) => c.id);
}
function hilosDePersona(core, personaId) {
  const ids = new Set(contrapartesDe(core, "Persona", personaId, "Hilo").map(({ c }) => c.id));
  return core.hilos.filter((h) => ids.has(h.id));
}
// Todas las tareas relacionadas a una entidad (Persona/Empresa/Obra): vinculadas
// directamente, o vinculadas a alguno de sus hilos de seguimiento (vía hiloRelacionadoId)
// — sin duplicar si una tarea cae en los dos casos.
function tareasDeEntidad(core, entidadTipo, entidadId) {
  const hilosIds = new Set(contrapartesDe(core, entidadTipo, entidadId, "Hilo").map(({ c }) => c.id));
  const tareasDirectas = core.hilos.filter((h) => hilosIds.has(h.id) && h.tipo === "tarea");
  const idsHilosCliente = new Set(core.hilos.filter((h) => hilosIds.has(h.id) && h.tipo === "cliente").map((h) => h.id));
  const tareasIndirectas = core.hilos.filter((h) => h.tipo === "tarea" && h.hiloRelacionadoId && idsHilosCliente.has(h.hiloRelacionadoId));
  const vistos = new Set();
  const todas = [];
  for (const t of [...tareasDirectas, ...tareasIndirectas]) {
    if (!vistos.has(t.id)) { vistos.add(t.id); todas.push(t); }
  }
  return todas;
}
// ¿Existe ya un vínculo (activo) entre dos entidades, con un tipo de relación dado (o cualquiera)?
function existeVinculo(core, oTipo, oId, dTipo, dId, tipoRelacionId = undefined) {
  return (core.vinculos || []).some((v) => !v.hasta &&
    (tipoRelacionId === undefined || (v.tipoRelacionId || null) === (tipoRelacionId || null)) &&
    (((v.origenTipo === oTipo && v.origenId === oId && v.destinoTipo === dTipo && v.destinoId === dId)) ||
     ((v.origenTipo === dTipo && v.origenId === dId && v.destinoTipo === oTipo && v.destinoId === oId))));
}
function etiquetaVinculoHilo(hilo, core) {
  const personas = personasActivasDeHilo(hilo, core);
  if (personas.length > 0) return personas.map((p) => p.nombre).join(", ");
  const empresas = empresasDeHilo(hilo, core);
  if (empresas.length > 0) return empresas.map((e) => e.denominacion).join(", ");
  const obras = obrasDeHilo(hilo, core);
  if (obras.length > 0) return obras.map((o) => o.nombre).join(", ");
  return hilo.titulo;
}
function getIniciales(nombre) {
  const partes = (nombre || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

// -------- Helpers de vínculos (Red de relaciones) --------
// Entidades que el usuario puede vincular con un "tipo de relación" en la pantalla de
// Relaciones y en el "+ Vincular" de cada ficha. Los hilos NO están acá: se vinculan solo
// de forma genérica (sin tipo) desde la propia ficha del hilo.
const TIPOS_ENTIDAD_RELACION = [
  { tipo: "Persona", coleccion: "personas", labelKey: "nombre", plural: "Personas" },
  { tipo: "Empresa", coleccion: "empresas", labelKey: "denominacion", plural: "Empresas" },
  { tipo: "Obra", coleccion: "obras", labelKey: "nombre", plural: "Obras" },
];
// Para mostrar el nombre de cualquier punta de un vínculo (incluye Hilo, que no es
// relacionable manualmente pero sí aparece como contraparte de vínculos genéricos).
const ENTIDAD_LABEL = { Persona: ["personas", "nombre"], Empresa: ["empresas", "denominacion"], Obra: ["obras", "nombre"], Hilo: ["hilos", "titulo"] };
function entidadLabel(tipo, id, core) {
  const def = ENTIDAD_LABEL[tipo];
  if (!def) return null;
  const item = (core[def[0]] || []).find((x) => x.id === id);
  return item ? item[def[1]] : null;
}
function todasLasEntidadesRelacionables(core) {
  return TIPOS_ENTIDAD_RELACION.flatMap((def) =>
    (core[def.coleccion] || []).map((item) => ({ tipo: def.tipo, id: item.id, label: item[def.labelKey] }))
  );
}
// Para relaciones asimétricas, cada lado ve un nombre distinto (ej: "Cliente de" / "Proveedor de");
// para las simétricas, un solo nombre vale para los dos lados.
function nombreRelacionLado(tipoRelacion, esOrigen) {
  if (!tipoRelacion) return "";
  if (tipoRelacion.cualidad !== "asimetrica") return tipoRelacion.nombre;
  return esOrigen ? tipoRelacion.nombre : (tipoRelacion.nombreInverso || tipoRelacion.nombre);
}

function addPeriod(fromISO, value, unit) {
  let d = parseISO(fromISO);
  if (unit === "dias") d = addDays(d, value);
  else if (unit === "semanas") d = addDays(d, value * 7);
  else if (unit === "meses") d.setMonth(d.getMonth() + value);
  return toISO(d);
}
function computeSmartDate(baseISO, acciones, parametros) {
  let d = parseISO(baseISO);
  while (!esDiaHabil(d, parametros)) d = addDays(d, 1);
  let guard = 0;
  while (guard < 90) {
    const iso = toISO(d);
    const count = acciones.filter((a) => a.estado === "Pendiente" && a.fechaProgramada === iso).length;
    if (count < parametros.umbralDiaLleno) return iso;
    d = addDays(d, 1);
    while (!esDiaHabil(d, parametros)) d = addDays(d, 1);
    guard++;
  }
  return toISO(d);
}

// ---------------------------------------------------------------------------
// WhatsApp link
// ---------------------------------------------------------------------------
function toWhatsappNumber(raw) {
  let d = (raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("54")) {
    let rest = d.slice(2);
    if (!rest.startsWith("9")) rest = "9" + rest;
    return "54" + rest;
  }
  if (d.startsWith("0")) d = d.slice(1);
  for (const len of [2, 3, 4]) {
    const area = d.slice(0, len);
    const remainder = d.slice(len);
    if (remainder.startsWith("15")) {
      const withoutFifteen = area + remainder.slice(2);
      if (withoutFifteen.length === 10) { d = withoutFifteen; break; }
    }
  }
  return "549" + d;
}

function WhatsAppIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.81L2 22l5.41-1.42a9.86 9.86 0 0 0 4.63 1.18h.01c5.46 0 9.9-4.45 9.9-9.91C21.95 6.45 17.5 2 12.04 2zm5.8 14.09c-.24.68-1.39 1.32-1.92 1.4-.49.08-1.11.11-1.79-.11-.41-.13-.94-.3-1.62-.59-2.85-1.23-4.71-4.1-4.85-4.29-.14-.19-1.16-1.54-1.16-2.94s.73-2.09.99-2.38c.26-.28.56-.35.75-.35h.53c.17 0 .4-.03.62.47.24.56.81 1.95.88 2.09.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.56.16.28.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.21 1.37.28.14.44.12.6-.07.17-.19.71-.83.9-1.11.19-.28.38-.23.63-.14.26.09 1.63.77 1.91.91.28.14.47.21.53.33.07.12.07.68-.17 1.36z" />
    </svg>
  );
}

// Ícono-botón a WhatsApp Business, para poner al lado del nombre de una persona.
function WhatsAppLink({ persona, size = 14 }) {
  const numero = toWhatsappNumber(persona?.whatsapp);
  if (!numero) return null;
  const abrir = (e) => {
    e.stopPropagation();
    e.preventDefault();
    window.open(`https://wa.me/${numero}`, "_blank", "noopener,noreferrer");
  };
  return (
    <button
      type="button"
      onClick={abrir}
      aria-label="Abrir WhatsApp Business"
      className="inline-flex items-center justify-center shrink-0 text-[#3F6B4A] hover:text-[#2f5238]"
    >
      <WhatsAppIcon size={size} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// UI primitives
// ---------------------------------------------------------------------------
// El "tone" es el nombre del rol de color (core.tema) que corresponde a ese estado —
// no un color fijo — así cada estado se puede recolorear por separado en Configuración.
function Chip({ children, tone = "estadoCerradoInactivo" }) {
  const tones = {
    estadoCerradoInactivo: "bg-[var(--tema-estadoCerradoInactivo)] text-[#4A4438]",
    prioridadBaja: "bg-[var(--tema-prioridadBaja)] text-[#4A4438]",
    estadoPendiente: "bg-[var(--tema-estadoPendiente)] text-[#2A2118]",
    prioridadMedia: "bg-[var(--tema-prioridadMedia)] text-[#2A2118]",
    urgenciaProxima: "bg-[var(--tema-urgenciaProxima)] text-[#2A2118]",
    estadoActivo: "bg-[var(--tema-estadoActivo)] text-[#F2F0E9]",
    estadoRealizada: "bg-[var(--tema-estadoRealizada)] text-[#F2F0E9]",
    prioridadAlta: "bg-[var(--tema-prioridadAlta)] text-[#F2F0E9]",
    urgenciaVencida: "bg-[var(--tema-urgenciaVencida)] text-[#F2F0E9]",
  };
  return <span className={`text-[10px] font-bold tracking-widest px-2 py-1 rounded-sm ${tones[tone]}`}>{children}</span>;
}

// Chips de los ítems que se fueron agregando en esta apertura de un formulario de vínculo
// múltiple (empresas, obras, personas...), con una X para deshacer cada uno sin cerrar el
// formulario — así se puede seguir buscando y sumando más de uno antes de terminar.
function ChipsAgregados({ items, core, coleccion, labelKey, onQuitar }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {items.map((id) => {
        const item = (core[coleccion] || []).find((x) => x.id === id);
        if (!item) return null;
        return (
          <span key={id} className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-sm" style={{ backgroundColor: core.tema.botonInactivo, color: core.tema.botonActivo }}>
            {item[labelKey]}
            {onQuitar && <button type="button" onClick={() => onQuitar(id)} aria-label="Quitar"><X size={12} /></button>}
          </span>
        );
      })}
    </div>
  );
}

// Botón "pill" para filas con varios desplegables que no entran con el patrón "Ver X/Ocultar
// X" + flecha (ocupa mucho ancho). Etiqueta fija; el estado de abierto/cerrado se lee por el
// color: apagado = texto de color sin relleno ni contorno (se funde con la tarjeta), encendido
// = fondo de ese color con texto blanco. "marcado" es independiente de ese estado: subraya el
// texto para indicar que el pill tiene contenido cargado, esté abierto o cerrado.
function PillToggle({ activo, marcado, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full border transition-colors ${marcado ? "underline underline-offset-2" : ""}`}
      style={{
        backgroundColor: activo ? "var(--tema-vinculo)" : "transparent",
        color: activo ? "#FFFFFF" : "var(--tema-vinculo)",
        borderColor: activo ? "var(--tema-vinculo)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}

function IconBtn({ onClick, children, label, danger }) {
  return (
    <button onClick={onClick} aria-label={label} className={`p-1.5 rounded-sm ${danger ? "text-[#C9A08A] hover:text-[var(--tema-peligro)]" : "text-[#8A8272] hover:text-[#2A2118]"}`}>
      {children}
    </button>
  );
}

function PrimaryBtn({ onClick, children, full, disabled, core }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={disabled ? undefined : core ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) } : undefined}
      className={`${full ? "w-full" : ""} ${disabled ? "bg-[#E7E2D8] text-[#A69C88] cursor-not-allowed" : core ? "hover:opacity-90" : "bg-[var(--tema-acento)] text-[#2A2118] hover:bg-[#D6791A]"} rounded-sm px-3.5 py-2.5 font-bold text-sm transition-colors flex items-center justify-center gap-1.5`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-[11px] font-bold tracking-wide text-[#6B6352] mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "w-full bg-white border border-[#D8D2C4] rounded-sm px-3 py-2 text-sm text-[#2A2118] placeholder-[#A69C88] focus:outline-none focus:ring-2 focus:ring-[var(--tema-acento)] focus:border-transparent";

// Selector de fecha y hora usado en toda la app donde se programa una acción o tarea: la
// fecha queda siempre a la vista, y la hora es opcional — se activa con "+ Establecer hora",
// que abre el selector nativo (reloj) con un paso explícito de "Aceptar" antes de cerrarlo.
// Ese paso evita el problema de algunos navegadores donde, al cerrar el selector nativo, el
// primer toque siguiente no llega al botón de guardar del formulario.
const AVISO_DEFAULT = { activo: false, cantidad: 30, unidad: "minutos" };

function SelectorFechaHora({ fecha, hora, onFecha, onHora, aviso, onAviso, labelFecha = "Fecha" }) {
  const [editandoHora, setEditandoHora] = useState(false);
  const [horaTemp, setHoraTemp] = useState(hora || "");
  const timeRef = useRef(null);
  const avisoActual = aviso || AVISO_DEFAULT;

  const abrirHora = () => { setHoraTemp(hora || ""); setEditandoHora(true); };
  const aceptarHora = () => { onHora(horaTemp); timeRef.current?.blur(); setEditandoHora(false); };
  const cancelarHora = () => setEditandoHora(false);
  const quitarHora = () => { onHora(""); setEditandoHora(false); onAviso?.({ ...avisoActual, activo: false }); };

  return (
    <div className="mb-3">
      <Field label={labelFecha}><input type="date" className={inputCls} value={fecha} onChange={(e) => onFecha(e.target.value)} /></Field>
      {editandoHora ? (
        <div className="mt-1.5">
          <input ref={timeRef} type="time" autoFocus className={inputCls} value={horaTemp} onChange={(e) => setHoraTemp(e.target.value)} />
          <div className="flex gap-2 mt-1.5">
            <button type="button" onClick={cancelarHora} className="flex-1 border border-[#D8D2C4] rounded-sm py-1.5 text-xs font-bold text-[#6B6352]">Cancelar</button>
            <button type="button" onClick={aceptarHora} className="flex-1 bg-[var(--tema-acento)] text-[#2A2118] rounded-sm py-1.5 text-xs font-bold">Aceptar</button>
          </div>
        </div>
      ) : hora ? (
        <>
          <div className="flex items-center justify-between mt-1.5">
            <button type="button" onClick={abrirHora} className="flex items-center gap-1 text-sm font-semibold text-[#2A2118]">
              <Clock3 size={13} className="text-[#8A8272]" /> {hora} hs
            </button>
            <IconBtn label="Quitar hora" danger onClick={quitarHora}><X size={14} /></IconBtn>
          </div>
          {onAviso && (
            <div className="mt-2">
              <label className="flex items-center gap-2 text-sm font-bold text-[#2A2118]">
                <input type="checkbox" checked={avisoActual.activo} onChange={(e) => onAviso({ ...avisoActual, activo: e.target.checked })} /> Avisar
              </label>
              {avisoActual.activo && (
                <div className="flex gap-2 mt-1.5">
                  <input type="number" min={1} className={inputCls} value={avisoActual.cantidad} onChange={(e) => onAviso({ ...avisoActual, cantidad: e.target.value })} />
                  <select className={inputCls} value={avisoActual.unidad} onChange={(e) => onAviso({ ...avisoActual, unidad: e.target.value })}>
                    <option value="minutos">minutos antes</option>
                    <option value="horas">horas antes</option>
                    <option value="dias">días antes</option>
                  </select>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <button type="button" onClick={abrirHora} className="text-xs font-bold text-[var(--tema-vinculo)]">+ Establecer hora</button>
      )}
    </div>
  );
}

// Elige texto claro u oscuro según qué tan clara sea la variante de fondo (usado sobre
// core.tema.botonActivo, que cambia mucho de tono entre paletas).
function contrastText(hex) {
  const c = (hex || "").replace("#", "");
  if (c.length !== 6) return "#2A2118";
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#2A2118" : "#FFFFFF";
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ backgroundColor: "#1C1914" }} className="fixed inset-0 flex items-start sm:items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto">
      <div className="bg-[#F7F5F0] w-full sm:max-w-md sm:rounded-sm rounded-t-lg flex flex-col max-h-full sm:max-h-[85vh] my-0 sm:my-auto">
        <div className="bg-[#F7F5F0] flex items-center justify-between px-4 py-3 border-b border-[#E4DECF] z-10 shrink-0">
          <h3 className="font-extrabold text-[#2A2118]">{title}</h3>
          <button onClick={onClose} aria-label="Cerrar"><X size={20} className="text-[#8A8272]" /></button>
        </div>
        <div className="p-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// Selector de color reutilizable (Configuración > Apariencia): reemplaza el <input type="color">
// nativo del navegador por un picker propio (gradiente + campo hex) en un modal.
function ColorField({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center justify-between py-1">
      <label className="text-sm text-[#2A2118]">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Elegir color para ${label}`}
        className="w-10 h-8 rounded-sm border border-[#E4DECF] cursor-pointer shrink-0"
        style={{ backgroundColor: value }}
      />
      {open && (
        <Modal title={label} onClose={() => setOpen(false)}>
          <div className="crm-color-picker">
            <HexColorPicker color={value} onChange={onChange} style={{ width: "100%", height: 180 }} />
          </div>
          <input
            className="mt-3 w-full text-sm font-mono text-center border border-[#D8D2C4] rounded-sm px-2 py-2"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            maxLength={7}
          />
          <button type="button" onClick={() => setOpen(false)} style={{ backgroundColor: "var(--tema-acento)", color: "#2A2118" }} className="w-full mt-3 rounded-sm py-2.5 font-bold text-sm">Listo</button>
        </Modal>
      )}
    </div>
  );
}

// Arma el texto de aviso de uso para un modal de confirmación de borrado: si el registro
// está siendo usado por otros, avisa cuántos y qué les pasa; si no, lo dice explícitamente.
function textoUsoRegistro(count, singular, plural, consecuencia) {
  if (count === 0) return "No está siendo usado por ningún otro registro. No se puede deshacer.";
  return `Se usa en ${count} ${count === 1 ? singular : plural} — ${consecuencia} No se puede deshacer.`;
}

// Modal de confirmación de borrado reutilizable (criterio fijo de la app: nunca se borra
// directo con una "x", siempre se pide confirmación).
function ConfirmDeleteModal({ title, texto, onCancel, onConfirm, confirmLabel = "Sí, eliminar" }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-[#2A2118] mb-4">{texto || "No se puede deshacer."}</p>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#6B6352]">Cancelar</button>
        <button onClick={onConfirm} style={{ backgroundColor: "var(--tema-peligro)", color: "#FFFFFF" }} className="flex-1 rounded-sm py-2.5 font-bold text-sm">{confirmLabel}</button>
      </div>
    </Modal>
  );
}

// Select de un catálogo simple (tipo de acción, cargo, categoría...) con la posibilidad
// de crear un registro nuevo ahí mismo, sin salir del formulario. "allowVacio" agrega
// una opción "— A definir —" al principio de la lista.
// Combobox con buscador: un input de texto que va filtrando una lista de opciones a medida
// que se escribe, en vez de un <select> plano donde hay que desplazarse para encontrar algo.
function BuscadorSelect({ opciones, value, onChange, placeholder, vacioLabel }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onClickFuera = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClickFuera);
    document.addEventListener("touchstart", onClickFuera);
    return () => {
      document.removeEventListener("mousedown", onClickFuera);
      document.removeEventListener("touchstart", onClickFuera);
    };
  }, []);

  const seleccionada = opciones.find((o) => o.id === value);
  const q = query.trim().toLowerCase();
  const filtradas = q ? opciones.filter((o) => o.label.toLowerCase().includes(q)) : opciones;

  const elegir = (id) => {
    onChange(id);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <input
        className={inputCls}
        placeholder={placeholder || "Buscar..."}
        value={open ? query : (seleccionada?.label || "")}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
      />
      {open && (
        // No es "absolute": si flotara por encima del contenido, un modal chico (con poco
        // alto) lo recortaría en vez de mostrarlo — al quedar en el flujo normal, el modal
        // simplemente crece o hace scroll para que la lista se vea completa.
        <div className="relative z-20 mt-1 max-h-48 overflow-y-auto bg-white border border-[#E4DECF] rounded-sm shadow-lg">
          {vacioLabel && (
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => elegir("")} className="w-full text-left px-3 py-2 text-sm text-[#8A8272] border-b border-[#E4DECF]">{vacioLabel}</button>
          )}
          {filtradas.length === 0 ? (
            <p className="px-3 py-2 text-sm text-[#A69C88]">Sin resultados.</p>
          ) : (
            filtradas.map((o) => (
              <button
                key={o.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(o.id)}
                className="w-full text-left px-3 py-2 text-sm text-[#2A2118]"
                style={{ backgroundColor: o.id === value ? "#F7F5F0" : "transparent" }}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Menciones "@Entidad": una mención se guarda como texto plano con el formato
// @[Nombre](Tipo:id) — así el texto sigue siendo editable en un input/textarea común, y
// cualquier pantalla que todavía no la muestre como enlace igual conserva el nombre legible.
const MENCION_REGEX = /@\[([^\]]+)\]\((\w+):([^)]+)\)/g;

// Para usar en atributos "title" o previews cortas: deja el nombre, sin el markup.
function textoPlanoDeMenciones(texto) {
  return (texto || "").replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1");
}

// Muestra un texto que puede tener menciones @[Nombre](Tipo:id) como enlaces clicables a la
// ficha correspondiente, dejando el resto como texto plano.
function TextoConMenciones({ texto, onOpen }) {
  if (!texto) return null;
  const regex = new RegExp(MENCION_REGEX);
  const partes = [];
  let ultimo = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(texto)) !== null) {
    if (match.index > ultimo) partes.push(<Fragment key={`t${key++}`}>{texto.slice(ultimo, match.index)}</Fragment>);
    const [, nombre, tipo, id] = match;
    partes.push(
      <button key={`m${key++}`} type="button" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onOpen(tipo.toLowerCase(), id); }} className="font-bold text-[var(--tema-mencion)] hover:underline underline-offset-2">
        @{nombre}
      </button>
    );
    ultimo = match.index + match[0].length;
  }
  if (ultimo < texto.length) partes.push(<Fragment key={`t${key++}`}>{texto.slice(ultimo)}</Fragment>);
  return <>{partes}</>;
}

// Campo de texto libre (input o textarea) con autocompletado "@Entidad": al escribir "@" y
// letras se abre una lista de Personas/Empresas/Obras que coincidan; al elegir una se inserta
// una mención @[Nombre](Tipo:id) en el texto, que TextoConMenciones muestra como enlace
// donde sea que ese texto se lea después.
function CampoConMenciones({ core, value, onChange, multiline, rows, placeholder, autoFocus, className }) {
  const [query, setQuery] = useState(null); // null = no se está armando una mención
  const [triggerPos, setTriggerPos] = useState(null);
  const wrapRef = useRef(null);
  const fieldRef = useRef(null);

  useEffect(() => {
    const onClickFuera = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setQuery(null); };
    document.addEventListener("mousedown", onClickFuera);
    document.addEventListener("touchstart", onClickFuera);
    return () => {
      document.removeEventListener("mousedown", onClickFuera);
      document.removeEventListener("touchstart", onClickFuera);
    };
  }, []);

  const entidades = useMemo(() => [
    ...core.personas.map((p) => ({ tipo: "Persona", id: p.id, nombre: p.nombre })),
    ...core.empresas.map((e) => ({ tipo: "Empresa", id: e.id, nombre: e.denominacion })),
    ...core.obras.map((o) => ({ tipo: "Obra", id: o.id, nombre: o.nombre })),
  ], [core.personas, core.empresas, core.obras]);

  const detectarMencion = (texto, cursor) => {
    const antes = texto.slice(0, cursor);
    const arroba = antes.lastIndexOf("@");
    if (arroba === -1) { setQuery(null); return; }
    const entreArrobaYCursor = antes.slice(arroba + 1);
    if (/[\s@]/.test(entreArrobaYCursor)) { setQuery(null); return; }
    setTriggerPos(arroba);
    setQuery(entreArrobaYCursor);
  };

  const onChangeTexto = (e) => {
    onChange(e.target.value);
    detectarMencion(e.target.value, e.target.selectionStart);
  };

  const elegir = (ent) => {
    const el = fieldRef.current;
    const cursor = el ? el.selectionStart : value.length;
    const antes = value.slice(0, triggerPos);
    const despues = value.slice(cursor);
    const insercion = `@[${ent.nombre}](${ent.tipo}:${ent.id}) `;
    const nuevoTexto = antes + insercion + despues;
    onChange(nuevoTexto);
    setQuery(null);
    requestAnimationFrame(() => {
      if (el) { el.focus(); const pos = antes.length + insercion.length; el.setSelectionRange(pos, pos); }
    });
  };

  const qq = (query || "").trim().toLowerCase();
  const opciones = (qq ? entidades.filter((e) => e.nombre.toLowerCase().includes(qq)) : entidades).slice(0, 6);

  const Campo = multiline ? "textarea" : "input";

  return (
    <div className="relative" ref={wrapRef}>
      <Campo
        ref={fieldRef}
        className={className || inputCls}
        rows={multiline ? (rows || 3) : undefined}
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={value}
        onChange={onChangeTexto}
        onClick={(e) => detectarMencion(value, e.target.selectionStart)}
        onKeyUp={(e) => { if (e.key === "Escape") setQuery(null); else detectarMencion(value, e.target.selectionStart); }}
      />
      {query !== null && (
        <div className="relative z-20 mt-1 max-h-40 overflow-y-auto bg-white border border-[#E4DECF] rounded-sm shadow-lg">
          {opciones.length === 0 ? (
            <p className="px-3 py-2 text-sm text-[#A69C88]">Sin resultados.</p>
          ) : (
            opciones.map((ent) => (
              <button
                key={`${ent.tipo}:${ent.id}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(ent)}
                className="w-full text-left px-3 py-2 text-sm text-[#2A2118] flex items-center justify-between gap-2"
              >
                <span className="truncate">{ent.nombre}</span>
                <span className="shrink-0 text-[10px] font-bold text-[#A69C88]">{ent.tipo}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SelectConCrear({ label, opciones, value, onChange, onCrear, placeholderCrear, allowVacio }) {
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");

  const confirmarCrear = () => {
    if (!nombreNuevo.trim()) return;
    const nuevo = onCrear(nombreNuevo.trim());
    onChange(nuevo.id);
    setNombreNuevo("");
    setCreando(false);
  };

  return (
    <Field label={label}>
      <div className="flex gap-2">
        <div className="flex-1">
          <BuscadorSelect
            opciones={opciones.map((o) => ({ id: o.id, label: o.nombre }))}
            value={value}
            onChange={onChange}
            vacioLabel={allowVacio ? "— A definir —" : null}
          />
        </div>
        <button
          type="button"
          onClick={() => setCreando((v) => !v)}
          aria-label="Crear nuevo"
          className="shrink-0 w-10 h-10 rounded-sm bg-[#E7E2D8] text-[#2A2118] flex items-center justify-center"
        >
          <Plus size={16} />
        </button>
      </div>
      {creando && (
        <div className="flex gap-2 mt-2">
          <input
            autoFocus
            className={inputCls}
            placeholder={placeholderCrear || "Nombre..."}
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmarCrear()}
          />
          <button type="button" onClick={confirmarCrear} className="text-[var(--tema-exito)]"><Check size={18} /></button>
          <button type="button" onClick={() => { setCreando(false); setNombreNuevo(""); }} className="text-[var(--tema-peligro)]"><X size={18} /></button>
        </div>
      )}
    </Field>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-[#A69C88]">
      {icon}
      <p className="text-sm text-center max-w-[240px]">{text}</p>
    </div>
  );
}

function TagsSection({ core, setCore, entidadTipo, entidadId }) {
  const [showPicker, setShowPicker] = useState(false);
  const asignadas = core.entidadEtiqueta.filter((r) => r.entidadTipo === entidadTipo && r.entidadId === entidadId);
  const tags = asignadas.map((r) => ({ rel: r, etiqueta: core.etiquetas.find((e) => e.id === r.etiquetaId) })).filter((t) => t.etiqueta);

  const quitar = (relId) => setCore((prev) => ({ ...prev, entidadEtiqueta: prev.entidadEtiqueta.filter((r) => r.id !== relId) }));

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 flex-wrap">
        {tags.map(({ rel, etiqueta }) => (
          <span key={rel.id} className="inline-flex items-center gap-1 text-[10px] font-bold tracking-widest px-2 py-1 rounded-sm bg-[#E7E2D8] text-[#4A4438]">
            {etiqueta.etiqueta}
            <button onClick={() => quitar(rel.id)} aria-label="Quitar etiqueta"><X size={10} /></button>
          </span>
        ))}
        <button onClick={() => setShowPicker(true)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-1 px-1 py-1">
          <Tag size={11} /> {tags.length === 0 ? "Agregar etiqueta" : "Agregar"}
        </button>
      </div>
      {showPicker && (
        <TagPickerForm
          core={core}
          setCore={setCore}
          entidadTipo={entidadTipo}
          entidadId={entidadId}
          asignadas={asignadas}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

function TagPickerForm({ core, setCore, entidadTipo, entidadId, asignadas, onClose }) {
  const [modo, setModo] = useState("existente");
  const [etiquetaId, setEtiquetaId] = useState("");
  const [nombre, setNombre] = useState("");
  const [categoriaId, setCategoriaId] = useState((core.categorias || [])[0]?.id || "");
  const [categoriaModo, setCategoriaModo] = useState("existente"); // 'existente' | 'nueva'
  const [nombreCategoriaNueva, setNombreCategoriaNueva] = useState("");

  const disponibles = core.etiquetas.filter((e) => e.aplicaA === entidadTipo && !asignadas.some((r) => r.etiquetaId === e.id));

  const asignar = () => {
    if (!etiquetaId) return;
    setCore((prev) => ({ ...prev, entidadEtiqueta: [...prev.entidadEtiqueta, { id: uid("et"), etiquetaId, entidadTipo, entidadId }] }));
    setEtiquetaId("");
  };

  const crearYAsignar = () => {
    if (!nombre.trim()) return;
    let catId = categoriaId;
    let categoriasActualizadas = core.categorias || [];
    if (categoriaModo === "nueva") {
      if (!nombreCategoriaNueva.trim()) return;
      const nuevaCat = { id: uid("CAT"), nombre: nombreCategoriaNueva.trim() };
      categoriasActualizadas = [...categoriasActualizadas, nuevaCat];
      catId = nuevaCat.id;
    }
    const nueva = { id: uid("ET"), etiqueta: nombre.trim(), categoriaId: catId, aplicaA: entidadTipo };
    setCore((prev) => ({
      ...prev,
      categorias: categoriasActualizadas,
      etiquetas: [...prev.etiquetas, nueva],
      entidadEtiqueta: [...prev.entidadEtiqueta, { id: uid("et"), etiquetaId: nueva.id, entidadTipo, entidadId }],
    }));
    setNombre("");
    setNombreCategoriaNueva("");
    setModo("existente");
  };

  return (
    <Modal title="Agregar etiquetas" onClose={onClose}>
      {asignadas.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {asignadas.map((r) => {
            const et = core.etiquetas.find((e) => e.id === r.etiquetaId);
            if (!et) return null;
            return (
              <span key={r.id} className="bg-[#D9F0DE] text-[#1B4D2E] text-xs font-bold px-2 py-1 rounded-sm">{et.etiqueta}</span>
            );
          })}
        </div>
      )}
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setModo("existente")}
          style={{ backgroundColor: modo === "existente" ? "#2A2F36" : "#E7E2D8", color: modo === "existente" ? "#FFFFFF" : "#6B6352" }}
          className="flex-1 py-2 rounded-sm text-sm font-bold"
        >Existente</button>
        <button
          type="button"
          onClick={() => setModo("nueva")}
          style={{ backgroundColor: modo === "nueva" ? "#2A2F36" : "#E7E2D8", color: modo === "nueva" ? "#FFFFFF" : "#6B6352" }}
          className="flex-1 py-2 rounded-sm text-sm font-bold"
        >Nueva etiqueta</button>
      </div>
      {modo === "existente" ? (
        disponibles.length === 0 ? (
          <p className="text-sm text-[#A69C88] mb-3">No hay más etiquetas de tipo "{entidadTipo}" disponibles — creá una nueva.</p>
        ) : (
          <>
            <Field label="Etiqueta">
              <BuscadorSelect
                opciones={disponibles.map((e) => ({ id: e.id, label: `${e.etiqueta} · ${(core.categorias || []).find((c) => c.id === e.categoriaId)?.nombre || "sin categoría"}` }))}
                value={etiquetaId}
                onChange={setEtiquetaId}
                placeholder="Buscar etiqueta..."
              />
            </Field>
            <button type="button" disabled={!etiquetaId} onClick={asignar} className="w-full border border-[#E4DECF] rounded-sm py-2.5 font-bold text-sm text-[#2A2118] disabled:text-[#C9C1AE] disabled:cursor-not-allowed mb-3">+ Agregar</button>
          </>
        )
      ) : (
        <>
          <Field label="Etiqueta *"><input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Zona Norte" /></Field>

          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setCategoriaModo("existente")}
              style={{ backgroundColor: categoriaModo === "existente" ? "#2A2F36" : "#E7E2D8", color: categoriaModo === "existente" ? "#FFFFFF" : "#6B6352" }}
              className="flex-1 py-1.5 rounded-sm text-xs font-bold"
            >Categoría existente</button>
            <button
              type="button"
              onClick={() => setCategoriaModo("nueva")}
              style={{ backgroundColor: categoriaModo === "nueva" ? "#2A2F36" : "#E7E2D8", color: categoriaModo === "nueva" ? "#FFFFFF" : "#6B6352" }}
              className="flex-1 py-1.5 rounded-sm text-xs font-bold"
            >Nueva categoría</button>
          </div>
          {categoriaModo === "existente" ? (
            <Field label="Categoría">
              <BuscadorSelect
                opciones={(core.categorias || []).map((c) => ({ id: c.id, label: c.nombre }))}
                value={categoriaId}
                onChange={setCategoriaId}
                placeholder="Buscar categoría..."
              />
            </Field>
          ) : (
            <Field label="Nueva categoría"><input className={inputCls} value={nombreCategoriaNueva} onChange={(e) => setNombreCategoriaNueva(e.target.value)} placeholder="Ej: Zona, Rubro, Prioridad" /></Field>
          )}

          <p className="text-xs text-[#A69C88] mb-3">Se creará como etiqueta de tipo "{entidadTipo}" y se asigna automáticamente.</p>
          <PrimaryBtn full onClick={crearYAsignar}>Crear y asignar</PrimaryBtn>
        </>
      )}
      <button type="button" onClick={onClose} className="w-full mt-3 border border-[#E4DECF] rounded-sm py-2.5 font-bold text-sm text-[#2A2118]">Listo</button>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function CRM({ userId, onLogout }) {
  const [core, setCore] = useState(null);
  const [acciones, setAcciones] = useState(null);
  const [tab, setTab] = useState("agenda");
  const [detail, setDetail] = useState(null); // { type: 'persona'|'empresa'|'obra', id }
  const [search, setSearch] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [guardado, setGuardado] = useState("ok"); // 'ok' | 'guardando' | 'error'
  const [showResumenHoy, setShowResumenHoy] = useState(false);
  const primerRenderCore = useRef(true);
  const primerRenderAcciones = useRef(true);
  const resumenMostrado = useRef(false);
  const coreRef = useRef(null);
  const accionesRef = useRef(null);
  const aplicandoRemotoCore = useRef(false);
  const aplicandoRemotoAcciones = useRef(false);
  // Última fecha de guardado (propia o recibida) que ya se aplicó — un aviso de tiempo real
  // más viejo o igual que esto se ignora, para que un aviso demorado o fuera de orden no
  // pueda pisar un cambio más reciente.
  const ultimoUpdatedAtRef = useRef(null);

  useEffect(() => { coreRef.current = core; }, [core]);
  useEffect(() => { accionesRef.current = acciones; }, [acciones]);

  // Tiempo real: cuando otro dispositivo con la misma cuenta guarda un cambio, este
  // dispositivo lo recibe solo y actualiza su copia local, sin que el usuario tenga
  // que refrescar manualmente. Requiere Realtime habilitado en la tabla crm_data.
  useEffect(() => {
    if (!userId) return;
    const canal = supabase
      .channel(`crm_data_${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "crm_data", filter: `user_id=eq.${userId}` },
        (payload) => {
          const nuevo = payload.new;
          if (!nuevo) return;
          if (nuevo.updated_at && ultimoUpdatedAtRef.current && nuevo.updated_at <= ultimoUpdatedAtRef.current) return;
          if (nuevo.updated_at) ultimoUpdatedAtRef.current = nuevo.updated_at;
          if (nuevo.core && JSON.stringify(nuevo.core) !== JSON.stringify(coreRef.current)) {
            aplicandoRemotoCore.current = true;
            setCore(nuevo.core);
          }
          if (nuevo.acciones && JSON.stringify(nuevo.acciones) !== JSON.stringify(accionesRef.current)) {
            aplicandoRemotoAcciones.current = true;
            setAcciones(nuevo.acciones);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [userId]);

  useEffect(() => {
    (async () => {
      let row = null;
      try { row = await loadCrmRow(userId); } catch { row = null; }
      let c = row ? normalizeCore(row.core) : seedCore();
      let a = row ? row.acciones : seedAcciones();
      if (!row) {
        await insertCrmRow(userId, c, a);
        ultimoUpdatedAtRef.current = new Date().toISOString();
      } else {
        ultimoUpdatedAtRef.current = row.updated_at || new Date().toISOString();
      }
      // Migración: las acciones de versiones anteriores no tenían hiloId (eran de prueba).
      // Se reinician hilos + acciones con datos de ejemplo del nuevo sistema.
      if (a.some((accion) => !accion.hiloId)) {
        c = { ...c, hilos: seedCore().hilos };
        a = seedAcciones();
        const ts = new Date().toISOString();
        ultimoUpdatedAtRef.current = ts;
        await saveCrmField(userId, "core", c, 0, ts);
        await saveCrmField(userId, "acciones", a, 0, ts);
      }
      // Migración: asignar número correlativo global y separar "nota planificada" de "nota de lo hecho".
      if (a.some((accion) => typeof accion.numero !== "number")) {
        a = migrarNumerosYNotas(a);
        const ts = new Date().toISOString();
        ultimoUpdatedAtRef.current = ts;
        await saveCrmField(userId, "acciones", a, 0, ts);
      }
      // Migración: las tareas pasan a tener fecha/hora/notas propias, en vez de vivir en su
      // acción pendiente — a las que ya tenían una, se les copia esa fecha/hora una sola vez.
      if (c.hilos.some((h) => h.tipo === "tarea" && typeof h.fecha === "undefined")) {
        c = {
          ...c,
          hilos: c.hilos.map((h) => {
            if (h.tipo !== "tarea" || typeof h.fecha !== "undefined") return h;
            const pendiente = a.find((acc) => acc.hiloId === h.id && acc.estado === "Pendiente");
            return { ...h, notas: h.notas || "", fecha: pendiente?.fechaProgramada || "", hora: pendiente?.horaProgramada || "" };
          }),
        };
        const ts = new Date().toISOString();
        ultimoUpdatedAtRef.current = ts;
        await saveCrmField(userId, "core", c, 0, ts);
      }
      setCore(c);
      setAcciones(a);
    })();
  }, [userId]);

  useEffect(() => {
    if (!core) return;
    if (primerRenderCore.current) { primerRenderCore.current = false; return; }
    if (aplicandoRemotoCore.current) { aplicandoRemotoCore.current = false; return; }
    const ts = new Date().toISOString();
    ultimoUpdatedAtRef.current = ts;
    setGuardado("guardando");
    saveCrmField(userId, "core", core, 0, ts).then((ok) => setGuardado(ok ? "ok" : "error"));
  }, [core, userId]);

  useEffect(() => {
    if (!acciones) return;
    if (primerRenderAcciones.current) { primerRenderAcciones.current = false; return; }
    if (aplicandoRemotoAcciones.current) { aplicandoRemotoAcciones.current = false; return; }
    const ts = new Date().toISOString();
    ultimoUpdatedAtRef.current = ts;
    setGuardado("guardando");
    saveCrmField(userId, "acciones", acciones, 0, ts).then((ok) => setGuardado(ok ? "ok" : "error"));
  }, [acciones, userId]);

  const hayResumenParaMostrar = (c, a) => {
    if (!c || !a) return false;
    const t = todayISO();
    const limiteProximos = addDaysISO(t, c.parametros.diasProximos ?? 7);
    const hayAccionPendiente = a.some((acc) => acc.estado === "Pendiente" && acc.fechaProgramada && acc.fechaProgramada <= limiteProximos);
    const hayTareaConFecha = c.hilos.some((h) => h.tipo === "tarea" && h.estado === "Activo" && h.fecha && h.fecha <= limiteProximos);
    return hayAccionPendiente || hayTareaConFecha;
  };

  useEffect(() => {
    if (!core || !acciones) return;
    if (resumenMostrado.current) return;
    resumenMostrado.current = true;
    if (hayResumenParaMostrar(core, acciones)) setShowResumenHoy(true);
  }, [core, acciones]);

  // Además del disparador de arriba (una vez al abrir la app), el resumen se vuelve a mostrar
  // cada vez que se entra a la pestaña Calendario. Cerrarlo no cambia de pestaña, así que se
  // queda en Calendario como antes.
  useEffect(() => {
    if (tab !== "calendario") return;
    if (hayResumenParaMostrar(core, acciones)) setShowResumenHoy(true);
  }, [tab]); // eslint-disable-line

  if (!core || !acciones) {
    return <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center text-[#A69C88] text-sm">Cargando...</div>;
  }

  const openDetail = (type, id) => { setDetail({ type, id }); };
  const closeDetail = () => setDetail(null);

  const NAV = [
    { id: "agenda", label: "Seguimientos", icon: Trello },
    { id: "tareas", label: "Tareas", icon: ListChecks },
    { id: "calendario", label: "Calendario", icon: CalendarClock },
    { id: "relaciones", label: "Relaciones", icon: GitBranch },
    { id: "informes", label: "Informes", icon: BarChart3 },
  ];

  const MENU_ABM = [
    { id: "personas", label: "Personas", icon: Users },
    { id: "empresas", label: "Empresas", icon: Building2 },
    { id: "obras", label: "Obras", icon: HardHat },
    { id: "tiposAccion", label: "Tipos de acción", icon: Layers },
    { id: "etiquetas", label: "Etiquetas", icon: Tags },
    { id: "categorias", label: "Categorías de etiquetas", icon: FolderKanban },
    { id: "tiposRelacion", label: "Tipos de relación", icon: GitBranch },
  ];

  return (
    <ErrorBoundary onReset={() => window.location.reload()}>
    <div className="relative h-[100dvh] overflow-hidden bg-[#F7F5F0] flex justify-center">
      <style>{`
        :root {
          ${Object.keys(TEMA_DEFAULT).map((clave) => `--tema-${clave}: ${core.tema[clave]};`).join("\n          ")}
        }
        .bg-white { background-color: ${core.tema.tarjeta} !important; }
        .bg-\\[\\#F7F5F0\\] { background-color: ${core.tema.fondo} !important; }
        .border-\\[\\#E4DECF\\] { border-color: ${core.tema.linea} !important; }
        .border-\\[\\#EFEBE0\\] { border-color: ${core.tema.linea} !important; }
        .border-\\[\\#D8D2C4\\] { border-color: ${core.tema.linea} !important; }
        .text-\\[\\#2A2118\\] { color: ${core.tema.ink} !important; }
        .text-\\[\\#6B6352\\] { color: ${core.tema.mutedBase} !important; }
        .text-\\[\\#8A8272\\] { color: ${core.tema.mutedBase} !important; }
        .text-\\[\\#A69C88\\] { color: ${core.tema.mutedBase} !important; }
        .text-\\[\\#C9C1AE\\] { color: ${core.tema.mutedBase} !important; }
        .text-\\[\\#D8D2C4\\] { color: ${core.tema.mutedBase} !important; }
        .placeholder-\\[\\#A69C88\\]::placeholder { color: ${core.tema.mutedBase} !important; }
      `}</style>
      <div className="w-full max-w-md px-3 pt-5 flex flex-col h-full">
        <header className="mb-4 px-1 flex items-start justify-between gap-2 shrink-0">
          <div>
            <h1 className="text-xl font-extrabold text-[#2A2118] tracking-tight">{core.parametros.tituloApp || "Seguimiento comercial"}</h1>
            <p className={`text-[10px] font-bold tracking-wide mt-0.5 ${guardado === "error" ? "text-[var(--tema-peligro)]" : "text-[#A69C88]"}`}>
              {guardado === "guardando" ? "Guardando..." : guardado === "error" ? "Error al guardar" : "Guardado"}
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-1.5">
            <button
              onClick={() => { setTab("buscar"); setDetail(null); }}
              aria-label="Buscar"
              style={
                tab === "buscar" && !detail
                  ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) }
                  : { backgroundColor: core.tema.botonInactivo, color: core.tema.ink }
              }
              className="flex items-center justify-center w-10 h-10 rounded-sm"
            >
              <Search size={17} />
            </button>
            <button
              onClick={() => setShowMenu(true)}
              aria-label="Menú"
              style={{ backgroundColor: core.tema.botonInactivo, color: core.tema.ink }}
              className="flex items-center justify-center w-10 h-10 rounded-sm"
            >
              <Menu size={17} />
            </button>
          </div>
        </header>

        <nav className="flex gap-1 mb-4 shrink-0">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = tab === n.id && !detail;
            return (
              <button
                key={n.id}
                onClick={() => { setTab(n.id); setDetail(null); }}
                style={active ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) } : { backgroundColor: core.tema.botonInactivo, color: core.tema.ink }}
                className="flex-1 min-w-0 h-12 flex flex-col items-center justify-center gap-0.5 rounded-sm text-[9px] font-bold transition-colors"
                title={n.label}
              >
                <Icon size={15} /> <span className="truncate max-w-full px-0.5">{n.label}</span>
              </button>
            );
          })}
        </nav>

        <main className="flex-1 min-h-0 overflow-y-auto pb-6">
          {detail ? (
            <ErrorBoundary key={`${detail.type}-${detail.id}`} onReset={closeDetail}>
              <DetailRouter detail={detail} core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onClose={closeDetail} onOpen={openDetail} />
            </ErrorBoundary>
          ) : (
            <ErrorBoundary key={tab} onReset={() => setTab("agenda")}>
              {tab === "agenda" && <AgendaView core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onOpen={openDetail} />}
              {tab === "tareas" && <TareasView core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onOpen={openDetail} />}
              {tab === "calendario" && <CalendarioView core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onOpen={openDetail} t={todayISO()} />}
              {tab === "personas" && <PersonasView core={core} setCore={setCore} onOpen={openDetail} />}
              {tab === "empresas" && <EmpresasView core={core} setCore={setCore} onOpen={openDetail} />}
              {tab === "obras" && <ObrasView core={core} setCore={setCore} onOpen={openDetail} />}
              {tab === "tiposAccion" && <TiposAccionView core={core} setCore={setCore} acciones={acciones} />}
              {tab === "etiquetas" && <EtiquetasView core={core} setCore={setCore} />}
              {tab === "categorias" && <CategoriasView core={core} setCore={setCore} />}
              {tab === "tiposRelacion" && <TiposRelacionView core={core} setCore={setCore} />}
              {tab === "relaciones" && <RelacionesView core={core} setCore={setCore} onOpen={openDetail} />}
              {tab === "informes" && <InformesView core={core} acciones={acciones} />}
              {tab === "buscar" && <BuscarView core={core} search={search} setSearch={setSearch} onOpen={openDetail} />}
              {tab === "config" && <ConfigView core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} />}
            </ErrorBoundary>
          )}
        </main>
      </div>

      {showMenu && (
        <Modal title="Menú" onClose={() => setShowMenu(false)}>
          <div>
            <p className="text-[10px] font-bold tracking-wide text-[#A69C88] mb-2">ABM</p>
            <div className="space-y-1 mb-4">
              {MENU_ABM.map((item) => {
                const Icon = item.icon;
                const active = tab === item.id && !detail;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setTab(item.id); setDetail(null); setShowMenu(false); }}
                    style={active ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) } : { color: core.tema.ink }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-sm font-semibold"
                  >
                    <Icon size={16} className={active ? "" : "text-[#8A8272]"} /> {item.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] font-bold tracking-wide text-[#A69C88] mb-2 pt-3 border-t border-[#E4DECF]">Sistema</p>
            <div className="space-y-1">
              <button
                onClick={() => { setTab("config"); setDetail(null); setShowMenu(false); }}
                style={tab === "config" && !detail ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) } : { color: core.tema.ink }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-sm font-semibold"
              >
                <Settings size={16} className={tab === "config" && !detail ? "" : "text-[#8A8272]"} /> Configuración
              </button>
              {onLogout && (
                <button
                  onClick={() => { setShowMenu(false); onLogout(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-sm font-semibold text-[var(--tema-peligro)]"
                >
                  <LogOut size={16} /> Cerrar sesión
                </button>
              )}
              <p className="text-center text-[10px] font-mono text-[#C9C1AE] pt-3">Versión {APP_VERSION}</p>
            </div>
          </div>
        </Modal>
      )}

      {showResumenHoy && (
        <ResumenHoyModal core={core} acciones={acciones} onOpen={openDetail} onClose={() => setShowResumenHoy(false)} />
      )}
    </div>
    </ErrorBoundary>
  );
}

function ResumenHoyModal({ core, acciones, onOpen, onClose }) {
  const t = todayISO();
  const diasProximos = core.parametros.diasProximos ?? 7;
  const limiteProximos = addDaysISO(t, diasProximos);

  const esTareaAccion = (a) => core.hilos.find((h) => h.id === a.hiloId)?.tipo === "tarea";

  // Un "evento" es, o bien una acción pendiente (de un seguimiento o del hilo interno de
  // una tarea), o bien la fecha propia de una tarea simple (hilo.fecha) — se combinan en
  // una sola lista para armar los tres grupos de abajo.
  const eventosDeAccion = acciones
    .filter((a) => a.estado === "Pendiente" && a.fechaProgramada)
    .map((a) => ({ key: `a-${a.id}`, fecha: a.fechaProgramada, esTarea: esTareaAccion(a), accion: a }));
  const eventosDeTarea = core.hilos
    .filter((h) => h.tipo === "tarea" && h.estado === "Activo" && h.fecha)
    .map((h) => ({ key: `h-${h.id}`, fecha: h.fecha, esTarea: true, hilo: h }));
  const eventos = [...eventosDeAccion, ...eventosDeTarea];

  const hoy = eventos.filter((e) => e.fecha === t);
  const vencidas = eventos.filter((e) => e.fecha < t).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const proximos = eventos.filter((e) => e.fecha > t && e.fecha <= limiteProximos).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));

  const Fila = ({ e }) => {
    if (e.hilo) {
      const hilo = e.hilo;
      return (
        <button
          onClick={() => { onClose(); onOpen("hilo", hilo.id); }}
          className="w-full text-left bg-white border border-[#E4DECF] rounded-sm p-2.5 mb-1.5"
        >
          <p className="text-sm font-semibold text-[#2A2118] truncate">{textoPlanoDeMenciones(hilo.titulo)}</p>
          {(hilo.hora || hilo.notas) && (
            <p className="text-xs text-[#6B6352] truncate">{textoPlanoDeMenciones([hilo.hora, hilo.notas].filter(Boolean).join(" · "))}</p>
          )}
        </button>
      );
    }
    const a = e.accion;
    const hilo = core.hilos.find((h) => h.id === a.hiloId);
    if (!hilo) return null;
    const tipoAccion = core.tiposAccion.find((ta) => ta.id === a.tipoAccionId);
    const esTarea = hilo.tipo === "tarea";
    const persona = esTarea ? null : personaPrincipalDeHilo(hilo, core);
    return (
      <button
        onClick={() => { onClose(); onOpen("hilo", hilo.id); }}
        className="w-full text-left bg-white border border-[#E4DECF] rounded-sm p-2.5 mb-1.5"
      >
        <p className="text-sm font-semibold text-[#2A2118] truncate">{textoPlanoDeMenciones(esTarea ? hilo.titulo : (persona?.nombre || hilo.titulo))}</p>
        <p className="text-xs text-[#6B6352] truncate">{textoPlanoDeMenciones([tipoAccion?.nombre, esTarea ? "" : hilo.titulo, a.notaPlanificada].filter(Boolean).join(" · "))}</p>
      </button>
    );
  };

  // Separa un grupo (Hoy/Vencidas/Próximos) en Tareas y Seguimientos — solo muestra la
  // etiqueta de la sub-lista que tiene contenido, y la línea entre ambas si hay las dos.
  const Grupo = ({ items }) => {
    const tareas = items.filter((e) => e.esTarea);
    const seguimientos = items.filter((e) => !e.esTarea);
    return (
      <>
        {tareas.length > 0 && (
          <div className={seguimientos.length > 0 ? "mb-2" : ""}>
            <p className="text-[10px] font-bold tracking-wide text-[#8A8272] mb-1">Tareas</p>
            {tareas.map((e) => <Fila key={e.key} e={e} />)}
          </div>
        )}
        {seguimientos.length > 0 && (
          <div className={tareas.length > 0 ? "border-t border-[#EFEBE0] pt-2" : ""}>
            <p className="text-[10px] font-bold tracking-wide text-[#8A8272] mb-1">Seguimientos</p>
            {seguimientos.map((e) => <Fila key={e.key} e={e} />)}
          </div>
        )}
      </>
    );
  };

  return (
    <Modal title="Resumen de hoy" onClose={onClose}>
      <div>
        <p className="text-sm font-bold tracking-wide text-[#6B6352] mb-1.5">Hoy{hoy.length > 0 ? ` (${hoy.length})` : ""}</p>
        {hoy.length === 0 ? (
          <p className="text-xs text-[#A69C88] mb-3">Nada programado para hoy.</p>
        ) : (
          <div className="mb-3"><Grupo items={hoy} /></div>
        )}
        <p className="text-sm font-bold tracking-wide text-[var(--tema-urgenciaVencida)] mb-1.5">Vencidas{vencidas.length > 0 ? ` (${vencidas.length})` : ""}</p>
        {vencidas.length === 0 ? (
          <p className="text-xs text-[#A69C88] mb-3">No hay pendientes vencidas.</p>
        ) : (
          <div className="mb-3"><Grupo items={vencidas} /></div>
        )}
        <p className="text-sm font-bold tracking-wide text-[#6B6352] mb-1.5">Próximos {diasProximos} días{proximos.length > 0 ? ` (${proximos.length})` : ""}</p>
        {proximos.length === 0 ? (
          <p className="text-xs text-[#A69C88]">Nada programado para los próximos {diasProximos} días.</p>
        ) : (
          <Grupo items={proximos} />
        )}
      </div>
    </Modal>
  );
}

// Atrapa errores de JavaScript que rompen el render y, en vez de dejar la pantalla en
// blanco en silencio, muestra el mensaje y el detalle técnico — para poder mandar una
// captura de pantalla y diagnosticar sin acceso a la consola del navegador.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("Error atrapado:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="bg-white border border-[var(--tema-peligro)] rounded-sm p-4">
          <p className="text-sm font-extrabold text-[var(--tema-peligro)] mb-1.5">Se produjo un error</p>
          <p className="text-xs text-[#6B6352] mb-3">Sacá una captura de esta pantalla completa y mandámela — con eso alcanza para arreglarlo.</p>
          <pre className="text-[11px] leading-snug bg-[#F7F5F0] border border-[#E4DECF] rounded-sm p-2.5 whitespace-pre-wrap break-words text-[#2A2118] mb-3 max-h-64 overflow-auto">
            {String(this.state.error?.message || this.state.error)}
            {this.state.error?.stack ? `\n\n${this.state.error.stack}` : ""}
          </pre>
          {this.props.onReset && (
            <button
              onClick={() => { this.setState({ error: null }); this.props.onReset(); }}
              className="w-full rounded-sm py-2.5 font-bold text-sm bg-[var(--tema-acento)] text-[#2A2118]"
            >
              Volver
            </button>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

function DetailRouter({ detail, core, setCore, acciones, setAcciones, onClose, onOpen }) {
  if (detail.type === "persona") return <PersonaDetail id={detail.id} core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onClose={onClose} onOpen={onOpen} />;
  if (detail.type === "empresa") return <EmpresaDetail id={detail.id} core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onClose={onClose} onOpen={onOpen} />;
  if (detail.type === "obra") return <ObraDetail id={detail.id} core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onClose={onClose} onOpen={onOpen} />;
  if (detail.type === "hilo") return <HiloScreen id={detail.id} core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onClose={onClose} onOpen={onOpen} />;
  return null;
}

function BackHeader({ title, onClose }) {
  return (
    <button onClick={onClose} className="flex items-center gap-1.5 text-sm font-bold text-[#6B6352] mb-3">
      <ArrowLeft size={16} /> Volver
    </button>
  );
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------
function AgendaView({ core, setCore, acciones, setAcciones, onOpen }) {
  const t = todayISO();

  return (
    <div>
      <KanbanView core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onOpen={onOpen} t={t} soloTipo="cliente" />
    </div>
  );
}

// Crea un hilo eligiendo libremente persona, empresa y/o obra (con al menos una de las tres),
// sin exigir una acción — se completa después, desde la ficha del hilo.
// Formulario unificado para crear un hilo desde cualquier punto de entrada (Seguimientos,
// Personas, Empresas, Obras): simple por defecto (título + vínculos opcionales), con una
// sección opcional para cargar el primer contacto y programar la próxima acción sin que
// sea obligatorio desde el inicio. "personaFija" ata el hilo a esa persona (y habilita el
// flujo de vincular empresa/obra a ese contacto); "empresaFijaId"/"obraFijaId" atan el hilo
// a esa empresa/obra sin mostrar el select correspondiente.
function NuevoHiloForm({ core, setCore, acciones, setAcciones, personaFija, empresaFijaId, obraFijaId, onCreated, onCancelar }) {
  const [titulo, setTitulo] = useState("");
  const [personaId, setPersonaId] = useState("");
  // Al arrancar desde una persona o una empresa fijas, se precargan también todas las
  // empresas/obras que dependen de ellas — después es más fácil corregir sacando lo que
  // sobra que buscando lo que falta.
  const [empresaIds, setEmpresaIds] = useState(() => {
    let base = empresaFijaId ? [empresaFijaId] : [];
    if (personaFija) base = [...new Set([...base, ...empresaIdsDePersona(core, personaFija.id)])];
    if (obraFijaId) {
      const dueña = empresaDueñaDeObra(core, obraFijaId);
      if (dueña && !base.includes(dueña)) base.push(dueña);
    }
    return base;
  });
  const [empresaParaAgregar, setEmpresaParaAgregar] = useState("");
  const [obraIds, setObraIds] = useState(() => {
    let base = obraFijaId ? [obraFijaId] : [];
    if (personaFija) base = [...new Set([...base, ...obraIdsDirectasDePersona(core, personaFija.id)])];
    const empresasBase = empresaFijaId ? [empresaFijaId] : [];
    if (personaFija) empresasBase.push(...empresaIdsDePersona(core, personaFija.id));
    const obrasDeEmpresas = empresasBase.flatMap((eid) => obraIdsDeEmpresa(core, eid));
    return [...new Set([...base, ...obrasDeEmpresas])];
  });
  const [obraParaAgregar, setObraParaAgregar] = useState("");
  const [showVincularEmpresa, setShowVincularEmpresa] = useState(false);
  const [showVincularObra, setShowVincularObra] = useState(false);
  const [showPrimerContacto, setShowPrimerContacto] = useState(false);
  // Selección múltiple: crea un hilo por cada persona elegida, todos con el mismo título
  // y la misma acción — sin vincular empresas/obras (eso se suma después, editando cada uno).
  const permiteMultiple = !personaFija && !empresaFijaId && !obraFijaId;
  const [seleccionMultiple, setSeleccionMultiple] = useState(false);
  const [personaIdsMultiple, setPersonaIdsMultiple] = useState([]);
  const [personaParaAgregar, setPersonaParaAgregar] = useState("");

  const [tipoAccionId1, setTipoAccionId1] = useState(tipoDefaultId(core));
  const [notas1, setNotas1] = useState("");
  const [programarProxima, setProgramarProxima] = useState(true);
  const [tipoAccionId2, setTipoAccionId2] = useState(tipoDefaultId(core));
  const [notas2, setNotas2] = useState("");
  const [modoFecha, setModoFecha] = useState("periodo");
  const [cantidad, setCantidad] = useState(1);
  const [unidad, setUnidad] = useState("semanas");
  const [fechaEspecifica, setFechaEspecifica] = useState(todayISO());
  const [horaEspecifica, setHoraEspecifica] = useState("");
  const [avisoEspecifica, setAvisoEspecifica] = useState(AVISO_DEFAULT);
  const [confirmarEspecifica, setConfirmarEspecifica] = useState(false);
  const [prioridad, setPrioridad] = useState("Media");
  const [recurrente, setRecurrente] = useState(false);
  const [repiteCadaN, setRepiteCadaN] = useState(1);
  const [repiteUnidad, setRepiteUnidad] = useState("meses");
  const [preview, setPreview] = useState(null);

  const empresasDeLaPersona = useMemo(() => {
    if (!personaFija) return [];
    return empresaIdsDePersona(core, personaFija.id).map((eid) => core.empresas.find((e) => e.id === eid)).filter(Boolean);
  }, [personaFija, core.vinculos, core.empresas]);

  const obrasDeLasEmpresas = useMemo(() => {
    if (empresaIds.length === 0) return [];
    const oids = [...new Set(empresaIds.flatMap((eid) => obraIdsDeEmpresa(core, eid)))];
    return oids.map((oid) => core.obras.find((o) => o.id === oid)).filter(Boolean);
  }, [empresaIds, core.vinculos, core.obras]);

  const agregarEmpresa = (empresaId) => {
    if (!empresaId) return;
    setEmpresaIds((ids) => (ids.includes(empresaId) ? ids : [...ids, empresaId]));
    const obrasDeEsaEmpresa = obraIdsDeEmpresa(core, empresaId);
    if (obrasDeEsaEmpresa.length > 0) setObraIds((ids) => [...new Set([...ids, ...obrasDeEsaEmpresa])]);
  };
  const quitarEmpresa = (empresaId) => setEmpresaIds((ids) => ids.filter((x) => x !== empresaId));
  const agregarObra = (nuevoObraId) => {
    if (!nuevoObraId) return;
    setObraIds((ids) => (ids.includes(nuevoObraId) ? ids : [...ids, nuevoObraId]));
    const dueña = empresaDueñaDeObra(core, nuevoObraId);
    if (dueña) agregarEmpresa(dueña);
  };
  const quitarObra = (obraId) => setObraIds((ids) => ids.filter((x) => x !== obraId));
  // Al elegir una persona en el flujo libre (sin personaFija), precarga sus empresas y las
  // obras de esas empresas — mismo criterio que al entrar desde la ficha de una persona.
  const elegirPersona = (nuevaPersonaId) => {
    setPersonaId(nuevaPersonaId);
    if (!nuevaPersonaId) return;
    const empresasDeEsaPersona = empresaIdsDePersona(core, nuevaPersonaId);
    const obrasDirectas = obraIdsDirectasDePersona(core, nuevaPersonaId);
    const obrasDeEsasEmpresas = empresasDeEsaPersona.flatMap((eid) => obraIdsDeEmpresa(core, eid));
    if (empresasDeEsaPersona.length > 0) setEmpresaIds((ids) => [...new Set([...ids, ...empresasDeEsaPersona])]);
    if (obrasDirectas.length + obrasDeEsasEmpresas.length > 0) setObraIds((ids) => [...new Set([...ids, ...obrasDirectas, ...obrasDeEsasEmpresas])]);
  };

  useEffect(() => {
    if (showPrimerContacto && programarProxima && modoFecha === "periodo") {
      const base = addPeriod(todayISO(), Number(cantidad) || 1, unidad);
      setPreview(computeSmartDate(base, acciones, core.parametros));
    }
  }, [showPrimerContacto, programarProxima, modoFecha, cantidad, unidad]); // eslint-disable-line

  const especificaInhabil = showPrimerContacto && programarProxima && modoFecha === "especifica" && esFechaInhabil(fechaEspecifica, core.parametros);
  const faltaVinculo = seleccionMultiple
    ? personaIdsMultiple.length === 0
    : !personaFija && !empresaFijaId && !obraFijaId && !personaId && empresaIds.length === 0 && obraIds.length === 0;

  // Arma las 1-2 acciones (primer contacto + próxima, según lo cargado en el formulario)
  // para un hilo recién creado — se reusa igual para la creación simple y la múltiple.
  const accionesParaHilo = (hiloId, hoy, siguienteNumeroInicial) => {
    let siguienteNumero = siguienteNumeroInicial;
    const idPrimera = uid("A");
    const nuevas = [{ id: idPrimera, hiloId, tipoAccionId: tipoAccionId1, estado: "Realizada", fechaRealizada: hoy, fechaProgramada: "", horaProgramada: "", prioridad: "", notaPlanificada: "", notaHecho: notas1, origenId: null, destinoId: null, numero: siguienteNumero++, recurrente: false, repiteCadaN: null, repiteUnidad: null, fechaCreacion: hoy, secuencia: Date.now() }];
    if (programarProxima) {
      const fecha = modoFecha === "periodo" ? (preview || hoy) : (fechaEspecifica || hoy);
      const hora = modoFecha === "especifica" ? horaEspecifica : "";
      const aviso = modoFecha === "especifica" && hora && avisoEspecifica.activo ? avisoEspecifica : null;
      const idNueva = uid("A");
      nuevas.push({ id: idNueva, hiloId, tipoAccionId: tipoAccionId2, estado: "Pendiente", fechaRealizada: "", fechaProgramada: fecha, horaProgramada: hora, prioridad, notaPlanificada: notas2, notaHecho: "", origenId: idPrimera, destinoId: null, numero: siguienteNumero++, recurrente, repiteCadaN: recurrente ? Number(repiteCadaN) : null, repiteUnidad: recurrente ? repiteUnidad : null, fechaCreacion: hoy, secuencia: Date.now(), aviso, avisoEnviado: false });
      nuevas[0] = { ...nuevas[0], destinoId: idNueva };
    }
    return { nuevas, siguienteNumero };
  };

  const crear = () => {
    if (!titulo.trim() || faltaVinculo) return;
    const hoy = todayISO();
    const personaIdFinal = personaFija ? personaFija.id : personaId;
    const nuevoHilo = { id: uid("H"), titulo: titulo.trim(), estado: "Activo", fechaCreacion: hoy, tipo: "cliente", columnaTareaId: null, hiloRelacionadoId: null, notaCierre: "" };
    const nuevosVinculos = [
      ...(personaIdFinal ? [vinc("Persona", personaIdFinal, "Hilo", nuevoHilo.id, null, true, hoy)] : []),
      ...empresaIds.map((eid) => vinc("Hilo", nuevoHilo.id, "Empresa", eid, null, false, hoy)),
      ...obraIds.map((oid) => vinc("Hilo", nuevoHilo.id, "Obra", oid, null, false, hoy)),
    ];
    setCore((prev) => ({ ...prev, hilos: [nuevoHilo, ...prev.hilos], vinculos: [...(prev.vinculos || []), ...nuevosVinculos] }));

    if (showPrimerContacto && setAcciones) {
      setAcciones((prev) => {
        const siguienteNumeroInicial = Math.max(0, ...prev.map((a) => a.numero || 0)) + 1;
        const { nuevas } = accionesParaHilo(nuevoHilo.id, hoy, siguienteNumeroInicial);
        return [...nuevas, ...prev];
      });
    }

    onCreated(nuevoHilo.id);
  };

  const crearMultiple = () => {
    if (!titulo.trim() || personaIdsMultiple.length === 0) return;
    const hoy = todayISO();
    const nuevosHilos = personaIdsMultiple.map(() => ({ id: uid("H"), titulo: titulo.trim(), estado: "Activo", fechaCreacion: hoy, tipo: "cliente", columnaTareaId: null, hiloRelacionadoId: null, notaCierre: "" }));
    const nuevosVinculos = personaIdsMultiple.map((pid, i) => vinc("Persona", pid, "Hilo", nuevosHilos[i].id, null, true, hoy));
    setCore((prev) => ({ ...prev, hilos: [...nuevosHilos, ...prev.hilos], vinculos: [...(prev.vinculos || []), ...nuevosVinculos] }));

    if (showPrimerContacto && setAcciones) {
      setAcciones((prev) => {
        let siguienteNumero = Math.max(0, ...prev.map((a) => a.numero || 0)) + 1;
        const todasLasNuevas = [];
        nuevosHilos.forEach((h) => {
          const { nuevas, siguienteNumero: sig } = accionesParaHilo(h.id, hoy, siguienteNumero);
          siguienteNumero = sig;
          todasLasNuevas.push(...nuevas);
        });
        return [...todasLasNuevas, ...prev];
      });
    }

    onCreated(nuevosHilos[nuevosHilos.length - 1].id);
  };

  const submit = () => {
    if (showPrimerContacto && programarProxima && especificaInhabil && !confirmarEspecifica) { setConfirmarEspecifica(true); return; }
    if (seleccionMultiple) crearMultiple(); else crear();
  };

  return (
    <div>
      {permiteMultiple && (
        <label className="flex items-center gap-2 mb-3 text-sm font-bold text-[#2A2118]">
          <input type="checkbox" checked={seleccionMultiple} onChange={(e) => setSeleccionMultiple(e.target.checked)} /> Creación múltiple de hilos
        </label>
      )}

      <Field label={seleccionMultiple ? "Título del tema * (se usa para todos los hilos)" : "Título del tema *"}>
        <CampoConMenciones core={core} autoFocus value={titulo} onChange={setTitulo} placeholder="Ej: Presupuesto cables solares" />
      </Field>

      {seleccionMultiple ? (
        <Field label="Personas">
          <ChipsAgregados items={personaIdsMultiple} core={core} coleccion="personas" labelKey="nombre" onQuitar={(pid) => setPersonaIdsMultiple((ids) => ids.filter((x) => x !== pid))} />
          <div className="flex gap-2">
            <div className="flex-1">
              <BuscadorSelect
                opciones={core.personas.filter((p) => !personaIdsMultiple.includes(p.id)).map((p) => ({ id: p.id, label: p.nombre }))}
                value={personaParaAgregar}
                onChange={setPersonaParaAgregar}
                placeholder="Buscar persona..."
              />
            </div>
            <button
              type="button"
              disabled={!personaParaAgregar}
              onClick={() => { setPersonaIdsMultiple((ids) => [...ids, personaParaAgregar]); setPersonaParaAgregar(""); }}
              className="shrink-0 border border-[#E4DECF] rounded-sm px-3 text-sm font-bold text-[#2A2118] disabled:text-[#C9C1AE] disabled:cursor-not-allowed"
            >
              + Agregar
            </button>
          </div>
        </Field>
      ) : (
        !personaFija && (
          <Field label="Persona">
            <BuscadorSelect
              opciones={core.personas.map((p) => ({ id: p.id, label: p.nombre }))}
              value={personaId}
              onChange={elegirPersona}
              vacioLabel="— ninguna —"
              placeholder="Buscar persona..."
            />
          </Field>
        )
      )}

      {!seleccionMultiple && !empresaFijaId && (
        <Field label="Empresa(s)">
          {empresaIds.length > 0 && (
            <div className="space-y-1 mb-2">
              {empresaIds.map((eid) => {
                const e = core.empresas.find((ee) => ee.id === eid);
                if (!e) return null;
                return (
                  <div key={eid} className="flex items-center justify-between gap-2 bg-[#F7F5F0] border border-[#E4DECF] rounded-sm px-2.5 py-1.5 text-sm">
                    <span className="font-semibold text-[#2A2118]">{e.denominacion}</span>
                    <button type="button" onClick={() => quitarEmpresa(eid)} className="text-[var(--tema-peligro)]"><X size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}
          {(() => {
            const opciones = (personaFija ? empresasDeLaPersona : core.empresas).filter((e) => !empresaIds.includes(e.id));
            if (opciones.length === 0) {
              return empresaIds.length === 0 && personaFija ? (
                <p className="text-sm text-[#A69C88] mb-1.5">Este contacto no tiene empresas vinculadas todavía.</p>
              ) : null;
            }
            return (
              <div className="flex gap-2">
                <div className="flex-1">
                  <BuscadorSelect
                    opciones={opciones.map((e) => ({ id: e.id, label: e.denominacion }))}
                    value={empresaParaAgregar}
                    onChange={setEmpresaParaAgregar}
                    placeholder="Buscar empresa..."
                  />
                </div>
                <button
                  type="button"
                  disabled={!empresaParaAgregar}
                  onClick={() => { agregarEmpresa(empresaParaAgregar); setEmpresaParaAgregar(""); }}
                  className="shrink-0 border border-[#E4DECF] rounded-sm px-3 text-sm font-bold text-[#2A2118] disabled:text-[#C9C1AE] disabled:cursor-not-allowed"
                >
                  + Agregar
                </button>
              </div>
            );
          })()}
          {personaFija && (
            <button type="button" onClick={() => setShowVincularEmpresa(true)} className="text-xs font-bold text-[var(--tema-vinculo)] mt-1.5">+ Vincular otra empresa a este contacto</button>
          )}
        </Field>
      )}

      {!seleccionMultiple && !obraFijaId && (
        <Field label="Obra(s)">
          {obraIds.length > 0 && (
            <div className="space-y-1 mb-2">
              {obraIds.map((oid) => {
                const o = core.obras.find((oo) => oo.id === oid);
                if (!o) return null;
                return (
                  <div key={oid} className="flex items-center justify-between gap-2 bg-[#F7F5F0] border border-[#E4DECF] rounded-sm px-2.5 py-1.5 text-sm">
                    <span className="font-semibold text-[#2A2118]">{o.nombre}</span>
                    <button type="button" onClick={() => quitarObra(oid)} className="text-[var(--tema-peligro)]"><X size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}
          {(() => {
            const opciones = (personaFija ? obrasDeLasEmpresas : core.obras).filter((o) => !obraIds.includes(o.id));
            if (opciones.length === 0) {
              return obraIds.length === 0 && personaFija ? (
                <p className="text-sm text-[#A69C88] mb-1.5">{empresaIds.length > 0 ? "Estas empresas no tienen obras vinculadas." : "Elegí primero una empresa para poder sumar una obra."}</p>
              ) : null;
            }
            return (
              <div className="flex gap-2">
                <div className="flex-1">
                  <BuscadorSelect
                    opciones={opciones.map((o) => ({ id: o.id, label: o.nombre }))}
                    value={obraParaAgregar}
                    onChange={setObraParaAgregar}
                    placeholder="Buscar obra..."
                  />
                </div>
                <button
                  type="button"
                  disabled={!obraParaAgregar}
                  onClick={() => { agregarObra(obraParaAgregar); setObraParaAgregar(""); }}
                  className="shrink-0 border border-[#E4DECF] rounded-sm px-3 text-sm font-bold text-[#2A2118] disabled:text-[#C9C1AE] disabled:cursor-not-allowed"
                >
                  + Agregar
                </button>
              </div>
            );
          })()}
          {personaFija && (
            <button
              type="button"
              disabled={empresaIds.length === 0}
              onClick={() => setShowVincularObra(true)}
              className={`text-xs font-bold mt-1.5 ${empresaIds.length > 0 ? "text-[var(--tema-vinculo)]" : "text-[#C9C1AE] cursor-not-allowed"}`}
            >
              + Vincular obra a una empresa
            </button>
          )}
        </Field>
      )}

      {faltaVinculo && (
        <p className="text-xs text-[#A69C88] mb-3">{seleccionMultiple ? "Elegí al menos una persona." : "Elegí al menos una — persona, empresa u obra."}</p>
      )}

      {!showPrimerContacto ? (
        <button type="button" onClick={() => setShowPrimerContacto(true)} className="text-xs font-bold text-[var(--tema-vinculo)] mb-3">
          + Cargar primer contacto y próxima acción
        </button>
      ) : (
        <div className="border-t border-[#E4DECF] my-3 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold tracking-wide text-[var(--tema-vinculo)]">Primer contacto</p>
            <button type="button" onClick={() => setShowPrimerContacto(false)} className="text-xs font-bold text-[#6B6352]">Quitar</button>
          </div>
          <SelectConCrear
            label="Tipo de acción"
            opciones={core.tiposAccion}
            value={tipoAccionId1}
            onChange={setTipoAccionId1}
            placeholderCrear="Ej: Videollamada"
            onCrear={(nombre) => {
              const nuevo = { id: uid("TA"), nombre };
              setCore((prev) => ({ ...prev, tiposAccion: [...prev.tiposAccion, nuevo] }));
              return nuevo;
            }}
          />
          <Field label="Se hizo">
            <CampoConMenciones core={core} multiline rows={2} value={notas1} onChange={setNotas1} placeholder="Qué hablaron, qué resultó..." />
          </Field>

          <label className="flex items-center gap-2 mb-2 text-sm font-bold text-[#2A2118]">
            <input type="checkbox" checked={programarProxima} onChange={(e) => setProgramarProxima(e.target.checked)} /> Programar próxima acción
          </label>

          {programarProxima && (
            <>
              <SelectConCrear
                label="Tipo de acción"
                opciones={core.tiposAccion}
                value={tipoAccionId2}
                onChange={setTipoAccionId2}
                placeholderCrear="Ej: Videollamada"
                onCrear={(nombre) => {
                  const nuevo = { id: uid("TA"), nombre };
                  setCore((prev) => ({ ...prev, tiposAccion: [...prev.tiposAccion, nuevo] }));
                  return nuevo;
                }}
              />
              <Field label="Se planifica (qué se busca con esta acción)">
                <CampoConMenciones core={core} multiline rows={2} value={notas2} onChange={setNotas2} placeholder="Ej: confirmar si aceptaron la propuesta, próximos pasos a seguir..." />
              </Field>

              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setModoFecha("periodo")}
                  style={{ backgroundColor: modoFecha === "periodo" ? "#2A2F36" : "#E7E2D8", color: modoFecha === "periodo" ? "#FFFFFF" : "#6B6352" }}
                  className="flex-1 py-1.5 rounded-sm text-xs font-bold"
                >Dentro de un período</button>
                <button
                  type="button"
                  onClick={() => setModoFecha("especifica")}
                  style={{ backgroundColor: modoFecha === "especifica" ? "#2A2F36" : "#E7E2D8", color: modoFecha === "especifica" ? "#FFFFFF" : "#6B6352" }}
                  className="flex-1 py-1.5 rounded-sm text-xs font-bold"
                >Fecha específica</button>
              </div>

              {modoFecha === "periodo" ? (
                <>
                  <Field label="¿Dentro de cuánto?">
                    <div className="flex gap-2">
                      <input type="number" min={1} className={inputCls} value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
                      <select className={inputCls} value={unidad} onChange={(e) => setUnidad(e.target.value)}>
                        <option value="dias">días</option>
                        <option value="semanas">semanas</option>
                        <option value="meses">meses</option>
                      </select>
                    </div>
                  </Field>
                  {preview && (
                    <p className="text-xs text-[#6B6352] mb-3 -mt-2 bg-[#EFEBE0] rounded-sm px-2.5 py-1.5">
                      Fecha sugerida: <span className="font-bold">{fmtDate(preview)}</span> (ajustada para no caer en día no hábil ni en un día muy cargado)
                    </p>
                  )}
                </>
              ) : (
                <>
                  <SelectorFechaHora
                    fecha={fechaEspecifica}
                    hora={horaEspecifica}
                    aviso={avisoEspecifica}
                    onAviso={setAvisoEspecifica}
                    onFecha={(v) => { setFechaEspecifica(v); setConfirmarEspecifica(false); }}
                    onHora={setHoraEspecifica}
                  />
                  {especificaInhabil && (
                    <div className="bg-[#FBEEE7] border border-[var(--tema-acento)] rounded-sm p-2.5 mb-3">
                      <p className="text-xs text-[#2A2118]">Ese día está marcado como no hábil. Si guardás de nuevo, se confirma igual.</p>
                    </div>
                  )}
                </>
              )}

              <Field label="Prioridad">
                <select className={inputCls} value={prioridad} onChange={(e) => setPrioridad(e.target.value)}>
                  <option>Alta</option><option>Media</option><option>Baja</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 mb-2 text-sm text-[#2A2118]">
                <input type="checkbox" checked={recurrente} onChange={(e) => setRecurrente(e.target.checked)} /> Es una acción repetitiva
              </label>
              {recurrente && (
                <Field label="Repetir cada">
                  <div className="flex gap-2">
                    <input type="number" min={1} className={inputCls} value={repiteCadaN} onChange={(e) => setRepiteCadaN(e.target.value)} />
                    <select className={inputCls} value={repiteUnidad} onChange={(e) => setRepiteUnidad(e.target.value)}>
                      <option value="dias">días</option>
                      <option value="semanas">semanas</option>
                      <option value="meses">meses</option>
                    </select>
                  </div>
                </Field>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onCancelar} className="flex-1 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#6B6352]">Cancelar</button>
        <button onClick={submit} disabled={!titulo.trim() || faltaVinculo} className={`flex-1 rounded-sm py-2.5 font-bold text-sm ${!titulo.trim() || faltaVinculo ? "bg-[#E7E2D8] text-[#A69C88] cursor-not-allowed" : "bg-[var(--tema-acento)] text-[#2A2118]"}`}>
          {especificaInhabil && confirmarEspecifica ? "Sí, crear igual" : seleccionMultiple ? `Crear ${personaIdsMultiple.length} hilo${personaIdsMultiple.length === 1 ? "" : "s"}` : "Crear hilo"}
        </button>
      </div>

      {showVincularEmpresa && personaFija && (
        <VincularEmpresaForm
          core={core}
          setCore={setCore}
          excluirIds={empresasDeLaPersona.map((e) => e.id)}
          onClose={() => setShowVincularEmpresa(false)}
          onSave={(rel) => {
            setCore((prev) => ({ ...prev, vinculos: [...(prev.vinculos || []), vinc("Persona", personaFija.id, "Empresa", rel.empresaId, rel.tipoRelacionId || null, false, todayISO())] }));
            agregarEmpresa(rel.empresaId);
          }}
        />
      )}
      {showVincularObra && personaFija && (
        <VincularObraForm
          core={core}
          setCore={setCore}
          empresaId={empresaIds[empresaIds.length - 1]}
          onClose={() => setShowVincularObra(false)}
          onVinculada={agregarObra}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tareas (kanban propio, reutiliza el motor de Hilos sin persona obligatoria)
// ---------------------------------------------------------------------------
function TareasView({ core, setCore, acciones, setAcciones, onOpen }) {
  const [columnaActiva, setColumnaActiva] = useState(null); // null = "Sin columna"
  const [dragging, setDragging] = useState(null); // { hiloId }
  const [hoverColumnaId, setHoverColumnaId] = useState(undefined);
  const [tituloNuevo, setTituloNuevo] = useState("");
  const [mostrarFecha, setMostrarFecha] = useState(false);
  const [fechaNueva, setFechaNueva] = useState("");
  const [horaNueva, setHoraNueva] = useState("");
  const [avisoNuevo, setAvisoNuevo] = useState(AVISO_DEFAULT);
  const [verCerradas, setVerCerradas] = useState(false);
  const tabsRef = useRef(null);
  const hoverRef = useRef(undefined);

  const columnas = core.kanbanColumnasTareas || [];
  const tareas = core.hilos.filter((h) => h.tipo === "tarea" && h.estado === "Activo");
  // Filtradas por la pestaña activa, igual que "tareas" — si no, la misma lista completa de
  // cerradas aparecía repetida debajo de cada columna (incluida "Sin columna").
  const tareasCerradas = core.hilos.filter((h) => h.tipo === "tarea" && h.estado === "Cerrado" && (h.columnaTareaId || null) === columnaActiva);

  const contarColumna = (colId) => tareas.filter((h) => (h.columnaTareaId || null) === colId).length;

  const tareasColumna = useMemo(() => {
    return tareas
      .filter((h) => (h.columnaTareaId || null) === columnaActiva)
      .sort((a, b) => {
        const fa = a.fecha || "", fb = b.fecha || "";
        if (fa && fb) return fa < fb ? -1 : fa > fb ? 1 : 0;
        if (fa && !fb) return -1;
        if (!fa && fb) return 1;
        return (b.fechaCreacion || "").localeCompare(a.fechaCreacion || "");
      });
  }, [tareas, columnaActiva]);

  useEffect(() => { hoverRef.current = hoverColumnaId; }, [hoverColumnaId]);

  const moverTarea = (hiloId, colId) => {
    setCore((prev) => ({ ...prev, hilos: prev.hilos.map((h) => (h.id === hiloId ? { ...h, columnaTareaId: colId } : h)) }));
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const p = e.touches ? e.touches[0] : e;
      let found;
      tabsRef.current?.querySelectorAll("[data-tab-id]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (p.clientX >= r.left && p.clientX <= r.right && p.clientY >= r.top && p.clientY <= r.bottom) {
          found = el.getAttribute("data-tab-id");
        }
      });
      setHoverColumnaId(found);
    };
    const onUp = () => {
      const target = hoverRef.current;
      if (target !== undefined) moverTarea(dragging.hiloId, target === "null" ? null : target);
      setDragging(null);
      setHoverColumnaId(undefined);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging]); // eslint-disable-line

  const eliminarColumna = (colId) => {
    if (contarColumna(colId) > 0) return;
    setCore((prev) => ({ ...prev, kanbanColumnasTareas: (prev.kanbanColumnasTareas || []).filter((c) => c.id !== colId) }));
    if (columnaActiva === colId) setColumnaActiva(null);
  };

  const crearTareaRapida = () => {
    if (!tituloNuevo.trim()) return;
    const hoy = todayISO();
    const aviso = horaNueva && avisoNuevo.activo ? avisoNuevo : null;
    const nuevoHilo = { id: uid("H"), titulo: tituloNuevo.trim(), notas: "", fecha: fechaNueva, hora: horaNueva, aviso, avisoEnviado: false, estado: "Activo", fechaCreacion: hoy, tipo: "tarea", columnaTareaId: columnaActiva, hiloRelacionadoId: null, notaCierre: "" };
    setCore((prev) => ({ ...prev, hilos: [nuevoHilo, ...prev.hilos] }));
    setTituloNuevo("");
    setFechaNueva("");
    setHoraNueva("");
    setAvisoNuevo(AVISO_DEFAULT);
    setMostrarFecha(false);
  };

  const nombreSinColumna = core.parametros.nombreSinColumnaTareas || "Sin columna";
  const nombreColumnaActiva = columnaActiva === null ? nombreSinColumna : columnas.find((c) => c.id === columnaActiva)?.nombre || "Columna";

  return (
    <div>
    <div className="sticky top-0 z-10 bg-[#F7F5F0]">
      <div className="bg-white border border-[#E4DECF] rounded-sm p-3 mb-3">
        <div className="flex gap-2">
          <input
            value={tituloNuevo}
            onChange={(e) => setTituloNuevo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && crearTareaRapida()}
            placeholder="+ Nueva tarea..."
            className={`${inputCls} flex-1`}
          />
          <button
            onClick={() => setMostrarFecha((v) => !v)}
            aria-label="Fecha y hora"
            style={mostrarFecha ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) } : { backgroundColor: core.tema.botonInactivo, color: core.tema.ink }}
            className="shrink-0 w-10 h-10 rounded-sm flex items-center justify-center"
          >
            <CalendarClock size={17} />
          </button>
          <button
            onClick={crearTareaRapida}
            disabled={!tituloNuevo.trim()}
            aria-label="Agregar tarea"
            className="shrink-0 w-10 h-10 rounded-sm flex items-center justify-center bg-[var(--tema-acento)] text-[#2A2118] disabled:bg-[#E7E2D8] disabled:text-[#C9C1AE] disabled:cursor-not-allowed"
          >
            <Plus size={18} />
          </button>
        </div>
        {mostrarFecha && (
          <div className="mt-2">
            <SelectorFechaHora fecha={fechaNueva} hora={horaNueva} aviso={avisoNuevo} onAviso={setAvisoNuevo} onFecha={setFechaNueva} onHora={setHoraNueva} />
          </div>
        )}
        <p className="text-xs text-[#A69C88] mt-2">La fecha y hora son opcionales — si no las cargás, la tarea se guarda igual.</p>
      </div>

      {dragging && (
        <p className="text-center text-xs font-bold text-[var(--tema-vinculo)] tracking-wide mb-1.5 animate-pulse">
          Soltá sobre una pestaña para mover la tarea
        </p>
      )}

      <ExcelTabsBar
        core={core}
        tabs={columnas}
        activeId={columnaActiva}
        incluirSinTab
        sinColumnaNombre={nombreSinColumna}
        onSelect={setColumnaActiva}
        onCreate={(nombre) => {
          const nueva = { id: uid("T"), nombre, orden: columnas.length };
          setCore((prev) => ({ ...prev, kanbanColumnasTareas: [...(prev.kanbanColumnasTareas || []), nueva] }));
          setColumnaActiva(nueva.id);
        }}
        onRename={(id, nombre) => setCore((prev) => ({ ...prev, kanbanColumnasTareas: (prev.kanbanColumnasTareas || []).map((c) => (c.id === id ? { ...c, nombre } : c)) }))}
        onRenameSinColumna={(nombre) => setCore((prev) => ({ ...prev, parametros: { ...prev.parametros, nombreSinColumnaTareas: nombre } }))}
        onDelete={eliminarColumna}
        contarTab={contarColumna}
        tabsRef={tabsRef}
        hoverId={hoverColumnaId}
        dragging={dragging}
      />
    </div>

      <div className="mt-3">
        {tareasColumna.length === 0 ? (
          <EmptyState icon={<ListChecks size={26} />} text={`No hay tareas en "${nombreColumnaActiva}". Arrastrá una desde otra pestaña, o cargá una nueva arriba.`} />
        ) : (
          <div>
            {tareasColumna.map((h, i) => (
              <Fragment key={h.id}>
                {i > 0 && <div className="flex justify-center py-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: core.tema.botonActivo }} /></div>}
                <HiloAgendaCard
                  hilo={h}
                  core={core}
                  setCore={setCore}
                  acciones={acciones}
                  setAcciones={setAcciones}
                  onOpen={onOpen}
                  onIniciarDrag={() => setDragging({ hiloId: h.id })}
                  arrastrando={dragging?.hiloId === h.id}
                />
              </Fragment>
            ))}
          </div>
        )}
      </div>

      {tareasCerradas.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setVerCerradas((v) => !v)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5">
            {verCerradas ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verCerradas ? "Ocultar" : "Ver"} tareas completadas ({tareasCerradas.length})
          </button>
          {verCerradas && (
            <div className="mt-2 space-y-2">
              {tareasCerradas.map((h) => (
                <HiloAgendaCard key={h.id} hilo={h} core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onOpen={onOpen} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Edita una tarea: título y fecha/hora de su próxima acción, en un solo formulario — mismos
// campos que al crearla (ver crearTareaRapida en TareasView), para mantener la lógica de
// edición consistente con creación en toda la app (ver EditarHiloPrincipalForm).
function EditarTareaForm({ hilo, core, setCore, onClose }) {
  const [titulo, setTitulo] = useState(hilo.titulo);
  const [notas, setNotas] = useState(hilo.notas || "");
  const [fecha, setFecha] = useState(hilo.fecha || "");
  const [hora, setHora] = useState(hilo.hora || "");
  const [aviso, setAviso] = useState(hilo.aviso || AVISO_DEFAULT);

  const guardar = () => {
    if (!titulo.trim()) return;
    const tituloFinal = titulo.trim();
    const avisoFinal = hora && aviso.activo ? aviso : null;
    const avisoCambio = fecha !== (hilo.fecha || "") || hora !== (hilo.hora || "") || JSON.stringify(avisoFinal) !== JSON.stringify(hilo.aviso || null);
    setCore((prev) => ({
      ...prev,
      hilos: prev.hilos.map((h) => (h.id === hilo.id ? { ...h, titulo: tituloFinal, notas: notas.trim(), fecha, hora, aviso: avisoFinal, avisoEnviado: avisoCambio ? false : !!h.avisoEnviado } : h)),
    }));
    onClose();
  };

  const quitarFecha = () => { setFecha(""); setHora(""); setAviso(AVISO_DEFAULT); };

  return (
    <div>
      <Field label="Título"><CampoConMenciones core={core} value={titulo} onChange={setTitulo} /></Field>
      <Field label="Notas (opcional)"><CampoConMenciones core={core} multiline rows={2} value={notas} onChange={setNotas} /></Field>
      <SelectorFechaHora fecha={fecha} hora={hora} aviso={aviso} onAviso={setAviso} onFecha={setFecha} onHora={setHora} labelFecha="Fecha (opcional)" />
      <PrimaryBtn full disabled={!titulo.trim()} onClick={guardar}>Guardar</PrimaryBtn>
      {(fecha || hora) && (
        <button onClick={quitarFecha} className="w-full text-center text-xs font-bold text-[var(--tema-peligro)] mt-2">Quitar fecha (la tarea queda sin programar)</button>
      )}
    </div>
  );
}

function SubtareaForm({ initial, onSave, onSaveYNueva, onClose }) {
  const [texto, setTexto] = useState(initial?.texto || "");
  const [fecha, setFecha] = useState(initial?.fecha || "");
  const [hora, setHora] = useState(initial?.hora || "");
  const [aviso, setAviso] = useState(initial?.aviso || AVISO_DEFAULT);
  const [nota, setNota] = useState(initial?.nota || "");
  const textoRef = useRef(null);

  const datosActuales = () => {
    const avisoFinal = hora && aviso.activo ? aviso : null;
    const avisoCambio = fecha !== (initial?.fecha || "") || hora !== (initial?.hora || "") || JSON.stringify(avisoFinal) !== JSON.stringify(initial?.aviso || null);
    return { texto: texto.trim(), fecha: fecha || null, hora: hora || null, aviso: avisoFinal, avisoEnviado: avisoCambio ? false : !!initial?.avisoEnviado, nota: nota.trim() || null };
  };

  const guardar = () => {
    if (!texto.trim()) return;
    onSave(datosActuales());
  };

  // Solo se ofrece al crear (no al editar): guarda esta subtarea sin cerrar el formulario,
  // lo limpia y devuelve el foco al texto para cargar la siguiente sin reabrir el modal.
  const guardarYNueva = () => {
    if (!texto.trim()) return;
    onSaveYNueva(datosActuales());
    setTexto(""); setFecha(""); setHora(""); setAviso(AVISO_DEFAULT); setNota("");
    textoRef.current?.focus();
  };

  return (
    <Modal title={initial ? "Editar subtarea" : "Nueva subtarea"} onClose={onClose}>
      <Field label="Texto">
        <input ref={textoRef} autoFocus className={inputCls} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej: Llamar para confirmar horario" />
      </Field>
      <SelectorFechaHora fecha={fecha} hora={hora} aviso={aviso} onAviso={setAviso} onFecha={setFecha} onHora={setHora} labelFecha="Fecha (opcional)" />
      <Field label="Nota (opcional)">
        <textarea className={inputCls} rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
      </Field>
      <PrimaryBtn full disabled={!texto.trim()} onClick={guardar}>Guardar</PrimaryBtn>
      {onSaveYNueva && (
        <button
          type="button"
          disabled={!texto.trim()}
          onClick={guardarYNueva}
          className="w-full mt-2 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#2A2118] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Guardar y nueva...
        </button>
      )}
    </Modal>
  );
}

function agruparPorHilo(lista) {
  const map = new Map();
  for (const a of lista) {
    const key = a.hiloId || a.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(a);
  }
  return Array.from(map.values());
}

// Recorre los grupos ya ordenados por fecha; apenas aparece una persona por primera vez,
// junta ahí mismo el resto de sus hilos (aunque tengan fecha más lejana), ordenados entre sí.
function agruparHilosPorPersona(gruposHilo, core, orden) {
  const personaDe = (grupo) => {
    const hilo = core.hilos.find((h) => h.id === grupo[0].hiloId);
    return hilo ? personaPrincipalDeHilo(hilo, core)?.id || null : null;
  };
  const usados = new Array(gruposHilo.length).fill(false);
  const resultado = [];

  for (let i = 0; i < gruposHilo.length; i++) {
    if (usados[i]) continue;
    usados[i] = true;
    const personaId = personaDe(gruposHilo[i]);
    const bloque = [gruposHilo[i]];

    if (personaId) {
      for (let j = i + 1; j < gruposHilo.length; j++) {
        if (usados[j]) continue;
        if (personaDe(gruposHilo[j]) === personaId) {
          bloque.push(gruposHilo[j]);
          usados[j] = true;
        }
      }
      bloque.sort((a, b) => {
        const fa = a[0].fechaProgramada, fb = b[0].fechaProgramada;
        if (fa === fb) return 0;
        const cmp = fa < fb ? -1 : 1;
        return orden === "asc" ? cmp : -cmp;
      });
    }
    resultado.push(...bloque);
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Calendario (sub-vista de Agenda)
// ---------------------------------------------------------------------------
const DIAS_SEMANA = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function startOfWeekMonday(d) {
  const day = d.getDay(); // 0=domingo
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

function CalendarioView({ core, setCore, acciones, setAcciones, onOpen, t }) {
  const pendientes = acciones.filter((a) => a.estado === "Pendiente" && a.fechaProgramada);
  const [modo, setModo] = useState("mes"); // 'mes' | 'semana'
  const [ref, setRef] = useState(parseISO(t));
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);

  const { countsClienteByDate, countsTareaByDate } = useMemo(() => {
    const cli = {}, tar = {};
    for (const a of pendientes) {
      const h = core.hilos.find((hh) => hh.id === a.hiloId);
      const map = h?.tipo === "tarea" ? tar : cli;
      map[a.fechaProgramada] = (map[a.fechaProgramada] || 0) + 1;
    }
    return { countsClienteByDate: cli, countsTareaByDate: tar };
  }, [pendientes, core.hilos]);

  const umbral = core.parametros.umbralDiaLleno;
  const COLOR_TAREA = "var(--tema-marcadorTareas)";

  const tonoDia = (iso) => {
    const n = countsClienteByDate[iso] || 0;
    if (n === 0) return null;
    if (n >= umbral) return "urgenciaVencida";
    return "urgenciaProxima";
  };

  const irHoy = () => { setRef(parseISO(t)); setDiaSeleccionado(t); };

  // -------- Vista mensual --------
  const gridMensual = useMemo(() => {
    if (modo !== "mes") return [];
    const y = ref.getFullYear(), m = ref.getMonth();
    const first = new Date(y, m, 1);
    const startOffset = (first.getDay() + 6) % 7; // 0 = lunes
    const start = addDays(first, -startOffset);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      cells.push({ date: d, iso: toISO(d), inMonth: d.getMonth() === m });
    }
    return cells;
  }, [modo, ref]);

  // -------- Vista semanal --------
  const gridSemanal = useMemo(() => {
    if (modo !== "semana") return [];
    const start = startOfWeekMonday(ref);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return { date: d, iso: toISO(d) };
    });
  }, [modo, ref]);

  const irAnterior = () => setRef((r) => (modo === "mes" ? new Date(r.getFullYear(), r.getMonth() - 1, 1) : addDays(r, -7)));
  const irSiguiente = () => setRef((r) => (modo === "mes" ? new Date(r.getFullYear(), r.getMonth() + 1, 1) : addDays(r, 7)));

  const tituloRango = modo === "mes"
    ? `${MESES[ref.getMonth()]} ${ref.getFullYear()}`
    : (() => {
        const start = startOfWeekMonday(ref);
        const end = addDays(start, 6);
        return `${fmtDate(toISO(start))} – ${fmtDate(toISO(end))}`;
      })();

  const pendientesDelDia = diaSeleccionado ? pendientes.filter((a) => a.fechaProgramada === diaSeleccionado) : [];
  const gruposDelDia = useMemo(() => agruparPorHilo(pendientesDelDia), [pendientesDelDia]);

  return (
    <div>
    <div className="sticky top-0 z-10 bg-[#F7F5F0]">
      <div className="flex gap-1.5 mb-3">
        <button onClick={() => setModo("mes")} style={modo === "mes" ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) } : { backgroundColor: core.tema.botonInactivo, color: core.tema.ink }} className="flex-1 h-8 text-[11px] font-bold tracking-wide rounded-sm">Mensual</button>
        <button onClick={() => setModo("semana")} style={modo === "semana" ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) } : { backgroundColor: core.tema.botonInactivo, color: core.tema.ink }} className="flex-1 h-8 text-[11px] font-bold tracking-wide rounded-sm">Semanal</button>
      </div>

      <div className="flex items-center justify-between mb-2">
        <IconBtn label="Anterior" onClick={irAnterior}><ChevronLeft size={18} /></IconBtn>
        <div className="text-center">
          <p className="text-sm font-extrabold text-[#2A2118]">{tituloRango}</p>
          <button onClick={irHoy} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)]">Hoy</button>
        </div>
        <IconBtn label="Siguiente" onClick={irSiguiente}><ChevronRight size={18} /></IconBtn>
      </div>

      <div className="flex items-center justify-center gap-4 mb-2">
        <span className="flex items-center gap-1 text-[10px] font-bold text-[#6B6352]"><span className="w-2 h-2 rounded-full bg-[var(--tema-acento)]" /> Hilos de clientes</span>
        <span className="flex items-center gap-1 text-[10px] font-bold text-[#6B6352]"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLOR_TAREA }} /> Tareas</span>
      </div>
    </div>

      {modo === "mes" ? (
        <div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DIAS_SEMANA.map((d) => <p key={d} className="text-center text-[10px] font-bold text-[#A69C88]">{d}</p>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {gridMensual.map(({ date, iso, inMonth }) => {
              const tone = tonoDia(iso);
              const countCli = countsClienteByDate[iso] || 0;
              const countTar = countsTareaByDate[iso] || 0;
              const isToday = iso === t;
              const isSel = iso === diaSeleccionado;
              return (
                <button
                  key={iso}
                  onClick={() => setDiaSeleccionado(iso)}
                  className={`relative aspect-square rounded-sm flex items-center justify-center ${isSel ? "ring-2 ring-[var(--tema-acento)]" : ""} ${inMonth ? "bg-white border border-[#E4DECF]" : "bg-transparent"}`}
                >
                  <span className={`absolute top-1 left-1 text-[10px] leading-none ${inMonth ? (isToday ? "font-extrabold text-[var(--tema-vinculo)]" : "text-[#8A8272]") : "text-[#E4DECF]"}`}>{date.getDate()}</span>
                  {inMonth && (countCli > 0 || countTar > 0) && (
                    <div className="flex items-center gap-0.5">
                      {countCli > 0 && <span className={`text-base font-extrabold ${tone === "red" ? "text-[var(--tema-urgenciaVencida)]" : "text-[var(--tema-urgenciaProxima)]"}`}>{countCli}</span>}
                      {countTar > 0 && <span className="text-base font-extrabold" style={{ color: COLOR_TAREA }}>{countTar}</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {gridSemanal.map(({ date, iso }) => {
            const tone = tonoDia(iso);
            const countCli = countsClienteByDate[iso] || 0;
            const countTar = countsTareaByDate[iso] || 0;
            const isToday = iso === t;
            const isSel = iso === diaSeleccionado;
            return (
              <button
                key={iso}
                onClick={() => setDiaSeleccionado(iso)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-sm ${isSel ? "ring-2 ring-[var(--tema-acento)]" : ""} bg-white border border-[#E4DECF]`}
              >
                <span className={`text-sm ${isToday ? "font-extrabold text-[var(--tema-vinculo)]" : "text-[#2A2118]"}`}>{DIAS_SEMANA[(date.getDay() + 6) % 7]} {date.getDate()}/{date.getMonth() + 1}</span>
                <div className="flex items-center gap-1.5">
                  {countCli > 0 && <Chip tone={tone}>{countCli}</Chip>}
                  {countTar > 0 && <span className="text-[10px] font-bold tracking-widest px-2 py-1 rounded-sm text-white" style={{ backgroundColor: COLOR_TAREA }}>{countTar}</span>}
                  {countCli === 0 && countTar === 0 && <span className="text-xs text-[#D8D2C4]">—</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {diaSeleccionado && (
        <div className="mt-4 pt-3 border-t border-[#E4DECF]">
          <p className="text-[11px] font-bold tracking-wide text-[#6B6352] mb-2">{fmtDate(diaSeleccionado)}</p>
          {gruposDelDia.length === 0 ? (
            <p className="text-sm text-[#A69C88]">Sin acciones programadas este día.</p>
          ) : (
            <div>
              {gruposDelDia.map((grupo, i) => (
                <Fragment key={grupo[0].id}>
                  {i > 0 && <div className="flex justify-center py-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: core.tema.botonActivo }} /></div>}
                  <HiloAgendaCard
                    accionesBucket={grupo}
                    core={core}
                    setCore={setCore}
                    acciones={acciones}
                    setAcciones={setAcciones}
                    onOpen={onOpen}
                    t={t}
                  />
                </Fragment>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kanban (reemplaza la vista "Lista" de Agenda)
// ---------------------------------------------------------------------------
// Barra de pestañas editable con look de "hojas de Excel": pestaña activa conectada al contenido,
// doble clic para editar el nombre, "+" para crear, "Eliminar" si está vacía.
// Casilla para marcar un hilo (o tarea) como finalizado. Si ya tiene historial, pide un texto
// de cierre para dejarlo registrado; si no tiene nada registrado todavía, cierra directo.
function CasillaFinalizar({ hilo, acciones, setCore, size = 20 }) {
  const [pidiendoTexto, setPidiendoTexto] = useState(false);
  const finalizado = hilo.estado === "Cerrado";
  const tieneHistorial = acciones.some((a) => a.hiloId === hilo.id && a.estado === "Realizada");

  const reabrir = () => setCore((prev) => ({ ...prev, hilos: prev.hilos.map((h) => (h.id === hilo.id ? { ...h, estado: "Activo" } : h)) }));
  const cerrarDirecto = () => setCore((prev) => ({ ...prev, hilos: prev.hilos.map((h) => (h.id === hilo.id ? { ...h, estado: "Cerrado" } : h)) }));
  const cerrarConTexto = (texto) => {
    setCore((prev) => ({ ...prev, hilos: prev.hilos.map((h) => (h.id === hilo.id ? { ...h, estado: "Cerrado", notaCierre: texto } : h)) }));
    setPidiendoTexto(false);
  };

  const onClick = (e) => {
    e.stopPropagation();
    if (finalizado) { reabrir(); return; }
    if (tieneHistorial) setPidiendoTexto(true);
    else cerrarDirecto();
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label={finalizado ? "Reabrir" : "Marcar como finalizada"}
        className="shrink-0 rounded-full flex items-center justify-center"
        style={{ width: size, height: size, backgroundColor: finalizado ? "var(--tema-estadoRealizada)" : "#FFFFFF", border: `2px solid ${finalizado ? "var(--tema-estadoRealizada)" : "#C9C1AE"}` }}
      >
        {finalizado && <Check size={size * 0.65} color="#FFFFFF" strokeWidth={3} />}
      </button>
      {pidiendoTexto && (
        <Modal title="Cerrar y dejar registro" onClose={() => setPidiendoTexto(false)}>
          <TextoCierreForm onConfirmar={cerrarConTexto} onCancelar={() => setPidiendoTexto(false)} />
        </Modal>
      )}
    </>
  );
}

function TextoCierreForm({ onConfirmar, onCancelar }) {
  const [texto, setTexto] = useState("");
  return (
    <div>
      <Field label="¿Cómo se cerró? (queda registrado en el hilo)">
        <textarea autoFocus className={inputCls} rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej: se aprobó el presupuesto, obra entregada, cliente no avanzó, etc." />
      </Field>
      <div className="flex gap-2">
        <button onClick={onCancelar} className="flex-1 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#6B6352]">Cancelar</button>
        <button onClick={() => onConfirmar(texto)} style={{ backgroundColor: "var(--tema-exito)", color: "#FFFFFF" }} className="flex-1 rounded-sm py-2.5 font-bold text-sm">Cerrar</button>
      </div>
    </div>
  );
}

function ExcelTabsBar({ core, tabs, activeId, incluirSinTab, sinColumnaNombre, onSelect, onCreate, onRename, onRenameSinColumna, onDelete, contarTab, tabsRef, hoverId, dragging }) {
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [editandoId, setEditandoId] = useState(undefined); // undefined = nadie editando, null = "Sin columna", id = esa pestaña
  const [eliminandoId, setEliminandoId] = useState(null); // pestaña con confirmación de borrado abierta
  const [avisoNoVaciaId, setAvisoNoVaciaId] = useState(null); // pestaña con aviso de "vaciala primero" abierto

  const confirmarCrear = () => {
    if (!nombreNuevo.trim()) return;
    onCreate(nombreNuevo.trim());
    setNombreNuevo("");
    setCreando(false);
  };
  const confirmarRenombrar = (id, valor) => {
    if (valor.trim()) {
      if (id === null) onRenameSinColumna?.(valor.trim());
      else onRename(id, valor.trim());
    }
    setEditandoId(undefined);
  };

  const nombreSinColumna = sinColumnaNombre || "Sin columna";
  const nombreTab = (id) => (id === null ? nombreSinColumna : tabs.find((t) => t.id === id)?.nombre || "");

  const renderTab = (id, nombre) => {
    const key = id === null ? "null" : id;
    const esActiva = activeId === id;
    const esHover = hoverId === key;
    const editando = editandoId === id;

    if (editando) {
      return (
        <input
          key={key}
          autoFocus
          defaultValue={nombre}
          onKeyDown={(e) => { if (e.key === "Enter") confirmarRenombrar(id, e.target.value); if (e.key === "Escape") setEditandoId(undefined); }}
          onBlur={(e) => confirmarRenombrar(id, e.target.value)}
          className="shrink-0 h-8 w-24 text-[10px] font-bold tracking-wide px-2 border rounded-t-sm focus:outline-none"
          style={{ backgroundColor: core.tema.tarjeta, borderColor: core.tema.linea }}
        />
      );
    }
    const colorTexto = esHover || esActiva ? "#FFFFFF" : "#2A2118";
    return (
      <div
        key={key}
        data-tab-id={key}
        onDoubleClick={() => setEditandoId(id)}
        style={{
          backgroundColor: esHover || esActiva ? core.tema.botonActivo : core.tema.botonInactivo,
          color: colorTexto,
          borderColor: core.tema.linea,
          marginBottom: esActiva && !esHover ? "-2px" : "0px",
          zIndex: esActiva ? 2 : 1,
          transform: esHover ? "scale(1.05)" : "none",
        }}
        className="relative shrink-0 h-8 flex items-center gap-1.5 pl-3 pr-1.5 text-[10px] font-bold tracking-wide border border-b-0 rounded-t-sm transition-transform"
      >
        <button type="button" onClick={() => onSelect(id)} className="flex items-center gap-1.5">
          {nombre}
          {contarTab(id) > 0 && (
            <span
              className="inline-flex items-center justify-center min-w-[1.15rem] h-[1.15rem] px-1 rounded-full border text-[9px] font-bold leading-none"
              style={{ borderColor: colorTexto, color: colorTexto }}
            >
              {contarTab(id)}
            </span>
          )}
        </button>
        {id !== null && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (contarTab(id) > 0) setAvisoNoVaciaId(id);
              else setEliminandoId(id);
            }}
            aria-label={`Eliminar "${nombre}"`}
            style={{ color: colorTexto }}
            className="shrink-0 opacity-70 hover:opacity-100"
          >
            <X size={11} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div>
      <div
        ref={tabsRef}
        className="flex gap-0.5 overflow-x-auto no-scrollbar"
        style={{ borderBottom: `2px solid ${core.tema.linea}`, outline: dragging ? `2px dashed ${core.tema.botonActivo}` : undefined, outlineOffset: dragging ? "3px" : undefined }}
      >
        {incluirSinTab && renderTab(null, nombreSinColumna)}
        {tabs.map((t) => renderTab(t.id, t.nombre))}
        {creando ? (
          <div className="shrink-0 h-8 flex items-center gap-1 border border-b-0 rounded-t-sm px-1.5" style={{ backgroundColor: core.tema.tarjeta, borderColor: core.tema.linea }}>
            <input
              autoFocus
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmarCrear()}
              placeholder="Nombre..."
              className="w-20 text-[10px] px-1 py-0.5 border border-[#D8D2C4] rounded-sm focus:outline-none"
            />
            <button onClick={confirmarCrear} className="text-[var(--tema-exito)]"><Check size={14} /></button>
            <button onClick={() => { setCreando(false); setNombreNuevo(""); }} className="text-[var(--tema-peligro)]"><X size={14} /></button>
          </div>
        ) : (
          <button onClick={() => setCreando(true)} className="shrink-0 flex items-center justify-center w-8 h-8 text-[#8A8272]"><Plus size={15} /></button>
        )}
      </div>

      {avisoNoVaciaId !== null && (
        <Modal title="No se puede eliminar" onClose={() => setAvisoNoVaciaId(null)}>
          <p className="text-sm text-[#2A2118] mb-4">
            La pestaña "{nombreTab(avisoNoVaciaId)}" tiene {contarTab(avisoNoVaciaId)} tarjeta{contarTab(avisoNoVaciaId) === 1 ? "" : "s"}. Vaciala primero para poder eliminarla.
          </p>
          <button onClick={() => setAvisoNoVaciaId(null)} style={{ backgroundColor: "var(--tema-acento)", color: "#2A2118" }} className="w-full rounded-sm py-2.5 font-bold text-sm">Entendido</button>
        </Modal>
      )}

      {eliminandoId !== null && (
        <ConfirmDeleteModal
          title="Eliminar pestaña"
          texto={`¿Eliminar la pestaña "${nombreTab(eliminandoId)}"? No se puede deshacer.`}
          onCancel={() => setEliminandoId(null)}
          onConfirm={() => { onDelete(eliminandoId); setEliminandoId(null); }}
        />
      )}
    </div>
  );
}

function KanbanView({ core, setCore, acciones, setAcciones, onOpen, t, soloTipo }) {
  const [columnaActiva, setColumnaActiva] = useState(null); // null = "Sin columna"
  const [dragging, setDragging] = useState(null); // { grupo }
  const [hoverColumnaId, setHoverColumnaId] = useState(undefined); // undefined = nada, "null" = Sin columna, o id
  const [bucket, setBucket] = useState("todas");
  const [orden, setOrden] = useState("asc");
  const [agruparPersona, setAgruparPersona] = useState(false);
  const [showNuevoHilo, setShowNuevoHilo] = useState(false);
  const [estadoFiltro, setEstadoFiltro] = useState("activos"); // 'activos' | 'inactivos' | 'todos'
  const tabsRef = useRef(null);
  const hoverRef = useRef(undefined);

  const columnas = core.kanbanColumnas || [];
  const hiloPasaFiltroEstado = (h) => {
    if (estadoFiltro === "todos") return true;
    if (estadoFiltro === "inactivos") return h?.estado === "Cerrado";
    return h?.estado === "Activo";
  };
  const pendientes = acciones.filter((a) => {
    if (a.estado !== "Pendiente" || !a.fechaProgramada) return false;
    const h = core.hilos.find((hh) => hh.id === a.hiloId);
    if (!hiloPasaFiltroEstado(h)) return false;
    if (!soloTipo) return true;
    return (h?.tipo || "cliente") === soloTipo;
  });

  const contarColumna = (colId) => pendientes.filter((a) => (a.columnaId || null) === colId).length;

  const pendientesColumna = useMemo(
    () => pendientes.filter((a) => (a.columnaId || null) === columnaActiva),
    [pendientes, columnaActiva]
  );

  const buckets = useMemo(() => {
    const proximos = addDaysISO(t, core.parametros.diasProximos ?? 7);
    return {
      vencidas: pendientesColumna.filter((a) => a.fechaProgramada < t),
      hoy: pendientesColumna.filter((a) => a.fechaProgramada === t),
      proximos: pendientesColumna.filter((a) => a.fechaProgramada >= t && a.fechaProgramada <= proximos),
      todas: pendientesColumna,
    };
  }, [pendientesColumna, t, core.parametros.diasProximos]);

  const listAcciones = useMemo(
    () =>
      [...buckets[bucket]].sort((a, b) => {
        if (a.fechaProgramada === b.fechaProgramada) return 0;
        const cmp = a.fechaProgramada < b.fechaProgramada ? -1 : 1;
        return orden === "asc" ? cmp : -cmp;
      }),
    [buckets, bucket, orden]
  );

  const gruposPorHilo = useMemo(() => agruparPorHilo(listAcciones), [listAcciones]);

  const gruposActivos = useMemo(
    () => (agruparPersona ? agruparHilosPorPersona(gruposPorHilo, core, orden) : gruposPorHilo),
    [gruposPorHilo, agruparPersona, core, orden]
  );

  // Hilos activos que todavía no tienen ninguna acción pendiente programada — sin esto,
  // quedan invisibles en Seguimientos aunque existan (solo se ven desde la ficha de origen).
  // Las acciones no tienen columnaId hasta que se les asigna una, así que este bloque solo
  // aplica en "Sin columna".
  const hilosSinAccion = useMemo(() => {
    if (columnaActiva !== null) return [];
    return core.hilos.filter((h) => {
      if (!hiloPasaFiltroEstado(h)) return false;
      if (soloTipo && (h.tipo || "cliente") !== soloTipo) return false;
      return !acciones.some((a) => a.hiloId === h.id && a.estado === "Pendiente");
    });
  }, [core.hilos, acciones, soloTipo, columnaActiva, estadoFiltro]);

  useEffect(() => { hoverRef.current = hoverColumnaId; }, [hoverColumnaId]);

  const moverGrupo = (grupo, colId) => {
    const ids = grupo.map((a) => a.id);
    setAcciones((prev) => prev.map((a) => (ids.includes(a.id) ? { ...a, columnaId: colId } : a)));
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const p = e.touches ? e.touches[0] : e;
      let found;
      tabsRef.current?.querySelectorAll("[data-tab-id]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (p.clientX >= r.left && p.clientX <= r.right && p.clientY >= r.top && p.clientY <= r.bottom) {
          found = el.getAttribute("data-tab-id");
        }
      });
      setHoverColumnaId(found);
    };
    const onUp = () => {
      const target = hoverRef.current;
      if (target !== undefined) {
        moverGrupo(dragging.grupo, target === "null" ? null : target);
      }
      setDragging(null);
      setHoverColumnaId(undefined);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging]); // eslint-disable-line

  const eliminarColumna = (colId) => {
    if (contarColumna(colId) > 0) return;
    setCore((prev) => ({ ...prev, kanbanColumnas: (prev.kanbanColumnas || []).filter((c) => c.id !== colId) }));
    if (columnaActiva === colId) setColumnaActiva(null);
  };

  const nombreSinColumna = core.parametros.nombreSinColumnaSeguimientos || "Sin columna";
  const nombreColumnaActiva = columnaActiva === null ? nombreSinColumna : columnas.find((c) => c.id === columnaActiva)?.nombre || "Columna";

  return (
    <div>
    <div className="sticky top-0 z-10 bg-[#F7F5F0]">
      {dragging && (
        <p className="text-center text-xs font-bold text-[var(--tema-vinculo)] tracking-wide mb-1.5 animate-pulse">
          Soltá sobre una pestaña para mover el hilo
        </p>
      )}
      <ExcelTabsBar
        core={core}
        tabs={columnas}
        activeId={columnaActiva}
        incluirSinTab
        sinColumnaNombre={nombreSinColumna}
        onSelect={setColumnaActiva}
        onCreate={(nombre) => {
          const nueva = { id: uid("K"), nombre, orden: columnas.length };
          setCore((prev) => ({ ...prev, kanbanColumnas: [...(prev.kanbanColumnas || []), nueva] }));
          setColumnaActiva(nueva.id);
        }}
        onRename={(id, nombre) => setCore((prev) => ({ ...prev, kanbanColumnas: (prev.kanbanColumnas || []).map((c) => (c.id === id ? { ...c, nombre } : c)) }))}
        onRenameSinColumna={(nombre) => setCore((prev) => ({ ...prev, parametros: { ...prev.parametros, nombreSinColumnaSeguimientos: nombre } }))}
        onDelete={eliminarColumna}
        contarTab={contarColumna}
        tabsRef={tabsRef}
        hoverId={hoverColumnaId}
        dragging={dragging}
      />

      <div className="border-t border-[#E4DECF] my-3" />

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <button
          onClick={() => setShowNuevoHilo(true)}
          style={{ backgroundColor: "var(--tema-acento)", color: "#2A2118" }}
          className="h-8 flex items-center gap-1 text-[10px] font-bold tracking-wide px-2 rounded-sm shrink-0"
        >
          <Plus size={14} /> Hilo
        </button>
        <div className="flex items-center rounded-sm overflow-hidden border border-[#E4DECF] shrink-0">
          {[["activos", "Activos"], ["inactivos", "Inactivos"], ["todos", "Todos"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setEstadoFiltro(key)}
              style={estadoFiltro === key ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) } : { backgroundColor: core.tema.tarjeta, color: core.tema.mutedBase }}
              className="h-8 flex items-center text-[10px] font-bold tracking-wide px-2"
            >
              {label}
            </button>
          ))}
        </div>
        <label className="h-8 flex items-center gap-1.5 text-[11px] font-bold text-[#6B6352] ml-auto shrink-0">
          <input type="checkbox" checked={agruparPersona} onChange={(e) => setAgruparPersona(e.target.checked)} />
          Agrupar personas
        </label>
        <button
          onClick={() => setOrden((o) => (o === "asc" ? "desc" : "asc"))}
          aria-label={orden === "asc" ? "Más antiguas primero" : "Más recientes primero"}
          style={{ backgroundColor: core.tema.botonInactivo, color: core.tema.ink }}
          className="h-8 w-8 flex items-center justify-center rounded-sm shrink-0"
        >
          {orden === "asc" ? <ArrowDownAZ size={14} /> : <ArrowUpAZ size={14} />}
        </button>
      </div>

      <div className="border-t border-[#E4DECF] mb-3" />
    </div>

      {gruposActivos.length === 0 ? (
        <EmptyState icon={<Trello size={26} />} text={`No hay hilos en "${nombreColumnaActiva}" con este filtro. Arrastrá una tarjeta desde otra pestaña usando el ícono ⠿, o probá otro filtro de fecha.`} />
      ) : (
        <div>
          {gruposActivos.map((grupo, i) => (
            <Fragment key={grupo[0].id}>
              {i > 0 && <div className="flex justify-center py-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: core.tema.botonActivo }} /></div>}
              <HiloAgendaCard
                accionesBucket={grupo}
                core={core}
                setCore={setCore}
                acciones={acciones}
                setAcciones={setAcciones}
                onOpen={onOpen}
                t={t}
                onIniciarDrag={() => setDragging({ grupo })}
                arrastrando={dragging?.grupo === grupo}
              />
            </Fragment>
          ))}
        </div>
      )}

      {hilosSinAccion.length > 0 && (
        <div className="mt-4">
          <div className="border-t border-[#E4DECF] mb-3" />
          <p className="text-[11px] font-bold tracking-wide text-[#6B6352] mb-2">Sin acción programada ({hilosSinAccion.length})</p>
          <div>
            {hilosSinAccion.map((h, i) => (
              <Fragment key={h.id}>
                {i > 0 && <div className="flex justify-center py-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: core.tema.botonActivo }} /></div>}
                <HiloAgendaCard hilo={h} core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onOpen={onOpen} />
              </Fragment>
            ))}
          </div>
        </div>
      )}

      {showNuevoHilo && (
        <Modal title="Nuevo hilo" onClose={() => setShowNuevoHilo(false)}>
          <NuevoHiloForm
            core={core}
            setCore={setCore}
            acciones={acciones}
            setAcciones={setAcciones}
            onCreated={(hiloId) => { setShowNuevoHilo(false); onOpen("hilo", hiloId); }}
            onCancelar={() => setShowNuevoHilo(false)}
          />
        </Modal>
      )}
    </div>
  );
}

function HiloAgendaCard({ hilo: hiloProp, accionesBucket, core, setCore, acciones, setAcciones, onOpen, t, onIniciarDrag, arrastrando, standalone }) {
  const [showAvanzar, setShowAvanzar] = useState(false);
  const [showReprogramar, setShowReprogramar] = useState(false);
  const [showEditarTitulo, setShowEditarTitulo] = useState(false);
  const [showVincularCliente, setShowVincularCliente] = useState(false);
  const [showAgregarTarea, setShowAgregarTarea] = useState(false);
  const [editingAccion, setEditingAccion] = useState(null);
  const [deletingAccionId, setDeletingAccionId] = useState(null);
  const [verVinculos, setVerVinculos] = useState(false);
  const [verRelaciones, setVerRelaciones] = useState(false);
  const [verTareasVinculadas, setVerTareasVinculadas] = useState(false);
  const [verContextoPrimary, setVerContextoPrimary] = useState(false);
  const [verResumen, setVerResumen] = useState(false);
  const [verDetalle, setVerDetalle] = useState(false);
  const [verDetallesTarea, setVerDetallesTarea] = useState(false);
  const [verSubtareas, setVerSubtareas] = useState(false);
  const [verAdjuntos, setVerAdjuntos] = useState(false);
  const [showNuevaSubtarea, setShowNuevaSubtarea] = useState(false);
  const [editingSubtarea, setEditingSubtarea] = useState(null);
  const [deletingSubtareaId, setDeletingSubtareaId] = useState(null);
  const [confirmar, setConfirmar] = useState(null); // { texto, onConfirm }

  const hilo = hiloProp || (accionesBucket ? core.hilos.find((h) => h.id === accionesBucket[0].hiloId) : null);
  if (!hilo) return standalone ? <div><p className="text-sm text-[#8A8272]">Este hilo ya no existe.</p></div> : null;

  const id = hilo.id;
  const esTarea = hilo.tipo === "tarea";
  const persona = personaPrincipalDeHilo(hilo, core);
  const personasDelHilo = personasActivasDeHilo(hilo, core);
  const empresas = empresasDeHilo(hilo, core);
  const obras = obrasDeHilo(hilo, core);
  const entidadesDelHilo = [
    ...personasDelHilo.map((p) => ({ tipo: "Persona", id: p.id })),
    ...empresas.map((e) => ({ tipo: "Empresa", id: e.id })),
    ...obras.map((o) => ({ tipo: "Obra", id: o.id })),
  ];
  // Todas las relaciones (no solo con otras entidades del hilo) de cada persona/empresa/obra
  // vinculada a este hilo, sin duplicar cuando las dos puntas están en el hilo.
  const relacionesDelHilo = Array.from(
    new Map(
      entidadesDelHilo
        .flatMap((e) => vinculosDeEntidad(core, e.tipo, e.id, true))
        .filter((v) => v.origenTipo !== "Hilo" && v.destinoTipo !== "Hilo")
        .map((v) => [v.id, v])
    ).values()
  );
  const accionesDelHilo = acciones.filter((a) => a.hiloId === id);
  const bucket = accionesBucket || accionesDelHilo.filter((a) => a.estado === "Pendiente");
  const primary = bucket[0] || null;
  const tipoPrimary = primary ? core.tiposAccion.find((tt) => tt.id === primary.tipoAccionId) : null;
  const historial = accionesDelHilo.filter((a) => a.estado === "Realizada").sort(compararRecientePrimero);
  const origenPrimary = primary?.origenId ? accionesDelHilo.find((a) => a.id === primary.origenId) : null;
  const hiloRelacionado = hilo.hiloRelacionadoId ? core.hilos.find((h) => h.id === hilo.hiloRelacionadoId) : null;
  const tareasVinculadas = core.hilos.filter((h) => h.tipo === "tarea" && h.hiloRelacionadoId === id);

  // el color de la solapa refleja la más urgente de todas las pendientes de este bucket
  const hoy = t || todayISO();
  const masUrgente = primary ? bucket.reduce((min, a) => (a.fechaProgramada < min.fechaProgramada ? a : min), primary) : null;
  const diasFaltantes = masUrgente ? diasEntre(hoy, masUrgente.fechaProgramada) : null;
  const diasUrgente = core.parametros.diasUrgente ?? 3;
  const colorBorde = !masUrgente ? "var(--tema-urgenciaSinFecha)" : diasFaltantes < 0 ? "var(--tema-urgenciaVencida)" : diasFaltantes <= diasUrgente ? "var(--tema-urgenciaProxima)" : "var(--tema-urgenciaLejana)";
  const nombrePrincipal = esTarea ? hilo.titulo : (personasDelHilo.length > 0 ? personasDelHilo.map((p) => p.nombre).join(", ") : etiquetaVinculoHilo(hilo, core));
  const subtareas = hilo.subtareas || [];

  const toggleSubtarea = (subId) => setCore((prev) => ({
    ...prev,
    hilos: prev.hilos.map((h) => (h.id === id ? { ...h, subtareas: (h.subtareas || []).map((s) => (s.id === subId ? { ...s, hecha: !s.hecha } : s)) } : h)),
  }));
  const agregarSubtarea = (datos) => setCore((prev) => ({
    ...prev,
    hilos: prev.hilos.map((h) => (h.id === id ? { ...h, subtareas: [...(h.subtareas || []), { id: uid("ST"), hecha: false, ...datos }] } : h)),
  }));
  const editarSubtarea = (subId, datos) => setCore((prev) => ({
    ...prev,
    hilos: prev.hilos.map((h) => (h.id === id ? { ...h, subtareas: (h.subtareas || []).map((s) => (s.id === subId ? { ...s, ...datos } : s)) } : h)),
  }));
  const eliminarSubtarea = (subId) => setCore((prev) => ({
    ...prev,
    hilos: prev.hilos.map((h) => (h.id === id ? { ...h, subtareas: (h.subtareas || []).filter((s) => s.id !== subId) } : h)),
  }));

  const desvincularTarea = (tareaId) => setCore((prev) => ({
    ...prev,
    hilos: prev.hilos.map((h) => (h.id === tareaId ? { ...h, hiloRelacionadoId: null } : h)),
  }));
  // Agrega la persona al hilo y, si tiene empresas vinculadas, arrastra también esas
  // empresas y las obras de esas empresas (además de las obras vinculadas directamente
  // a la persona) — mismo criterio que al crear un hilo desde una persona.
  const agregarPersona = (personaId, comoPrincipal) => setCore((prev) => {
    const hiloActual = prev.hilos.find((h) => h.id === id);
    if (!hiloActual) return prev;
    const activos = participantesActivos(hiloActual, prev);
    const yaActivo = activos.some((p) => p.personaId === personaId);
    let vinculos = [...(prev.vinculos || [])];
    if (!yaActivo) {
      const seraPrincipal = comoPrincipal || activos.length === 0;
      if (seraPrincipal) vinculos = vinculos.map((v) => (esParticipanteActivoDeHilo(v, id) ? { ...v, principal: false } : v));
      vinculos.push(vinc("Persona", personaId, "Hilo", id, null, seraPrincipal, todayISO()));
    }
    const empresasDeEsaPersona = empresaIdsDePersona(prev, personaId);
    const yaEmpresas = new Set(contrapartesDe(prev, "Hilo", id, "Empresa", true).map(({ c }) => c.id));
    const nuevasEmpresas = empresasDeEsaPersona.filter((eid) => !yaEmpresas.has(eid));
    for (const eid of nuevasEmpresas) vinculos.push(vinc("Hilo", id, "Empresa", eid, null, false, todayISO()));
    const empresasParaObras = [...yaEmpresas, ...nuevasEmpresas];
    const obrasDirectas = obraIdsDirectasDePersona(prev, personaId);
    const obrasDeEmpresas = empresasParaObras.flatMap((eid) => obraIdsDeEmpresa(prev, eid));
    const yaObras = new Set(contrapartesDe(prev, "Hilo", id, "Obra", true).map(({ c }) => c.id));
    const nuevasObras = [...new Set([...obrasDirectas, ...obrasDeEmpresas])].filter((oid) => !yaObras.has(oid));
    for (const oid of nuevasObras) vinculos.push(vinc("Hilo", id, "Obra", oid, null, false, todayISO()));
    return { ...prev, vinculos };
  });
  const updateAccion = (accId, cambios) => setAcciones((prev) => prev.map((a) => (a.id === accId ? { ...a, ...cambios } : a)));
  const deleteAccion = (accId) => setAcciones((prev) => prev.filter((a) => a.id !== accId));
  const reprogramar = (nuevaFecha) => { if (primary) updateAccion(primary.id, { fechaProgramada: nuevaFecha }); setShowReprogramar(false); };

  const nombreLine = !esTarea && personasDelHilo.length > 0 ? (
    <p className="text-base font-extrabold text-[#2A2118] truncate">
      {personasDelHilo.map((p, i) => (
        <span key={p.id}>
          {i > 0 && ", "}
          <button onClick={() => onOpen("persona", p.id)} className="hover:underline underline-offset-2">{p.nombre}</button>
        </span>
      ))}
    </p>
  ) : (
    <p className="text-base font-extrabold text-[#2A2118] truncate" title={textoPlanoDeMenciones(nombrePrincipal)}><TextoConMenciones texto={nombrePrincipal} onOpen={onOpen} /></p>
  );

  // Si no hay persona, el título principal ya muestra la empresa (o si tampoco hay, la obra)
  // vía etiquetaVinculoHilo — así que ese mismo dato no se repite acá abajo.
  const esTituloEmpresa = !esTarea && personasDelHilo.length === 0 && empresas.length > 0;
  const esTituloObra = !esTarea && personasDelHilo.length === 0 && empresas.length === 0 && obras.length > 0;
  const empresasSubtitulo = esTituloEmpresa ? [] : empresas;
  const obrasSubtitulo = esTituloObra ? [] : obras;

  const empresasObrasLine = (empresasSubtitulo.length > 0 || obrasSubtitulo.length > 0) && (
    <p className="text-sm mt-0.5 truncate">
      {empresasSubtitulo.map((e, i) => (
        <span key={e.id}>
          {i > 0 && ", "}
          <button onClick={() => onOpen("empresa", e.id)} className="font-bold text-[#2A2118] hover:underline underline-offset-2">{e.denominacion}</button>
        </span>
      ))}
      {empresasSubtitulo.length > 0 && obrasSubtitulo.length > 0 && <span className="text-[#8A8272]"> · </span>}
      {obrasSubtitulo.map((o, i) => (
        <span key={o.id}>
          {i > 0 && ", "}
          <button onClick={() => onOpen("obra", o.id)} className="text-[#6B6352] hover:underline underline-offset-2">{o.nombre}</button>
        </span>
      ))}
    </p>
  );

  // Vínculos/Relaciones y Contexto/Resumen se reusan tal cual en los dos casos: para un
  // hilo de cliente van siempre visibles; para una tarea, adentro de "Ver/Ocultar detalles".
  // Piezas de contenido reutilizadas por la tarjeta de tarea (con su propio botón "Ver X" +
  // flecha arriba de cada una) y por la tarjeta de hilo de cliente (con la fila de pills
  // "filaPillsCliente" más abajo controlando estos mismos estados).
  const contenidoRelaciones = verRelaciones && (
    <div className="mt-2.5">
      {relacionesDelHilo.length === 0 ? (
        <p className="text-sm text-[#A69C88]">Sin relaciones cargadas.</p>
      ) : (
        <div className="space-y-1.5">
          {relacionesDelHilo.map((v) => {
            const tr = (core.tiposRelacion || []).find((t) => t.id === v.tipoRelacionId);
            const labelOrigen = entidadLabel(v.origenTipo, v.origenId, core);
            const labelDestino = entidadLabel(v.destinoTipo, v.destinoId, core);
            if (!labelOrigen || !labelDestino) return null;
            return (
              <div key={v.id} className="flex items-center flex-wrap gap-x-1 gap-y-0.5 text-sm">
                <button onClick={() => onOpen(v.origenTipo.toLowerCase(), v.origenId)} className="font-semibold text-[#2A2118]">{labelOrigen}</button>
                <span className="text-[#8A8272]">{tr ? nombreRelacionLado(tr, true) : "vinculado a"}</span>
                <button onClick={() => onOpen(v.destinoTipo.toLowerCase(), v.destinoId)} className="font-semibold text-[#2A2118]">{labelDestino}</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const contenidoVinculos = verVinculos && (
    <div className="mt-2.5 space-y-3">
      {esTarea && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-bold tracking-wide text-[#8A8272]">Hilo</p>
            {!hiloRelacionado && <button onClick={() => setShowVincularCliente(true)} className="text-xs font-bold text-[var(--tema-vinculo)]">+ Vincular</button>}
          </div>
          {hiloRelacionado ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              <button onClick={() => onOpen("hilo", hiloRelacionado.id)} className="text-left flex-1 min-w-0 font-semibold text-[#2A2118]">{hiloRelacionado.titulo}</button>
              <IconBtn label="Desvincular" danger onClick={() => setConfirmar({ texto: "¿Desvincular esta tarea del hilo de cliente?", onConfirm: () => setCore((prev) => ({ ...prev, hilos: prev.hilos.map((h) => (h.id === id ? { ...h, hiloRelacionadoId: null } : h)) })) })}><X size={14} /></IconBtn>
            </div>
          ) : (
            <p className="text-sm text-[#A69C88]">Sin hilo vinculado.</p>
          )}
        </div>
      )}

      <VinculosDeHilo hilo={hilo} hiloId={id} core={core} setCore={setCore} onOpen={onOpen} agregarPersona={agregarPersona} setConfirmar={setConfirmar} />
    </div>
  );

  const contenidoContexto = verContextoPrimary && (
    <p className="text-xs text-[#6B6352] mt-1">
      <span className="font-bold text-[#8A8272]">Se generó a partir de:</span>{" "}
      {origenPrimary ? (origenPrimary.notaHecho ? <TextoConMenciones texto={origenPrimary.notaHecho} onOpen={onOpen} /> : "Sin registro.") : "Es la primera acción de este hilo."}
    </p>
  );

  // mostrarBotonDetalle: la tarjeta de tarea sigue con el botón "Ver resumen detallado" pegado
  // al final de la lista; la de cliente lo controla desde la fila de pills, así que no lo repite acá.
  const contenidoResumenLista = (mostrarBotonDetalle) => verResumen && (
    <div className="mt-2">
      {historial.length === 0 ? (
        <p className="text-xs text-[#A69C88]">Todavía no hay acciones anteriores en este hilo.</p>
      ) : (
        <>
          {verDetalle ? (
            <div className="space-y-2">
              {historial.map((a) => <AccionCard key={a.id} accion={a} acciones={accionesDelHilo} core={core} onOpen={onOpen} onEdit={() => setEditingAccion(a)} onDelete={() => setDeletingAccionId(a.id)} />)}
            </div>
          ) : (
            <div className="space-y-1.5">
              {historial.map((a) => (
                <div key={a.id} className="text-xs">
                  <span className="font-mono text-[#8A8272]">{fmtDate(a.fechaRealizada)}</span>{" "}
                  <span className="text-[#6B6352]">{a.notaHecho ? <TextoConMenciones texto={a.notaHecho} onOpen={onOpen} /> : core.tiposAccion.find((tt) => tt.id === a.tipoAccionId)?.nombre}</span>
                </div>
              ))}
            </div>
          )}
          {mostrarBotonDetalle && (
            <button onClick={() => setVerDetalle((v) => !v)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5 mt-2">
              {verDetalle ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verDetalle ? "Ocultar resumen detallado" : "Ver resumen detallado"}
            </button>
          )}
        </>
      )}
    </div>
  );

  // Versión de la tarjeta de tarea: cada bloque con su propio botón "Ver X"/"Ocultar X" arriba,
  // igual que antes de separar contenido y botones.
  const bloqueVinculosRelaciones = (
    <>
      <div className="mt-1.5 flex items-center gap-3">
        <button onClick={() => setVerVinculos((v) => !v)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5">
          {verVinculos ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verVinculos ? "Ocultar vínculos" : "Ver vínculos"}
        </button>
        <button onClick={() => setVerRelaciones((v) => !v)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5">
          {verRelaciones ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verRelaciones ? "Ocultar relaciones" : "Ver relaciones"}
        </button>
      </div>
      {contenidoRelaciones}
      <div className="mt-1.5">{contenidoVinculos}</div>
    </>
  );

  const bloqueContextoResumen = primary && (
    <div className="mt-1.5">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => setVerContextoPrimary((v) => !v)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5">
          {verContextoPrimary ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verContextoPrimary ? "Ocultar contexto" : "Ver contexto"}
        </button>
        <button onClick={() => { setVerResumen((v) => !v); setVerDetalle(false); }} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5">
          {verResumen ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verResumen ? "Ocultar resumen" : "Ver resumen"}
        </button>
      </div>
      {contenidoContexto}
      {contenidoResumenLista(true)}
    </div>
  );

  // Fila única de pills de la tarjeta de hilo de cliente: reemplaza los botones "Ver X/Ocultar
  // X" con flecha (ocupaban varios renglones) por chips angostos de color fijo — el estado se
  // ve por el relleno, no por el texto — todos en un mismo renglón con scroll horizontal si no
  // entran. Incluye "Todo" para desplegar/plegar los demás de una. Solo entran acá los pills
  // efectivamente disponibles (contexto/resumen requieren una acción pendiente; resumen
  // detallado requiere además que haya historial).
  const togglesDesplegables = [
    [verVinculos, setVerVinculos],
    [verRelaciones, setVerRelaciones],
    [verAdjuntos, setVerAdjuntos],
    ...(primary ? [[verContextoPrimary, setVerContextoPrimary], [verResumen, setVerResumen]] : []),
    ...(primary && historial.length > 0 ? [[verDetalle, setVerDetalle]] : []),
  ];
  const todoDesplegado = togglesDesplegables.every(([v]) => v);
  const toggleTodosDesplegables = () => {
    const nuevoValor = !todoDesplegado;
    togglesDesplegables.forEach(([, set]) => set(nuevoValor));
  };
  const filaPillsCliente = (
    <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
      <PillToggle activo={todoDesplegado} onClick={toggleTodosDesplegables}>Todo</PillToggle>
      <PillToggle activo={verVinculos} onClick={() => setVerVinculos((v) => !v)}>Vínculos</PillToggle>
      <PillToggle activo={verRelaciones} onClick={() => setVerRelaciones((v) => !v)}>Relaciones</PillToggle>
      <PillToggle activo={verAdjuntos} marcado={(hilo.adjuntos || []).length > 0} onClick={() => setVerAdjuntos((v) => !v)}>Adjuntos</PillToggle>
      {primary && <PillToggle activo={verContextoPrimary} onClick={() => setVerContextoPrimary((v) => !v)}>Contexto</PillToggle>}
      {primary && <PillToggle activo={verResumen} onClick={() => { setVerResumen((v) => !v); setVerDetalle(false); }}>Resumen</PillToggle>}
      {primary && verResumen && historial.length > 0 && <PillToggle activo={verDetalle} onClick={() => setVerDetalle((v) => !v)}>Detallado</PillToggle>}
    </div>
  );

  // Checklist de subtareas (solo tareas) — se muestra adentro de "Ver/Ocultar detalles".
  const bloqueSubtareas = esTarea && (
    <div>
      <p className="text-[10px] font-bold tracking-wide text-[#8A8272] mb-1.5">Subtareas</p>
      {subtareas.map((s) => (
        <div key={s.id} className="flex items-start gap-1.5 py-1">
          <button
            type="button"
            onClick={() => toggleSubtarea(s.id)}
            aria-label={s.hecha ? "Marcar subtarea como pendiente" : "Marcar subtarea como completada"}
            className="shrink-0 rounded-full flex items-center justify-center mt-0.5"
            style={{ width: 14, height: 14, backgroundColor: s.hecha ? "var(--tema-estadoRealizada)" : "#FFFFFF", border: `2px solid ${s.hecha ? "var(--tema-estadoRealizada)" : "#C9C1AE"}` }}
          >
            {s.hecha && <Check size={9} color="#FFFFFF" strokeWidth={3} />}
          </button>
          <div className="flex-1 min-w-0">
            <p className={`text-xs ${s.hecha ? "line-through text-[#A69C88]" : "text-[#2A2118]"}`}>{s.texto}</p>
            {(s.fecha || s.hora || s.nota) && (
              <p className="text-[10px] text-[#8A8272] mt-0.5">
                {s.fecha ? fmtDateHora(s.fecha, s.hora) : (s.hora ? `${s.hora} hs` : "")}
                {(s.fecha || s.hora) && s.nota && " · "}
                {s.nota}
              </p>
            )}
          </div>
          <IconBtn label="Editar subtarea" onClick={() => setEditingSubtarea(s)}><Pencil size={11} /></IconBtn>
          <IconBtn label="Eliminar subtarea" danger onClick={() => setDeletingSubtareaId(s.id)}><Trash2 size={11} /></IconBtn>
        </div>
      ))}
      <button type="button" onClick={() => setShowNuevaSubtarea(true)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] mt-1">+ Agregar subtarea</button>
    </div>
  );

  // Todos los modales/confirmaciones de la tarjeta — iguales para hilo de cliente y tarea.
  const modales = (
    <>
      {showReprogramar && primary && (
        <ReprogramarModal
          fechaActual={primary.fechaProgramada}
          core={core}
          onClose={() => setShowReprogramar(false)}
          onSave={reprogramar}
        />
      )}

      {showAvanzar && (
        <AvanzarHiloForm
          hilo={hilo}
          pendienteActual={primary}
          core={core}
          setCore={setCore}
          acciones={acciones}
          setAcciones={setAcciones}
          onClose={() => setShowAvanzar(false)}
        />
      )}

      {showNuevaSubtarea && (
        <SubtareaForm onSave={(datos) => { agregarSubtarea(datos); setShowNuevaSubtarea(false); }} onSaveYNueva={agregarSubtarea} onClose={() => setShowNuevaSubtarea(false)} />
      )}
      {editingSubtarea && (
        <SubtareaForm initial={editingSubtarea} onSave={(datos) => { editarSubtarea(editingSubtarea.id, datos); setEditingSubtarea(null); }} onClose={() => setEditingSubtarea(null)} />
      )}
      {deletingSubtareaId && (
        <ConfirmDeleteModal
          title="Eliminar subtarea"
          texto="¿Eliminar esta subtarea? No se puede deshacer."
          onCancel={() => setDeletingSubtareaId(null)}
          onConfirm={() => { eliminarSubtarea(deletingSubtareaId); setDeletingSubtareaId(null); }}
        />
      )}

      {showEditarTitulo && (
        esTarea ? (
          <Modal title="Editar tarea" onClose={() => setShowEditarTitulo(false)}>
            <EditarTareaForm hilo={hilo} core={core} setCore={setCore} onClose={() => setShowEditarTitulo(false)} />
          </Modal>
        ) : (
          <Modal title="Editar hilo" onClose={() => setShowEditarTitulo(false)}>
            <EditarHiloPrincipalForm hilo={hilo} core={core} setCore={setCore} onClose={() => setShowEditarTitulo(false)} />
          </Modal>
        )
      )}

      {showVincularCliente && (
        <Modal title="Vincular a un hilo de cliente" onClose={() => setShowVincularCliente(false)}>
          {core.hilos.filter((h) => h.tipo === "cliente" && h.estado === "Activo").length === 0 ? (
            <p className="text-sm text-[#A69C88]">No hay hilos de clientes activos para vincular.</p>
          ) : (
            <Field label="Hilo de cliente">
              <BuscadorSelect
                opciones={core.hilos.filter((h) => h.tipo === "cliente" && h.estado === "Activo").map((h) => {
                  const p = personaPrincipalDeHilo(h, core);
                  return { id: h.id, label: p ? `${h.titulo} · ${p.nombre}` : h.titulo };
                })}
                value=""
                onChange={(hiloElegidoId) => {
                  if (!hiloElegidoId) return;
                  setCore((prev) => ({ ...prev, hilos: prev.hilos.map((hh) => (hh.id === id ? { ...hh, hiloRelacionadoId: hiloElegidoId } : hh)) }));
                  setShowVincularCliente(false);
                }}
                placeholder="Buscar hilo de cliente..."
              />
            </Field>
          )}
        </Modal>
      )}

      {showAgregarTarea && (
        <Modal title="Agregar tarea" onClose={() => setShowAgregarTarea(false)}>
          <AgregarTareaAlHiloForm
            core={core}
            hiloClienteId={id}
            personasDelHilo={personasDelHilo}
            onVincular={(tareaId) => {
              setCore((prev) => ({ ...prev, hilos: prev.hilos.map((h) => (h.id === tareaId ? { ...h, hiloRelacionadoId: id } : h)) }));
            }}
            onCrear={(nuevoHilo) => setCore((prev) => ({ ...prev, hilos: [nuevoHilo, ...prev.hilos] }))}
            onClose={() => setShowAgregarTarea(false)}
          />
        </Modal>
      )}

      {editingAccion && (
        <EditAccionForm
          accion={editingAccion}
          core={core}
          setCore={setCore}
          otrasAccionesDelHilo={accionesDelHilo.filter((a) => a.id !== editingAccion.id)}
          onClose={() => setEditingAccion(null)}
          onSave={(cambios) => { updateAccion(editingAccion.id, cambios); setEditingAccion(null); }}
        />
      )}

      {deletingAccionId && (
        <Modal title="¿Eliminar esta acción?" onClose={() => setDeletingAccionId(null)}>
          <p className="text-sm text-[#2A2118] mb-4">{textoUsoRegistro(accionesDelHilo.filter((a) => a.id !== deletingAccionId && (a.origenId === deletingAccionId || a.destinoId === deletingAccionId)).length, "acción", "acciones", "Van a perder la referencia de contexto (\"Ver contexto\") a esta acción.")}</p>
          <div className="flex gap-2">
            <button onClick={() => setDeletingAccionId(null)} className="flex-1 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#6B6352]">Cancelar</button>
            <button onClick={() => { deleteAccion(deletingAccionId); setDeletingAccionId(null); }} style={{ backgroundColor: "var(--tema-peligro)", color: "#FFFFFF" }} className="flex-1 rounded-sm py-2.5 font-bold text-sm">Sí, eliminar</button>
          </div>
        </Modal>
      )}

      {confirmar && (
        <ConfirmDeleteModal title="¿Confirmás?" texto={confirmar.texto} confirmLabel="Sí" onCancel={() => setConfirmar(null)} onConfirm={() => { confirmar.onConfirm(); setConfirmar(null); }} />
      )}
    </>
  );

  if (esTarea) {
    return (
      <div className="bg-white border border-[#E4DECF] rounded-sm p-3 relative" style={{ opacity: arrastrando ? 0.35 : 1 }}>
        {/* Encabezado mínimo: casilla, ícono, título+fecha chica y editar quedan siempre visibles. */}
        <div className="flex items-start gap-2.5 min-w-0">
          <CasillaFinalizar hilo={hilo} acciones={accionesDelHilo} setCore={setCore} size={18} />
          <div
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold"
            style={{ backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) }}
          >
            <ListChecks size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-extrabold text-[#2A2118] truncate" title={textoPlanoDeMenciones(hilo.titulo)}><TextoConMenciones texto={hilo.titulo} onOpen={onOpen} /></p>
            {(hilo.fecha || hilo.hora) && (
              <p className="text-[10px] text-[#8A8272] mt-0.5">
                {hilo.fecha ? fmtDateHora(hilo.fecha, hilo.hora) : `${hilo.hora} hs`}
              </p>
            )}
          </div>
          <IconBtn label="Editar título" onClick={() => setShowEditarTitulo(true)}><Pencil size={13} /></IconBtn>
          {hilo.estado === "Cerrado" && <Chip tone="estadoCerradoInactivo">{hilo.estado}</Chip>}
          {onIniciarDrag && (
            <button
              onPointerDown={(e) => { e.preventDefault(); onIniciarDrag(); }}
              onTouchStart={(e) => { e.preventDefault(); onIniciarDrag(); }}
              aria-label="Arrastrar a otra columna"
              style={{ touchAction: "none" }}
              className="shrink-0 text-[#8A8272] cursor-grab active:cursor-grabbing p-1 -mr-1"
            >
              <GripVertical size={16} />
            </button>
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-3 flex-wrap">
          <button onClick={() => setVerSubtareas((v) => !v)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5">
            {verSubtareas ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verSubtareas ? "Ocultar subtareas" : "Ver subtareas"}
          </button>
          <button onClick={() => setVerAdjuntos((v) => !v)} className={`text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5 ${(hilo.adjuntos || []).length > 0 ? "underline underline-offset-2" : ""}`}>
            {verAdjuntos ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verAdjuntos ? "Ocultar adjuntos" : "Ver adjuntos"}
          </button>
          <button onClick={() => setVerDetallesTarea((v) => !v)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5">
            {verDetallesTarea ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verDetallesTarea ? "Ocultar detalles" : "Ver detalles"}
          </button>
        </div>

        {/* Desplegar "detalles" también muestra las subtareas y los adjuntos; desplegar solo
            "subtareas" o solo "adjuntos" no abre "detalles". */}
        {(verSubtareas || verDetallesTarea) && (
          <div className="mt-2.5">
            {bloqueSubtareas}
          </div>
        )}

        {(verAdjuntos || verDetallesTarea) && (
          <div className="mt-2.5">
            <AdjuntosDeHilo hilo={hilo} hiloId={id} setCore={setCore} setConfirmar={setConfirmar} />
          </div>
        )}

        {verDetallesTarea && (
          <div className="mt-3 pt-3 border-t border-dashed border-[#E4DECF] space-y-3">
            {hilo.notas && (
              <p className="text-xs text-[#2A2118]"><TextoConMenciones texto={hilo.notas} onOpen={onOpen} /></p>
            )}

            {bloqueVinculosRelaciones}

            {primary && (
              <div className="flex items-start justify-between gap-2">
                {primary.notaPlanificada ? (
                  <p className="text-xs font-bold text-[#2A2118] pl-2.5 flex-1 min-w-0" style={{ borderLeft: `10px solid ${colorBorde}` }}><TextoConMenciones texto={primary.notaPlanificada} onOpen={onOpen} /></p>
                ) : <span />}
                <div className="flex items-center gap-0.5 shrink-0">
                  <IconBtn label="Editar acción" onClick={() => setEditingAccion(primary)}><Pencil size={16} /></IconBtn>
                  <IconBtn label="Eliminar acción" danger onClick={() => setDeletingAccionId(primary.id)}><Trash2 size={16} /></IconBtn>
                </div>
              </div>
            )}

            {bloqueContextoResumen}

            {bucket.length > 1 && (
              <p className="text-[10px] text-[var(--tema-peligro)] font-bold tracking-wide">⚠ Este hilo tiene {bucket.length} acciones pendientes a la vez — revisalo, no debería pasar.</p>
            )}

            <div className="flex items-center gap-1.5 flex-nowrap">
              <div className="flex items-center gap-1.5 ml-auto min-w-0">
                {primary && tipoPrimary && <span className="min-w-0 flex-1 truncate text-right text-xs font-mono font-bold text-black" title={tipoPrimary.nombre}>{tipoPrimary.nombre}</span>}
                {primary && (
                  <span className="shrink-0 text-[11px] font-bold font-mono px-2 py-1 rounded-sm bg-[#F1DFB9] text-[#5C3F18]">
                    {fmtDate(masUrgente.fechaProgramada)}
                  </span>
                )}
                {primary && <span className="shrink-0"><IconBtn label="Reprogramar" onClick={() => setShowReprogramar(true)}><Pencil size={13} /></IconBtn></span>}
                {primary?.recurrente && <Repeat size={12} className="shrink-0 text-[#8A8272]" />}
                {primary && (
                  <button
                    type="button"
                    onClick={() => setShowAvanzar(true)}
                    className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-1 rounded-sm"
                    style={{ backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) }}
                  >
                    <ChevronRight size={12} /> Hilo
                  </button>
                )}
              </div>
            </div>

            {!primary && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-[#A69C88]">Sin acciones programadas.</p>
                <button
                  type="button"
                  onClick={() => setShowAvanzar(true)}
                  className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-1 rounded-sm"
                  style={{ backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) }}
                >
                  <ChevronRight size={12} /> Avanzar
                </button>
              </div>
            )}
          </div>
        )}

        {modales}
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E4DECF] rounded-sm p-3 relative" style={{ opacity: arrastrando ? 0.35 : 1 }}>
      {/* Bloque 1: persona, empresa, obra */}
      <div className="flex items-start gap-2.5 min-w-0 mt-1">
        <CasillaFinalizar hilo={hilo} acciones={accionesDelHilo} setCore={setCore} size={18} />
        <div
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold"
          style={{ backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) }}
        >
          {getIniciales(nombrePrincipal)}
        </div>
        <div className="min-w-0 flex-1 flex items-start gap-1">
          <div className="min-w-0 flex-1">
            {nombreLine}
            {empresasObrasLine}
          </div>
        </div>
        {persona && <WhatsAppLink persona={persona} size={15} />}
        {hilo.estado === "Cerrado" && <Chip tone="estadoCerradoInactivo">{hilo.estado}</Chip>}
        {onIniciarDrag && (
          <button
            onPointerDown={(e) => { e.preventDefault(); onIniciarDrag(); }}
            onTouchStart={(e) => { e.preventDefault(); onIniciarDrag(); }}
            aria-label="Arrastrar a otra columna"
            style={{ touchAction: "none" }}
            className="shrink-0 text-[#8A8272] cursor-grab active:cursor-grabbing p-1 -mr-1"
          >
            <GripVertical size={16} />
          </button>
        )}
      </div>

      {filaPillsCliente}
      {contenidoRelaciones}
      <div className="mt-1.5">{contenidoVinculos}</div>
      {verAdjuntos && (
        <div className="mt-2.5">
          <AdjuntosDeHilo hilo={hilo} hiloId={id} setCore={setCore} setConfirmar={setConfirmar} />
        </div>
      )}

      {/* Bloque 2: tema del hilo */}
      <div className="mt-2 pt-2 border-t border-dashed border-[#E4DECF]">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold tracking-wide text-[#A69C88] mb-0.5">Tema del hilo</p>
          <IconBtn label="Editar hilo" onClick={() => setShowEditarTitulo(true)}><Pencil size={12} /></IconBtn>
        </div>
        <p className="text-base font-extrabold text-[#2A2118]"><TextoConMenciones texto={hilo.titulo} onOpen={onOpen} /></p>
      </div>

      {hilo.estado === "Cerrado" && hilo.notaCierre && (
        <p className="text-xs text-[#6B6352] mt-2 italic bg-[#F7F5F0] rounded-sm p-2">"{hilo.notaCierre}"</p>
      )}

      {/* Bloque 3: actividad programada */}
      {primary && (
        <div className="flex items-start justify-between gap-2 mt-2">
          {primary.notaPlanificada ? (
            <p className="text-xs font-bold text-[#2A2118] pl-2.5 flex-1 min-w-0" style={{ borderLeft: `10px solid ${colorBorde}` }}><TextoConMenciones texto={primary.notaPlanificada} onOpen={onOpen} /></p>
          ) : <span />}
          <div className="flex items-center gap-0.5 shrink-0">
            <IconBtn label="Editar acción" onClick={() => setEditingAccion(primary)}><Pencil size={16} /></IconBtn>
            <IconBtn label="Eliminar acción" danger onClick={() => setDeletingAccionId(primary.id)}><Trash2 size={16} /></IconBtn>
          </div>
        </div>
      )}

      <div className="mt-1.5">
        {contenidoContexto}
        {contenidoResumenLista(false)}
      </div>

      {bucket.length > 1 && (
        <p className="text-[10px] text-[var(--tema-peligro)] font-bold tracking-wide mt-1.5">⚠ Este hilo tiene {bucket.length} acciones pendientes a la vez — revisalo, no debería pasar.</p>
      )}

      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-dashed border-[#E4DECF] flex-nowrap">
        <div className="shrink-0 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setVerTareasVinculadas((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6B6352] bg-[#F7F5F0] border border-[#E4DECF] rounded-sm px-2 py-1"
          >
            <ListChecks size={11} /> {tareasVinculadas.length} tarea{tareasVinculadas.length === 1 ? "" : "s"}
          </button>
          <button type="button" onClick={() => setShowAgregarTarea(true)} aria-label="Agregar tarea" className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center">
            <Plus size={13} />
          </button>
        </div>
        <div className="flex items-center gap-1.5 ml-auto min-w-0">
          {personasDelHilo.length > 1 && (
            <span className="shrink-0 flex items-center">
              {personasDelHilo.map((p) => (
                <span
                  key={p.id}
                  className="w-5 h-5 rounded-full bg-[#F1DFB9] text-[#5C3F18] text-[9px] font-extrabold flex items-center justify-center border-2 -ml-1.5 first:ml-0"
                  style={{ borderColor: core.tema.tarjeta }}
                >
                  {getIniciales(p.nombre)}
                </span>
              ))}
            </span>
          )}
          {primary && tipoPrimary && <span className="min-w-0 flex-1 truncate text-right text-xs font-mono font-bold text-black" title={tipoPrimary.nombre}>{tipoPrimary.nombre}</span>}
          {primary && (
            <span className="shrink-0 text-[11px] font-bold font-mono px-2 py-1 rounded-sm bg-[#F1DFB9] text-[#5C3F18]">
              {fmtDate(masUrgente.fechaProgramada)}
            </span>
          )}
          {primary && <span className="shrink-0"><IconBtn label="Reprogramar" onClick={() => setShowReprogramar(true)}><Pencil size={13} /></IconBtn></span>}
          {primary?.recurrente && <Repeat size={12} className="shrink-0 text-[#8A8272]" />}
          {primary && (
            <button
              type="button"
              onClick={() => setShowAvanzar(true)}
              className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-1 rounded-sm"
              style={{ backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) }}
            >
              <ChevronRight size={12} /> Hilo
            </button>
          )}
        </div>
      </div>

      {verTareasVinculadas && tareasVinculadas.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {tareasVinculadas.map((tv) => (
            <div key={tv.id} className="flex items-center justify-between gap-2 text-sm bg-[#F7F5F0] border border-[#E4DECF] rounded-sm px-2 py-1.5">
              <button onClick={() => onOpen("hilo", tv.id)} className="text-left flex-1 min-w-0 flex items-center gap-1.5">
                <span className={tv.estado === "Cerrado" ? "line-through text-[#A69C88]" : "text-[#2A2118] font-semibold"}>{tv.titulo}</span>
                {tv.estado === "Cerrado" && <Chip tone="estadoCerradoInactivo">Cerrada</Chip>}
              </button>
              <IconBtn label="Desvincular" danger onClick={() => setConfirmar({ texto: "¿Desvincular esta tarea del hilo?", onConfirm: () => desvincularTarea(tv.id) })}><X size={14} /></IconBtn>
            </div>
          ))}
          <button onClick={() => setShowAgregarTarea(true)} className="text-xs font-bold text-[var(--tema-vinculo)]">+ Agregar tarea</button>
        </div>
      )}

      {!primary && (
        <>
          <p className="text-xs text-[#A69C88] mt-2">Sin próxima acción programada.</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <PrimaryBtn core={core} onClick={() => setShowAvanzar(true)}>Avanzar este hilo</PrimaryBtn>
          </div>
        </>
      )}

      {modales}
    </div>
  );
}

function HiloScreen({ id, core, setCore, acciones, setAcciones, onClose, onOpen }) {
  return (
    <div>
      <BackHeader onClose={onClose} />
      <HiloAgendaCard hilo={core.hilos.find((h) => h.id === id)} core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onOpen={onOpen} standalone />
    </div>
  );
}

function ReprogramarModal({ fechaActual, core, onClose, onSave }) {
  const [fecha, setFecha] = useState(fechaActual || todayISO());
  const [confirmar, setConfirmar] = useState(false);
  const inhabil = esFechaInhabil(fecha, core.parametros);

  const intentarGuardar = () => {
    if (!fecha) return;
    if (inhabil && !confirmar) { setConfirmar(true); return; }
    onSave(fecha);
  };

  return (
    <Modal title="Reprogramar acción" onClose={onClose}>
      <Field label="Nueva fecha">
        <input type="date" className={inputCls} value={fecha} onChange={(e) => { setFecha(e.target.value); setConfirmar(false); }} />
      </Field>
      {inhabil && (
        <div className="bg-[#FBEEE7] border border-[var(--tema-acento)] rounded-sm p-2.5 mb-3">
          <p className="text-xs text-[#2A2118]">Ese día está marcado como no hábil (fin de semana, día bloqueado, o fecha puntual que agregaste). ¿Confirmás igual?</p>
        </div>
      )}
      <PrimaryBtn full onClick={intentarGuardar}>{inhabil && confirmar ? "Sí, guardar igual" : "Guardar nueva fecha"}</PrimaryBtn>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------
function PersonasView({ core, setCore, onOpen }) {
  const [modal, setModal] = useState(null); // null | {} (new) | persona (edit)
  const [q, setQ] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const usoDeletingId = deletingId ? vinculosDeEntidad(core, "Persona", deletingId, true).length : 0;
  const [googleEstado, setGoogleEstado] = useState("verificando"); // verificando | noConectado | sincronizando | ok | reconectar | sinEtiqueta | error
  const [googleLabel, setGoogleLabel] = useState("");
  const yaSincronizoRef = useRef(false);

  const sincronizarGoogle = async () => {
    setGoogleEstado("sincronizando");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setGoogleEstado("noConectado"); return; }
      const res = await fetch("/api/google/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!data.connected) { setGoogleEstado("noConectado"); return; }
      if (data.error === "reconectar") { setGoogleEstado("reconectar"); return; }
      if (data.error === "sin_etiqueta") { setGoogleLabel(data.label || core.parametros.googleContactsLabel || "CRM"); setGoogleEstado("sinEtiqueta"); return; }
      if (data.personas) setCore((prev) => ({ ...prev, personas: data.personas }));
      setGoogleEstado("ok");
    } catch {
      setGoogleEstado("noConectado");
    }
  };

  useEffect(() => {
    if (yaSincronizoRef.current) return;
    yaSincronizoRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const googleParam = params.get("google");
    if (googleParam) window.history.replaceState({}, "", window.location.pathname);
    if (googleParam === "error") { setGoogleEstado("error"); return; }
    sincronizarGoogle();
  }, []); // eslint-disable-line

  const conectarGoogle = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const params = new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      redirect_uri: `${window.location.origin}/api/google/callback`,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/contacts.readonly",
      access_type: "offline",
      prompt: "consent",
      state: session.access_token,
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  };

  const desconectarGoogle = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch("/api/google/disconnect", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
    setGoogleEstado("noConectado");
  };

  const list = core.personas.filter((p) => p.nombre.toLowerCase().includes(q.toLowerCase()));

  const savePersona = (data) => {
    setCore((prev) => {
      const exists = prev.personas.some((p) => p.id === data.id);
      return { ...prev, personas: exists ? prev.personas.map((p) => (p.id === data.id ? data : p)) : [data, ...prev.personas] };
    });
    setModal(null);
  };

  const deletePersona = (id) => {
    setCore((prev) => ({
      ...prev,
      personas: prev.personas.filter((p) => p.id !== id),
      vinculos: (prev.vinculos || []).filter((v) => !(v.origenTipo === "Persona" && v.origenId === id) && !(v.destinoTipo === "Persona" && v.destinoId === id)),
      entidadEtiqueta: prev.entidadEtiqueta.filter((r) => !(r.entidadTipo === "Persona" && r.entidadId === id)),
    }));
  };

  return (
    <div>
    <div className="sticky top-0 z-10 bg-[#F7F5F0]">
      {(googleEstado === "noConectado" || googleEstado === "reconectar" || googleEstado === "error") && (
        <div className="bg-white border border-[#E4DECF] rounded-sm p-3 mb-3 flex items-center justify-between gap-2">
          <p className="text-xs text-[#6B6352]">
            {googleEstado === "reconectar"
              ? "Tu conexión con Google Contacts venció."
              : googleEstado === "error"
              ? "No se pudo conectar con Google. Probá de nuevo."
              : "Traé tus contactos automáticamente desde Google (nombre y teléfono)."}
          </p>
          <button onClick={conectarGoogle} className="shrink-0 bg-[var(--tema-acento)] text-[#2A2118] rounded-sm px-3 py-1.5 font-bold text-xs">
            {googleEstado === "reconectar" ? "Reconectar" : "Conectar Google"}
          </button>
        </div>
      )}
      {googleEstado === "sinEtiqueta" && (
        <div className="bg-[#FBEEE7] border border-[var(--tema-acento)] rounded-sm p-3 mb-3">
          <p className="text-xs text-[#2A2118]">
            Conectado, pero todavía no encontré la etiqueta <b>"{googleLabel}"</b> en tus Contactos de Google. Creala ahí y asignásela a los contactos que querés traer acá — los personales, sin esa etiqueta, no se importan.
          </p>
        </div>
      )}
      {googleEstado === "sincronizando" && (
        <p className="text-[10px] text-[#A69C88] mb-2">Sincronizando con Google Contacts...</p>
      )}
      {googleEstado === "ok" && (
        <p className="text-[10px] text-[#A69C88] mb-3">
          Google Contacts conectado · <button onClick={desconectarGoogle} className="underline font-bold">Desconectar</button>
        </p>
      )}

      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A69C88]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar persona..." className={`${inputCls} pl-8`} />
        </div>
        <button onClick={() => setModal({})} className="shrink-0 bg-[var(--tema-acento)] text-[#2A2118] rounded-sm px-3 py-1 flex flex-col items-center justify-center gap-0.5 leading-none">
          <span className="text-[9px] font-bold">{core.personas.length}</span>
          <Plus size={16} />
        </button>
      </div>
    </div>

      {list.length === 0 ? (
        <EmptyState icon={<Users size={26} />} text="No hay personas cargadas todavía." />
      ) : (
        <div className="space-y-2">
          {list.map((p) => {
            const empresas = empresaIdsDePersona(core, p.id).map((eid) => core.empresas.find((e) => e.id === eid)?.denominacion).filter(Boolean);
            return (
              <div key={p.id} className="w-full bg-white border border-[#E4DECF] rounded-sm p-3 flex items-center gap-3">
                <button onClick={() => onOpen("persona", p.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-xs shrink-0"
                    style={{ backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) }}
                  >
                    {getIniciales(p.nombre)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#2A2118] truncate" title={p.nombre}>{p.nombre}</p>
                    <p className="text-xs text-[#8A8272] truncate" title={empresas.length ? empresas.join(", ") : "Sin empresa vinculada"}>{empresas.length ? empresas.join(", ") : "Sin empresa vinculada"}</p>
                  </div>
                </button>
                <WhatsAppLink persona={p} size={17} />
                <IconBtn label="Editar persona" onClick={() => setModal(p)}><Pencil size={15} /></IconBtn>
                <IconBtn label="Eliminar persona" danger onClick={() => setDeletingId(p.id)}><Trash2 size={15} /></IconBtn>
                <ChevronRight size={16} className="text-[#C9C1AE] shrink-0" />
              </div>
            );
          })}
        </div>
      )}

      {modal !== null && <PersonaForm initial={modal} core={core} setCore={setCore} onSave={savePersona} onDelete={modal.id ? () => { deletePersona(modal.id); setModal(null); } : null} onClose={() => setModal(null)} />}
      {deletingId && (
        <Modal title="¿Eliminar esta persona?" onClose={() => setDeletingId(null)}>
          <p className="text-sm text-[#2A2118] mb-4">{textoUsoRegistro(usoDeletingId, "vínculo", "vínculos", "Se borran junto con la persona (empresas, obras, hilos).")} Su historial de acciones no se toca (queda huérfano, referenciado por un id inexistente).</p>
          <div className="flex gap-2">
            <button onClick={() => setDeletingId(null)} className="flex-1 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#6B6352]">Cancelar</button>
            <button onClick={() => { deletePersona(deletingId); setDeletingId(null); }} style={{ backgroundColor: "var(--tema-peligro)", color: "#FFFFFF" }} className="flex-1 rounded-sm py-2.5 font-bold text-sm">Sí, eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PersonaForm({ initial, core, setCore, onSave, onDelete, onClose }) {
  const [nombre, setNombre] = useState(initial.nombre || "");
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp || "");
  const [direccion, setDireccion] = useState(initial.direccion || "");
  const [ciudad, setCiudad] = useState(initial.ciudad || "");
  const [notas, setNotas] = useState(initial.notas || "");
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  const [empresaIds, setEmpresaIds] = useState([]);
  const [empresaParaAgregar, setEmpresaParaAgregar] = useState("");
  const [showNuevaEmpresa, setShowNuevaEmpresa] = useState(false);

  const [obraIds, setObraIds] = useState([]);
  const [obraParaAgregar, setObraParaAgregar] = useState("");
  const [showNuevaObra, setShowNuevaObra] = useState(false);

  const agregarEmpresa = () => {
    if (!empresaParaAgregar) return;
    setEmpresaIds((ids) => [...ids, empresaParaAgregar]);
    setEmpresaParaAgregar("");
  };
  const quitarEmpresa = (eid) => setEmpresaIds((ids) => ids.filter((x) => x !== eid));

  const agregarObra = () => {
    if (!obraParaAgregar) return;
    setObraIds((ids) => [...ids, obraParaAgregar]);
    setObraParaAgregar("");
  };
  const quitarObra = (oid) => setObraIds((ids) => ids.filter((x) => x !== oid));

  const submit = () => {
    if (!nombre.trim()) return;
    const personaId = initial.id || uid("P");
    if (empresaIds.length > 0 || obraIds.length > 0) {
      setCore((prev) => {
        const empresaIdsYaLinkeadas = new Set(empresaIds);
        const nuevos = empresaIds.map((empresaId) => vinc("Persona", personaId, "Empresa", empresaId, null, false, todayISO()));
        for (const obraId of obraIds) {
          nuevos.push(vinc("Persona", personaId, "Obra", obraId, null, false, todayISO()));
          const dueña = empresaDueñaDeObra(prev, obraId);
          if (dueña && !empresaIdsYaLinkeadas.has(dueña)) {
            nuevos.push(vinc("Persona", personaId, "Empresa", dueña, null, false, todayISO()));
            empresaIdsYaLinkeadas.add(dueña);
          }
        }
        return { ...prev, vinculos: [...(prev.vinculos || []), ...nuevos] };
      });
    }
    onSave({ id: personaId, nombre: nombre.trim(), whatsapp, direccion, ciudad, notas });
  };

  return (
    <Modal title={initial.id ? "Editar persona" : "Nueva persona"} onClose={onClose}>
      <Field label="Nombre *"><input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
      <Field label="WhatsApp"><input className={inputCls} placeholder="0351 15-555-1234" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /></Field>
      <Field label="Dirección"><input className={inputCls} value={direccion} onChange={(e) => setDireccion(e.target.value)} /></Field>
      <Field label="Ciudad"><input className={inputCls} value={ciudad} onChange={(e) => setCiudad(e.target.value)} /></Field>
      <Field label="Notas generales"><textarea className={inputCls} rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} /></Field>

      <div className="border-t border-dashed border-[#E4DECF] mt-1 mb-3 pt-3">
        <Field label="Empresa(s)">
          {empresaIds.length > 0 && (
            <div className="space-y-1 mb-2">
              {empresaIds.map((eid) => {
                const e = core.empresas.find((ee) => ee.id === eid);
                if (!e) return null;
                return (
                  <div key={eid} className="flex items-center justify-between gap-2 bg-[#F7F5F0] border border-[#E4DECF] rounded-sm px-2.5 py-1.5 text-sm">
                    <span className="font-semibold text-[#2A2118]">{e.denominacion}</span>
                    <button type="button" onClick={() => quitarEmpresa(eid)} className="text-[var(--tema-peligro)]"><X size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}
          {(() => {
            const opciones = core.empresas.filter((e) => !empresaIds.includes(e.id));
            return opciones.length === 0 ? (
              <p className="text-xs text-[#A69C88] mb-2">No hay más empresas disponibles.</p>
            ) : (
              <div className="flex gap-2 mb-2">
                <div className="flex-1">
                  <BuscadorSelect
                    opciones={opciones.map((e) => ({ id: e.id, label: e.denominacion }))}
                    value={empresaParaAgregar}
                    onChange={setEmpresaParaAgregar}
                    placeholder="Buscar empresa..."
                  />
                </div>
                <button type="button" disabled={!empresaParaAgregar} onClick={agregarEmpresa} className="shrink-0 border border-[#E4DECF] rounded-sm px-3 text-sm font-bold text-[#2A2118] disabled:text-[#C9C1AE] disabled:cursor-not-allowed">+ Agregar</button>
              </div>
            );
          })()}
          <button type="button" onClick={() => setShowNuevaEmpresa(true)} className="w-full border border-[#E4DECF] rounded-sm py-2 font-bold text-xs text-[#2A2118]">+ Crear empresa nueva</button>
          {showNuevaEmpresa && (
            <EmpresaForm
              initial={{}}
              core={core}
              setCore={setCore}
              onClose={() => setShowNuevaEmpresa(false)}
              onSave={(data, vinculoPersona) => {
                setCore((prev) => ({ ...prev, empresas: [data, ...prev.empresas] }));
                setEmpresaIds((ids) => [...ids, data.id]);
                if (vinculoPersona?.personaId) {
                  setCore((prev) => ({
                    ...prev,
                    vinculos: [...(prev.vinculos || []), vinc("Persona", vinculoPersona.personaId, "Empresa", data.id, vinculoPersona.tipoRelacionId || null, true, todayISO())],
                  }));
                }
                setShowNuevaEmpresa(false);
              }}
            />
          )}
        </Field>
      </div>

      <div className="border-t border-dashed border-[#E4DECF] mb-3 pt-3">
        <Field label="Obra(s)">
          {obraIds.length > 0 && (
            <div className="space-y-1 mb-2">
              {obraIds.map((oid) => {
                const o = core.obras.find((oo) => oo.id === oid);
                if (!o) return null;
                return (
                  <div key={oid} className="flex items-center justify-between gap-2 bg-[#F7F5F0] border border-[#E4DECF] rounded-sm px-2.5 py-1.5 text-sm">
                    <span className="font-semibold text-[#2A2118]">{o.nombre}</span>
                    <button type="button" onClick={() => quitarObra(oid)} className="text-[var(--tema-peligro)]"><X size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}
          {(() => {
            const opciones = core.obras.filter((o) => !obraIds.includes(o.id));
            return opciones.length === 0 ? (
              <p className="text-xs text-[#A69C88] mb-2">No hay más obras disponibles.</p>
            ) : (
              <div className="flex gap-2 mb-2">
                <div className="flex-1">
                  <BuscadorSelect
                    opciones={opciones.map((o) => ({ id: o.id, label: o.nombre }))}
                    value={obraParaAgregar}
                    onChange={setObraParaAgregar}
                    placeholder="Buscar obra..."
                  />
                </div>
                <button type="button" disabled={!obraParaAgregar} onClick={agregarObra} className="shrink-0 border border-[#E4DECF] rounded-sm px-3 text-sm font-bold text-[#2A2118] disabled:text-[#C9C1AE] disabled:cursor-not-allowed">+ Agregar</button>
              </div>
            );
          })()}
          <button type="button" onClick={() => setShowNuevaObra(true)} className="w-full border border-[#E4DECF] rounded-sm py-2 font-bold text-xs text-[#2A2118]">+ Crear obra nueva</button>
          {showNuevaObra && (
            <ObraForm
              initial={{}}
              core={core}
              setCore={setCore}
              onClose={() => setShowNuevaObra(false)}
              onSave={(data, vinculoEmpresa) => {
                setCore((prev) => ({ ...prev, obras: [data, ...prev.obras] }));
                setObraIds((ids) => [...ids, data.id]);
                if (vinculoEmpresa?.empresaId) {
                  setCore((prev) => ({
                    ...prev,
                    vinculos: [...(prev.vinculos || []), vinc("Empresa", vinculoEmpresa.empresaId, "Obra", data.id, TR_DUENA, false, todayISO())],
                  }));
                }
                setShowNuevaObra(false);
              }}
            />
          )}
        </Field>
      </div>

      <div className="flex items-center gap-2 mt-2">
        {confirmarEliminar ? (
          <>
            <span className="flex-1 text-xs text-[var(--tema-peligro)] font-semibold">{textoUsoRegistro(vinculosDeEntidad(core, "Persona", initial.id, true).length, "vínculo", "vínculos", "Se borran junto con la persona.")}</span>
            <button type="button" onClick={() => setConfirmarEliminar(false)} className="shrink-0 border border-[#D8D2C4] rounded-sm px-3 py-2.5 text-xs font-bold text-[#6B6352]">Cancelar</button>
            <button type="button" onClick={onDelete} style={{ backgroundColor: "var(--tema-peligro)", color: "#FFFFFF" }} className="shrink-0 rounded-sm px-3 py-2.5 text-xs font-bold">Sí, eliminar</button>
          </>
        ) : (
          <>
            <PrimaryBtn onClick={submit} full>Guardar</PrimaryBtn>
            {onDelete && <button type="button" onClick={() => setConfirmarEliminar(true)} className="shrink-0 border border-[#E4DECF] rounded-sm px-3 text-[var(--tema-peligro)]"><Trash2 size={16} /></button>}
          </>
        )}
      </div>
    </Modal>
  );
}

// Sección "Vínculos" unificada de una ficha (Persona/Empresa/Obra). Lista todos los vínculos
// activos de la entidad cuya contraparte es Persona/Empresa/Obra (los vínculos a hilos se ven
// en la sección de hilos). Reutiliza el form genérico para "+ Vincular", con lápiz de editar y
// papelera con confirmación en cada uno.
function VinculosDeFicha({ core, setCore, entidadTipo, entidadId, onOpen }) {
  const [verVinculos, setVerVinculos] = useState(false);
  const [showVincular, setShowVincular] = useState(false);
  const [editVinculo, setEditVinculo] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const items = vinculosDeEntidad(core, entidadTipo, entidadId, true)
    .map((v) => ({ v, c: contraparteVinculo(v, entidadTipo, entidadId) }))
    .filter(({ c }) => c.tipo !== "Hilo");
  const del = (vinculoId) => setCore((prev) => ({ ...prev, vinculos: (prev.vinculos || []).filter((x) => x.id !== vinculoId) }));

  return (
    <div className="border-t border-dashed border-[#E4DECF] mt-3 pt-3">
      <button onClick={() => setVerVinculos((v) => !v)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5">
        {verVinculos ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verVinculos ? "Ocultar relaciones" : "Ver relaciones"}
      </button>
      {verVinculos && (
        <div className="mt-2.5">
          <div className="flex justify-end mb-1.5">
            <button onClick={() => setShowVincular(true)} className="text-xs font-bold text-[var(--tema-vinculo)]">+ Vincular</button>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-[#A69C88]">Sin vínculos cargados.</p>
          ) : (
            <div className="space-y-1.5">
              {items.map(({ v, c }) => {
                const tr = (core.tiposRelacion || []).find((t) => t.id === v.tipoRelacionId);
                const label = entidadLabel(c.tipo, c.id, core);
                if (!label) return null;
                const persona = c.tipo === "Persona" ? core.personas.find((p) => p.id === c.id) : null;
                return (
                  <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
                    <button onClick={() => onOpen(c.tipo.toLowerCase(), c.id)} className="text-left flex-1 min-w-0">
                      {tr ? (
                        <>
                          <span className="text-[#8A8272]">{nombreRelacionLado(tr, c.esOrigen)} </span>
                          <span className="font-semibold text-[#2A2118]">{label}</span>
                        </>
                      ) : (
                        <span className="font-semibold text-[#2A2118]">{label}</span>
                      )}
                      {v.principal && <Star size={11} className="inline text-[var(--tema-acento)] ml-1" />}
                    </button>
                    {persona && <WhatsAppLink persona={persona} size={15} />}
                    <IconBtn label="Editar vínculo" onClick={() => setEditVinculo(v)}><Pencil size={14} /></IconBtn>
                    <IconBtn label="Eliminar vínculo" danger onClick={() => setDeletingId(v.id)}><Trash2 size={14} /></IconBtn>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {showVincular && (
        <VincularRelacionForm core={core} setCore={setCore} entidadFija={{ tipo: entidadTipo, id: entidadId }} onClose={() => setShowVincular(false)} />
      )}
      {editVinculo && (
        <EditVinculoForm core={core} setCore={setCore} vinculo={editVinculo} onClose={() => setEditVinculo(null)} />
      )}
      {deletingId && (
        <ConfirmDeleteModal title="¿Eliminar este vínculo?" texto="Se quita la relación entre las dos entidades. No se puede deshacer." onCancel={() => setDeletingId(null)} onConfirm={() => { del(deletingId); setDeletingId(null); }} />
      )}
    </div>
  );
}

// Edita un vínculo ya cargado: su tipo de relación (opcional), si es principal, la fecha y la nota.
function EditVinculoForm({ core, setCore, vinculo, onClose }) {
  const [tipoRelacionId, setTipoRelacionId] = useState(vinculo.tipoRelacionId || "");
  const [showNuevoTipo, setShowNuevoTipo] = useState(false);
  const [principal, setPrincipal] = useState(!!vinculo.principal);
  const [desde, setDesde] = useState(vinculo.desde || todayISO());
  const [nota, setNota] = useState(vinculo.nota || "");
  const origenLabel = entidadLabel(vinculo.origenTipo, vinculo.origenId, core);
  const destinoLabel = entidadLabel(vinculo.destinoTipo, vinculo.destinoId, core);
  const guardar = () => {
    setCore((prev) => ({ ...prev, vinculos: (prev.vinculos || []).map((v) => (v.id === vinculo.id ? { ...v, tipoRelacionId: tipoRelacionId || null, principal, desde, nota: nota.trim() } : v)) }));
    onClose();
  };
  return (
    <Modal title="Editar vínculo" onClose={onClose}>
      <p className="text-sm text-[#2A2118] mb-3"><b>{origenLabel}</b> <span className="text-[#8A8272]">↔</span> <b>{destinoLabel}</b></p>
      <Field label="Tipo de relación (opcional)">
        <BuscadorSelect
          opciones={(core.tiposRelacion || []).map((t) => ({ id: t.id, label: t.cualidad === "asimetrica" ? `${t.nombre} / ${t.nombreInverso}` : t.nombre }))}
          value={tipoRelacionId}
          onChange={setTipoRelacionId}
          vacioLabel="— Sin tipo (genérico) —"
          placeholder="Buscar tipo de relación..."
        />
      </Field>
      <button type="button" onClick={() => setShowNuevoTipo(true)} className="w-full border border-[#E4DECF] rounded-sm py-2 font-bold text-xs text-[#2A2118] mb-3">+ Crear tipo de relación nuevo</button>
      <label className="flex items-center gap-2 mb-3 text-sm text-[#2A2118]">
        <input type="checkbox" checked={principal} onChange={(e) => setPrincipal(e.target.checked)} /> Marcar como vínculo principal
      </label>
      <Field label="Fecha"><input type="date" className={inputCls} value={desde} onChange={(e) => setDesde(e.target.value)} /></Field>
      <Field label="Nota (opcional)"><textarea className={inputCls} rows={2} value={nota} onChange={(e) => setNota(e.target.value)} /></Field>
      <PrimaryBtn full onClick={guardar}>Guardar</PrimaryBtn>

      {showNuevoTipo && (
        <Modal title="Nuevo tipo de relación" onClose={() => setShowNuevoTipo(false)}>
          <TipoRelacionForm
            data={{}}
            onSave={(data) => {
              setCore((prev) => ({ ...prev, tiposRelacion: [...(prev.tiposRelacion || []), data] }));
              setTipoRelacionId(data.id);
              setShowNuevoTipo(false);
            }}
          />
        </Modal>
      )}
    </Modal>
  );
}

function PersonaDetail({ id, core, setCore, acciones, setAcciones, onClose, onOpen }) {
  const persona = core.personas.find((p) => p.id === id);
  const [showNuevoHilo, setShowNuevoHilo] = useState(false);
  const [verHilos, setVerHilos] = useState(false);
  const [verCerrados, setVerCerrados] = useState(false);
  const [verTareas, setVerTareas] = useState(false);
  const [showAgregarTareaEntidad, setShowAgregarTareaEntidad] = useState(false);

  if (!persona) return <div><BackHeader onClose={onClose} /><p className="text-sm text-[#8A8272]">Esta persona ya no existe.</p></div>;

  const hilosDeLaPersona = hilosDePersona(core, id).filter((h) => h.tipo === "cliente");
  const hilosActivos = hilosDeLaPersona.filter((h) => h.estado === "Activo");
  const hilosCerrados = hilosDeLaPersona.filter((h) => h.estado === "Cerrado");
  const tareasDeLaPersona = tareasDeEntidad(core, "Persona", id);

  return (
    <div>
      <BackHeader onClose={onClose} />
      <div className="bg-white border border-[#E4DECF] rounded-sm p-4 mb-3">
        <div className="flex items-start gap-2.5">
          <div
            className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-sm font-extrabold"
            style={{ backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) }}
          >
            {getIniciales(persona.nombre)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-[#2A2118] flex items-center gap-2">{persona.nombre} <WhatsAppLink persona={persona} size={18} /></h2>
            <p className="text-xs text-[#8A8272]">{persona.ciudad}{persona.direccion ? ` · ${persona.direccion}` : ""}</p>
          </div>
        </div>
        {persona.notas && <p className="text-sm text-[#6B6352] mt-2 italic">"{persona.notas}"</p>}
        <TagsSection core={core} setCore={setCore} entidadTipo="Persona" entidadId={id} />
        <VinculosDeFicha core={core} setCore={setCore} entidadTipo="Persona" entidadId={id} onOpen={onOpen} />

        <div className="border-t border-dashed border-[#E4DECF] mt-3 pt-3">
          <button onClick={() => setVerHilos((v) => !v)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5">
            {verHilos ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verHilos ? "Ocultar hilos de seguimiento" : "Ver hilos de seguimiento"}
          </button>
          {verHilos && (
            <div className="mt-2.5">
              <div className="flex justify-end mb-1.5">
                <button onClick={() => setShowNuevoHilo(true)} className="text-xs font-bold text-[var(--tema-vinculo)] flex items-center gap-1"><Plus size={12} /> Nuevo hilo</button>
              </div>
              {hilosActivos.length === 0 ? (
                <EmptyState icon={<GitBranch size={22} />} text="Todavía no hay hilos de seguimiento con esta persona." />
              ) : (
                <div className="space-y-2">
                  {hilosActivos.map((h) => <HiloRow key={h.id} hilo={h} core={core} acciones={acciones} onOpen={onOpen} />)}
                </div>
              )}

              {hilosCerrados.length > 0 && (
                <div className="mt-3">
                  <button onClick={() => setVerCerrados((v) => !v)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5">
                    {verCerrados ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verCerrados ? "Ocultar" : "Ver"} hilos cerrados ({hilosCerrados.length})
                  </button>
                  {verCerrados && (
                    <div className="space-y-2 mt-2">
                      {hilosCerrados.map((h) => <HiloRow key={h.id} hilo={h} core={core} acciones={acciones} onOpen={onOpen} />)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-dashed border-[#E4DECF] mt-3 pt-3">
          <button onClick={() => setVerTareas((v) => !v)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5">
            {verTareas ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verTareas ? "Ocultar tareas" : "Ver tareas"}
          </button>
          {verTareas && (
            <div className="mt-2.5">
              <div className="flex justify-end mb-1.5">
                <button onClick={() => setShowAgregarTareaEntidad(true)} className="text-xs font-bold text-[var(--tema-vinculo)] flex items-center gap-1"><Plus size={12} /> Agregar tarea</button>
              </div>
              {tareasDeLaPersona.length === 0 ? (
                <p className="text-sm text-[#A69C88]">Sin tareas todavía.</p>
              ) : (
                <div className="space-y-2">
                  {tareasDeLaPersona.map((t) => <HiloAgendaCard key={t.id} hilo={t} core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onOpen={onOpen} />)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showNuevoHilo && (
        <Modal title={`Nuevo hilo — ${persona.nombre}`} onClose={() => setShowNuevoHilo(false)}>
          <NuevoHiloForm
            personaFija={persona}
            core={core}
            setCore={setCore}
            acciones={acciones}
            setAcciones={setAcciones}
            onCancelar={() => setShowNuevoHilo(false)}
            onCreated={(hiloId) => { setShowNuevoHilo(false); onOpen("hilo", hiloId); }}
          />
        </Modal>
      )}

      {showAgregarTareaEntidad && (
        <Modal title="Agregar tarea" onClose={() => setShowAgregarTareaEntidad(false)}>
          <AgregarTareaAEntidadForm
            core={core}
            tareasExcluidas={tareasDeLaPersona.map((t) => t.id)}
            onVincular={(tareaId) => {
              setCore((prev) => ({ ...prev, vinculos: [...(prev.vinculos || []), vinc("Persona", id, "Hilo", tareaId, null, false, todayISO())] }));
              setShowAgregarTareaEntidad(false);
            }}
            onCrear={(nuevoHilo) => {
              setCore((prev) => ({
                ...prev,
                hilos: [nuevoHilo, ...prev.hilos],
                vinculos: [...(prev.vinculos || []), vinc("Persona", id, "Hilo", nuevoHilo.id, null, false, todayISO())],
              }));
              setShowAgregarTareaEntidad(false);
            }}
            onClose={() => setShowAgregarTareaEntidad(false)}
          />
        </Modal>
      )}
    </div>
  );
}

function HiloRow({ hilo, core, acciones, onOpen }) {
  const empresas = empresasDeHilo(hilo, core);
  const obras = obrasDeHilo(hilo, core);
  const persona = personaPrincipalDeHilo(hilo, core);
  const accionesDelHilo = acciones.filter((a) => a.hiloId === hilo.id);
  const pendiente = accionesDelHilo.find((a) => a.estado === "Pendiente");
  const tipoPendiente = pendiente ? core.tiposAccion.find((t) => t.id === pendiente.tipoAccionId) : null;
  const tareasVinculadas = core.hilos.filter((h) => h.tipo === "tarea" && h.hiloRelacionadoId === hilo.id).length;
  return (
    <div role="button" tabIndex={0} onClick={() => onOpen("hilo", hilo.id)} onKeyDown={(e) => e.key === "Enter" && onOpen("hilo", hilo.id)} className="w-full text-left bg-white border border-[#E4DECF] rounded-sm p-3 cursor-pointer">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {persona && <p className="text-[15px] font-semibold text-[#2A2118] truncate">{persona.nombre}</p>}
          <p className={`truncate ${persona ? "text-sm text-[#6B6352] mt-0.5" : "text-[15px] font-semibold text-[#2A2118]"}`} title={textoPlanoDeMenciones(hilo.titulo)}><TextoConMenciones texto={hilo.titulo} onOpen={onOpen} /></p>
          <p className="text-xs text-[#8A8272] mt-0.5">{[empresas.map((e) => e.denominacion).join(", "), obras.map((o) => o.nombre).join(", ")].filter(Boolean).join(" · ") || "Sin empresa/obra"}</p>
        </div>
        <Chip tone={hilo.estado === "Activo" ? "estadoActivo" : "estadoCerradoInactivo"}>{hilo.estado}</Chip>
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-[#8A8272]">
          {accionesDelHilo.length} acci{accionesDelHilo.length === 1 ? "ón" : "ones"}
          {tareasVinculadas > 0 && ` · ${tareasVinculadas} tarea${tareasVinculadas === 1 ? "" : "s"}`}
        </span>
        {pendiente ? (
          <span className="text-xs text-[#6B6352]">Próxima: {tipoPendiente?.nombre} · {fmtDateHora(pendiente.fechaProgramada, pendiente.horaProgramada)}</span>
        ) : (
          <span className="text-xs text-[#A69C88]">Sin próxima acción</span>
        )}
      </div>
    </div>
  );
}

function AccionCard({ accion, acciones, core, onOpen, onEdit, onDelete }) {
  const [verContexto, setVerContexto] = useState(false);
  const tipo = core.tiposAccion.find((t) => t.id === accion.tipoAccionId);
  const isPend = accion.estado === "Pendiente";
  const prioTone = accion.prioridad === "Alta" ? "prioridadAlta" : accion.prioridad === "Media" ? "prioridadMedia" : "prioridadBaja";
  const destino = accion.destinoId ? (acciones || []).find((a) => a.id === accion.destinoId) : null;
  return (
    <div className={`border-l-4 ${isPend ? "border-[var(--tema-estadoPendiente)]" : "border-[var(--tema-estadoRealizada)]"} border-y border-r border-[#E4DECF] rounded-sm p-3`} style={{ backgroundColor: isPend ? "#FFFFFF" : "#F2F1EF" }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Chip tone={isPend ? "estadoPendiente" : "estadoRealizada"}>{accion.estado}</Chip>
          {tipo && <span className="text-sm font-semibold text-[#2A2118]">{tipo.nombre}</span>}
          <span className="text-[9px] font-mono text-[#C9C1AE]">{fmtNumero(accion.numero)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[#8A8272]">{fmtDate(isPend ? accion.fechaProgramada : accion.fechaRealizada)}</span>
          {onEdit && <IconBtn label="Editar acción" onClick={onEdit}><Pencil size={13} /></IconBtn>}
          {onDelete && <IconBtn label="Eliminar acción" danger onClick={onDelete}><Trash2 size={13} /></IconBtn>}
        </div>
      </div>
      {accion.notaHecho && <p className="text-sm text-[#6B6352] mt-1.5"><TextoConMenciones texto={accion.notaHecho} onOpen={onOpen} /></p>}
      <div className="flex items-center gap-2 mt-1.5">
        {accion.prioridad && <Chip tone={prioTone}>{accion.prioridad}</Chip>}
        {accion.recurrente && <span className="text-[10px] text-[#8A8272] flex items-center gap-1"><Repeat size={11} /> cada {accion.repiteCadaN} {accion.repiteUnidad}</span>}
        <button onClick={() => setVerContexto((v) => !v)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5 ml-auto">
          {verContexto ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verContexto ? "Ocultar contexto" : "Ver contexto"}
        </button>
      </div>
      {verContexto && (
        <div className="mt-2 pt-2 border-t border-[#EFEBE0] space-y-1.5">
          <p className="text-xs text-[#6B6352]"><span className="font-bold text-[#8A8272]">Se había planificado:</span> {accion.notaPlanificada ? <TextoConMenciones texto={accion.notaPlanificada} onOpen={onOpen} /> : "Sin registro."}</p>
          <p className="text-xs text-[#6B6352]"><span className="font-bold text-[#8A8272]">Se hizo:</span> {accion.notaHecho ? <TextoConMenciones texto={accion.notaHecho} onOpen={onOpen} /> : "Sin registro."}</p>
          <p className="text-xs text-[#6B6352]"><span className="font-bold text-[#8A8272]">Se planificó:</span> {destino ? (destino.notaPlanificada ? <TextoConMenciones texto={destino.notaPlanificada} onOpen={onOpen} /> : "Sin registro.") : "No se generó una próxima acción en ese momento."}</p>
        </div>
      )}
    </div>
  );
}

// Formulario reutilizable para vincular una o varias empresas (existentes o nuevas) a lo
// que sea que el llamador esté armando (una persona, o el hilo en creación de una persona
// fija) — cada "onSave" agrega una sin cerrar el formulario, hasta tocar "Listo".
function VincularEmpresaForm({ core, setCore, onClose, onSave, excluirIds }) {
  const [agregadas, setAgregadas] = useState([]);
  const excluidas = new Set([...(excluirIds || []), ...agregadas]);
  const disponibles = core.empresas.filter((e) => !excluidas.has(e.id));
  const [empresaId, setEmpresaId] = useState("");
  const [tipoRelacionId, setTipoRelacionId] = useState("");
  const [showNuevaEmpresa, setShowNuevaEmpresa] = useState(false);

  const agregarExistente = () => {
    if (!empresaId) return;
    onSave({ empresaId, tipoRelacionId: tipoRelacionId || null });
    setAgregadas((a) => [...a, empresaId]);
    setEmpresaId("");
  };

  return (
    <Modal title="Vincular empresas" onClose={onClose}>
      <ChipsAgregados items={agregadas} core={core} coleccion="empresas" labelKey="denominacion" />

      {disponibles.length === 0 ? (
        <p className="text-sm text-[#A69C88] mb-3">No hay más empresas disponibles para vincular.</p>
      ) : (
        <Field label="Empresa">
          <BuscadorSelect
            opciones={disponibles.map((e) => ({ id: e.id, label: e.denominacion }))}
            value={empresaId}
            onChange={setEmpresaId}
            placeholder="Buscar empresa..."
          />
        </Field>
      )}
      <button type="button" onClick={() => setShowNuevaEmpresa(true)} className="w-full border border-[#E4DECF] rounded-sm py-2 font-bold text-xs text-[#2A2118] mb-3">+ Crear empresa nueva</button>

      <Field label="Tipo de relación (opcional)">
        <BuscadorSelect
          opciones={(core.tiposRelacion || []).map((t) => ({ id: t.id, label: t.cualidad === "asimetrica" ? `${t.nombre} / ${t.nombreInverso}` : t.nombre }))}
          value={tipoRelacionId}
          onChange={setTipoRelacionId}
          vacioLabel="— Sin tipo (genérico) —"
          placeholder="Buscar tipo de relación..."
        />
      </Field>
      <button type="button" disabled={!empresaId} onClick={agregarExistente} className="w-full border border-[#E4DECF] rounded-sm py-2.5 font-bold text-sm text-[#2A2118] disabled:text-[#C9C1AE] disabled:cursor-not-allowed mb-3">+ Agregar</button>
      <button type="button" onClick={onClose} className="w-full mt-1 bg-[var(--tema-acento)] text-[#2A2118] rounded-sm py-2.5 font-bold text-sm">Listo</button>

      {showNuevaEmpresa && (
        <EmpresaForm
          initial={{}}
          core={core}
          setCore={setCore}
          onClose={() => setShowNuevaEmpresa(false)}
          onSave={(data, vinculoPersona) => {
            setCore((prev) => ({ ...prev, empresas: [data, ...prev.empresas] }));
            onSave({ empresaId: data.id, tipoRelacionId: tipoRelacionId || null });
            if (vinculoPersona?.personaId) {
              setCore((prev) => ({
                ...prev,
                vinculos: [...(prev.vinculos || []), vinc("Persona", vinculoPersona.personaId, "Empresa", data.id, vinculoPersona.tipoRelacionId || null, true, todayISO())],
              }));
            }
            setAgregadas((a) => [...a, data.id]);
            setShowNuevaEmpresa(false);
          }}
        />
      )}
    </Modal>
  );
}

// Vincula una o varias entidades (Persona/Empresa/Obra, o cualquier tipo que se sume a
// TIPOS_ENTIDAD_RELACION en el futuro) a un hilo, con un único buscador — se agregan una a
// una, acumulando, hasta tocar "Listo" (mismo patrón que los demás formularios de vincular).
function VincularEntidadAHiloForm({ core, setCore, vinculadasKeys, onVincular, onClose }) {
  const clave = (tipo, entId) => `${tipo}:${entId}`;
  const [agregadas, setAgregadas] = useState([]);
  const agregadasKeys = new Set(agregadas.map((e) => clave(e.tipo, e.id)));
  const disponibles = todasLasEntidadesRelacionables(core).filter((e) => !vinculadasKeys.has(clave(e.tipo, e.id)) && !agregadasKeys.has(clave(e.tipo, e.id)));
  const [sel, setSel] = useState("");
  const [crear, setCrear] = useState(null); // "Persona" | "Empresa" | "Obra" | null

  const agregarExistente = (tipo, entId, label) => {
    onVincular(tipo, entId);
    setAgregadas((a) => [...a, { tipo, id: entId, label }]);
  };
  const agregar = () => {
    if (!sel) return;
    const [tipo, entId] = sel.split(":");
    const item = disponibles.find((e) => e.tipo === tipo && e.id === entId);
    if (!item) return;
    agregarExistente(tipo, entId, item.label);
    setSel("");
  };

  return (
    <Modal title="Vincular al hilo" onClose={onClose}>
      {agregadas.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {agregadas.map((e) => (
            <span key={clave(e.tipo, e.id)} className="bg-[#D9F0DE] text-[#1B4D2E] text-xs font-bold px-2 py-1 rounded-sm">
              {e.label} <span className="opacity-60 font-normal">({e.tipo})</span>
            </span>
          ))}
        </div>
      )}
      {disponibles.length === 0 ? (
        <p className="text-sm text-[#A69C88] mb-3">No hay más personas, empresas u obras disponibles para vincular.</p>
      ) : (
        <Field label="Persona, empresa u obra">
          <BuscadorSelect
            opciones={disponibles.map((e) => ({ id: clave(e.tipo, e.id), label: `${e.label} (${e.tipo})` }))}
            value={sel}
            onChange={setSel}
            placeholder="Buscar..."
          />
        </Field>
      )}
      <button type="button" disabled={!sel} onClick={agregar} className="w-full border border-[#E4DECF] rounded-sm py-2.5 font-bold text-sm text-[#2A2118] disabled:text-[#C9C1AE] disabled:cursor-not-allowed mb-3">+ Agregar</button>

      <div className="grid grid-cols-3 gap-1.5 mb-3">
        <button type="button" onClick={() => setCrear("Persona")} className="border border-[#E4DECF] rounded-sm py-2 font-bold text-[11px] text-[#2A2118]">+ Persona</button>
        <button type="button" onClick={() => setCrear("Empresa")} className="border border-[#E4DECF] rounded-sm py-2 font-bold text-[11px] text-[#2A2118]">+ Empresa</button>
        <button type="button" onClick={() => setCrear("Obra")} className="border border-[#E4DECF] rounded-sm py-2 font-bold text-[11px] text-[#2A2118]">+ Obra</button>
      </div>

      <button type="button" onClick={onClose} className="w-full mt-1 bg-[var(--tema-acento)] text-[#2A2118] rounded-sm py-2.5 font-bold text-sm">Listo</button>

      {crear === "Persona" && (
        <PersonaForm
          initial={{}}
          core={core}
          setCore={setCore}
          onClose={() => setCrear(null)}
          onSave={(data) => {
            setCore((prev) => ({ ...prev, personas: [data, ...prev.personas] }));
            agregarExistente("Persona", data.id, data.nombre);
            setCrear(null);
          }}
        />
      )}
      {crear === "Empresa" && (
        <EmpresaForm
          initial={{}}
          core={core}
          setCore={setCore}
          onClose={() => setCrear(null)}
          onSave={(data, vinculoPersona) => {
            setCore((prev) => ({ ...prev, empresas: [data, ...prev.empresas] }));
            agregarExistente("Empresa", data.id, data.denominacion);
            if (vinculoPersona?.personaId) {
              setCore((prev) => ({ ...prev, vinculos: [...(prev.vinculos || []), vinc("Persona", vinculoPersona.personaId, "Empresa", data.id, vinculoPersona.tipoRelacionId || null, true, todayISO())] }));
            }
            setCrear(null);
          }}
        />
      )}
      {crear === "Obra" && (
        <ObraForm
          initial={{}}
          core={core}
          setCore={setCore}
          onClose={() => setCrear(null)}
          onSave={(data, vinculoEmpresa) => {
            setCore((prev) => ({ ...prev, obras: [data, ...prev.obras] }));
            agregarExistente("Obra", data.id, data.nombre);
            if (vinculoEmpresa?.empresaId) {
              setCore((prev) => ({ ...prev, vinculos: [...(prev.vinculos || []), vinc("Empresa", vinculoEmpresa.empresaId, "Obra", data.id, TR_DUENA, false, todayISO())] }));
            }
            setCrear(null);
          }}
        />
      )}
    </Modal>
  );
}

// Vínculos genéricos de un hilo con Personas/Empresas/Obras (y cualquier entidad nueva que
// se sume después a TIPOS_ENTIDAD_RELACION): un solo botón "+ Vincular" y la lista se agrupa
// sola por tipo. Personas conserva el marcado de "principal" y el historial de interlocutores
// (desvincular no borra, guarda "hasta" para no perder el legajo). El resto de los tipos se
// quita directo, con confirmación.
function VinculosDeHilo({ hilo, hiloId, core, setCore, onOpen, agregarPersona, setConfirmar }) {
  const [showVincular, setShowVincular] = useState(false);
  const [verHistorialPersonas, setVerHistorialPersonas] = useState(false);

  const marcarPrincipal = (vinculoId) => setCore((prev) => ({
    ...prev,
    vinculos: (prev.vinculos || []).map((v) => (esParticipanteActivoDeHilo(v, hiloId) ? { ...v, principal: v.id === vinculoId } : v)),
  }));
  const desvincularParticipante = (vinculoId) => setCore((prev) => ({
    ...prev,
    vinculos: (prev.vinculos || []).map((v) => (v.id === vinculoId ? { ...v, hasta: todayISO(), principal: false } : v)),
  }));
  const quitarDelHilo = (tipo, entId) => setCore((prev) => ({
    ...prev,
    vinculos: (prev.vinculos || []).filter((v) => !esVinculoEntreHiloYEntidad(v, hiloId, tipo, entId)),
  }));
  const vincularEntidad = (tipo, entId) => {
    if (tipo === "Persona") { agregarPersona(entId, false); return; }
    setCore((prev) => ({ ...prev, vinculos: [...(prev.vinculos || []), vinc("Hilo", hiloId, tipo, entId, null, false, todayISO())] }));
  };

  const participantesInactivos = participantesDeHilo(hilo, core).filter((p) => p.hasta).sort((a, b) => (b.hasta || "").localeCompare(a.hasta || ""));
  const grupos = TIPOS_ENTIDAD_RELACION.map((def) => ({
    def,
    items: contrapartesDe(core, "Hilo", hiloId, def.tipo, true)
      .map(({ v, c }) => ({ v, item: (core[def.coleccion] || []).find((x) => x.id === c.id) }))
      .filter((x) => x.item),
  })).filter((g) => g.items.length > 0);
  const vinculadasKeys = new Set(grupos.flatMap((g) => g.items.map(({ item }) => `${g.def.tipo}:${item.id}`)));

  return (
    <div>
      <div className="flex justify-end mb-1.5">
        <button onClick={() => setShowVincular(true)} className="text-xs font-bold text-[var(--tema-vinculo)]">+ Vincular</button>
      </div>
      {grupos.length === 0 ? (
        <p className="text-sm text-[#A69C88]">Sin vínculos cargados.</p>
      ) : (
        <div className="space-y-2.5">
          {grupos.map(({ def, items }) => (
            <div key={def.tipo}>
              <p className="text-[10px] font-bold tracking-wide text-[#A69C88] mb-1">{def.plural}</p>
              <div className="space-y-1">
                {def.tipo === "Persona"
                  ? [...items].sort((a, b) => (b.v.principal ? 1 : 0) - (a.v.principal ? 1 : 0)).map(({ v, item }) => (
                      <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
                        <button onClick={() => onOpen("persona", item.id)} className="text-left flex-1 min-w-0">
                          <span className="font-semibold text-[#2A2118]">{item.nombre}</span>
                          {v.principal && <Star size={11} className="inline text-[var(--tema-acento)] ml-1" />}
                          <span className="text-xs text-[#A69C88]"> · desde {fmtDate(v.desde)}</span>
                        </button>
                        <div className="flex items-center gap-1">
                          {!v.principal && <IconBtn label="Marcar principal" onClick={() => marcarPrincipal(v.id)}><Star size={14} /></IconBtn>}
                          <IconBtn label="Desvincular" danger onClick={() => setConfirmar({ texto: "¿Desvincular a esta persona del hilo? Queda en el historial de interlocutores.", onConfirm: () => desvincularParticipante(v.id) })}><X size={14} /></IconBtn>
                        </div>
                      </div>
                    ))
                  : items.map(({ item }) => (
                      <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                        <button onClick={() => onOpen(def.tipo.toLowerCase(), item.id)} className="text-left flex-1 min-w-0 font-semibold text-[#2A2118]">{item[def.labelKey]}</button>
                        <IconBtn label="Quitar vínculo" danger onClick={() => setConfirmar({ texto: `¿Quitar el vínculo con "${item[def.labelKey]}"?`, onConfirm: () => quitarDelHilo(def.tipo, item.id) })}><X size={14} /></IconBtn>
                      </div>
                    ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {participantesInactivos.length > 0 && (
        <div className="mt-2">
          <button onClick={() => setVerHistorialPersonas((v) => !v)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5">
            {verHistorialPersonas ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verHistorialPersonas ? "Ocultar historial de interlocutores" : "Ver historial de interlocutores"} ({participantesInactivos.length})
          </button>
          {verHistorialPersonas && (
            <div className="mt-1.5 space-y-1">
              {participantesInactivos.map((part) => {
                const p = core.personas.find((pp) => pp.id === part.personaId);
                return (
                  <p key={part.id} className="text-xs text-[#8A8272]">
                    {p?.nombre || "(persona eliminada)"} · {fmtDate(part.desde)} – {fmtDate(part.hasta)}
                  </p>
                );
              })}
            </div>
          )}
        </div>
      )}
      {showVincular && (
        <VincularEntidadAHiloForm core={core} setCore={setCore} vinculadasKeys={vinculadasKeys} onVincular={vincularEntidad} onClose={() => setShowVincular(false)} />
      )}
    </div>
  );
}

// Adjuntos de un hilo (Seguimientos y Tareas): PDF, imágenes, Excel y Word, guardados en el
// bucket privado "adjuntos" de Supabase Storage (ver supabase/schema.sql). Solo se guarda el
// archivo en sí en Storage; la metadata (nombre, tipo, tamaño, ruta, fecha) viaja dentro del
// hilo, junto con el resto de sus datos.
function AdjuntosDeHilo({ hilo, hiloId, setCore, setConfirmar }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const adjuntos = hilo.adjuntos || [];

  const guardarAdjuntos = (nuevaLista) => setCore((prev) => ({
    ...prev,
    hilos: prev.hilos.map((h) => (h.id === hiloId ? { ...h, adjuntos: nuevaLista } : h)),
  }));

  const subirArchivo = async (file) => {
    setError("");
    if (file.size > ADJUNTO_TAMANO_MAX) { setError(`El archivo pesa más de ${formatBytes(ADJUNTO_TAMANO_MAX)}.`); return; }
    setSubiendo(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("No se encontró la sesión — volvé a iniciar sesión."); return; }
      const adjuntoId = uid("ADJ");
      const nombreSanitizado = file.name.replace(/[^a-zA-Z0-9.\-_ ]/g, "_");
      const path = `${session.user.id}/${hiloId}/${adjuntoId}-${nombreSanitizado}`;
      const { error: uploadError } = await supabase.storage.from("adjuntos").upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (uploadError) { setError("No se pudo subir el archivo. Probá de nuevo."); return; }
      guardarAdjuntos([{ id: adjuntoId, nombre: file.name, tipo: file.type, tamano: file.size, path, subidoEn: todayISO() }, ...adjuntos]);
    } finally {
      setSubiendo(false);
    }
  };

  const descargarArchivo = async (adjunto) => {
    setError("");
    const { data, error: urlError } = await supabase.storage.from("adjuntos").createSignedUrl(adjunto.path, 60);
    if (urlError || !data) { setError("No se pudo generar el enlace de descarga."); return; }
    window.open(data.signedUrl, "_blank");
  };

  const eliminarArchivo = async (adjunto) => {
    await supabase.storage.from("adjuntos").remove([adjunto.path]);
    guardarAdjuntos(adjuntos.filter((a) => a.id !== adjunto.id));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-bold tracking-wide text-[#A69C88]">{adjuntos.length} archivo{adjuntos.length === 1 ? "" : "s"}</p>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={subiendo} className="text-xs font-bold text-[var(--tema-vinculo)] disabled:opacity-50">
          {subiendo ? "Subiendo…" : "+ Agregar archivo"}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) subirArchivo(f); e.target.value = ""; }}
        />
      </div>
      {error && <p className="text-xs text-[var(--tema-peligro)] mb-1.5">{error}</p>}
      {adjuntos.length === 0 ? (
        <p className="text-sm text-[#A69C88]">Sin archivos adjuntos.</p>
      ) : (
        <div className="space-y-1">
          {adjuntos.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
              <button onClick={() => descargarArchivo(a)} className="text-left flex-1 min-w-0 flex items-center gap-1.5">
                <IconoAdjunto tipo={a.tipo} className="shrink-0 text-[#8A8272]" />
                <span className="truncate font-semibold text-[#2A2118]">{a.nombre}</span>
                <span className="shrink-0 text-xs text-[#A69C88]">{formatBytes(a.tamano)}</span>
              </button>
              <IconBtn label="Eliminar archivo" danger onClick={() => setConfirmar({ texto: `¿Eliminar "${a.nombre}"? No se puede deshacer.`, onConfirm: () => eliminarArchivo(a) })}><Trash2 size={14} /></IconBtn>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Edita el título y la persona/empresa(s)/obra(s) de un hilo de cliente ya existente, con
// los mismos campos que al crearlo (ver NuevoHiloForm) — pero sin la parte de "primer
// contacto", que no aplica a un hilo que ya tiene historial. Un seguimiento es siempre sobre
// una persona; a veces nace solo con una empresa/obra porque es el único dato disponible, y
// este formulario es el lugar para completarlo después.
function EditarHiloPrincipalForm({ hilo, core, setCore, onClose }) {
  const [titulo, setTitulo] = useState(hilo.titulo);
  const [personaId, setPersonaId] = useState(() => personaPrincipalDeHilo(hilo, core)?.id || "");
  const [empresaIds, setEmpresaIds] = useState(() => empresasDeHilo(hilo, core).map((e) => e.id));
  const [empresaParaAgregar, setEmpresaParaAgregar] = useState("");
  const [obraIds, setObraIds] = useState(() => obrasDeHilo(hilo, core).map((o) => o.id));
  const [obraParaAgregar, setObraParaAgregar] = useState("");

  const agregarEmpresa = (empresaId) => {
    if (!empresaId) return;
    setEmpresaIds((ids) => (ids.includes(empresaId) ? ids : [...ids, empresaId]));
  };
  const quitarEmpresa = (empresaId) => setEmpresaIds((ids) => ids.filter((x) => x !== empresaId));
  const agregarObra = (obraId) => {
    if (!obraId) return;
    setObraIds((ids) => (ids.includes(obraId) ? ids : [...ids, obraId]));
  };
  const quitarObra = (obraId) => setObraIds((ids) => ids.filter((x) => x !== obraId));

  const faltaVinculo = !personaId && empresaIds.length === 0 && obraIds.length === 0;

  const guardar = () => {
    if (!titulo.trim() || faltaVinculo) return;
    const hoy = todayISO();
    setCore((prev) => {
      // Personas: se cierran (con historial) las activas y se agrega la elegida, si hay.
      let vinculos = (prev.vinculos || []).map((v) => (esParticipanteActivoDeHilo(v, hilo.id) ? { ...v, hasta: hoy, principal: false } : v));
      if (personaId) vinculos.push(vinc("Persona", personaId, "Hilo", hilo.id, null, true, hoy));

      const empresasActuales = contrapartesDe(prev, "Hilo", hilo.id, "Empresa", true).map(({ c }) => c.id);
      const empresasAQuitar = empresasActuales.filter((eid) => !empresaIds.includes(eid));
      vinculos = vinculos.filter((v) => !empresasAQuitar.some((eid) => esVinculoEntreHiloYEntidad(v, hilo.id, "Empresa", eid)));
      for (const eid of empresaIds.filter((eid) => !empresasActuales.includes(eid))) vinculos.push(vinc("Hilo", hilo.id, "Empresa", eid, null, false, hoy));

      const obrasActuales = contrapartesDe(prev, "Hilo", hilo.id, "Obra", true).map(({ c }) => c.id);
      const obrasAQuitar = obrasActuales.filter((oid) => !obraIds.includes(oid));
      vinculos = vinculos.filter((v) => !obrasAQuitar.some((oid) => esVinculoEntreHiloYEntidad(v, hilo.id, "Obra", oid)));
      for (const oid of obraIds.filter((oid) => !obrasActuales.includes(oid))) vinculos.push(vinc("Hilo", hilo.id, "Obra", oid, null, false, hoy));

      return {
        ...prev,
        hilos: prev.hilos.map((h) => (h.id === hilo.id ? { ...h, titulo: titulo.trim() } : h)),
        vinculos,
      };
    });
    onClose();
  };

  return (
    <div>
      <Field label="Título del tema *"><CampoConMenciones core={core} autoFocus value={titulo} onChange={setTitulo} placeholder="Ej: Presupuesto cables solares" /></Field>

      <Field label="Persona">
        <BuscadorSelect
          opciones={core.personas.map((p) => ({ id: p.id, label: p.nombre }))}
          value={personaId}
          onChange={setPersonaId}
          vacioLabel="— ninguna —"
          placeholder="Buscar persona..."
        />
      </Field>

      <Field label="Empresa(s)">
        {empresaIds.length > 0 && (
          <div className="space-y-1 mb-2">
            {empresaIds.map((eid) => {
              const e = core.empresas.find((ee) => ee.id === eid);
              if (!e) return null;
              return (
                <div key={eid} className="flex items-center justify-between gap-2 bg-[#F7F5F0] border border-[#E4DECF] rounded-sm px-2.5 py-1.5 text-sm">
                  <span className="font-semibold text-[#2A2118]">{e.denominacion}</span>
                  <button type="button" onClick={() => quitarEmpresa(eid)} className="text-[var(--tema-peligro)]"><X size={14} /></button>
                </div>
              );
            })}
          </div>
        )}
        {core.empresas.filter((e) => !empresaIds.includes(e.id)).length > 0 && (
          <div className="flex gap-2">
            <div className="flex-1">
              <BuscadorSelect
                opciones={core.empresas.filter((e) => !empresaIds.includes(e.id)).map((e) => ({ id: e.id, label: e.denominacion }))}
                value={empresaParaAgregar}
                onChange={setEmpresaParaAgregar}
                placeholder="Buscar empresa..."
              />
            </div>
            <button
              type="button"
              disabled={!empresaParaAgregar}
              onClick={() => { agregarEmpresa(empresaParaAgregar); setEmpresaParaAgregar(""); }}
              className="shrink-0 border border-[#E4DECF] rounded-sm px-3 text-sm font-bold text-[#2A2118] disabled:text-[#C9C1AE] disabled:cursor-not-allowed"
            >
              + Agregar
            </button>
          </div>
        )}
      </Field>

      <Field label="Obra(s)">
        {obraIds.length > 0 && (
          <div className="space-y-1 mb-2">
            {obraIds.map((oid) => {
              const o = core.obras.find((oo) => oo.id === oid);
              if (!o) return null;
              return (
                <div key={oid} className="flex items-center justify-between gap-2 bg-[#F7F5F0] border border-[#E4DECF] rounded-sm px-2.5 py-1.5 text-sm">
                  <span className="font-semibold text-[#2A2118]">{o.nombre}</span>
                  <button type="button" onClick={() => quitarObra(oid)} className="text-[var(--tema-peligro)]"><X size={14} /></button>
                </div>
              );
            })}
          </div>
        )}
        {core.obras.filter((o) => !obraIds.includes(o.id)).length > 0 && (
          <div className="flex gap-2">
            <div className="flex-1">
              <BuscadorSelect
                opciones={core.obras.filter((o) => !obraIds.includes(o.id)).map((o) => ({ id: o.id, label: o.nombre }))}
                value={obraParaAgregar}
                onChange={setObraParaAgregar}
                placeholder="Buscar obra..."
              />
            </div>
            <button
              type="button"
              disabled={!obraParaAgregar}
              onClick={() => { agregarObra(obraParaAgregar); setObraParaAgregar(""); }}
              className="shrink-0 border border-[#E4DECF] rounded-sm px-3 text-sm font-bold text-[#2A2118] disabled:text-[#C9C1AE] disabled:cursor-not-allowed"
            >
              + Agregar
            </button>
          </div>
        )}
      </Field>

      {faltaVinculo && (
        <p className="text-xs text-[#A69C88] mb-3">Elegí al menos una — persona, empresa u obra.</p>
      )}

      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#6B6352]">Cancelar</button>
        <button onClick={guardar} disabled={!titulo.trim() || faltaVinculo} className={`flex-1 rounded-sm py-2.5 font-bold text-sm ${!titulo.trim() || faltaVinculo ? "bg-[#E7E2D8] text-[#A69C88] cursor-not-allowed" : "bg-[var(--tema-acento)] text-[#2A2118]"}`}>
          Guardar cambios
        </button>
      </div>
    </div>
  );
}

// Agrega una tarea a un hilo de cliente: buscando entre las tareas sueltas (sin vincular
// todavía a ningún hilo de cliente) — priorizando las que comparten alguna persona con este
// hilo — o creando una nueva si no la encuentra.
function AgregarTareaAlHiloForm({ core, hiloClienteId, personasDelHilo, onVincular, onCrear, onClose }) {
  const [modo, setModo] = useState("existente"); // 'existente' | 'nueva'
  const [q, setQ] = useState("");
  const [titulo, setTitulo] = useState("");
  const [notas, setNotas] = useState("");
  const [columnaId, setColumnaId] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [aviso, setAviso] = useState(AVISO_DEFAULT);
  const columnas = core.kanbanColumnasTareas || [];

  const disponibles = useMemo(() => {
    const personaIds = new Set(personasDelHilo.map((p) => p.id));
    const sueltas = core.hilos.filter((h) => h.tipo === "tarea" && !h.hiloRelacionadoId);
    const texto = q.trim().toLowerCase();
    const filtradas = texto ? sueltas.filter((h) => h.titulo.toLowerCase().includes(texto)) : sueltas;
    const conMismaPersona = [];
    const resto = [];
    filtradas.forEach((h) => {
      const coincide = personasActivasDeHilo(h, core).some((p) => personaIds.has(p.id));
      (coincide ? conMismaPersona : resto).push(h);
    });
    return [...conMismaPersona, ...resto];
  }, [core.hilos, q, personasDelHilo]);

  const crear = () => {
    if (!titulo.trim()) return;
    const nuevoHilo = {
      id: uid("H"), titulo: titulo.trim(), notas: notas.trim(), fecha, hora,
      aviso: hora && aviso.activo ? aviso : null, avisoEnviado: false,
      estado: "Activo", fechaCreacion: todayISO(), tipo: "tarea",
      columnaTareaId: columnaId || null, hiloRelacionadoId: hiloClienteId, notaCierre: "",
    };
    onCrear(nuevoHilo);
    setTitulo(""); setNotas(""); setColumnaId(""); setFecha(""); setHora(""); setAviso(AVISO_DEFAULT);
    setModo("existente");
  };

  return (
    <>
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setModo("existente")}
          style={{ backgroundColor: modo === "existente" ? "#2A2F36" : "#E7E2D8", color: modo === "existente" ? "#FFFFFF" : "#6B6352" }}
          className="flex-1 py-2 rounded-sm text-sm font-bold"
        >Tarea existente</button>
        <button
          type="button"
          onClick={() => setModo("nueva")}
          style={{ backgroundColor: modo === "nueva" ? "#2A2F36" : "#E7E2D8", color: modo === "nueva" ? "#FFFFFF" : "#6B6352" }}
          className="flex-1 py-2 rounded-sm text-sm font-bold"
        >Nueva tarea</button>
      </div>
      {modo === "existente" ? (
        <>
          <Field label="Buscar tarea">
            <input autoFocus className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título de la tarea..." />
          </Field>
          {disponibles.length === 0 ? (
            <p className="text-sm text-[#A69C88]">No encontré tareas sueltas con ese criterio — probá creando una nueva.</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {disponibles.map((h) => (
                <button
                  key={h.id}
                  onClick={() => onVincular(h.id)}
                  className="w-full text-left bg-[#F7F5F0] border border-[#E4DECF] rounded-sm p-2.5 text-sm font-semibold text-[#2A2118]"
                >
                  {h.titulo}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <Field label="Título de la tarea *"><CampoConMenciones core={core} autoFocus value={titulo} onChange={setTitulo} /></Field>
          <Field label="Notas (opcional)"><CampoConMenciones core={core} multiline rows={2} value={notas} onChange={setNotas} /></Field>
          <Field label="Columna del Kanban de Tareas (opcional)">
            <select className={inputCls} value={columnaId} onChange={(e) => setColumnaId(e.target.value)}>
              <option value="">— Sin columna —</option>
              {columnas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Field>
          <SelectorFechaHora fecha={fecha} hora={hora} aviso={aviso} onAviso={setAviso} onFecha={setFecha} onHora={setHora} labelFecha="Fecha (opcional)" />
          <PrimaryBtn full onClick={crear}>Crear tarea</PrimaryBtn>
        </>
      )}
      <button type="button" onClick={onClose} className="w-full mt-3 border border-[#E4DECF] rounded-sm py-2.5 font-bold text-sm text-[#2A2118]">Listo</button>
    </>
  );
}

// Igual que AgregarTareaAlHiloForm, pero vincula la tarea directamente a una Persona/
// Empresa/Obra (vínculo genérico) en vez de a un hilo de cliente puntual.
function AgregarTareaAEntidadForm({ core, tareasExcluidas, onVincular, onCrear, onClose }) {
  const [modo, setModo] = useState("existente"); // 'existente' | 'nueva'
  const [q, setQ] = useState("");
  const [titulo, setTitulo] = useState("");
  const [notas, setNotas] = useState("");
  const [columnaId, setColumnaId] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [aviso, setAviso] = useState(AVISO_DEFAULT);
  const columnas = core.kanbanColumnasTareas || [];

  const disponibles = useMemo(() => {
    const excluidas = new Set(tareasExcluidas);
    const sueltas = core.hilos.filter((h) => h.tipo === "tarea" && !excluidas.has(h.id));
    const texto = q.trim().toLowerCase();
    return texto ? sueltas.filter((h) => h.titulo.toLowerCase().includes(texto)) : sueltas;
  }, [core.hilos, q, tareasExcluidas]);

  const crear = () => {
    if (!titulo.trim()) return;
    const nuevoHilo = {
      id: uid("H"), titulo: titulo.trim(), notas: notas.trim(), fecha, hora,
      aviso: hora && aviso.activo ? aviso : null, avisoEnviado: false,
      estado: "Activo", fechaCreacion: todayISO(), tipo: "tarea",
      columnaTareaId: columnaId || null, hiloRelacionadoId: null, notaCierre: "",
    };
    onCrear(nuevoHilo);
    setTitulo(""); setNotas(""); setColumnaId(""); setFecha(""); setHora(""); setAviso(AVISO_DEFAULT);
    setModo("existente");
  };

  return (
    <>
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setModo("existente")}
          style={{ backgroundColor: modo === "existente" ? "#2A2F36" : "#E7E2D8", color: modo === "existente" ? "#FFFFFF" : "#6B6352" }}
          className="flex-1 py-2 rounded-sm text-sm font-bold"
        >Tarea existente</button>
        <button
          type="button"
          onClick={() => setModo("nueva")}
          style={{ backgroundColor: modo === "nueva" ? "#2A2F36" : "#E7E2D8", color: modo === "nueva" ? "#FFFFFF" : "#6B6352" }}
          className="flex-1 py-2 rounded-sm text-sm font-bold"
        >Nueva tarea</button>
      </div>
      {modo === "existente" ? (
        <>
          <Field label="Buscar tarea">
            <input autoFocus className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título de la tarea..." />
          </Field>
          {disponibles.length === 0 ? (
            <p className="text-sm text-[#A69C88]">No encontré tareas con ese criterio — probá creando una nueva.</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {disponibles.map((h) => (
                <button
                  key={h.id}
                  onClick={() => onVincular(h.id)}
                  className="w-full text-left bg-[#F7F5F0] border border-[#E4DECF] rounded-sm p-2.5 text-sm font-semibold text-[#2A2118]"
                >
                  {h.titulo}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <Field label="Título de la tarea *"><CampoConMenciones core={core} autoFocus value={titulo} onChange={setTitulo} /></Field>
          <Field label="Columna del Kanban de Tareas (opcional)">
            <select className={inputCls} value={columnaId} onChange={(e) => setColumnaId(e.target.value)}>
              <option value="">— Sin columna —</option>
              {columnas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Field>
          <SelectorFechaHora fecha={fecha} hora={hora} aviso={aviso} onAviso={setAviso} onFecha={setFecha} onHora={setHora} labelFecha="Fecha (opcional)" />
          <p className="text-xs text-[#A69C88] mb-3">Si cargás fecha, se crea con esa acción pendiente. Si no, la tarea queda sin fecha hasta que la avances.</p>
          <PrimaryBtn full onClick={crear}>Crear tarea</PrimaryBtn>
        </>
      )}
      <button type="button" onClick={onClose} className="w-full mt-3 border border-[#E4DECF] rounded-sm py-2.5 font-bold text-sm text-[#2A2118]">Listo</button>
    </>
  );
}

// Avanzar un hilo: registra lo que se acaba de hacer y, opcionalmente, programa la próxima acción — en un solo paso.
function AvanzarHiloForm({ hilo, pendienteActual, core, setCore, acciones, setAcciones, onClose }) {
  const esTarea = hilo.tipo === "tarea";
  const [tipoAccionId1, setTipoAccionId1] = useState(pendienteActual?.tipoAccionId || (esTarea ? "" : tipoDefaultId(core)));
  const [notas1, setNotas1] = useState("");
  const [fechaHecho, setFechaHecho] = useState(todayISO());
  const [programarProxima, setProgramarProxima] = useState(true);
  const [tipoAccionId2, setTipoAccionId2] = useState(esTarea ? "" : tipoDefaultId(core));
  const [notas2, setNotas2] = useState("");
  const [modoFecha, setModoFecha] = useState("periodo"); // 'periodo' | 'especifica'
  const [cantidad, setCantidad] = useState(1);
  const [unidad, setUnidad] = useState("semanas");
  const [fechaEspecifica, setFechaEspecifica] = useState(todayISO());
  const [horaEspecifica, setHoraEspecifica] = useState("");
  const [avisoEspecifica, setAvisoEspecifica] = useState(AVISO_DEFAULT);
  const [confirmarEspecifica, setConfirmarEspecifica] = useState(false);
  const [prioridad, setPrioridad] = useState("Media");
  const [recurrente, setRecurrente] = useState(false);
  const [repiteCadaN, setRepiteCadaN] = useState(1);
  const [repiteUnidad, setRepiteUnidad] = useState("meses");
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (programarProxima && modoFecha === "periodo") {
      const base = addPeriod(todayISO(), Number(cantidad) || 1, unidad);
      setPreview(computeSmartDate(base, acciones, core.parametros));
    }
  }, [programarProxima, modoFecha, cantidad, unidad]); // eslint-disable-line

  const especificaInhabil = modoFecha === "especifica" && esFechaInhabil(fechaEspecifica, core.parametros);

  const guardar = () => {
    const hoy = todayISO();
    const fecha = modoFecha === "periodo" ? (preview || hoy) : (fechaEspecifica || hoy);
    const hora = modoFecha === "especifica" ? horaEspecifica : "";
    const aviso = modoFecha === "especifica" && hora && avisoEspecifica.activo ? avisoEspecifica : null;
    setAcciones((prev) => {
      let siguienteNumero = Math.max(0, ...prev.map((a) => a.numero || 0)) + 1;
      let next = prev;
      let idCompletada;

      const fechaRealizada = fechaHecho || hoy;
      if (pendienteActual) {
        idCompletada = pendienteActual.id;
        next = next.map((a) => (a.id === pendienteActual.id ? { ...a, estado: "Realizada", fechaRealizada, fechaProgramada: "", horaProgramada: "", prioridad: "", tipoAccionId: tipoAccionId1, notaHecho: notas1, secuencia: Date.now() } : a));
      } else {
        idCompletada = uid("A");
        next = [{ id: idCompletada, hiloId: hilo.id, tipoAccionId: tipoAccionId1, estado: "Realizada", fechaRealizada, fechaProgramada: "", horaProgramada: "", prioridad: "", notaPlanificada: "", notaHecho: notas1, origenId: null, destinoId: null, numero: siguienteNumero++, recurrente: false, repiteCadaN: null, repiteUnidad: null, fechaCreacion: hoy, secuencia: Date.now() }, ...next];
      }

      if (programarProxima) {
        const idNueva = uid("A");
        // Hereda la columna del Kanban de la acción que se acaba de completar, para que el
        // hilo no se vaya a "Sin columna" al continuarlo (ver AvanzarHiloForm).
        next = [{ id: idNueva, hiloId: hilo.id, tipoAccionId: tipoAccionId2, estado: "Pendiente", fechaRealizada: "", fechaProgramada: fecha, horaProgramada: hora, prioridad, notaPlanificada: notas2, notaHecho: "", origenId: idCompletada, destinoId: null, numero: siguienteNumero++, recurrente, repiteCadaN: recurrente ? Number(repiteCadaN) : null, repiteUnidad: recurrente ? repiteUnidad : null, fechaCreacion: hoy, secuencia: Date.now() + 1, columnaId: pendienteActual?.columnaId ?? null, aviso, avisoEnviado: false }, ...next];
        next = next.map((a) => (a.id === idCompletada ? { ...a, destinoId: idNueva } : a));
      }
      return next;
    });
    onClose();
  };

  const submit = () => {
    if (programarProxima && especificaInhabil && !confirmarEspecifica) { setConfirmarEspecifica(true); return; }
    guardar();
  };

  return (
    <Modal title={`${esTarea ? "Avanzar tarea" : "Avanzar hilo"} — ${textoPlanoDeMenciones(hilo.titulo)}`} onClose={onClose}>
      <p className="text-[11px] font-bold tracking-wide text-[var(--tema-vinculo)] mb-2">{pendienteActual ? "Lo que acabás de hacer" : "Registrar contacto"}</p>
      {!esTarea && (
        <SelectConCrear
          label="Tipo de acción"
          opciones={core.tiposAccion}
          value={tipoAccionId1}
          onChange={setTipoAccionId1}
          placeholderCrear="Ej: Videollamada"
          onCrear={(nombre) => {
            const nuevo = { id: uid("TA"), nombre };
            setCore((prev) => ({ ...prev, tiposAccion: [...prev.tiposAccion, nuevo] }));
            return nuevo;
          }}
        />
      )}
      <Field label={esTarea ? "¿Qué hiciste?" : "Se hizo"}>
        <CampoConMenciones core={core} multiline rows={2} value={notas1} onChange={setNotas1} placeholder="Qué hablaron, qué resultó..." />
      </Field>
      <Field label="Fecha en que pasó">
        <input type="date" className={inputCls} value={fechaHecho} onChange={(e) => setFechaHecho(e.target.value)} />
      </Field>

      <div className="border-t border-[#E4DECF] my-3 pt-3">
        <label className="flex items-center gap-2 mb-2 text-sm font-bold text-[#2A2118]">
          <input type="checkbox" checked={programarProxima} onChange={(e) => setProgramarProxima(e.target.checked)} /> Programar próxima acción
        </label>

        {programarProxima && (
          <>
            {!esTarea && (
              <SelectConCrear
                label="Tipo de acción"
                opciones={core.tiposAccion}
                value={tipoAccionId2}
                onChange={setTipoAccionId2}
                placeholderCrear="Ej: Videollamada"
                onCrear={(nombre) => {
                  const nuevo = { id: uid("TA"), nombre };
                  setCore((prev) => ({ ...prev, tiposAccion: [...prev.tiposAccion, nuevo] }));
                  return nuevo;
                }}
              />
            )}
            <Field label={esTarea ? "Próximo paso" : "Se planifica (qué se busca con esta acción)"}>
              <CampoConMenciones core={core} multiline rows={2} value={notas2} onChange={setNotas2} placeholder="Ej: confirmar si aceptaron la propuesta, próximos pasos a seguir..." />
            </Field>

            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setModoFecha("periodo")}
                style={{ backgroundColor: modoFecha === "periodo" ? "#2A2F36" : "#E7E2D8", color: modoFecha === "periodo" ? "#FFFFFF" : "#6B6352" }}
                className="flex-1 py-1.5 rounded-sm text-xs font-bold"
              >Dentro de un período</button>
              <button
                type="button"
                onClick={() => setModoFecha("especifica")}
                style={{ backgroundColor: modoFecha === "especifica" ? "#2A2F36" : "#E7E2D8", color: modoFecha === "especifica" ? "#FFFFFF" : "#6B6352" }}
                className="flex-1 py-1.5 rounded-sm text-xs font-bold"
              >Fecha específica</button>
            </div>

            {modoFecha === "periodo" ? (
              <>
                <Field label="¿Dentro de cuánto?">
                  <div className="flex gap-2">
                    <input type="number" min={1} className={inputCls} value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
                    <select className={inputCls} value={unidad} onChange={(e) => setUnidad(e.target.value)}>
                      <option value="dias">días</option>
                      <option value="semanas">semanas</option>
                      <option value="meses">meses</option>
                    </select>
                  </div>
                </Field>
                {preview && (
                  <p className="text-xs text-[#6B6352] mb-3 -mt-2 bg-[#EFEBE0] rounded-sm px-2.5 py-1.5">
                    Fecha sugerida: <span className="font-bold">{fmtDate(preview)}</span> (ajustada para no caer en día no hábil ni en un día muy cargado)
                  </p>
                )}
              </>
            ) : (
              <>
                <SelectorFechaHora
                  fecha={fechaEspecifica}
                  hora={horaEspecifica}
                  aviso={avisoEspecifica}
                  onAviso={setAvisoEspecifica}
                  onFecha={(v) => { setFechaEspecifica(v); setConfirmarEspecifica(false); }}
                  onHora={setHoraEspecifica}
                />
                {especificaInhabil && (
                  <div className="bg-[#FBEEE7] border border-[var(--tema-acento)] rounded-sm p-2.5 mb-3">
                    <p className="text-xs text-[#2A2118]">Ese día está marcado como no hábil. Si guardás de nuevo, se confirma igual.</p>
                  </div>
                )}
              </>
            )}

            <Field label="Prioridad">
              <select className={inputCls} value={prioridad} onChange={(e) => setPrioridad(e.target.value)}>
                <option>Alta</option><option>Media</option><option>Baja</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 mb-2 text-sm text-[#2A2118]">
              <input type="checkbox" checked={recurrente} onChange={(e) => setRecurrente(e.target.checked)} /> Es una acción repetitiva
            </label>
            {recurrente && (
              <Field label="Repetir cada">
                <div className="flex gap-2">
                  <input type="number" min={1} className={inputCls} value={repiteCadaN} onChange={(e) => setRepiteCadaN(e.target.value)} />
                  <select className={inputCls} value={repiteUnidad} onChange={(e) => setRepiteUnidad(e.target.value)}>
                    <option value="dias">días</option>
                    <option value="semanas">semanas</option>
                    <option value="meses">meses</option>
                  </select>
                </div>
              </Field>
            )}
          </>
        )}
      </div>

      <PrimaryBtn full onClick={submit}>{especificaInhabil && confirmarEspecifica ? "Sí, guardar igual" : "Guardar y continuar"}</PrimaryBtn>
    </Modal>
  );
}

// Editar una acción puntual del hilo (ya no necesita empresa/obra: las hereda del hilo)
function EditAccionForm({ accion, core, setCore, otrasAccionesDelHilo = [], onClose, onSave }) {
  const [tipoAccionId, setTipoAccionId] = useState(accion.tipoAccionId);
  const [estado, setEstado] = useState(accion.estado);
  const [fechaRealizada, setFechaRealizada] = useState(accion.fechaRealizada || todayISO());
  const [fechaProgramada, setFechaProgramada] = useState(accion.fechaProgramada || todayISO());
  const [horaProgramada, setHoraProgramada] = useState(accion.horaProgramada || "");
  const [aviso, setAviso] = useState(accion.aviso || AVISO_DEFAULT);
  const [prioridad, setPrioridad] = useState(accion.prioridad || "Media");
  const [notaPlanificada, setNotaPlanificada] = useState(accion.notaPlanificada || "");
  const [notaHecho, setNotaHecho] = useState(accion.notaHecho || "");
  const [recurrente, setRecurrente] = useState(!!accion.recurrente);
  const [repiteCadaN, setRepiteCadaN] = useState(accion.repiteCadaN || 1);
  const [repiteUnidad, setRepiteUnidad] = useState(accion.repiteUnidad || "meses");
  const [confirmar, setConfirmar] = useState(false);

  const inhabil = estado === "Pendiente" && esFechaInhabil(fechaProgramada, core.parametros);
  const yaHayPendiente = estado === "Pendiente" && otrasAccionesDelHilo.some((a) => a.estado === "Pendiente");

  const submit = () => {
    if (yaHayPendiente) return;
    if (estado === "Pendiente" && inhabil && !confirmar) { setConfirmar(true); return; }
    if (estado === "Realizada") {
      onSave({ tipoAccionId, estado, fechaRealizada, fechaProgramada: "", horaProgramada: "", prioridad: "", notaPlanificada, notaHecho, recurrente: false, repiteCadaN: null, repiteUnidad: null, secuencia: accion.secuencia || Date.now(), aviso: null, avisoEnviado: false });
    } else {
      const avisoFinal = horaProgramada && aviso.activo ? aviso : null;
      // Si fecha/hora/aviso no cambiaron, se conserva si ya se había enviado (para no
      // duplicar el aviso); si cambió algo de eso, se resetea para que pueda volver a avisar.
      const avisoCambio = fechaProgramada !== (accion.fechaProgramada || "") || horaProgramada !== (accion.horaProgramada || "") || JSON.stringify(avisoFinal) !== JSON.stringify(accion.aviso || null);
      onSave({ tipoAccionId, estado, fechaRealizada: "", fechaProgramada, horaProgramada, prioridad, notaPlanificada, notaHecho, recurrente, repiteCadaN: recurrente ? Number(repiteCadaN) : null, repiteUnidad: recurrente ? repiteUnidad : null, aviso: avisoFinal, avisoEnviado: avisoCambio ? false : !!accion.avisoEnviado });
    }
  };

  return (
    <Modal title="Editar acción" onClose={onClose}>
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setEstado("Realizada")}
          style={{ backgroundColor: estado === "Realizada" ? "var(--tema-estadoRealizada)" : "#E7E2D8", color: estado === "Realizada" ? "#FFFFFF" : "#6B6352" }}
          className="flex-1 py-2 rounded-sm text-sm font-bold"
        >Realizada</button>
        <button
          type="button"
          onClick={() => setEstado("Pendiente")}
          style={{ backgroundColor: estado === "Pendiente" ? "var(--tema-estadoPendiente)" : "#E7E2D8", color: estado === "Pendiente" ? "#2A2118" : "#6B6352" }}
          className="flex-1 py-2 rounded-sm text-sm font-bold"
        >Pendiente</button>
      </div>

      <SelectConCrear
        label="Tipo de acción"
        opciones={core.tiposAccion}
        value={tipoAccionId}
        onChange={setTipoAccionId}
        placeholderCrear="Ej: Videollamada"
        onCrear={(nombre) => {
          const nuevo = { id: uid("TA"), nombre };
          setCore((prev) => ({ ...prev, tiposAccion: [...prev.tiposAccion, nuevo] }));
          return nuevo;
        }}
      />

      {estado === "Realizada" ? (
        <Field label="Fecha realizada"><input type="date" className={inputCls} value={fechaRealizada} onChange={(e) => setFechaRealizada(e.target.value)} /></Field>
      ) : (
        <>
          {yaHayPendiente && (
            <div className="bg-[#FBEEE7] border border-[var(--tema-peligro)] rounded-sm p-2.5 mb-3">
              <p className="text-xs text-[#2A2118]">Este hilo ya tiene otra acción pendiente. No se puede guardar como Pendiente hasta resolver esa — reprogramala o marcala como Realizada primero.</p>
            </div>
          )}
          <SelectorFechaHora
            fecha={fechaProgramada}
            hora={horaProgramada}
            aviso={aviso}
            onAviso={setAviso}
            onFecha={(v) => { setFechaProgramada(v); setConfirmar(false); }}
            onHora={setHoraProgramada}
            labelFecha="Fecha programada"
          />
          {inhabil && (
            <div className="bg-[#FBEEE7] border border-[var(--tema-acento)] rounded-sm p-2.5 mb-3">
              <p className="text-xs text-[#2A2118]">Ese día está marcado como no hábil. Si guardás de nuevo, se confirma igual.</p>
            </div>
          )}
          <Field label="Prioridad">
            <select className={inputCls} value={prioridad} onChange={(e) => setPrioridad(e.target.value)}>
              <option>Alta</option><option>Media</option><option>Baja</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 mb-2 text-sm text-[#2A2118]">
            <input type="checkbox" checked={recurrente} onChange={(e) => setRecurrente(e.target.checked)} /> Es una acción repetitiva
          </label>
          {recurrente && (
            <Field label="Repetir cada">
              <div className="flex gap-2">
                <input type="number" min={1} className={inputCls} value={repiteCadaN} onChange={(e) => setRepiteCadaN(e.target.value)} />
                <select className={inputCls} value={repiteUnidad} onChange={(e) => setRepiteUnidad(e.target.value)}>
                  <option value="dias">días</option>
                  <option value="semanas">semanas</option>
                  <option value="meses">meses</option>
                </select>
              </div>
            </Field>
          )}
        </>
      )}

      <Field label="Se había planificado (por qué se creó esta acción)">
        <CampoConMenciones core={core} multiline rows={2} value={notaPlanificada} onChange={setNotaPlanificada} />
      </Field>
      {estado === "Realizada" && (
        <Field label="Se hizo">
          <CampoConMenciones core={core} multiline rows={2} value={notaHecho} onChange={setNotaHecho} />
        </Field>
      )}

      <PrimaryBtn full onClick={submit} disabled={yaHayPendiente}>{inhabil && confirmar ? "Sí, guardar igual" : "Guardar cambios"}</PrimaryBtn>
    </Modal>
  );
}

function VincularObraForm({ core, setCore, empresaId, onClose, onVinculada }) {
  const [agregadas, setAgregadas] = useState([]);
  const yaVinculadas = new Set(obraIdsDeEmpresa(core, empresaId));
  const disponibles = core.obras.filter((o) => !yaVinculadas.has(o.id) && !agregadas.includes(o.id));
  const [obraId, setObraId] = useState("");
  const [showNuevaObra, setShowNuevaObra] = useState(false);

  const vincularObra = (id) => {
    setCore((prev) => ({ ...prev, vinculos: [...(prev.vinculos || []), vinc("Empresa", empresaId, "Obra", id, TR_DUENA, false, todayISO())] }));
    setAgregadas((a) => [...a, id]);
    onVinculada?.(id);
  };
  const agregarExistente = () => {
    if (!obraId) return;
    vincularObra(obraId);
    setObraId("");
  };
  const quitarAgregada = (id) => {
    setCore((prev) => ({ ...prev, vinculos: (prev.vinculos || []).filter((v) => !(v.tipoRelacionId === TR_DUENA && v.origenTipo === "Empresa" && v.origenId === empresaId && v.destinoTipo === "Obra" && v.destinoId === id)) }));
    setAgregadas((a) => a.filter((x) => x !== id));
  };

  return (
    <Modal title="Vincular obras a la empresa" onClose={onClose}>
      <ChipsAgregados items={agregadas} core={core} coleccion="obras" labelKey="nombre" onQuitar={quitarAgregada} />
      {disponibles.length === 0 ? (
        <p className="text-sm text-[#A69C88] mb-3">No hay más obras disponibles para vincular.</p>
      ) : (
        <>
          <Field label="Obra">
            <BuscadorSelect
              opciones={disponibles.map((o) => ({ id: o.id, label: o.nombre }))}
              value={obraId}
              onChange={setObraId}
              placeholder="Buscar obra..."
            />
          </Field>
          <button type="button" disabled={!obraId} onClick={agregarExistente} className="w-full border border-[#E4DECF] rounded-sm py-2.5 font-bold text-sm text-[#2A2118] disabled:text-[#C9C1AE] disabled:cursor-not-allowed mb-3">+ Agregar</button>
        </>
      )}
      <button type="button" onClick={() => setShowNuevaObra(true)} className="w-full border border-[#E4DECF] rounded-sm py-2 font-bold text-xs text-[#2A2118] mb-3">+ Crear obra nueva</button>
      {showNuevaObra && (
        <ObraForm
          initial={{}}
          core={core}
          setCore={setCore}
          onClose={() => setShowNuevaObra(false)}
          onSave={(data, vinculoEmpresa) => {
            setCore((prev) => ({ ...prev, obras: [data, ...prev.obras] }));
            vincularObra(data.id);
            if (vinculoEmpresa?.empresaId && vinculoEmpresa.empresaId !== empresaId) {
              setCore((prev) => ({
                ...prev,
                vinculos: [...(prev.vinculos || []), vinc("Empresa", vinculoEmpresa.empresaId, "Obra", data.id, TR_DUENA, false, todayISO())],
              }));
            }
            setShowNuevaObra(false);
          }}
        />
      )}
      <button type="button" onClick={onClose} className="w-full mt-1 bg-[var(--tema-acento)] text-[#2A2118] rounded-sm py-2.5 font-bold text-sm">Listo</button>
    </Modal>
  );
}

function EmpresasView({ core, setCore, onOpen }) {
  const [modal, setModal] = useState(null);
  const [q, setQ] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const usoDeletingId = deletingId ? vinculosDeEntidad(core, "Empresa", deletingId, true).length : 0;
  const [showImportar, setShowImportar] = useState(false);
  const list = core.empresas.filter((e) => e.denominacion.toLowerCase().includes(q.toLowerCase()));

  const save = (data, vinculoPersona) => {
    setCore((prev) => {
      const exists = prev.empresas.some((e) => e.id === data.id);
      const empresas = exists ? prev.empresas.map((e) => (e.id === data.id ? data : e)) : [data, ...prev.empresas];
      const vinculos = vinculoPersona?.personaId
        ? [...(prev.vinculos || []), vinc("Persona", vinculoPersona.personaId, "Empresa", data.id, vinculoPersona.tipoRelacionId || null, true, todayISO())]
        : prev.vinculos;
      return { ...prev, empresas, vinculos };
    });
    setModal(null);
  };
  const del = (id) => setCore((prev) => ({
    ...prev,
    empresas: prev.empresas.filter((e) => e.id !== id),
    vinculos: (prev.vinculos || []).filter((v) => !(v.origenTipo === "Empresa" && v.origenId === id) && !(v.destinoTipo === "Empresa" && v.destinoId === id)),
    entidadEtiqueta: prev.entidadEtiqueta.filter((r) => !(r.entidadTipo === "Empresa" && r.entidadId === id)),
  }));

  return (
    <div>
    <div className="sticky top-0 z-10 bg-[#F7F5F0]">
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A69C88]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa..." className={`${inputCls} pl-8`} />
        </div>
        <button onClick={() => setShowImportar(true)} aria-label="Importar desde Excel" className="shrink-0 border border-[#E4DECF] rounded-sm px-3.5 py-2 font-bold text-[#6B6352]"><FileSpreadsheet size={18} /></button>
        <button onClick={() => setModal({})} className="shrink-0 bg-[var(--tema-acento)] text-[#2A2118] rounded-sm px-3 py-1 flex flex-col items-center justify-center gap-0.5 leading-none">
          <span className="text-[9px] font-bold">{core.empresas.length}</span>
          <Plus size={16} />
        </button>
      </div>
    </div>

      {list.length === 0 ? (
        <EmptyState icon={<Building2 size={26} />} text="No hay empresas cargadas todavía." />
      ) : (
        <div className="space-y-2">
          {list.map((e) => {
            const nPersonas = personaIdsDeEmpresa(core, e.id).length;
            const nSubsidiarias = subsidiariasDeEmpresa(e.id, core).length;
            const cabecera = cabeceraDeEmpresa(e.id, core);
            return (
              <div key={e.id} className="w-full bg-white border border-[#E4DECF] rounded-sm p-3 flex items-center gap-3">
                <button onClick={() => onOpen("empresa", e.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) }}><Building2 size={16} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#2A2118] truncate" title={e.denominacion}>{e.denominacion}</p>
                    {nPersonas > 0 ? (
                      <p className="text-xs text-[#8A8272] truncate" title={`${e.ciudad ? e.ciudad + " · " : ""}${nPersonas} contacto${nPersonas !== 1 ? "s" : ""}`}>{e.ciudad ? `${e.ciudad} · ` : ""}{nPersonas} contacto{nPersonas !== 1 ? "s" : ""}</p>
                    ) : (
                      <Chip tone="estadoPendiente">A definir</Chip>
                    )}
                    {nSubsidiarias > 0 && (
                      <p className="text-[11px] text-[var(--tema-vinculo)] font-semibold flex items-center gap-1 mt-0.5"><Layers size={11} /> Cabecera · {nSubsidiarias} empresa{nSubsidiarias !== 1 ? "s" : ""} del grupo</p>
                    )}
                    {cabecera && (
                      <p className="text-[11px] text-[#8A8272] flex items-center gap-1 mt-0.5"><Layers size={11} /> Grupo {cabecera.denominacion}</p>
                    )}
                  </div>
                </button>
                <IconBtn label="Editar empresa" onClick={() => setModal(e)}><Pencil size={15} /></IconBtn>
                <IconBtn label="Eliminar empresa" danger onClick={() => setDeletingId(e.id)}><Trash2 size={15} /></IconBtn>
                <ChevronRight size={16} className="text-[#C9C1AE] shrink-0" />
              </div>
            );
          })}
        </div>
      )}

      {modal !== null && <EmpresaForm initial={modal} core={core} setCore={setCore} onSave={save} onDelete={modal.id ? () => { del(modal.id); setModal(null); } : null} onClose={() => setModal(null)} />}
      {deletingId && (
        <Modal title="¿Eliminar esta empresa?" onClose={() => setDeletingId(null)}>
          <p className="text-sm text-[#2A2118] mb-4">{textoUsoRegistro(usoDeletingId, "vínculo", "vínculos", "Se borran junto con la empresa (personas, obras, hilos).")}</p>
          <div className="flex gap-2">
            <button onClick={() => setDeletingId(null)} className="flex-1 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#6B6352]">Cancelar</button>
            <button onClick={() => { del(deletingId); setDeletingId(null); }} style={{ backgroundColor: "var(--tema-peligro)", color: "#FFFFFF" }} className="flex-1 rounded-sm py-2.5 font-bold text-sm">Sí, eliminar</button>
          </div>
        </Modal>
      )}
      {showImportar && <ImportarEmpresasForm core={core} setCore={setCore} onClose={() => setShowImportar(false)} />}
    </div>
  );
}

function EmpresaForm({ initial, core, setCore, onSave, onDelete, onClose }) {
  const esNueva = !initial.id;
  const [denominacion, setDenominacion] = useState(initial.denominacion || "");
  const [cuit, setCuit] = useState(initial.cuit || "");
  const [direccion, setDireccion] = useState(initial.direccion || "");
  const [ciudad, setCiudad] = useState(initial.ciudad || "");
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  const [personaModo, setPersonaModo] = useState("existente"); // 'existente' | 'adefinir'
  const [personaId, setPersonaId] = useState(core?.personas?.[0]?.id || "");
  const [tipoRelacionId, setTipoRelacionId] = useState("");
  const [showNuevaPersona, setShowNuevaPersona] = useState(false);

  const submit = () => {
    if (!denominacion.trim()) return;
    const data = { id: initial.id || uid("E"), denominacion: denominacion.trim(), cuit: cuit.trim(), direccion, ciudad };
    let vinculoPersona = null;
    if (esNueva && personaModo === "existente" && personaId) vinculoPersona = { personaId, tipoRelacionId: tipoRelacionId || null };
    onSave(data, vinculoPersona);
  };

  return (
    <Modal title={initial.id ? "Editar empresa" : "Nueva empresa"} onClose={onClose}>
      <Field label="Denominación *"><input className={inputCls} value={denominacion} onChange={(e) => setDenominacion(e.target.value)} /></Field>
      <Field label="CUIT"><input className={inputCls} placeholder="30-12345678-9" value={cuit} onChange={(e) => setCuit(e.target.value)} /></Field>
      <Field label="Dirección"><input className={inputCls} value={direccion} onChange={(e) => setDireccion(e.target.value)} /></Field>
      <Field label="Ciudad"><input className={inputCls} value={ciudad} onChange={(e) => setCiudad(e.target.value)} /></Field>
      {!esNueva && <p className="text-xs text-[#A69C88] mb-3">Los grupos (cabecera/subsidiaria) y demás relaciones se gestionan desde la sección "Vínculos" de la ficha.</p>}

      {esNueva && (
        <div className="border-t border-[#E4DECF] my-3 pt-3">
          <p className="text-[11px] font-bold tracking-wide text-[var(--tema-vinculo)] mb-2">Persona que la representa</p>
          <div className="flex gap-1.5 mb-2">
            <button type="button" onClick={() => setPersonaModo("existente")} style={{ backgroundColor: personaModo === "existente" ? "#2A2F36" : "#E7E2D8", color: personaModo === "existente" ? "#FFFFFF" : "#6B6352" }} className="flex-1 py-2 rounded-sm text-xs font-bold">Existente</button>
            <button type="button" onClick={() => setPersonaModo("adefinir")} style={{ backgroundColor: personaModo === "adefinir" ? "#2A2F36" : "#E7E2D8", color: personaModo === "adefinir" ? "#FFFFFF" : "#6B6352" }} className="flex-1 py-2 rounded-sm text-xs font-bold">A definir</button>
          </div>
          {personaModo === "existente" && (
            <>
              {(core?.personas || []).length > 0 && (
                <Field label="Persona">
                  <BuscadorSelect
                    opciones={core.personas.map((p) => ({ id: p.id, label: p.nombre }))}
                    value={personaId}
                    onChange={setPersonaId}
                    placeholder="Buscar persona..."
                  />
                </Field>
              )}
              <button type="button" onClick={() => setShowNuevaPersona(true)} className="w-full border border-[#E4DECF] rounded-sm py-2 font-bold text-xs text-[#2A2118] mb-3">+ Crear persona nueva</button>
            </>
          )}
          {personaModo === "adefinir" && (
            <p className="text-sm text-[#A69C88] mb-3">La empresa va a quedar marcada como "A definir" hasta que le asignes una persona.</p>
          )}
          {personaModo !== "adefinir" && (
            <Field label="Tipo de relación (opcional)">
              <BuscadorSelect
                opciones={(core?.tiposRelacion || []).map((t) => ({ id: t.id, label: t.cualidad === "asimetrica" ? `${t.nombre} / ${t.nombreInverso}` : t.nombre }))}
                value={tipoRelacionId}
                onChange={setTipoRelacionId}
                vacioLabel="— Sin tipo (genérico) —"
                placeholder="Buscar tipo de relación..."
              />
            </Field>
          )}
          {showNuevaPersona && (
            <PersonaForm
              initial={{}}
              core={core}
              setCore={setCore}
              onClose={() => setShowNuevaPersona(false)}
              onSave={(data) => {
                setCore((prev) => ({ ...prev, personas: [data, ...prev.personas] }));
                setPersonaId(data.id);
                setPersonaModo("existente");
                setShowNuevaPersona(false);
              }}
            />
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2">
        {confirmarEliminar ? (
          <>
            <span className="flex-1 text-xs text-[var(--tema-peligro)] font-semibold">{textoUsoRegistro(vinculosDeEntidad(core, "Empresa", initial.id, true).length, "vínculo", "vínculos", "Se borran junto con la empresa.")}</span>
            <button type="button" onClick={() => setConfirmarEliminar(false)} className="shrink-0 border border-[#D8D2C4] rounded-sm px-3 py-2.5 text-xs font-bold text-[#6B6352]">Cancelar</button>
            <button type="button" onClick={onDelete} style={{ backgroundColor: "var(--tema-peligro)", color: "#FFFFFF" }} className="shrink-0 rounded-sm px-3 py-2.5 text-xs font-bold">Sí, eliminar</button>
          </>
        ) : (
          <>
            <PrimaryBtn onClick={submit} full>Guardar</PrimaryBtn>
            {onDelete && <button type="button" onClick={() => setConfirmarEliminar(true)} className="shrink-0 border border-[#E4DECF] rounded-sm px-3 text-[var(--tema-peligro)]"><Trash2 size={16} /></button>}
          </>
        )}
      </div>
    </Modal>
  );
}

// Quita tildes y pasa a minúscula, para comparar texto ingresado a mano sin que un acento cambie el resultado.
function normalizarTexto(s) {
  return (s || "").toString().trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Deja solo los dígitos de un CUIT (sin guiones ni espacios) — un CUIT válido tiene 11.
function soloDigitosCuit(s) {
  return (s || "").toString().replace(/\D/g, "");
}

// Carga masiva de empresas desde un Excel: se descarga una plantilla con los encabezados
// esperados, se completa una fila por empresa y se vuelve a subir. Denominación es la única
// columna obligatoria. Si el CUIT de la fila (11 dígitos, sin guiones) coincide con el de una
// empresa ya cargada, se corrigen sus datos con lo que traiga la fila (incluso vaciando campos
// que la fila trae en blanco). Si el CUIT no está o no alcanza para decidir, se cae al criterio
// de denominación — ahí, si ya existe, se omite sin tocar nada.
function ImportarEmpresasForm({ core, setCore, onClose }) {
  const [resultado, setResultado] = useState(null); // { agregadas, corregidas, existentes } | { error }
  const inputRef = useRef(null);

  const descargarPlantilla = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Denominación", "CUIT", "Dirección", "Ciudad"],
      ["Constructora Ejemplo S.A.", "30-12345678-9", "Av. Siempre Viva 123", "Córdoba"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Empresas");
    XLSX.writeFile(wb, "plantilla_empresas.xlsx");
  };

  const onFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (filas.length === 0) { setResultado({ error: "El archivo está vacío." }); return; }

        const encabezado = filas[0].map(normalizarTexto);
        const idxDenom = encabezado.findIndex((h) => h.includes("denominacion"));
        if (idxDenom === -1) { setResultado({ error: 'No encontré la columna "Denominación" — usá la plantilla sin cambiar los encabezados.' }); return; }
        const idxCuit = encabezado.findIndex((h) => h.includes("cuit"));
        const idxDireccion = encabezado.findIndex((h) => h.includes("direccion"));
        const idxCiudad = encabezado.findIndex((h) => h.includes("ciudad"));

        const empresaIdPorCuit = new Map();
        for (const emp of core.empresas) {
          const c = soloDigitosCuit(emp.cuit);
          if (c.length === 11) empresaIdPorCuit.set(c, emp.id);
        }
        const nombresExistentes = new Set(core.empresas.map((emp) => normalizarTexto(emp.denominacion)));

        const correcciones = new Map(); // empresaId -> campos corregidos
        const nuevas = [];
        let agregadas = 0;
        let corregidas = 0;
        let existentes = 0;

        for (const fila of filas.slice(1)) {
          const denominacion = (fila[idxDenom] ?? "").toString().trim();
          if (!denominacion) continue;
          const cuit = idxCuit !== -1 ? soloDigitosCuit(fila[idxCuit]) : "";
          const direccion = idxDireccion !== -1 ? (fila[idxDireccion] ?? "").toString().trim() : "";
          const ciudad = idxCiudad !== -1 ? (fila[idxCiudad] ?? "").toString().trim() : "";
          const cuitValido = cuit.length === 11;
          const idPorCuit = cuitValido ? empresaIdPorCuit.get(cuit) : null;

          if (idPorCuit) {
            correcciones.set(idPorCuit, { denominacion, cuit, direccion, ciudad });
            corregidas++;
            continue;
          }

          const clave = normalizarTexto(denominacion);
          if (nombresExistentes.has(clave)) { existentes++; continue; }
          nombresExistentes.add(clave);
          const nueva = { id: uid("E"), denominacion, cuit, direccion, ciudad };
          nuevas.push(nueva);
          agregadas++;
          if (cuitValido) empresaIdPorCuit.set(cuit, nueva.id);
        }

        if (nuevas.length > 0 || correcciones.size > 0) {
          setCore((prev) => ({
            ...prev,
            empresas: [...nuevas, ...prev.empresas.map((emp) => (correcciones.has(emp.id) ? { ...emp, ...correcciones.get(emp.id) } : emp))],
          }));
        }
        setResultado({ agregadas, corregidas, existentes });
      } catch {
        setResultado({ error: "No pude leer el archivo. Verificá que sea un .xlsx válido, basado en la plantilla." });
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <Modal title="Importar empresas desde Excel" onClose={onClose}>
      <p className="text-sm text-[#6B6352] mb-3">Descargá la plantilla, completá una fila por empresa — la Denominación es obligatoria — y subí acá el mismo archivo completado. Si el CUIT coincide con una empresa ya cargada, se corrigen sus datos; si no hay CUIT que decida, se compara por denominación.</p>
      <button type="button" onClick={descargarPlantilla} className="w-full flex items-center justify-center gap-2 border border-[#E4DECF] rounded-sm py-2.5 font-bold text-sm text-[#2A2118] mb-3">
        <Download size={16} /> Descargar plantilla
      </button>
      <button type="button" onClick={() => inputRef.current?.click()} className="w-full flex items-center justify-center gap-2 rounded-sm py-2.5 font-bold text-sm bg-[var(--tema-acento)] text-[#2A2118] mb-3">
        <FileSpreadsheet size={16} /> Elegir archivo completado
      </button>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} />

      <div className="border-t border-[#E4DECF] mt-1 mb-3 pt-3">
        <button
          type="button"
          onClick={() => exportarExcel(
            "empresas.xlsx",
            ["Denominación", "CUIT", "Dirección", "Ciudad"],
            core.empresas.map((e) => [e.denominacion, e.cuit || "", e.direccion || "", e.ciudad || ""])
          )}
          className="w-full flex items-center justify-center gap-2 border border-[#E4DECF] rounded-sm py-2.5 font-bold text-sm text-[#2A2118]"
        >
          <Download size={16} /> Exportar tus {core.empresas.length} empresas actuales
        </button>
      </div>

      {resultado?.error && (
        <p className="text-sm text-[var(--tema-peligro)] bg-[#FBEEE7] border border-[var(--tema-peligro)] rounded-sm p-2.5">{resultado.error}</p>
      )}
      {resultado && !resultado.error && (
        <p className="text-sm text-[#2A2118] bg-[#F7F5F0] border border-[#E4DECF] rounded-sm p-2.5">
          Se agregar{resultado.agregadas === 1 ? "ó" : "on"} <b>{resultado.agregadas}</b> empresa{resultado.agregadas === 1 ? "" : "s"} nueva{resultado.agregadas === 1 ? "" : "s"}.
          {resultado.corregidas > 0 && <> Se corrigi{resultado.corregidas === 1 ? "ó" : "eron"} <b>{resultado.corregidas}</b> por coincidir el CUIT.</>}
          {resultado.existentes > 0 && <> {resultado.existentes} ya exist{resultado.existentes === 1 ? "ía" : "ían"} (misma denominación) y se omit{resultado.existentes === 1 ? "ió" : "ieron"}.</>}
        </p>
      )}
    </Modal>
  );
}

function EmpresaDetail({ id, core, setCore, acciones, setAcciones, onClose, onOpen }) {
  const empresa = core.empresas.find((e) => e.id === id);
  const [showNuevoHiloEmpresa, setShowNuevoHiloEmpresa] = useState(false);
  const [verGrupo, setVerGrupo] = useState(false);
  const [verHilos, setVerHilos] = useState(false);
  const [verCerrados, setVerCerrados] = useState(false);
  const [verTareas, setVerTareas] = useState(false);
  const [showAgregarTareaEntidad, setShowAgregarTareaEntidad] = useState(false);
  if (!empresa) return <div><BackHeader onClose={onClose} /><p className="text-sm text-[#8A8272]">Esta empresa ya no existe.</p></div>;

  const cabecera = cabeceraDeEmpresa(id, core);
  const subsidiarias = subsidiariasDeEmpresa(id, core);
  const empresaIdsIncluidas = verGrupo && subsidiarias.length > 0 ? [id, ...subsidiarias.map((s) => s.id)] : [id];

  const hilosIdsDeEmpresa = new Set(empresaIdsIncluidas.flatMap((eid) => contrapartesDe(core, "Empresa", eid, "Hilo").map(({ c }) => c.id)));
  const hilosDeEmpresa = core.hilos.filter((h) => hilosIdsDeEmpresa.has(h.id)).map((h) => h.id);
  const hilosDeEstaEmpresa = core.hilos.filter((h) => hilosIdsDeEmpresa.has(h.id) && h.estado === "Activo" && h.tipo === "cliente");
  const hilosCerradosDeEmpresa = core.hilos.filter((h) => hilosIdsDeEmpresa.has(h.id) && h.estado === "Cerrado" && h.tipo === "cliente");
  const accCount = acciones.filter((a) => hilosDeEmpresa.includes(a.hiloId)).length;
  const tareasDeLaEmpresa = tareasDeEntidad(core, "Empresa", id);

  return (
    <div>
      <BackHeader onClose={onClose} />
      <div className="bg-white border border-[#E4DECF] rounded-sm p-4 mb-3">
        <div className="flex items-start gap-2.5">
          <div className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) }}>
            <Building2 size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-[#2A2118]">{empresa.denominacion}</h2>
            {empresa.cuit && <p className="text-xs text-[#8A8272] mt-0.5">CUIT {empresa.cuit}</p>}
            {(empresa.direccion || empresa.ciudad) && <p className="text-xs text-[#8A8272] mt-0.5">{[empresa.direccion, empresa.ciudad].filter(Boolean).join(" · ")}</p>}
            {cabecera && (
              <button onClick={() => onOpen("empresa", cabecera.id)} className="text-xs font-semibold text-[var(--tema-vinculo)] flex items-center gap-1 mt-1">
                <Layers size={12} /> Grupo {cabecera.denominacion}
              </button>
            )}
          </div>
        </div>
        <TagsSection core={core} setCore={setCore} entidadTipo="Empresa" entidadId={id} />
        <p className="text-xs text-[#8A8272] mt-3">
          {accCount} acción{accCount !== 1 ? "es" : ""} registrada{accCount !== 1 ? "s" : ""} {verGrupo && subsidiarias.length > 0 ? "en todo el grupo" : "en total"}
        </p>

        <VinculosDeFicha core={core} setCore={setCore} entidadTipo="Empresa" entidadId={id} onOpen={onOpen} />

        <div className="border-t border-dashed border-[#E4DECF] mt-3 pt-3">
          <button onClick={() => setVerHilos((v) => !v)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5">
            {verHilos ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verHilos ? "Ocultar hilos de seguimiento" : "Ver hilos de seguimiento"}
          </button>
          {verHilos && (
            <div className="mt-2.5">
              <div className="flex justify-end mb-1.5">
                <button onClick={() => setShowNuevoHiloEmpresa(true)} className="text-xs font-bold text-[var(--tema-vinculo)] flex items-center gap-1"><Plus size={12} /> Nuevo hilo</button>
              </div>
              {hilosDeEstaEmpresa.length === 0 ? (
                <p className="text-sm text-[#A69C88]">Sin hilos todavía. Podés arrancar uno acá aunque todavía no tengas el contacto.</p>
              ) : (
                <div className="space-y-2">
                  {hilosDeEstaEmpresa.map((h) => <HiloRow key={h.id} hilo={h} core={core} acciones={acciones} onOpen={onOpen} />)}
                </div>
              )}

              {hilosCerradosDeEmpresa.length > 0 && (
                <div className="mt-3">
                  <button onClick={() => setVerCerrados((v) => !v)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5">
                    {verCerrados ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verCerrados ? "Ocultar" : "Ver"} hilos cerrados ({hilosCerradosDeEmpresa.length})
                  </button>
                  {verCerrados && (
                    <div className="space-y-2 mt-2">
                      {hilosCerradosDeEmpresa.map((h) => <HiloRow key={h.id} hilo={h} core={core} acciones={acciones} onOpen={onOpen} />)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-dashed border-[#E4DECF] mt-3 pt-3">
          <button onClick={() => setVerTareas((v) => !v)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5">
            {verTareas ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verTareas ? "Ocultar tareas" : "Ver tareas"}
          </button>
          {verTareas && (
            <div className="mt-2.5">
              <div className="flex justify-end mb-1.5">
                <button onClick={() => setShowAgregarTareaEntidad(true)} className="text-xs font-bold text-[var(--tema-vinculo)] flex items-center gap-1"><Plus size={12} /> Agregar tarea</button>
              </div>
              {tareasDeLaEmpresa.length === 0 ? (
                <p className="text-sm text-[#A69C88]">Sin tareas todavía.</p>
              ) : (
                <div className="space-y-2">
                  {tareasDeLaEmpresa.map((t) => <HiloAgendaCard key={t.id} hilo={t} core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onOpen={onOpen} />)}
                </div>
              )}
            </div>
          )}
        </div>

        {subsidiarias.length > 0 && (
          <div className="border-t border-dashed border-[#E4DECF] mt-3 pt-3">
            <button onClick={() => setVerGrupo((v) => !v)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5">
              {verGrupo ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verGrupo ? "Ocultar empresas del grupo" : "Ver empresas del grupo"}
            </button>
            {verGrupo && (
              <div className="space-y-1 mt-2.5">
                {subsidiarias.map((s) => (
                  <button key={s.id} onClick={() => onOpen("empresa", s.id)} className="block w-full text-left text-sm font-semibold text-[#2A2118]">{s.denominacion}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showNuevoHiloEmpresa && (
        <Modal title="Nuevo hilo" onClose={() => setShowNuevoHiloEmpresa(false)}>
          <NuevoHiloForm
            core={core}
            setCore={setCore}
            acciones={acciones}
            setAcciones={setAcciones}
            empresaFijaId={id}
            onCreated={(hiloId) => { setShowNuevoHiloEmpresa(false); onOpen("hilo", hiloId); }}
            onCancelar={() => setShowNuevoHiloEmpresa(false)}
          />
        </Modal>
      )}

      {showAgregarTareaEntidad && (
        <Modal title="Agregar tarea" onClose={() => setShowAgregarTareaEntidad(false)}>
          <AgregarTareaAEntidadForm
            core={core}
            tareasExcluidas={tareasDeLaEmpresa.map((t) => t.id)}
            onVincular={(tareaId) => {
              setCore((prev) => ({ ...prev, vinculos: [...(prev.vinculos || []), vinc("Empresa", id, "Hilo", tareaId, null, false, todayISO())] }));
              setShowAgregarTareaEntidad(false);
            }}
            onCrear={(nuevoHilo) => {
              setCore((prev) => ({
                ...prev,
                hilos: [nuevoHilo, ...prev.hilos],
                vinculos: [...(prev.vinculos || []), vinc("Empresa", id, "Hilo", nuevoHilo.id, null, false, todayISO())],
              }));
              setShowAgregarTareaEntidad(false);
            }}
            onClose={() => setShowAgregarTareaEntidad(false)}
          />
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Obras
// ---------------------------------------------------------------------------
function ObrasView({ core, setCore, onOpen }) {
  const [modal, setModal] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const usoDeletingId = deletingId ? vinculosDeEntidad(core, "Obra", deletingId, true).length : 0;
  const [q, setQ] = useState("");
  const list = core.obras.filter((o) => o.nombre.toLowerCase().includes(q.toLowerCase()));
  const save = (data, vinculoEmpresa) => {
    setCore((prev) => {
      const exists = prev.obras.some((o) => o.id === data.id);
      const obras = exists ? prev.obras.map((o) => (o.id === data.id ? data : o)) : [data, ...prev.obras];
      const vinculos = vinculoEmpresa?.empresaId
        ? [...(prev.vinculos || []), vinc("Empresa", vinculoEmpresa.empresaId, "Obra", data.id, TR_DUENA, false, todayISO())]
        : prev.vinculos;
      return { ...prev, obras, vinculos };
    });
    setModal(null);
  };
  const del = (id) => setCore((prev) => ({
    ...prev,
    obras: prev.obras.filter((o) => o.id !== id),
    vinculos: (prev.vinculos || []).filter((v) => !(v.origenTipo === "Obra" && v.origenId === id) && !(v.destinoTipo === "Obra" && v.destinoId === id)),
    entidadEtiqueta: prev.entidadEtiqueta.filter((r) => !(r.entidadTipo === "Obra" && r.entidadId === id)),
  }));

  return (
    <div>
    <div className="sticky top-0 z-10 bg-[#F7F5F0]">
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A69C88]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar obra..." className={`${inputCls} pl-8`} />
        </div>
        <button onClick={() => setModal({})} className="shrink-0 bg-[var(--tema-acento)] text-[#2A2118] rounded-sm px-3 py-1 flex flex-col items-center justify-center gap-0.5 leading-none">
          <span className="text-[9px] font-bold">{core.obras.length}</span>
          <Plus size={16} />
        </button>
      </div>
    </div>
      {list.length === 0 ? (
        <EmptyState icon={<HardHat size={26} />} text="No hay obras cargadas todavía." />
      ) : (
        <div className="space-y-2">
          {list.map((o) => {
            const empresas = contrapartesDe(core, "Obra", o.id, "Empresa", true).map(({ c }) => core.empresas.find((e) => e.id === c.id)?.denominacion).filter(Boolean);
            return (
              <div key={o.id} className="w-full bg-white border border-[#E4DECF] rounded-sm p-3 flex items-center gap-3">
                <button onClick={() => onOpen("obra", o.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) }}><HardHat size={16} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#2A2118] truncate" title={o.nombre}>{o.nombre}</p>
                    {empresas.length ? (
                      <p className="text-xs text-[#8A8272] truncate" title={empresas.join(", ")}>{empresas.join(", ")}</p>
                    ) : (
                      <Chip tone="estadoPendiente">A definir</Chip>
                    )}
                  </div>
                </button>
                <IconBtn label="Editar obra" onClick={() => setModal(o)}><Pencil size={15} /></IconBtn>
                <IconBtn label="Eliminar obra" danger onClick={() => setDeletingId(o.id)}><Trash2 size={15} /></IconBtn>
                <ChevronRight size={16} className="text-[#C9C1AE] shrink-0" />
              </div>
            );
          })}
        </div>
      )}
      {modal !== null && <ObraForm initial={modal} core={core} setCore={setCore} onSave={save} onDelete={modal.id ? () => { del(modal.id); setModal(null); } : null} onClose={() => setModal(null)} />}
      {deletingId && (
        <Modal title="¿Eliminar esta obra?" onClose={() => setDeletingId(null)}>
          <p className="text-sm text-[#2A2118] mb-4">{textoUsoRegistro(usoDeletingId, "vínculo", "vínculos", "Se borran junto con la obra (empresas, personas, hilos).")}</p>
          <div className="flex gap-2">
            <button onClick={() => setDeletingId(null)} className="flex-1 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#6B6352]">Cancelar</button>
            <button onClick={() => { del(deletingId); setDeletingId(null); }} style={{ backgroundColor: "var(--tema-peligro)", color: "#FFFFFF" }} className="flex-1 rounded-sm py-2.5 font-bold text-sm">Sí, eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ObraForm({ initial, core, setCore, onSave, onDelete, onClose }) {
  const esNueva = !initial.id;
  const [nombre, setNombre] = useState(initial.nombre || "");
  const [descripcion, setDescripcion] = useState(initial.descripcion || "");
  const [metros2, setMetros2] = useState(initial.metros2 || "");
  const [direccion, setDireccion] = useState(initial.direccion || "");
  const [ciudad, setCiudad] = useState(initial.ciudad || "");
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  const [empresaModo, setEmpresaModo] = useState("existente"); // 'existente' | 'adefinir'
  const [empresaId, setEmpresaId] = useState(core?.empresas?.[0]?.id || "");
  const [showNuevaEmpresa, setShowNuevaEmpresa] = useState(false);

  const submit = () => {
    if (!nombre.trim()) return;
    const data = { id: initial.id || uid("O"), nombre: nombre.trim(), descripcion, metros2: Number(metros2) || 0, direccion, ciudad };
    let vinculoEmpresa = null;
    if (esNueva && empresaModo === "existente" && empresaId) vinculoEmpresa = { tipo: "existente", empresaId };
    onSave(data, vinculoEmpresa);
  };

  return (
    <Modal title={initial.id ? "Editar obra" : "Nueva obra"} onClose={onClose}>
      <Field label="Nombre *"><input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
      <Field label="Descripción"><input className={inputCls} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></Field>
      <Field label="Metros²"><input type="number" className={inputCls} value={metros2} onChange={(e) => setMetros2(e.target.value)} /></Field>
      <Field label="Dirección"><input className={inputCls} value={direccion} onChange={(e) => setDireccion(e.target.value)} /></Field>
      <Field label="Ciudad"><input className={inputCls} value={ciudad} onChange={(e) => setCiudad(e.target.value)} /></Field>

      {esNueva && (
        <div className="border-t border-[#E4DECF] my-3 pt-3">
          <p className="text-[11px] font-bold tracking-wide text-[var(--tema-vinculo)] mb-2">Empresa a la que pertenece</p>
          <div className="flex gap-1.5 mb-2">
            <button type="button" onClick={() => setEmpresaModo("existente")} style={{ backgroundColor: empresaModo === "existente" ? "#2A2F36" : "#E7E2D8", color: empresaModo === "existente" ? "#FFFFFF" : "#6B6352" }} className="flex-1 py-2 rounded-sm text-xs font-bold">Existente</button>
            <button type="button" onClick={() => setEmpresaModo("adefinir")} style={{ backgroundColor: empresaModo === "adefinir" ? "#2A2F36" : "#E7E2D8", color: empresaModo === "adefinir" ? "#FFFFFF" : "#6B6352" }} className="flex-1 py-2 rounded-sm text-xs font-bold">A definir</button>
          </div>
          {empresaModo === "existente" && (
            <>
              {(core?.empresas || []).length > 0 && (
                <Field label="Empresa">
                  <BuscadorSelect
                    opciones={core.empresas.map((e) => ({ id: e.id, label: e.denominacion }))}
                    value={empresaId}
                    onChange={setEmpresaId}
                    placeholder="Buscar empresa..."
                  />
                </Field>
              )}
              <button type="button" onClick={() => setShowNuevaEmpresa(true)} className="w-full border border-[#E4DECF] rounded-sm py-2 font-bold text-xs text-[#2A2118] mb-3">+ Crear empresa nueva</button>
            </>
          )}
          {empresaModo === "adefinir" && (
            <p className="text-sm text-[#A69C88] mb-3">La obra va a quedar marcada como "A definir" hasta que le asignes una empresa.</p>
          )}
          {showNuevaEmpresa && (
            <EmpresaForm
              initial={{}}
              core={core}
              setCore={setCore}
              onClose={() => setShowNuevaEmpresa(false)}
              onSave={(data, vinculoPersona) => {
                setCore((prev) => ({ ...prev, empresas: [data, ...prev.empresas] }));
                setEmpresaId(data.id);
                setEmpresaModo("existente");
                if (vinculoPersona?.personaId) {
                  setCore((prev) => ({
                    ...prev,
                    vinculos: [...(prev.vinculos || []), vinc("Persona", vinculoPersona.personaId, "Empresa", data.id, vinculoPersona.tipoRelacionId || null, true, todayISO())],
                  }));
                }
                setShowNuevaEmpresa(false);
              }}
            />
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2">
        {confirmarEliminar ? (
          <>
            <span className="flex-1 text-xs text-[var(--tema-peligro)] font-semibold">{textoUsoRegistro(vinculosDeEntidad(core, "Obra", initial.id, true).length, "vínculo", "vínculos", "Se borran junto con la obra.")}</span>
            <button type="button" onClick={() => setConfirmarEliminar(false)} className="shrink-0 border border-[#D8D2C4] rounded-sm px-3 py-2.5 text-xs font-bold text-[#6B6352]">Cancelar</button>
            <button type="button" onClick={onDelete} style={{ backgroundColor: "var(--tema-peligro)", color: "#FFFFFF" }} className="shrink-0 rounded-sm px-3 py-2.5 text-xs font-bold">Sí, eliminar</button>
          </>
        ) : (
          <>
            <PrimaryBtn onClick={submit} full>Guardar</PrimaryBtn>
            {onDelete && <button type="button" onClick={() => setConfirmarEliminar(true)} className="shrink-0 border border-[#E4DECF] rounded-sm px-3 text-[var(--tema-peligro)]"><Trash2 size={16} /></button>}
          </>
        )}
      </div>
    </Modal>
  );
}

function ObraDetail({ id, core, setCore, acciones, setAcciones, onClose, onOpen }) {
  const obra = core.obras.find((o) => o.id === id);
  const [showNuevoHiloObra, setShowNuevoHiloObra] = useState(false);
  const [verHilos, setVerHilos] = useState(false);
  const [verCerrados, setVerCerrados] = useState(false);
  const [verTareas, setVerTareas] = useState(false);
  const [showAgregarTareaEntidad, setShowAgregarTareaEntidad] = useState(false);
  if (!obra) return <div><BackHeader onClose={onClose} /><p className="text-sm text-[#8A8272]">Esta obra ya no existe.</p></div>;
  const hilosIdsDeEstaObra = new Set(contrapartesDe(core, "Obra", id, "Hilo").map(({ c }) => c.id));
  const hilosDeEstaObra = core.hilos.filter((h) => hilosIdsDeEstaObra.has(h.id) && h.estado === "Activo" && h.tipo === "cliente");
  const hilosCerradosDeObra = core.hilos.filter((h) => hilosIdsDeEstaObra.has(h.id) && h.estado === "Cerrado" && h.tipo === "cliente");
  const tareasDeLaObra = tareasDeEntidad(core, "Obra", id);
  return (
    <div>
      <BackHeader onClose={onClose} />
      <div className="bg-white border border-[#E4DECF] rounded-sm p-4 mb-3">
        <div className="flex items-start gap-2.5">
          <div className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) }}>
            <HardHat size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-[#2A2118]">{obra.nombre}</h2>
            {obra.descripcion && <p className="text-sm text-[#6B6352] mt-1">{obra.descripcion}</p>}
            <p className="text-xs text-[#8A8272] mt-1">{obra.metros2 ? `${obra.metros2} m² · ` : ""}{obra.ciudad}{obra.direccion ? ` · ${obra.direccion}` : ""}</p>
          </div>
        </div>
        <TagsSection core={core} setCore={setCore} entidadTipo="Obra" entidadId={id} />
        <VinculosDeFicha core={core} setCore={setCore} entidadTipo="Obra" entidadId={id} onOpen={onOpen} />

        <div className="border-t border-dashed border-[#E4DECF] mt-3 pt-3">
          <button onClick={() => setVerHilos((v) => !v)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5">
            {verHilos ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verHilos ? "Ocultar hilos de seguimiento" : "Ver hilos de seguimiento"}
          </button>
          {verHilos && (
            <div className="mt-2.5">
              <div className="flex justify-end mb-1.5">
                <button onClick={() => setShowNuevoHiloObra(true)} className="text-xs font-bold text-[var(--tema-vinculo)] flex items-center gap-1"><Plus size={12} /> Nuevo hilo</button>
              </div>
              {hilosDeEstaObra.length === 0 ? (
                <p className="text-sm text-[#A69C88]">Sin hilos todavía. Podés arrancar uno acá aunque todavía no sepas la empresa o el contacto.</p>
              ) : (
                <div className="space-y-2">
                  {hilosDeEstaObra.map((h) => <HiloRow key={h.id} hilo={h} core={core} acciones={acciones} onOpen={onOpen} />)}
                </div>
              )}

              {hilosCerradosDeObra.length > 0 && (
                <div className="mt-3">
                  <button onClick={() => setVerCerrados((v) => !v)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5">
                    {verCerrados ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verCerrados ? "Ocultar" : "Ver"} hilos cerrados ({hilosCerradosDeObra.length})
                  </button>
                  {verCerrados && (
                    <div className="space-y-2 mt-2">
                      {hilosCerradosDeObra.map((h) => <HiloRow key={h.id} hilo={h} core={core} acciones={acciones} onOpen={onOpen} />)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-dashed border-[#E4DECF] mt-3 pt-3">
          <button onClick={() => setVerTareas((v) => !v)} className="text-[10px] font-bold tracking-wide text-[var(--tema-vinculo)] flex items-center gap-0.5">
            {verTareas ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verTareas ? "Ocultar tareas" : "Ver tareas"}
          </button>
          {verTareas && (
            <div className="mt-2.5">
              <div className="flex justify-end mb-1.5">
                <button onClick={() => setShowAgregarTareaEntidad(true)} className="text-xs font-bold text-[var(--tema-vinculo)] flex items-center gap-1"><Plus size={12} /> Agregar tarea</button>
              </div>
              {tareasDeLaObra.length === 0 ? (
                <p className="text-sm text-[#A69C88]">Sin tareas todavía.</p>
              ) : (
                <div className="space-y-2">
                  {tareasDeLaObra.map((t) => <HiloAgendaCard key={t.id} hilo={t} core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onOpen={onOpen} />)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {showNuevoHiloObra && (
        <Modal title="Nuevo hilo" onClose={() => setShowNuevoHiloObra(false)}>
          <NuevoHiloForm
            core={core}
            setCore={setCore}
            acciones={acciones}
            setAcciones={setAcciones}
            obraFijaId={id}
            onCreated={(hiloId) => { setShowNuevoHiloObra(false); onOpen("hilo", hiloId); }}
            onCancelar={() => setShowNuevoHiloObra(false)}
          />
        </Modal>
      )}

      {showAgregarTareaEntidad && (
        <Modal title="Agregar tarea" onClose={() => setShowAgregarTareaEntidad(false)}>
          <AgregarTareaAEntidadForm
            core={core}
            tareasExcluidas={tareasDeLaObra.map((t) => t.id)}
            onVincular={(tareaId) => {
              setCore((prev) => ({ ...prev, vinculos: [...(prev.vinculos || []), vinc("Obra", id, "Hilo", tareaId, null, false, todayISO())] }));
              setShowAgregarTareaEntidad(false);
            }}
            onCrear={(nuevoHilo) => {
              setCore((prev) => ({
                ...prev,
                hilos: [nuevoHilo, ...prev.hilos],
                vinculos: [...(prev.vinculos || []), vinc("Obra", id, "Hilo", nuevoHilo.id, null, false, todayISO())],
              }));
              setShowAgregarTareaEntidad(false);
            }}
            onClose={() => setShowAgregarTareaEntidad(false)}
          />
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buscar
// ---------------------------------------------------------------------------
function BuscarView({ core, search, setSearch, onOpen }) {
  const q = search.trim().toLowerCase();
  const personas = q ? core.personas.filter((p) => p.nombre.toLowerCase().includes(q)) : [];
  const empresasDirectas = q ? core.empresas.filter((e) => e.denominacion.toLowerCase().includes(q)) : [];
  // Si el nombre coincide con una cabecera o con una subsidiaria, sumamos el resto del
  // grupo — si no, buscar "Constructora del Sur" no te muestra las empresas que agrupa.
  const empresasIds = new Set(empresasDirectas.map((e) => e.id));
  const empresas = [...empresasDirectas];
  for (const e of empresasDirectas) {
    const cab = cabeceraDeEmpresa(e.id, core);
    const relacionadas = cab
      ? [cab, ...subsidiariasDeEmpresa(cab.id, core)]
      : subsidiariasDeEmpresa(e.id, core);
    for (const r of relacionadas) {
      if (r && !empresasIds.has(r.id)) { empresasIds.add(r.id); empresas.push(r); }
    }
  }
  const obras = q ? core.obras.filter((o) => o.nombre.toLowerCase().includes(q)) : [];

  return (
    <div>
    <div className="sticky top-0 z-10 bg-[#F7F5F0]">
      <div className="relative mb-4">
        <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A69C88]" />
        <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar persona, empresa u obra..." className={`${inputCls} pl-8`} />
      </div>
    </div>

      {!q ? (
        <EmptyState icon={<Search size={26} />} text="Escribí un nombre para buscar en toda tu cartera." />
      ) : personas.length + empresas.length + obras.length === 0 ? (
        <EmptyState icon={<Search size={26} />} text="Sin resultados." />
      ) : (
        <div className="space-y-4">
          {personas.length > 0 && <ResultGroup title="Personas" items={personas.map((p) => ({ id: p.id, label: p.nombre, type: "persona", persona: p }))} onOpen={onOpen} />}
          {empresas.length > 0 && <ResultGroup title="Empresas" items={empresas.map((e) => {
            const nSub = subsidiariasDeEmpresa(e.id, core).length;
            const cab = cabeceraDeEmpresa(e.id, core);
            const sub = nSub > 0 ? `Cabecera · ${nSub} empresa${nSub !== 1 ? "s" : ""} del grupo` : cab ? `Grupo ${cab.denominacion}` : null;
            return { id: e.id, label: e.denominacion, type: "empresa", sub };
          })} onOpen={onOpen} />}
          {obras.length > 0 && <ResultGroup title="Obras" items={obras.map((o) => ({ id: o.id, label: o.nombre, type: "obra" }))} onOpen={onOpen} />}
        </div>
      )}
    </div>
  );
}

function ResultGroup({ title, items, onOpen }) {
  return (
    <div>
      <p className="text-[11px] font-bold tracking-wide text-[#6B6352] mb-1.5">{title}</p>
      <div className="space-y-1.5">
        {items.map((it) => (
          <div key={it.id} className="w-full bg-white border border-[#E4DECF] rounded-sm p-2.5 text-sm flex items-center gap-2">
            <button onClick={() => onOpen(it.type, it.id)} className="flex-1 min-w-0 text-left">
              <span className="font-semibold text-[#2A2118]">{it.label}</span>
              {it.sub && <span className="block text-xs text-[#8A8272]">{it.sub}</span>}
            </button>
            {it.persona && <WhatsAppLink persona={it.persona} size={15} />}
            <ChevronRight size={14} className="text-[#C9C1AE] shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Informes
// ---------------------------------------------------------------------------
function exportarExcel(nombreArchivo, headers, rows) {
  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Datos");
  XLSX.writeFile(wb, nombreArchivo);
}

function ultimoContactoPorPersona(persona, core, acciones) {
  const hilosIds = hilosDePersona(core, persona.id).map((h) => h.id);
  const realizadas = acciones.filter((a) => hilosIds.includes(a.hiloId) && a.estado === "Realizada" && a.fechaRealizada);
  if (realizadas.length === 0) return null;
  return realizadas.reduce((max, a) => (a.fechaRealizada > max ? a.fechaRealizada : max), realizadas[0].fechaRealizada);
}

function diasEntre(iso1, iso2) {
  return Math.round((parseISO(iso2) - parseISO(iso1)) / 86400000);
}

function InformesView({ core, acciones }) {
  const [subVista, setSubVista] = useState("tablero"); // 'tablero' | 'informes'
  return (
    <div>
    <div className="sticky top-0 z-10 bg-[#F7F5F0]">
      <div className="flex gap-1.5 mb-4">
        <button
          onClick={() => setSubVista("tablero")}
          style={subVista === "tablero" ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) } : { backgroundColor: core.tema.tarjeta, color: core.tema.mutedBase }}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold tracking-wide px-2.5 py-1.5 rounded-sm border border-[#E4DECF]"
        >
          <BarChart3 size={13} /> Tablero de control
        </button>
        <button
          onClick={() => setSubVista("informes")}
          style={subVista === "informes" ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) } : { backgroundColor: core.tema.tarjeta, color: core.tema.mutedBase }}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold tracking-wide px-2.5 py-1.5 rounded-sm border border-[#E4DECF]"
        >
          <FileSpreadsheet size={13} /> Informes
        </button>
      </div>
    </div>
      {subVista === "tablero" ? <TableroControl core={core} acciones={acciones} /> : <ReportesView core={core} acciones={acciones} />}
    </div>
  );
}

function IndicadorCard({ label, value, tone = "ink" }) {
  const tones = { ink: "var(--tema-ink)", urgenciaVencida: "var(--tema-urgenciaVencida)", estadoActivo: "var(--tema-estadoActivo)", estadoPendiente: "var(--tema-estadoPendiente)", estadoCerradoInactivo: "var(--tema-estadoCerradoInactivo)" };
  return (
    <div className="bg-white border border-[#E4DECF] rounded-sm p-3">
      <p className="text-[10px] font-bold tracking-wide text-[#8A8272] mb-1">{label}</p>
      <p className="text-2xl font-extrabold" style={{ color: tones[tone] }}>{value}</p>
    </div>
  );
}

function TableroControl({ core, acciones }) {
  const t = todayISO();
  const inicioMes = t.slice(0, 7) + "-01";
  const umbralSinContacto = 30;

  const hilosActivos = core.hilos.filter((h) => h.estado === "Activo").length;
  const hilosCerrados = core.hilos.filter((h) => h.estado === "Cerrado").length;
  const pendientes = acciones.filter((a) => a.estado === "Pendiente");
  const vencidas = pendientes.filter((a) => a.fechaProgramada < t).length;
  const realizadasEsteMes = acciones.filter((a) => a.estado === "Realizada" && a.fechaRealizada >= inicioMes).length;

  const sinContacto = core.personas.filter((p) => {
    if (hilosDePersona(core, p.id).length === 0) return false;
    const ultimo = ultimoContactoPorPersona(p, core, acciones);
    if (!ultimo) return true;
    return diasEntre(ultimo, t) > umbralSinContacto;
  }).length;

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <IndicadorCard label="Hilos activos" value={hilosActivos} tone="estadoActivo" />
        <IndicadorCard label="Hilos cerrados" value={hilosCerrados} />
        <IndicadorCard label="Acciones vencidas" value={vencidas} tone={vencidas > 0 ? "urgenciaVencida" : "ink"} />
        <IndicadorCard label="Pendientes totales" value={pendientes.length} tone="estadoPendiente" />
        <IndicadorCard label="Realizadas este mes" value={realizadasEsteMes} tone="estadoRealizada" />
        <IndicadorCard label={`Sin contacto +${umbralSinContacto}d`} value={sinContacto} tone={sinContacto > 0 ? "urgenciaVencida" : "ink"} />
      </div>
      <p className="text-xs text-[#A69C88]">Estos indicadores se recalculan solos con tus datos actuales. El detalle de cada uno (por ejemplo, quiénes son los "sin contacto") está en la solapa Informes.</p>
    </div>
  );
}

function ReportesView({ core, acciones }) {
  const [informe, setInforme] = useState("accionesPorMes");
  const INFORMES = [
    ["accionesPorMes", "Acciones por mes"],
    ["hilosPorEmpresa", "Hilos por empresa"],
    ["sinContacto", "Sin contacto"],
    ["obrasSinEmpresa", "Obras sin empresa"],
    ["empresasSinPersona", "Empresas sin persona"],
  ];
  return (
    <div>
      <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
        {INFORMES.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setInforme(key)}
            style={informe === key ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) } : { backgroundColor: core.tema.tarjeta, color: core.tema.mutedBase }}
            className="shrink-0 text-xs font-bold tracking-wide px-2.5 py-1.5 rounded-sm border border-[#E4DECF]"
          >
            {label}
          </button>
        ))}
      </div>
      {informe === "accionesPorMes" && <InformeAccionesPorMes core={core} acciones={acciones} />}
      {informe === "hilosPorEmpresa" && <InformeHilosPorEmpresa core={core} acciones={acciones} />}
      {informe === "sinContacto" && <InformeSinContacto core={core} acciones={acciones} />}
      {informe === "obrasSinEmpresa" && <InformeObrasSinEmpresa core={core} />}
      {informe === "empresasSinPersona" && <InformeEmpresasSinPersona core={core} />}
    </div>
  );
}

function InformeObrasSinEmpresa({ core }) {
  const rows = core.obras
    .filter((o) => contrapartesDe(core, "Obra", o.id, "Empresa", true).length === 0)
    .map((o) => [o.nombre, o.ciudad || "—"]);
  return (
    <ReportTable
      headers={["Obra", "Ciudad"]}
      rows={rows}
      emptyText="Todas las obras tienen una empresa asignada."
      onExportar={() => exportarExcel("obras_sin_empresa.xlsx", ["Obra", "Ciudad"], rows)}
    />
  );
}

function InformeEmpresasSinPersona({ core }) {
  const rows = core.empresas
    .filter((e) => personaIdsDeEmpresa(core, e.id).length === 0)
    .map((e) => [e.denominacion, e.ciudad || "—"]);
  return (
    <ReportTable
      headers={["Empresa", "Ciudad"]}
      rows={rows}
      emptyText="Todas las empresas tienen al menos una persona vinculada."
      onExportar={() => exportarExcel("empresas_sin_persona.xlsx", ["Empresa", "Ciudad"], rows)}
    />
  );
}

function ReportTable({ headers, rows, onExportar, emptyText }) {
  return (
    <div>
      <div className="flex justify-end mb-2">
        <button onClick={onExportar} disabled={rows.length === 0} style={rows.length === 0 ? { backgroundColor: "#E7E2D8", color: "#A69C88", cursor: "not-allowed" } : { backgroundColor: "var(--tema-exito)", color: "#FFFFFF" }} className="flex items-center gap-1.5 text-xs font-bold tracking-wide px-2.5 py-1.5 rounded-sm">
          <Download size={13} /> Exportar a Excel
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-[#A69C88] py-6 text-center">{emptyText || "Sin datos para mostrar."}</p>
      ) : (
        <div className="bg-white border border-[#E4DECF] rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#EFEBE0]">
                {headers.map((h) => <th key={h} className="text-left px-2.5 py-2 text-[10px] font-bold tracking-wide text-[#6B6352] whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={i % 2 === 1 ? "bg-[#F7F5F0]" : ""}>
                  {row.map((cell, j) => <td key={j} className="px-2.5 py-1.5 text-[#2A2118] border-t border-[#EFEBE0] whitespace-nowrap">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InformeAccionesPorMes({ core, acciones }) {
  const t = todayISO();
  const [desde, setDesde] = useState(addDaysISO(t, -180));
  const [hasta, setHasta] = useState(t);
  const [tipoAccionId, setTipoAccionId] = useState("");

  const filtradas = acciones.filter((a) => {
    if (a.estado !== "Realizada" || !a.fechaRealizada) return false;
    if (a.fechaRealizada < desde || a.fechaRealizada > hasta) return false;
    if (tipoAccionId && a.tipoAccionId !== tipoAccionId) return false;
    return true;
  });

  const porMes = {};
  for (const a of filtradas) {
    const mes = a.fechaRealizada.slice(0, 7);
    porMes[mes] = (porMes[mes] || 0) + 1;
  }
  const rows = Object.keys(porMes).sort().map((m) => [m, porMes[m]]);

  return (
    <div>
      <div className="bg-white border border-[#E4DECF] rounded-sm p-3 mb-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Desde"><input type="date" className={inputCls} value={desde} onChange={(e) => setDesde(e.target.value)} /></Field>
          <Field label="Hasta"><input type="date" className={inputCls} value={hasta} onChange={(e) => setHasta(e.target.value)} /></Field>
        </div>
        <Field label="Tipo de acción">
          <BuscadorSelect
            opciones={core.tiposAccion.map((tp) => ({ id: tp.id, label: tp.nombre }))}
            value={tipoAccionId}
            onChange={setTipoAccionId}
            vacioLabel="Todos"
            placeholder="Buscar tipo de acción..."
          />
        </Field>
      </div>
      <ReportTable
        headers={["Mes", "Cantidad"]}
        rows={rows}
        emptyText="No hay acciones realizadas en ese rango."
        onExportar={() => exportarExcel("acciones_por_mes.xlsx", ["Mes", "Cantidad"], rows)}
      />
    </div>
  );
}

function InformeHilosPorEmpresa({ core, acciones }) {
  const [estadoFiltro, setEstadoFiltro] = useState("Activo"); // 'Activo' | 'Cerrado' | 'Todos'
  const [agruparPorCabecera, setAgruparPorCabecera] = useState(false);

  const hilosFiltrados = core.hilos.filter((h) => estadoFiltro === "Todos" || h.estado === estadoFiltro);
  const porEmpresa = {};
  for (const h of hilosFiltrados) {
    const empresas = empresasDeHilo(h, core);
    const keys = empresas.length > 0
      ? empresas.map((e) => { const cab = agruparPorCabecera ? cabeceraDeEmpresa(e.id, core) : null; return cab ? cab.id : e.id; })
      : ["__sin_empresa__"];
    for (const key of keys) {
      if (!porEmpresa[key]) porEmpresa[key] = { hilos: 0, acciones: 0, empresaIds: new Set() };
      porEmpresa[key].hilos += 1;
      porEmpresa[key].acciones += acciones.filter((a) => a.hiloId === h.id).length;
      const empresaOrigen = empresas.find((e) => { const cab = agruparPorCabecera ? cabeceraDeEmpresa(e.id, core) : null; return (cab ? cab.id : e.id) === key; });
      if (empresaOrigen) porEmpresa[key].empresaIds.add(empresaOrigen.id);
    }
  }
  const rows = Object.entries(porEmpresa)
    .map(([empresaId, datos]) => {
      const emp = core.empresas.find((e) => e.id === empresaId);
      const nombre = emp ? emp.denominacion : "Sin empresa";
      const sufijo = agruparPorCabecera && datos.empresaIds.size > 1 ? ` (${datos.empresaIds.size} empresas del grupo)` : "";
      return [nombre + sufijo, datos.hilos, datos.acciones];
    })
    .sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div className="bg-white border border-[#E4DECF] rounded-sm p-3 mb-3">
        <Field label="Estado del hilo">
          <select className={inputCls} value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
            <option value="Activo">Activos</option>
            <option value="Cerrado">Cerrados</option>
            <option value="Todos">Todos</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-[#2A2118] mt-2">
          <input type="checkbox" checked={agruparPorCabecera} onChange={(e) => setAgruparPorCabecera(e.target.checked)} />
          Agrupar empresas por cabecera (holding)
        </label>
      </div>
      <ReportTable
        headers={["Empresa", "Hilos", "Acciones"]}
        rows={rows}
        emptyText="No hay hilos que coincidan con el filtro."
        onExportar={() => exportarExcel("hilos_por_empresa.xlsx", ["Empresa", "Hilos", "Acciones"], rows)}
      />
    </div>
  );
}

function InformeSinContacto({ core, acciones }) {
  const [umbral, setUmbral] = useState(30);
  const t = todayISO();

  const filas = core.personas
    .filter((p) => hilosDePersona(core, p.id).length > 0)
    .map((p) => {
      const ultimo = ultimoContactoPorPersona(p, core, acciones);
      const dias = ultimo ? diasEntre(ultimo, t) : Infinity;
      const empresas = empresaIdsDePersona(core, p.id).map((eid) => core.empresas.find((e) => e.id === eid)?.denominacion).filter(Boolean).join(", ");
      return { persona: p.nombre, empresas: empresas || "—", ultimo: ultimo ? fmtDate(ultimo) : "Nunca", dias };
    })
    .filter((r) => r.dias > umbral)
    .sort((a, b) => b.dias - a.dias)
    .map((r) => [r.persona, r.empresas, r.ultimo, r.dias === Infinity ? "—" : r.dias]);

  return (
    <div>
      <div className="bg-white border border-[#E4DECF] rounded-sm p-3 mb-3">
        <Field label="Días sin contacto (mínimo)">
          <input type="number" min={1} className={inputCls} value={umbral} onChange={(e) => setUmbral(Number(e.target.value) || 1)} />
        </Field>
      </div>
      <ReportTable
        headers={["Persona", "Empresa(s)", "Último contacto", "Días sin contacto"]}
        rows={filas}
        emptyText="No hay contactos que superen ese umbral — vas bien."
        onExportar={() => exportarExcel("sin_contacto.xlsx", ["Persona", "Empresa(s)", "Último contacto", "Días sin contacto"], filas)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
function TiposAccionView({ core, setCore, acciones }) {
  const [modal, setModal] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const usoDeletingId = deletingId ? acciones.filter((a) => a.tipoAccionId === deletingId).length : 0;
  const [q, setQ] = useState("");
  const list = core.tiposAccion.filter((t) => t.nombre.toLowerCase().includes(q.toLowerCase()));
  const saveTipo = (data) => {
    setCore((prev) => {
      const exists = prev.tiposAccion.some((t) => t.id === data.id);
      return { ...prev, tiposAccion: exists ? prev.tiposAccion.map((t) => (t.id === data.id ? data : t)) : [...prev.tiposAccion, data] };
    });
    setModal(null);
  };
  const delTipo = (id) => setCore((prev) => ({ ...prev, tiposAccion: prev.tiposAccion.filter((t) => t.id !== id) }));

  return (
    <div>
    <div className="sticky top-0 z-10 bg-[#F7F5F0]">
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A69C88]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tipo de acción..." className={`${inputCls} pl-8`} />
        </div>
        <button onClick={() => setModal({})} className="shrink-0 bg-[var(--tema-acento)] text-[#2A2118] rounded-sm px-3 py-1 flex flex-col items-center justify-center gap-0.5 leading-none">
          <span className="text-[9px] font-bold">{core.tiposAccion.length}</span>
          <Plus size={16} />
        </button>
      </div>
    </div>
      <div className="space-y-1.5">
        {list.map((t) => (
          <div key={t.id} className="bg-white border border-[#E4DECF] rounded-sm p-2.5 flex items-center justify-between text-sm">
            <span className="font-semibold text-[#2A2118]">{t.nombre}</span>
            <div className="flex gap-1">
              <IconBtn label="Editar" onClick={() => setModal(t)}><Pencil size={14} /></IconBtn>
              <IconBtn label="Eliminar" danger onClick={() => setDeletingId(t.id)}><Trash2 size={14} /></IconBtn>
            </div>
          </div>
        ))}
      </div>
      {modal !== null && (
        <Modal title={modal.id ? "Editar tipo de acción" : "Nuevo tipo de acción"} onClose={() => setModal(null)}>
          <TipoAccionForm data={modal} onSave={saveTipo} />
        </Modal>
      )}
      {deletingId && (
        <Modal title="¿Eliminar este tipo de acción?" onClose={() => setDeletingId(null)}>
          <p className="text-sm text-[#2A2118] mb-4">{textoUsoRegistro(usoDeletingId, "acción", "acciones", "Van a quedar sin tipo asignado.")}</p>
          <div className="flex gap-2">
            <button onClick={() => setDeletingId(null)} className="flex-1 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#6B6352]">Cancelar</button>
            <button onClick={() => { delTipo(deletingId); setDeletingId(null); }} style={{ backgroundColor: "var(--tema-peligro)", color: "#FFFFFF" }} className="flex-1 rounded-sm py-2.5 font-bold text-sm">Sí, eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EtiquetasView({ core, setCore }) {
  const [modal, setModal] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const usoDeletingId = deletingId ? (core.entidadEtiqueta || []).filter((r) => r.etiquetaId === deletingId).length : 0;
  const saveEtiqueta = (data) => {
    setCore((prev) => {
      const exists = prev.etiquetas.some((t) => t.id === data.id);
      return { ...prev, etiquetas: exists ? prev.etiquetas.map((t) => (t.id === data.id ? data : t)) : [...prev.etiquetas, data] };
    });
    setModal(null);
  };
  const [q, setQ] = useState("");
  const list = core.etiquetas.filter((t) => t.etiqueta.toLowerCase().includes(q.toLowerCase()));
  const delEtiqueta = (id) => setCore((prev) => ({
    ...prev,
    etiquetas: prev.etiquetas.filter((t) => t.id !== id),
    entidadEtiqueta: prev.entidadEtiqueta.filter((r) => r.etiquetaId !== id),
  }));

  return (
    <div>
    <div className="sticky top-0 z-10 bg-[#F7F5F0]">
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A69C88]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar etiqueta..." className={`${inputCls} pl-8`} />
        </div>
        <button onClick={() => setModal({})} className="shrink-0 bg-[var(--tema-acento)] text-[#2A2118] rounded-sm px-3 py-1 flex flex-col items-center justify-center gap-0.5 leading-none">
          <span className="text-[9px] font-bold">{core.etiquetas.length}</span>
          <Plus size={16} />
        </button>
      </div>
    </div>
      <div className="space-y-1.5">
        {list.map((t) => (
          <div key={t.id} className="bg-white border border-[#E4DECF] rounded-sm p-2.5 flex items-center justify-between text-sm">
            <div>
              <span className="font-semibold text-[#2A2118]">{t.etiqueta}</span>
              <span className="text-[#8A8272]"> · {(core.categorias || []).find((c) => c.id === t.categoriaId)?.nombre || "sin categoría"} · aplica a {t.aplicaA}</span>
            </div>
            <div className="flex gap-1">
              <IconBtn label="Editar" onClick={() => setModal(t)}><Pencil size={14} /></IconBtn>
              <IconBtn label="Eliminar" danger onClick={() => setDeletingId(t.id)}><Trash2 size={14} /></IconBtn>
            </div>
          </div>
        ))}
      </div>
      {modal !== null && (
        <Modal title={modal.id ? "Editar etiqueta" : "Nueva etiqueta"} onClose={() => setModal(null)}>
          <EtiquetaForm data={modal} core={core} setCore={setCore} onSave={saveEtiqueta} />
        </Modal>
      )}
      {deletingId && (
        <Modal title="¿Eliminar esta etiqueta?" onClose={() => setDeletingId(null)}>
          <p className="text-sm text-[#2A2118] mb-4">{textoUsoRegistro(usoDeletingId, "registro", "registros", "Se les va a quitar esta etiqueta.")}</p>
          <div className="flex gap-2">
            <button onClick={() => setDeletingId(null)} className="flex-1 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#6B6352]">Cancelar</button>
            <button onClick={() => { delEtiqueta(deletingId); setDeletingId(null); }} style={{ backgroundColor: "var(--tema-peligro)", color: "#FFFFFF" }} className="flex-1 rounded-sm py-2.5 font-bold text-sm">Sí, eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CategoriasView({ core, setCore }) {
  const [modal, setModal] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const usoDeletingId = deletingId ? (core.etiquetas || []).filter((e) => e.categoriaId === deletingId).length : 0;
  const saveCategoria = (data) => {
    setCore((prev) => {
      const exists = (prev.categorias || []).some((c) => c.id === data.id);
      return { ...prev, categorias: exists ? prev.categorias.map((c) => (c.id === data.id ? data : c)) : [...(prev.categorias || []), data] };
    });
    setModal(null);
  };
  const [q, setQ] = useState("");
  const list = (core.categorias || []).filter((c) => c.nombre.toLowerCase().includes(q.toLowerCase()));
  const delCategoria = (id) => setCore((prev) => ({ ...prev, categorias: (prev.categorias || []).filter((c) => c.id !== id) }));

  return (
    <div>
    <div className="sticky top-0 z-10 bg-[#F7F5F0]">
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A69C88]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar categoría..." className={`${inputCls} pl-8`} />
        </div>
        <button onClick={() => setModal({})} className="shrink-0 bg-[var(--tema-acento)] text-[#2A2118] rounded-sm px-3 py-1 flex flex-col items-center justify-center gap-0.5 leading-none">
          <span className="text-[9px] font-bold">{(core.categorias || []).length}</span>
          <Plus size={16} />
        </button>
      </div>
    </div>
      <div className="space-y-1.5">
        {list.map((c) => (
          <div key={c.id} className="bg-white border border-[#E4DECF] rounded-sm p-2.5 flex items-center justify-between text-sm">
            <span className="font-semibold text-[#2A2118]">{c.nombre}</span>
            <div className="flex gap-1">
              <IconBtn label="Editar" onClick={() => setModal(c)}><Pencil size={14} /></IconBtn>
              <IconBtn label="Eliminar" danger onClick={() => setDeletingId(c.id)}><Trash2 size={14} /></IconBtn>
            </div>
          </div>
        ))}
      </div>
      {modal !== null && (
        <Modal title={modal.id ? "Editar categoría" : "Nueva categoría"} onClose={() => setModal(null)}>
          <CategoriaForm data={modal} onSave={saveCategoria} />
        </Modal>
      )}
      {deletingId && (
        <Modal title="¿Eliminar esta categoría?" onClose={() => setDeletingId(null)}>
          <p className="text-sm text-[#2A2118] mb-4">{textoUsoRegistro(usoDeletingId, "etiqueta", "etiquetas", "Van a quedar sin categoría.")}</p>
          <div className="flex gap-2">
            <button onClick={() => setDeletingId(null)} className="flex-1 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#6B6352]">Cancelar</button>
            <button onClick={() => { delCategoria(deletingId); setDeletingId(null); }} style={{ backgroundColor: "var(--tema-peligro)", color: "#FFFFFF" }} className="flex-1 rounded-sm py-2.5 font-bold text-sm">Sí, eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Catálogo de tipos de relación para la Red de relaciones (ver TipoRelacionForm para el
// significado de cualidad simétrica/asimétrica y de "implica jerarquía").
function TiposRelacionView({ core, setCore }) {
  const [modal, setModal] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const usoDeletingId = deletingId ? (core.vinculos || []).filter((v) => v.tipoRelacionId === deletingId).length : 0;
  const saveTipo = (data) => {
    setCore((prev) => {
      const exists = (prev.tiposRelacion || []).some((t) => t.id === data.id);
      const tiposRelacion = exists ? prev.tiposRelacion.map((t) => (t.id === data.id ? data : t)) : [...(prev.tiposRelacion || []), data];
      return { ...prev, tiposRelacion };
    });
    setModal(null);
  };
  const [q, setQ] = useState("");
  const qq = q.trim().toLowerCase();
  const list = (core.tiposRelacion || []).filter((t) => t.nombre.toLowerCase().includes(qq) || (t.nombreInverso || "").toLowerCase().includes(qq));
  const delTipo = (id) => setCore((prev) => ({
    ...prev,
    tiposRelacion: (prev.tiposRelacion || []).filter((t) => t.id !== id),
    vinculos: (prev.vinculos || []).filter((v) => v.tipoRelacionId !== id),
  }));

  return (
    <div>
    <div className="sticky top-0 z-10 bg-[#F7F5F0]">
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A69C88]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tipo de relación..." className={`${inputCls} pl-8`} />
        </div>
        <button onClick={() => setModal({})} className="shrink-0 bg-[var(--tema-acento)] text-[#2A2118] rounded-sm px-3 py-1 flex flex-col items-center justify-center gap-0.5 leading-none">
          <span className="text-[9px] font-bold">{(core.tiposRelacion || []).length}</span>
          <Plus size={16} />
        </button>
      </div>
    </div>
      {list.length === 0 ? (
        <EmptyState icon={<GitBranch size={22} />} text="Todavía no hay tipos de relación cargados." />
      ) : (
        <div className="space-y-1.5">
          {list.map((t) => (
            <div key={t.id} className="bg-white border border-[#E4DECF] rounded-sm p-2.5 flex items-center justify-between text-sm">
              <div className="min-w-0">
                <span className="font-semibold text-[#2A2118]">{t.nombre}{t.cualidad === "asimetrica" ? ` / ${t.nombreInverso}` : ""}</span>
                <p className="text-xs text-[#8A8272]">{t.cualidad === "asimetrica" ? "Asimétrica" : "Simétrica"}{t.cualidad === "asimetrica" && t.implicaJerarquia ? " · implica jerarquía" : ""}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <IconBtn label="Editar" onClick={() => setModal(t)}><Pencil size={14} /></IconBtn>
                <IconBtn label="Eliminar" danger onClick={() => setDeletingId(t.id)}><Trash2 size={14} /></IconBtn>
              </div>
            </div>
          ))}
        </div>
      )}
      {modal !== null && (
        <Modal title={modal.id ? "Editar tipo de relación" : "Nuevo tipo de relación"} onClose={() => setModal(null)}>
          <TipoRelacionForm data={modal} onSave={saveTipo} />
        </Modal>
      )}
      {deletingId && (
        <Modal title="¿Eliminar este tipo de relación?" onClose={() => setDeletingId(null)}>
          <p className="text-sm text-[#2A2118] mb-4">{textoUsoRegistro(usoDeletingId, "vínculo", "vínculos", "También se van a borrar esos vínculos.")}</p>
          <div className="flex gap-2">
            <button onClick={() => setDeletingId(null)} className="flex-1 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#6B6352]">Cancelar</button>
            <button onClick={() => { delTipo(deletingId); setDeletingId(null); }} style={{ backgroundColor: "var(--tema-peligro)", color: "#FFFFFF" }} className="flex-1 rounded-sm py-2.5 font-bold text-sm">Sí, eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ConfigView({ core, setCore, acciones, setAcciones }) {
  const [section, setSection] = useState("parametros");
  const [confirmVaciar, setConfirmVaciar] = useState(false);
  const [confirmBorrarDatosPrueba, setConfirmBorrarDatosPrueba] = useState(false);
  const [avisoDatosPrueba, setAvisoDatosPrueba] = useState(false);

  // Crea (si no existen ya, por nombre) 3 personas/empresas/obras de prueba vinculadas
  // entre sí de a pares (Persona Prueba N - Empresa Prueba N - Obra Prueba N).
  const generarDatosPrueba = () => {
    setAvisoDatosPrueba(true);
    setTimeout(() => setAvisoDatosPrueba(false), 2500);
    setCore((prev) => {
      let personas = prev.personas;
      let empresas = prev.empresas;
      let obras = prev.obras;
      let vinculos = [...(prev.vinculos || [])];

      for (let i = 1; i <= 3; i++) {
        const nombrePersona = `Persona Prueba ${i}`;
        let persona = personas.find((p) => p.nombre === nombrePersona);
        if (!persona) { persona = { id: uid("P"), nombre: nombrePersona, whatsapp: "", direccion: "", ciudad: "", notas: "" }; personas = [persona, ...personas]; }

        const nombreEmpresa = `Empresa Prueba ${i}`;
        let empresa = empresas.find((e) => e.denominacion === nombreEmpresa);
        if (!empresa) { empresa = { id: uid("E"), denominacion: nombreEmpresa, cuit: "", direccion: "", ciudad: "" }; empresas = [empresa, ...empresas]; }

        const nombreObra = `Obra Prueba ${i}`;
        let obra = obras.find((o) => o.nombre === nombreObra);
        if (!obra) { obra = { id: uid("O"), nombre: nombreObra, descripcion: "", metros2: null, direccion: "", ciudad: "" }; obras = [obra, ...obras]; }

        const hayVinc = (oT, oI, dT, dI) => vinculos.some((v) => v.origenTipo === oT && v.origenId === oI && v.destinoTipo === dT && v.destinoId === dI);
        if (!hayVinc("Persona", persona.id, "Empresa", empresa.id)) vinculos.push(vinc("Persona", persona.id, "Empresa", empresa.id, null, true, todayISO()));
        if (!hayVinc("Empresa", empresa.id, "Obra", obra.id)) vinculos.push(vinc("Empresa", empresa.id, "Obra", obra.id, TR_DUENA, false, todayISO()));
      }
      return { ...prev, personas, empresas, obras, vinculos };
    });
  };

  // Borra todo lo de prueba: personas, empresas y obras cuyo nombre empieza con
  // "Persona/Empresa/Obra Prueba", los hilos (seguimientos y tareas) y acciones
  // vinculados a ellas, y todo vínculo/etiqueta donde intervengan — sin tocar
  // ninguna otra entidad real, aunque esté relacionada con una de prueba.
  const esNombreDePrueba = (nombre, prefijo) => (nombre || "").trim().toLowerCase().startsWith(prefijo);
  const borrarDatosPrueba = () => {
    const personaPruebaIds = new Set(core.personas.filter((p) => esNombreDePrueba(p.nombre, "persona prueba")).map((p) => p.id));
    const empresaPruebaIds = new Set(core.empresas.filter((e) => esNombreDePrueba(e.denominacion, "empresa prueba")).map((e) => e.id));
    const obraPruebaIds = new Set(core.obras.filter((o) => esNombreDePrueba(o.nombre, "obra prueba")).map((o) => o.id));
    const esEntidadPrueba = (tipo, id) =>
      (tipo === "Persona" && personaPruebaIds.has(id)) ||
      (tipo === "Empresa" && empresaPruebaIds.has(id)) ||
      (tipo === "Obra" && obraPruebaIds.has(id));
    const hiloTocaPruebaDirecto = (h) =>
      participantesActivos(h, core).some((pa) => personaPruebaIds.has(pa.personaId)) ||
      empresasDeHilo(h, core).some((e) => empresaPruebaIds.has(e.id)) ||
      obrasDeHilo(h, core).some((o) => obraPruebaIds.has(o.id));
    const hilosDirectosPruebaIds = new Set(core.hilos.filter(hiloTocaPruebaDirecto).map((h) => h.id));
    // Una tarea no tiene el vínculo propio: cuelga de su hilo padre vía hiloRelacionadoId,
    // así que si ese padre toca una entidad de prueba, la tarea también se considera de prueba.
    const hilosABorrarIds = new Set(
      core.hilos.filter((h) => hilosDirectosPruebaIds.has(h.id) || (h.hiloRelacionadoId && hilosDirectosPruebaIds.has(h.hiloRelacionadoId))).map((h) => h.id)
    );

    setCore((prev) => ({
      ...prev,
      personas: prev.personas.filter((p) => !personaPruebaIds.has(p.id)),
      empresas: prev.empresas.filter((e) => !empresaPruebaIds.has(e.id)),
      obras: prev.obras.filter((o) => !obraPruebaIds.has(o.id)),
      hilos: prev.hilos.filter((h) => !hilosABorrarIds.has(h.id)),
      vinculos: (prev.vinculos || []).filter((v) =>
        !(v.origenTipo === "Hilo" && hilosABorrarIds.has(v.origenId)) &&
        !(v.destinoTipo === "Hilo" && hilosABorrarIds.has(v.destinoId)) &&
        !esEntidadPrueba(v.origenTipo, v.origenId) &&
        !esEntidadPrueba(v.destinoTipo, v.destinoId)
      ),
      entidadEtiqueta: (prev.entidadEtiqueta || []).filter((r) => !esEntidadPrueba(r.entidadTipo, r.entidadId)),
    }));
    setAcciones((prev) => prev.filter((a) => !hilosABorrarIds.has(a.hiloId)));
    setConfirmBorrarDatosPrueba(false);
  };

  // Borra personas, empresas, obras, hilos (seguimientos y tareas), vínculos y acciones,
  // sin tocar etiquetas, categorías, tipos de relación, tipos de acción, parámetros ni apariencia.
  const vaciarDatos = () => {
    setCore((prev) => ({
      ...prev,
      personas: [],
      empresas: [],
      obras: [],
      hilos: [],
      vinculos: [],
      entidadEtiqueta: [],
    }));
    setAcciones([]);
    setConfirmVaciar(false);
  };

  const setUmbral = (v) => setCore((prev) => ({ ...prev, parametros: { ...prev.parametros, umbralDiaLleno: Number(v) || 1 } }));
  const setDiasUrgente = (v) => setCore((prev) => ({ ...prev, parametros: { ...prev.parametros, diasUrgente: Math.max(0, Number(v) || 0) } }));
  const setDiasProximos = (v) => setCore((prev) => ({ ...prev, parametros: { ...prev.parametros, diasProximos: Math.max(1, Number(v) || 1) } }));
  const setGoogleContactsLabel = (v) => setCore((prev) => ({ ...prev, parametros: { ...prev.parametros, googleContactsLabel: v } }));
  const setTituloApp = (v) => setCore((prev) => ({ ...prev, parametros: { ...prev.parametros, tituloApp: v } }));

  const setTemaColor = (clave, valor) => setCore((prev) => ({ ...prev, tema: { ...prev.tema, [clave]: valor } }));
  const restablecerTema = () => setCore((prev) => ({ ...prev, tema: { ...TEMA_DEFAULT } }));

  const PALETAS = [
    {
      id: "panel-obra-oscuro", nombre: "Panel de obra (oscuro)",
      tema: { ...TEMA_DEFAULT, botonActivo: "#5FB8C4", botonInactivo: "#232C37", tarjeta: "#1E262F", linea: "#303B47", fondo: "#171D24", ink: "#E7ECF2", mutedBase: "#8E9AA8" },
    },
    {
      id: "panel-obra-claro", nombre: "Panel de obra (claro)",
      tema: { ...TEMA_DEFAULT, botonActivo: "#1F7A86", botonInactivo: "#F3F5F6", tarjeta: "#FFFFFF", linea: "#D8DEE4", fondo: "#FFFFFF", ink: "#1B2430", mutedBase: "#5B6674" },
    },
    {
      id: "ficha-viva", nombre: "Ficha viva",
      tema: { ...TEMA_DEFAULT, botonActivo: "#3B5B8C", botonInactivo: "#EFE6D4", tarjeta: "#FBF8F1", linea: "#D9CBAF", fondo: "#F4EEE1", ink: "#2B2420", mutedBase: "#736555" },
    },
  ];
  const aplicarPaleta = (tema) => setCore((prev) => ({ ...prev, tema }));

  const toggleDiaHabil = (num) => setCore((prev) => {
    const actuales = prev.parametros.diasHabiles || [1, 2, 3, 4, 5];
    const set = new Set(actuales);
    if (set.has(num)) set.delete(num); else set.add(num);
    return { ...prev, parametros: { ...prev.parametros, diasHabiles: Array.from(set).sort() } };
  });

  const [nuevaFechaNoHabil, setNuevaFechaNoHabil] = useState("");
  const agregarFechaNoHabil = () => {
    if (!nuevaFechaNoHabil) return;
    setCore((prev) => {
      const lista = prev.parametros.fechasNoHabiles || [];
      if (lista.includes(nuevaFechaNoHabil)) return prev;
      return { ...prev, parametros: { ...prev.parametros, fechasNoHabiles: [...lista, nuevaFechaNoHabil].sort() } };
    });
    setNuevaFechaNoHabil("");
  };
  const quitarFechaNoHabil = (iso) => setCore((prev) => ({ ...prev, parametros: { ...prev.parametros, fechasNoHabiles: (prev.parametros.fechasNoHabiles || []).filter((f) => f !== iso) } }));

  const SECTIONS = [
    ["parametros", "Parámetros"],
    ["apariencia", "Apariencia"],
  ];

  return (
    <div>
      <div className="flex gap-1.5 mb-3">
        {SECTIONS.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setSection(k)}
            style={section === k ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) } : { backgroundColor: core.tema.tarjeta, color: core.tema.mutedBase }}
            className="text-xs font-bold tracking-wide px-2.5 py-1.5 rounded-sm border border-[#E4DECF]"
          >{l}</button>
        ))}
      </div>

      {section === "parametros" && (
        <div className="space-y-3">
          <div className="bg-white border border-[#E4DECF] rounded-sm p-4">
            <Field label="Título de la app">
              <input className={inputCls} value={core.parametros.tituloApp ?? "Seguimiento comercial"} onChange={(e) => setTituloApp(e.target.value)} placeholder="Seguimiento comercial" />
            </Field>
          </div>

          <div className="bg-white border border-[#E4DECF] rounded-sm p-4">
            <Field label="Umbral de día lleno (cant. de acciones pendientes en un mismo día a partir de la cual se busca otra fecha)">
              <input type="number" min={1} className={inputCls} value={core.parametros.umbralDiaLleno} onChange={(e) => setUmbral(e.target.value)} />
            </Field>
            <p className="text-xs text-[#8A8272]">Se usa cuando programás una acción futura por período (ej: "en 2 meses"): la app evita días no hábiles y días con {core.parametros.umbralDiaLleno} o más acciones ya agendadas.</p>
          </div>

          <div className="bg-white border border-[#E4DECF] rounded-sm p-4">
            <Field label='Pestaña "N días" del Kanban — cuántos días hacia adelante incluye (contando hoy)'>
              <input type="number" min={1} className={inputCls} value={core.parametros.diasProximos ?? 7} onChange={(e) => setDiasProximos(e.target.value)} />
            </Field>
          </div>

          <div className="bg-white border border-[#E4DECF] rounded-sm p-4">
            <Field label="Etiqueta de Google Contacts a sincronizar">
              <input className={inputCls} value={core.parametros.googleContactsLabel ?? "CRM"} onChange={(e) => setGoogleContactsLabel(e.target.value)} placeholder="Ej: CRM" />
            </Field>
            <p className="text-xs text-[#8A8272]">Solo se importan los contactos de Google que tengan esta etiqueta puesta (creála desde la app de Contactos de Google). Así separás tus contactos personales de los que querés ver acá.</p>
          </div>

          <div className="bg-white border border-[#E4DECF] rounded-sm p-4">
            <p className="text-[11px] font-bold tracking-wide text-[#6B6352] mb-2">Colores de urgencia en Seguimientos</p>
            <div className="flex items-center gap-2 mb-2 text-sm">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: "var(--tema-urgenciaVencida)" }} /> Vencida
            </div>
            <div className="flex items-center gap-2 mb-2 text-sm">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: "var(--tema-urgenciaProxima)" }} /> Próxima a vencer
            </div>
            <div className="flex items-center gap-2 mb-3 text-sm">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: "var(--tema-urgenciaLejana)" }} /> Con tiempo
            </div>
            <Field label="¿Cuántos días de acá en adelante se consideran 'próxima a vencer' (amarillo)?">
              <input type="number" min={0} className={inputCls} value={core.parametros.diasUrgente ?? 3} onChange={(e) => setDiasUrgente(e.target.value)} />
            </Field>
            <p className="text-xs text-[#8A8272]">Hoy y hasta {core.parametros.diasUrgente ?? 3} día{(core.parametros.diasUrgente ?? 3) === 1 ? "" : "s"} adelante: amarillo. Más lejos: verde. Ya pasada la fecha: rojo.</p>
          </div>

          <div className="bg-white border border-[#E4DECF] rounded-sm p-4">
            <p className="text-[11px] font-bold tracking-wide text-[#6B6352] mb-2">Días hábiles</p>
            <div className="grid grid-cols-7 gap-1">
              {[["Lu", 1], ["Ma", 2], ["Mi", 3], ["Ju", 4], ["Vi", 5], ["Sá", 6], ["Do", 0]].map(([label, num]) => {
                const activo = (core.parametros.diasHabiles || []).includes(num);
                return (
                  <button
                    key={num}
                    onClick={() => toggleDiaHabil(num)}
                    style={activo ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) } : { backgroundColor: core.tema.botonInactivo, color: core.tema.ink }}
                    className="py-2 rounded-sm text-xs font-bold"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-[#8A8272] mt-2">Los días marcados en gris no se usan para programar acciones automáticamente (además de las fechas puntuales de abajo).</p>
          </div>

          <div className="bg-white border border-[#E4DECF] rounded-sm p-4">
            <p className="text-[11px] font-bold tracking-wide text-[#6B6352] mb-2">Fechas puntuales no hábiles</p>
            <div className="flex gap-2 mb-3">
              <input type="date" className={inputCls} value={nuevaFechaNoHabil} onChange={(e) => setNuevaFechaNoHabil(e.target.value)} />
              <button onClick={agregarFechaNoHabil} className="shrink-0 bg-[var(--tema-acento)] text-[#2A2118] rounded-sm px-3 font-bold"><Plus size={16} /></button>
            </div>
            {(core.parametros.fechasNoHabiles || []).length === 0 ? (
              <p className="text-sm text-[#A69C88]">No agregaste fechas puntuales todavía (ej: feriados, días que no atendés).</p>
            ) : (
              <div className="space-y-1.5">
                {(core.parametros.fechasNoHabiles || []).map((f) => (
                  <div key={f} className="flex items-center justify-between bg-[#F7F5F0] border border-[#E4DECF] rounded-sm px-2.5 py-1.5 text-sm">
                    <span className="text-[#2A2118] font-mono">{fmtDate(f)}</span>
                    <IconBtn label="Quitar fecha" danger onClick={() => quitarFechaNoHabil(f)}><Trash2 size={14} /></IconBtn>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {section === "apariencia" && (
        <div className="space-y-3">
          <div className="bg-white border border-[#E4DECF] rounded-sm p-4">
            <p className="text-[11px] font-bold tracking-wide text-[#6B6352] mb-3">Paletas</p>
            <div className="space-y-2">
              {PALETAS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => aplicarPaleta(p.tema)}
                  className="w-full flex items-center gap-2.5 border border-[#E4DECF] rounded-sm p-2.5 text-left"
                  style={{ backgroundColor: p.tema.fondo }}
                >
                  <span className="flex gap-1 shrink-0">
                    <span className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: p.tema.botonActivo }} />
                    <span className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: p.tema.tarjeta }} />
                  </span>
                  <span className="text-sm font-bold" style={{ color: p.tema.ink }}>{p.nombre}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-[#A69C88] mt-2">Elegí una para aplicar todos sus colores de una — después podés seguir ajustándolos a mano abajo.</p>
          </div>

          <div className="bg-white border border-[#E4DECF] rounded-sm p-4">
            <p className="text-[11px] font-bold tracking-wide text-[#6B6352] mb-2">Botones</p>
            <ColorField label="Botón activo (seleccionado)" value={core.tema.botonActivo} onChange={(v) => setTemaColor("botonActivo", v)} />
            <ColorField label="Botón inactivo" value={core.tema.botonInactivo} onChange={(v) => setTemaColor("botonInactivo", v)} />
            <div className="flex gap-2 mt-3">
              <button
                style={{ backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) }}
                className="flex-1 py-2 rounded-sm text-xs font-bold tracking-wide"
              >
                Vista previa activo
              </button>
              <button
                style={{ backgroundColor: core.tema.botonInactivo, color: core.tema.ink }}
                className="flex-1 py-2 rounded-sm text-xs font-bold tracking-wide"
              >
                Vista previa inactivo
              </button>
            </div>
          </div>

          <div className="bg-white border border-[#E4DECF] rounded-sm p-4">
            <p className="text-[11px] font-bold tracking-wide text-[#6B6352] mb-2">Fondo y tarjetas</p>
            <ColorField label="Fondo de la página" value={core.tema.fondo} onChange={(v) => setTemaColor("fondo", v)} />
            <ColorField label="Fondo de las tarjetas" value={core.tema.tarjeta} onChange={(v) => setTemaColor("tarjeta", v)} />
          </div>

          <div className="bg-white border border-[#E4DECF] rounded-sm p-4">
            <p className="text-[11px] font-bold tracking-wide text-[#6B6352] mb-2">Texto</p>
            <ColorField label="Texto principal" value={core.tema.ink} onChange={(v) => setTemaColor("ink", v)} />
            <ColorField label="Texto secundario" value={core.tema.mutedBase} onChange={(v) => setTemaColor("mutedBase", v)} />
          </div>

          <div className="bg-white border border-[#E4DECF] rounded-sm p-4">
            <p className="text-[11px] font-bold tracking-wide text-[#6B6352] mb-2">Líneas</p>
            <ColorField label="Color de bordes y separadores" value={core.tema.linea} onChange={(v) => setTemaColor("linea", v)} />
          </div>

          {TEMA_GRUPOS.map((grupo) => (
            <div key={grupo.titulo} className="bg-white border border-[#E4DECF] rounded-sm p-4">
              <p className="text-[11px] font-bold tracking-wide text-[#6B6352] mb-1">{grupo.titulo}</p>
              <p className="text-xs text-[#A69C88] mb-2">{grupo.ayuda}</p>
              {grupo.subgrupos.map((subgrupo, i) => (
                <div key={i} className={i > 0 ? "border-t border-[#E4DECF] mt-2 pt-2" : ""}>
                  {subgrupo.map((rol) => (
                    <ColorField key={rol.clave} label={rol.label} value={core.tema[rol.clave]} onChange={(v) => setTemaColor(rol.clave, v)} />
                  ))}
                </div>
              ))}
            </div>
          ))}

          <button onClick={restablecerTema} className="text-xs font-bold tracking-wide text-[var(--tema-vinculo)]">Restablecer colores originales</button>

          <p className="text-xs text-[#A69C88]">Esto cambia todos los colores de la app — fondo, texto, botones, tarjetas, líneas divisorias, vínculos, y los colores de urgencia, prioridad y estado de Seguimientos.</p>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-[#E4DECF]">
        <p className="text-[11px] font-bold tracking-wide text-[#6B6352] mb-2">Datos de prueba</p>
        <button onClick={generarDatosPrueba} className="text-xs font-bold tracking-wide text-[var(--tema-exito)] flex items-center gap-1.5">
          <Plus size={13} /> Generar datos de prueba
        </button>
        {avisoDatosPrueba && <p className="text-xs font-bold text-[var(--tema-exito)] mt-1">Datos de prueba generados ✓</p>}
        <p className="text-xs text-[#A69C88] mt-1 mb-3">Crea 3 personas, 3 empresas y 3 obras de prueba (vinculadas entre sí de a pares). Si ya existen, no las duplica.</p>

        <button onClick={() => setConfirmBorrarDatosPrueba(true)} className="text-xs font-bold tracking-wide text-[var(--tema-peligro)] flex items-center gap-1.5">
          <Trash2 size={13} /> Borrar datos de prueba
        </button>
        <p className="text-xs text-[#A69C88] mt-1">Borra las personas, empresas y obras cuyo nombre empieza con "Persona/Empresa/Obra Prueba", junto con sus seguimientos, tareas, acciones, vínculos y etiquetas asignadas. No toca ninguna otra entidad, aunque esté relacionada con una de prueba.</p>
      </div>

      <div className="mt-6 pt-4 border-t border-[#E4DECF]">
        <button onClick={() => setConfirmVaciar(true)} className="text-xs font-bold tracking-wide text-[var(--tema-peligro)] flex items-center gap-1.5">
          <AlertTriangle size={13} /> Vaciar todos los datos cargados
        </button>
        <p className="text-xs text-[#A69C88] mt-1">Borra personas, empresas, obras, seguimientos, tareas, vínculos y acciones. No toca etiquetas, categorías, tipos de relación, tipos de acción ni la apariencia.</p>
      </div>

      <p className="text-center text-[10px] font-mono text-[#C9C1AE] mt-6">Versión {APP_VERSION}</p>

      {confirmBorrarDatosPrueba && (
        <Modal title="¿Borrar datos de prueba?" onClose={() => setConfirmBorrarDatosPrueba(false)}>
          <p className="text-sm text-[#2A2118] mb-4">Esto borra las personas, empresas y obras "Persona/Empresa/Obra Prueba", junto con sus seguimientos, tareas, acciones, vínculos y etiquetas asignadas. No se puede deshacer.</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmBorrarDatosPrueba(false)} className="flex-1 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#6B6352]">Cancelar</button>
            <button onClick={borrarDatosPrueba} style={{ backgroundColor: "var(--tema-peligro)", color: "#FFFFFF" }} className="flex-1 rounded-sm py-2.5 font-bold text-sm">Sí, borrar</button>
          </div>
        </Modal>
      )}

      {confirmVaciar && (
        <Modal title="¿Vaciar todos los datos cargados?" onClose={() => setConfirmVaciar(false)}>
          <p className="text-sm text-[#2A2118] mb-4">Esto borra permanentemente todas las personas, empresas, obras, seguimientos, tareas, vínculos y acciones. Las etiquetas, categorías, tipos de relación, tipos de acción y la apariencia quedan como están. No se puede deshacer.</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmVaciar(false)} className="flex-1 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#6B6352]">Cancelar</button>
            <button onClick={vaciarDatos} style={{ backgroundColor: "var(--tema-peligro)", color: "#FFFFFF" }} className="flex-1 rounded-sm py-2.5 font-bold text-sm">Sí, vaciar todo</button>
          </div>
        </Modal>
      )}

    </div>
  );
}

function TipoAccionForm({ data, onSave }) {
  const [nombre, setNombre] = useState(data.nombre || "");
  return (
    <div>
      <Field label="Nombre"><input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
      <PrimaryBtn full onClick={() => nombre.trim() && onSave({ id: data.id || uid("TA"), nombre: nombre.trim() })}>Guardar</PrimaryBtn>
    </div>
  );
}

function EtiquetaForm({ data, core, setCore, onSave }) {
  const [etiqueta, setEtiqueta] = useState(data.etiqueta || "");
  const [categoriaId, setCategoriaId] = useState(data.categoriaId || (core.categorias || [])[0]?.id || "");
  const [aplicaA, setAplicaA] = useState(data.aplicaA || "Empresa");
  return (
    <div>
      <Field label="Etiqueta"><input className={inputCls} value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Ej: Zona Norte" /></Field>
      <SelectConCrear
        label="Categoría"
        opciones={core.categorias || []}
        value={categoriaId}
        onChange={setCategoriaId}
        placeholderCrear="Ej: Zona, Rubro, Prioridad"
        onCrear={(nombre) => {
          const nuevo = { id: uid("CAT"), nombre };
          setCore((prev) => ({ ...prev, categorias: [...(prev.categorias || []), nuevo] }));
          return nuevo;
        }}
      />
      <Field label="Aplica a">
        <select className={inputCls} value={aplicaA} onChange={(e) => setAplicaA(e.target.value)}>
          <option>Persona</option><option>Empresa</option><option>Obra</option>
        </select>
      </Field>
      <PrimaryBtn full onClick={() => etiqueta.trim() && onSave({ id: data.id || uid("ET"), etiqueta: etiqueta.trim(), categoriaId, aplicaA })}>Guardar</PrimaryBtn>
    </div>
  );
}

function CategoriaForm({ data, onSave }) {
  const [nombre, setNombre] = useState(data.nombre || "");
  return (
    <div>
      <Field label="Nombre"><input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Zona, Rubro, Prioridad" /></Field>
      <PrimaryBtn full onClick={() => nombre.trim() && onSave({ id: data.id || uid("CAT"), nombre: nombre.trim() })}>Guardar</PrimaryBtn>
    </div>
  );
}

function TipoRelacionForm({ data, onSave }) {
  const [cualidad, setCualidad] = useState(data.cualidad || "simetrica");
  const [nombre, setNombre] = useState(data.nombre || "");
  const [nombreInverso, setNombreInverso] = useState(data.nombreInverso || "");
  const [implicaJerarquia, setImplicaJerarquia] = useState(!!data.implicaJerarquia);

  const guardar = () => {
    if (!nombre.trim()) return;
    if (cualidad === "asimetrica" && !nombreInverso.trim()) return;
    onSave({
      id: data.id || uid("TR"),
      cualidad,
      nombre: nombre.trim(),
      nombreInverso: cualidad === "asimetrica" ? nombreInverso.trim() : null,
      implicaJerarquia: cualidad === "asimetrica" ? implicaJerarquia : false,
    });
  };

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <button type="button" onClick={() => setCualidad("simetrica")} style={{ backgroundColor: cualidad === "simetrica" ? "#2A2F36" : "#E7E2D8", color: cualidad === "simetrica" ? "#FFFFFF" : "#6B6352" }} className="flex-1 py-2 rounded-sm text-sm font-bold">Simétrica</button>
        <button type="button" onClick={() => setCualidad("asimetrica")} style={{ backgroundColor: cualidad === "asimetrica" ? "#2A2F36" : "#E7E2D8", color: cualidad === "asimetrica" ? "#FFFFFF" : "#6B6352" }} className="flex-1 py-2 rounded-sm text-sm font-bold">Asimétrica</button>
      </div>
      <p className="text-xs text-[#8A8272] mb-3">
        {cualidad === "simetrica"
          ? "Un solo nombre vale para los dos lados de la relación (ej: \"Amigo de\")."
          : "Cada lado tiene su propio nombre; al cargar un vínculo con este tipo, el otro lado se completa solo (ej: \"Cliente de\" / \"Proveedor de\")."}
      </p>
      <Field label={cualidad === "simetrica" ? "Nombre de la relación" : "Nombre (origen → destino)"}>
        <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={cualidad === "simetrica" ? "Ej: Amigo de" : "Ej: Cliente de"} />
      </Field>
      {cualidad === "asimetrica" && (
        <>
          <Field label="Nombre inverso (destino → origen)">
            <input className={inputCls} value={nombreInverso} onChange={(e) => setNombreInverso(e.target.value)} placeholder="Ej: Proveedor de" />
          </Field>
          <Field label="¿Implica jerarquía?">
            <div className="flex gap-2">
              <button type="button" onClick={() => setImplicaJerarquia(false)} style={{ backgroundColor: !implicaJerarquia ? "#2A2F36" : "#E7E2D8", color: !implicaJerarquia ? "#FFFFFF" : "#6B6352" }} className="flex-1 py-2 rounded-sm text-sm font-bold">No</button>
              <button type="button" onClick={() => setImplicaJerarquia(true)} style={{ backgroundColor: implicaJerarquia ? "#2A2F36" : "#E7E2D8", color: implicaJerarquia ? "#FFFFFF" : "#6B6352" }} className="flex-1 py-2 rounded-sm text-sm font-bold">Sí</button>
            </div>
          </Field>
        </>
      )}
      <PrimaryBtn full onClick={guardar}>Guardar</PrimaryBtn>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Red de relaciones (Telaraña)
// ---------------------------------------------------------------------------
// Formulario de carga de vínculos, reutilizado tal cual tanto en la pantalla principal
// "Relaciones" (armado masivo, con varios orígenes y destinos a la vez) como en el botón
// "+ Vincular" de cada ficha de Persona/Empresa/Obra — ahí se abre con "entidadFija" puesta,
// que queda fija del lado del origen y no se puede quitar.
function RelacionForm({ core, setCore, entidadFija, onCreado }) {
  const clave = (e) => `${e.tipo}:${e.id}`;
  // Cuando hay una entidad fija (viene del botón "+ Vincular" de una ficha), por defecto va
  // del lado "Desde". "ladoFijo" permite invertirla al lado "Hacia" — necesario para
  // relaciones asimétricas donde el nombre que corresponde a la entidad fija es el inverso
  // (ej: una obra necesita expresar "es obra de" en vez de "construye").
  const [ladoFijo, setLadoFijo] = useState("origen"); // "origen" | "destino"
  const [origenes, setOrigenes] = useState(entidadFija ? [entidadFija] : []);
  const [origenSel, setOrigenSel] = useState("");
  const [tipoRelacionId, setTipoRelacionId] = useState("");
  const [showNuevoTipo, setShowNuevoTipo] = useState(false);
  const [destinos, setDestinos] = useState([]);
  const [destinoSel, setDestinoSel] = useState("");
  const [fecha, setFecha] = useState(todayISO());
  const [nota, setNota] = useState("");
  const [feedback, setFeedback] = useState("");

  const todas = todasLasEntidadesRelacionables(core);
  const yaOrigen = new Set(origenes.map(clave));
  const yaDestino = new Set(destinos.map(clave));
  const opcionesOrigen = todas.filter((e) => !yaOrigen.has(clave(e))).map((e) => ({ id: clave(e), label: `${e.label} (${e.tipo})` }));
  const opcionesDestino = todas.filter((e) => !yaDestino.has(clave(e))).map((e) => ({ id: clave(e), label: `${e.label} (${e.tipo})` }));

  const esFija = (e) => entidadFija && e.tipo === entidadFija.tipo && e.id === entidadFija.id;

  const invertirLadoFijo = () => {
    if (!entidadFija) return;
    if (ladoFijo === "origen") {
      setOrigenes((a) => a.filter((x) => !esFija(x)));
      setDestinos((a) => (a.some(esFija) ? a : [...a, entidadFija]));
      setLadoFijo("destino");
    } else {
      setDestinos((a) => a.filter((x) => !esFija(x)));
      setOrigenes((a) => (a.some(esFija) ? a : [...a, entidadFija]));
      setLadoFijo("origen");
    }
  };

  const agregarOrigen = () => {
    if (!origenSel) return;
    const [tipo, id] = origenSel.split(":");
    setOrigenes((a) => [...a, { tipo, id }]);
    setOrigenSel("");
  };
  const quitarOrigen = (e) => { if (!esFija(e)) setOrigenes((a) => a.filter((x) => clave(x) !== clave(e))); };
  const agregarDestino = () => {
    if (!destinoSel) return;
    const [tipo, id] = destinoSel.split(":");
    setDestinos((a) => [...a, { tipo, id }]);
    setDestinoSel("");
  };
  const quitarDestino = (e) => { if (!esFija(e)) setDestinos((a) => a.filter((x) => clave(x) !== clave(e))); };

  // Producto cartesiano orígenes × destinos, sin auto-relaciones (una entidad consigo misma).
  const pares = origenes.flatMap((o) => destinos.filter((d) => clave(d) !== clave(o)).map((d) => [o, d]));

  const crearVinculos = () => {
    if (pares.length === 0 || !fecha) return;
    const nuevos = pares.map(([o, d]) => ({ ...vinc(o.tipo, o.id, d.tipo, d.id, tipoRelacionId || null, false, fecha), nota: nota.trim() }));
    setCore((prev) => ({ ...prev, vinculos: [...(prev.vinculos || []), ...nuevos] }));
    setFeedback(nuevos.length === 1 ? "Se creó 1 vínculo." : `Se crearon ${nuevos.length} vínculos.`);
    setTimeout(() => setFeedback(""), 2500);
    setDestinos([]);
    setNota("");
    onCreado?.();
  };

  return (
    <div>
      {entidadFija && (
        <button
          type="button"
          onClick={invertirLadoFijo}
          className="w-full mb-3 flex items-center justify-center gap-1.5 text-xs font-bold text-[var(--tema-vinculo)] border border-[#E4DECF] rounded-sm py-2"
        >
          <Repeat size={13} /> "{entidadLabel(entidadFija.tipo, entidadFija.id, core)}" va del lado {ladoFijo === "origen" ? '"Desde"' : '"Hacia"'} — invertir
        </button>
      )}
      <Field label="Desde">
        {origenes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {origenes.map((e) => (
              <span key={clave(e)} className="flex items-center gap-1 bg-[#D9F0DE] text-[#1B4D2E] text-xs font-bold px-2 py-1 rounded-sm">
                {entidadLabel(e.tipo, e.id, core)} <span className="opacity-60 font-normal">({e.tipo})</span>
                {!esFija(e) && <button type="button" onClick={() => quitarOrigen(e)} aria-label="Quitar"><X size={12} /></button>}
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <div className="flex-1"><BuscadorSelect opciones={opcionesOrigen} value={origenSel} onChange={setOrigenSel} placeholder="Buscar persona, empresa u obra..." /></div>
          <button type="button" disabled={!origenSel} onClick={agregarOrigen} className="shrink-0 border border-[#E4DECF] rounded-sm px-3 text-sm font-bold text-[#2A2118] disabled:text-[#C9C1AE] disabled:cursor-not-allowed">+ Agregar</button>
        </div>
      </Field>

      <Field label="Tipo de relación (opcional)">
        <BuscadorSelect
          opciones={(core.tiposRelacion || []).map((t) => ({ id: t.id, label: t.cualidad === "asimetrica" ? `${t.nombre} / ${t.nombreInverso}` : t.nombre }))}
          value={tipoRelacionId}
          onChange={setTipoRelacionId}
          vacioLabel="— Sin tipo (genérico) —"
          placeholder="Buscar tipo de relación..."
        />
      </Field>
      <button type="button" onClick={() => setShowNuevoTipo(true)} className="w-full border border-[#E4DECF] rounded-sm py-2 font-bold text-xs text-[#2A2118] mb-3">+ Crear tipo de relación nuevo</button>

      <Field label="Hacia">
        {destinos.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {destinos.map((e) => (
              <span key={clave(e)} className="flex items-center gap-1 bg-[#D9F0DE] text-[#1B4D2E] text-xs font-bold px-2 py-1 rounded-sm">
                {entidadLabel(e.tipo, e.id, core)} <span className="opacity-60 font-normal">({e.tipo})</span>
                {!esFija(e) && <button type="button" onClick={() => quitarDestino(e)} aria-label="Quitar"><X size={12} /></button>}
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <div className="flex-1"><BuscadorSelect opciones={opcionesDestino} value={destinoSel} onChange={setDestinoSel} placeholder="Buscar persona, empresa u obra..." /></div>
          <button type="button" disabled={!destinoSel} onClick={agregarDestino} className="shrink-0 border border-[#E4DECF] rounded-sm px-3 text-sm font-bold text-[#2A2118] disabled:text-[#C9C1AE] disabled:cursor-not-allowed">+ Agregar</button>
        </div>
      </Field>

      <Field label="Fecha"><input type="date" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field>
      <Field label="Nota (opcional)"><textarea className={inputCls} rows={2} value={nota} onChange={(e) => setNota(e.target.value)} /></Field>

      {feedback && <p className="text-xs font-bold text-[#1B4D2E] mb-2">{feedback}</p>}
      <PrimaryBtn full disabled={pares.length === 0} onClick={crearVinculos}>
        {pares.length > 1 ? `Crear ${pares.length} vínculos` : "Crear vínculo"}
      </PrimaryBtn>

      {showNuevoTipo && (
        <Modal title="Nuevo tipo de relación" onClose={() => setShowNuevoTipo(false)}>
          <TipoRelacionForm
            data={{}}
            onSave={(data) => {
              setCore((prev) => ({ ...prev, tiposRelacion: [...(prev.tiposRelacion || []), data] }));
              setTipoRelacionId(data.id);
              setShowNuevoTipo(false);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

// Abre el mismo RelacionForm de arriba en un modal, con una entidad ya puesta como origen —
// es la pantalla que llaman los botones "+ Vincular" de las fichas de Persona/Empresa/Obra.
function VincularRelacionForm({ core, setCore, entidadFija, onClose }) {
  return (
    <Modal title="Vincular" onClose={onClose}>
      <RelacionForm core={core} setCore={setCore} entidadFija={entidadFija} />
      <button type="button" onClick={onClose} className="w-full mt-1 bg-[var(--tema-acento)] text-[#2A2118] rounded-sm py-2.5 font-bold text-sm">Listo</button>
    </Modal>
  );
}

function RelacionesView({ core, setCore, onOpen }) {
  const [q, setQ] = useState("");
  const [showNuevo, setShowNuevo] = useState(false);
  const [editVinculo, setEditVinculo] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  // Esta pantalla es la Red de relaciones entre Personas/Empresas/Obras: los vínculos de un
  // hilo (pertenencia genérica) se gestionan y se ven desde la propia ficha del hilo, no acá.
  const vinculos = [...(core.vinculos || [])]
    .filter((v) => v.origenTipo !== "Hilo" && v.destinoTipo !== "Hilo")
    .sort((a, b) => (b.desde || "").localeCompare(a.desde || ""));
  const del = (id) => setCore((prev) => ({ ...prev, vinculos: (prev.vinculos || []).filter((v) => v.id !== id) }));

  const qq = q.trim().toLowerCase();
  const visibles = qq
    ? vinculos.filter((v) => {
        const origenLabel = entidadLabel(v.origenTipo, v.origenId, core) || "";
        const destinoLabel = entidadLabel(v.destinoTipo, v.destinoId, core) || "";
        return origenLabel.toLowerCase().includes(qq) || destinoLabel.toLowerCase().includes(qq);
      })
    : vinculos;

  return (
    <div>
      <div className="sticky top-0 z-10 bg-[#F7F5F0]">
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A69C88]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre..." className={`${inputCls} pl-8`} />
          </div>
          <button onClick={() => setShowNuevo(true)} className="shrink-0 bg-[var(--tema-acento)] text-[#2A2118] rounded-sm px-3 py-1 flex flex-col items-center justify-center gap-0.5 leading-none">
            <span className="text-[9px] font-bold">{vinculos.length}</span>
            <Plus size={16} />
          </button>
        </div>
      </div>

      {visibles.length === 0 ? (
        <EmptyState icon={<GitBranch size={22} />} text="Todavía no hay vínculos cargados." />
      ) : (
        <div className="space-y-1.5">
          {visibles.map((v) => {
            const tr = (core.tiposRelacion || []).find((t) => t.id === v.tipoRelacionId);
            const origenLabel = entidadLabel(v.origenTipo, v.origenId, core);
            const destinoLabel = entidadLabel(v.destinoTipo, v.destinoId, core);
            if (!origenLabel || !destinoLabel) return null;
            return (
              <div key={v.id} className="bg-white border border-[#E4DECF] rounded-sm p-2.5 flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#2A2118]">
                    <button onClick={() => onOpen(v.origenTipo.toLowerCase(), v.origenId)} title={origenLabel}>{origenLabel}</button>
                    {v.principal && <Star size={11} className="inline text-[var(--tema-acento)] ml-1" />}
                  </p>
                  <p className="text-[#8A8272]">
                    {nombreRelacionLado(tr, true) || "vinculado a"}{" "}
                    <button onClick={() => onOpen(v.destinoTipo.toLowerCase(), v.destinoId)} className="font-semibold text-[#2A2118]" title={destinoLabel}>{destinoLabel}</button>
                  </p>
                  <p className="text-xs text-[#8A8272]">{v.desde}{v.nota ? ` · ${v.nota}` : ""}</p>
                </div>
                <IconBtn label="Editar vínculo" onClick={() => setEditVinculo(v)}><Pencil size={14} /></IconBtn>
                <IconBtn label="Eliminar vínculo" danger onClick={() => setDeletingId(v.id)}><Trash2 size={14} /></IconBtn>
              </div>
            );
          })}
        </div>
      )}

      {showNuevo && (
        <Modal title="Nuevo vínculo" onClose={() => setShowNuevo(false)}>
          <RelacionForm core={core} setCore={setCore} />
          <button type="button" onClick={() => setShowNuevo(false)} className="w-full mt-1 bg-[var(--tema-acento)] text-[#2A2118] rounded-sm py-2.5 font-bold text-sm">Listo</button>
        </Modal>
      )}
      {editVinculo && <EditVinculoForm core={core} setCore={setCore} vinculo={editVinculo} onClose={() => setEditVinculo(null)} />}
      {deletingId && (
        <ConfirmDeleteModal title="¿Eliminar este vínculo?" texto="Se quita la relación entre las dos entidades. No se puede deshacer." onCancel={() => setDeletingId(null)} onConfirm={() => { del(deletingId); setDeletingId(null); }} />
      )}
    </div>
  );
}
