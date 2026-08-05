'use client';

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import * as XLSX from "xlsx";
import {
  Plus, X, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Search, Settings, Users, Building2,
  HardHat, CalendarClock, Trash2, Pencil, Check, AlertTriangle,
  Tag, Star, Clock3, ListChecks, Repeat, ArrowLeft, ArrowDownAZ, ArrowUpAZ, GitBranch, Archive,
  BarChart3, FileSpreadsheet, Download, Trello, GripVertical, LogOut, Menu, Tags, FolderKanban, Briefcase, Layers,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

// ---------------------------------------------------------------------------
// Storage (Supabase, una fila por usuario en la tabla crm_data)
// ---------------------------------------------------------------------------
const APP_VERSION = "1.9.5";

const uid = (p) => p + "-" + Math.random().toString(36).slice(2, 9);

const seedCore = () => ({
  personas: [
    { id: "P001", nombre: "Juan Pérez", whatsapp: "0351 15-555-1234", direccion: "Av. Colón 1234", ciudad: "Córdoba", notas: "Prefiere contacto por la tarde" },
    { id: "P002", nombre: "María Gómez", whatsapp: "0351 15-666-4321", direccion: "Bv. San Juan 550", ciudad: "Córdoba", notas: "" },
    { id: "P003", nombre: "Roberto Díaz", whatsapp: "011 15-777-8899", direccion: "Av. Rivadavia 900", ciudad: "CABA", notas: "Dueño, muy ocupado, mejor mail primero" },
  ],
  empresas: [
    { id: "E001", denominacion: "Constructora del Sur S.A.", direccion: "Ruta 20 Km 8", ciudad: "Córdoba" },
    { id: "E002", denominacion: "Grupo Díaz Desarrollos", direccion: "Av. Rivadavia 900", ciudad: "CABA" },
  ],
  cargos: [
    { id: "C01", nombre: "Dueño" },
    { id: "C02", nombre: "Gerente" },
    { id: "C03", nombre: "Jefe de Compras" },
    { id: "C04", nombre: "Administración" },
    { id: "C05", nombre: "Otro" },
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
  personaEmpresa: [
    { id: uid("pe"), personaId: "P001", empresaId: "E001", cargoId: "C03", principal: true },
    { id: uid("pe"), personaId: "P002", empresaId: "E001", cargoId: "C04", principal: false },
    { id: uid("pe"), personaId: "P003", empresaId: "E002", cargoId: "C01", principal: true },
  ],
  empresaObra: [{ id: uid("eo"), empresaId: "E001", obraId: "O001" }],
  entidadEtiqueta: [
    { id: uid("et"), etiquetaId: "ET01", entidadTipo: "Empresa", entidadId: "E001" },
    { id: uid("et"), etiquetaId: "ET03", entidadTipo: "Empresa", entidadId: "E001" },
    { id: uid("et"), etiquetaId: "ET02", entidadTipo: "Obra", entidadId: "O001" },
  ],
  parametros: { umbralDiaLleno: 8, diasHabiles: [1, 2, 3, 4, 5], fechasNoHabiles: [], diasUrgente: 3, diasProximos: 7, googleContactsLabel: "CRM", tituloApp: "Seguimiento comercial", nombreSinColumnaSeguimientos: "Sin columna", nombreSinColumnaTareas: "Sin columna" },
  tema: { botonActivo: "#1B4D2E", botonInactivo: "#D9F0DE", tarjeta: "#FFFFFF", linea: "#E4DECF", fondo: "#F7F5F0", ink: "#2A2118", mutedBase: "#6B6352" },
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
    { id: "H001", participantes: [{ id: "part1", personaId: "P001", desde: addDaysISO(todayISO(), -15), hasta: null, principal: true }], empresaId: "E001", obraId: "", titulo: "Presupuesto cables solares", estado: "Activo", fechaCreacion: addDaysISO(todayISO(), -15), tipo: "cliente", columnaTareaId: null, hiloRelacionadoId: null, notaCierre: "" },
    { id: "H002", participantes: [{ id: "part2", personaId: "P001", desde: addDaysISO(todayISO(), -20), hasta: null, principal: true }], empresaId: "E001", obraId: "O001", titulo: "Avance obra Anatonia Village", estado: "Activo", fechaCreacion: addDaysISO(todayISO(), -20), tipo: "cliente", columnaTareaId: null, hiloRelacionadoId: null, notaCierre: "" },
    { id: "H003", participantes: [{ id: "part3", personaId: "P002", desde: addDaysISO(todayISO(), -6), hasta: null, principal: true }], empresaId: "E001", obraId: "", titulo: "Datos de facturación", estado: "Activo", fechaCreacion: addDaysISO(todayISO(), -6), tipo: "cliente", columnaTareaId: null, hiloRelacionadoId: null, notaCierre: "" },
    { id: "H004", participantes: [{ id: "part4", personaId: "P003", desde: addDaysISO(todayISO(), -10), hasta: null, principal: true }], empresaId: "E002", obraId: "", titulo: "Propuesta anual", estado: "Activo", fechaCreacion: addDaysISO(todayISO(), -10), tipo: "cliente", columnaTareaId: null, hiloRelacionadoId: null, notaCierre: "" },
    { id: "H005", participantes: [], empresaId: "", obraId: "", titulo: "Comprar resma de hojas", estado: "Activo", fechaCreacion: todayISO(), tipo: "tarea", columnaTareaId: "T1", hiloRelacionadoId: null, notaCierre: "" },
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

function normalizeCore(c) {
  const seed = seedCore();
  const out = { ...seed, ...c };
  if (!Array.isArray(out.cargos) || out.cargos.length === 0) out.cargos = seed.cargos;
  if (!Array.isArray(out.categorias) || out.categorias.length === 0) out.categorias = seed.categorias;
  out.empresas = (out.empresas || []).map((e) => ({ ciudad: "", ...e }));
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
  out.personaEmpresa = (out.personaEmpresa || []).map((r) => {
    if (r.cargoId) return r;
    // dato viejo: tenía "cargo" como texto libre -> lo mapeamos a un cargo de la tabla, o "Otro"
    const match = out.cargos.find((c2) => c2.nombre.toLowerCase() === (r.cargo || "").toLowerCase());
    const { cargo, ...rest } = r;
    return { ...rest, cargoId: match ? match.id : out.cargos[out.cargos.length - 1].id };
  });
  if (!Array.isArray(out.hilos)) out.hilos = [];
  out.hilos = out.hilos.map((h) => {
    const base = { tipo: "cliente", columnaTareaId: null, hiloRelacionadoId: null, notaCierre: "", ...h };
    if (!Array.isArray(base.participantes)) {
      base.participantes = base.personaId
        ? [{ id: uid("part"), personaId: base.personaId, desde: base.fechaCreacion || todayISO(), hasta: null, principal: true }]
        : [];
    }
    return base;
  });
  out.parametros = { umbralDiaLleno: 8, diasHabiles: [1, 2, 3, 4, 5], fechasNoHabiles: [], diasUrgente: 3, diasProximos: 7, googleContactsLabel: "CRM", tituloApp: "Seguimiento comercial", nombreSinColumnaSeguimientos: "Sin columna", nombreSinColumnaTareas: "Sin columna", ...(out.parametros || {}) };
  out.tema = { ...{ botonActivo: "#1B4D2E", botonInactivo: "#D9F0DE", tarjeta: "#FFFFFF", linea: "#E4DECF", fondo: "#F7F5F0", ink: "#2A2118", mutedBase: "#6B6352" }, ...(out.tema || {}) };
  if (!Array.isArray(out.kanbanColumnas)) out.kanbanColumnas = seed.kanbanColumnas;
  if (!Array.isArray(out.kanbanColumnasTareas)) out.kanbanColumnasTareas = seed.kanbanColumnasTareas;
  return out;
}

async function loadCrmRow(userId) {
  const { data, error } = await supabase
    .from("crm_data")
    .select("core, acciones")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function insertCrmRow(userId, core, acciones) {
  const { error } = await supabase.from("crm_data").insert({ user_id: userId, core, acciones });
  if (error) throw error;
}

async function saveCrmField(userId, field, value, intento = 0) {
  try {
    const { error } = await supabase
      .from("crm_data")
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) throw error;
    return true;
  } catch {
    if (intento < 2) {
      await new Promise((r) => setTimeout(r, 400));
      return saveCrmField(userId, field, value, intento + 1);
    }
    return false;
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
// -------- Helpers de participantes (personas vinculadas a un hilo, con historial) --------
function participantesActivos(hilo) {
  return (hilo.participantes || []).filter((p) => !p.hasta);
}
function personasActivasDeHilo(hilo, core) {
  const activos = [...participantesActivos(hilo)].sort((a, b) => (b.principal ? 1 : 0) - (a.principal ? 1 : 0));
  return activos.map((p) => core.personas.find((pp) => pp.id === p.personaId)).filter(Boolean);
}
function personaPrincipalDeHilo(hilo, core) {
  const personas = personasActivasDeHilo(hilo, core);
  return personas[0] || null;
}
function etiquetaVinculoHilo(hilo, core) {
  const personas = personasActivasDeHilo(hilo, core);
  if (personas.length > 0) return personas.map((p) => p.nombre).join(", ");
  const empresa = core.empresas.find((e) => e.id === hilo.empresaId);
  if (empresa) return empresa.denominacion;
  const obra = core.obras.find((o) => o.id === hilo.obraId);
  if (obra) return obra.nombre;
  return hilo.titulo;
}
function getIniciales(nombre) {
  const partes = (nombre || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
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
function Chip({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-[#E7E2D8] text-[#4A4438]",
    amber: "bg-[#F4A742] text-[#2A2118]",
    green: "bg-[#3F6B4A] text-[#F2F0E9]",
    slate: "bg-[#2A2F36] text-[#F2F0E9]",
    red: "bg-[#B0452E] text-[#F2F0E9]",
  };
  return <span className={`text-[10px] font-bold tracking-widest uppercase px-2 py-1 rounded-sm ${tones[tone]}`}>{children}</span>;
}

function IconBtn({ onClick, children, label, danger }) {
  return (
    <button onClick={onClick} aria-label={label} className={`p-1.5 rounded-sm ${danger ? "text-[#C9A08A] hover:text-[#B0452E]" : "text-[#8A8272] hover:text-[#2A2118]"}`}>
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
      className={`${full ? "w-full" : ""} ${disabled ? "bg-[#E7E2D8] text-[#A69C88] cursor-not-allowed" : core ? "hover:opacity-90" : "bg-[#E8871E] text-[#2A2118] hover:bg-[#D6791A]"} rounded-sm px-3.5 py-2.5 font-bold text-sm transition-colors flex items-center justify-center gap-1.5`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-[11px] font-bold uppercase tracking-wide text-[#6B6352] mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "w-full bg-white border border-[#D8D2C4] rounded-sm px-3 py-2 text-sm text-[#2A2118] placeholder-[#A69C88] focus:outline-none focus:ring-2 focus:ring-[#E8871E] focus:border-transparent";

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

// Select de un catálogo simple (tipo de acción, cargo, categoría...) con la posibilidad
// de crear un registro nuevo ahí mismo, sin salir del formulario. "allowVacio" agrega
// una opción "— A definir —" al principio de la lista.
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
        <select className={`${inputCls} flex-1`} value={value} onChange={(e) => onChange(e.target.value)}>
          {allowVacio && <option value="">— A definir —</option>}
          {opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
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
          <button type="button" onClick={confirmarCrear} className="text-[#3F6B4A]"><Check size={18} /></button>
          <button type="button" onClick={() => { setCreando(false); setNombreNuevo(""); }} className="text-[#B0452E]"><X size={18} /></button>
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
          <span key={rel.id} className="inline-flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase px-2 py-1 rounded-sm bg-[#E7E2D8] text-[#4A4438]">
            {etiqueta.etiqueta}
            <button onClick={() => quitar(rel.id)} aria-label="Quitar etiqueta"><X size={10} /></button>
          </span>
        ))}
        <button onClick={() => setShowPicker(true)} className="text-[10px] font-bold uppercase tracking-wide text-[#B0452E] flex items-center gap-1 px-1 py-1">
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
  const [nombre, setNombre] = useState("");
  const [categoriaId, setCategoriaId] = useState((core.categorias || [])[0]?.id || "");
  const [categoriaModo, setCategoriaModo] = useState("existente"); // 'existente' | 'nueva'
  const [nombreCategoriaNueva, setNombreCategoriaNueva] = useState("");

  const disponibles = core.etiquetas.filter((e) => e.aplicaA === entidadTipo && !asignadas.some((r) => r.etiquetaId === e.id));

  const asignar = (etiquetaId) => {
    setCore((prev) => ({ ...prev, entidadEtiqueta: [...prev.entidadEtiqueta, { id: uid("et"), etiquetaId, entidadTipo, entidadId }] }));
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
    onClose();
  };

  return (
    <Modal title="Agregar etiqueta" onClose={onClose}>
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
          <p className="text-sm text-[#A69C88]">No hay más etiquetas de tipo "{entidadTipo}" disponibles — creá una nueva.</p>
        ) : (
          <div className="space-y-1.5">
            {disponibles.map((e) => (
              <button key={e.id} onClick={() => { asignar(e.id); onClose(); }} className="w-full text-left bg-[#F7F5F0] border border-[#E4DECF] rounded-sm p-2.5 text-sm">
                <span className="font-semibold text-[#2A2118]">{e.etiqueta}</span>
                <span className="text-[#8A8272]"> · {(core.categorias || []).find((c) => c.id === e.categoriaId)?.nombre || "sin categoría"}</span>
              </button>
            ))}
          </div>
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
              <select className={inputCls} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                {(core.categorias || []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Nueva categoría"><input className={inputCls} value={nombreCategoriaNueva} onChange={(e) => setNombreCategoriaNueva(e.target.value)} placeholder="Ej: Zona, Rubro, Prioridad" /></Field>
          )}

          <p className="text-xs text-[#A69C88] mb-3">Se creará como etiqueta de tipo "{entidadTipo}" y se asigna automáticamente.</p>
          <PrimaryBtn full onClick={crearYAsignar}>Crear y asignar</PrimaryBtn>
        </>
      )}
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

  useEffect(() => {
    (async () => {
      let row = null;
      try { row = await loadCrmRow(userId); } catch { row = null; }
      let c = row ? normalizeCore(row.core) : seedCore();
      let a = row ? row.acciones : seedAcciones();
      if (!row) {
        await insertCrmRow(userId, c, a);
      }
      // Migración: las acciones de versiones anteriores no tenían hiloId (eran de prueba).
      // Se reinician hilos + acciones con datos de ejemplo del nuevo sistema.
      if (a.some((accion) => !accion.hiloId)) {
        c = { ...c, hilos: seedCore().hilos };
        a = seedAcciones();
        await saveCrmField(userId, "core", c);
        await saveCrmField(userId, "acciones", a);
      }
      // Migración: asignar número correlativo global y separar "nota planificada" de "nota de lo hecho".
      if (a.some((accion) => typeof accion.numero !== "number")) {
        a = migrarNumerosYNotas(a);
        await saveCrmField(userId, "acciones", a);
      }
      setCore(c);
      setAcciones(a);
    })();
  }, [userId]);

  useEffect(() => {
    if (!core) return;
    if (primerRenderCore.current) { primerRenderCore.current = false; return; }
    setGuardado("guardando");
    saveCrmField(userId, "core", core).then((ok) => setGuardado(ok ? "ok" : "error"));
  }, [core, userId]);

  useEffect(() => {
    if (!acciones) return;
    if (primerRenderAcciones.current) { primerRenderAcciones.current = false; return; }
    setGuardado("guardando");
    saveCrmField(userId, "acciones", acciones).then((ok) => setGuardado(ok ? "ok" : "error"));
  }, [acciones, userId]);

  useEffect(() => {
    if (!core || !acciones) return;
    if (resumenMostrado.current) return;
    resumenMostrado.current = true;
    const t = todayISO();
    const hayAlgo = acciones.some((a) => a.estado === "Pendiente" && a.fechaProgramada && a.fechaProgramada <= t);
    if (hayAlgo) setShowResumenHoy(true);
  }, [core, acciones]);

  if (!core || !acciones) {
    return <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center text-[#A69C88] text-sm">Cargando...</div>;
  }

  const openDetail = (type, id) => { setDetail({ type, id }); };
  const closeDetail = () => setDetail(null);

  const NAV = [
    { id: "agenda", label: "Seguimientos", icon: Trello },
    { id: "tareas", label: "Tareas", icon: ListChecks },
    { id: "calendario", label: "Calendario", icon: CalendarClock },
    { id: "informes", label: "Informes", icon: BarChart3 },
  ];

  const MENU_ABM = [
    { id: "personas", label: "Personas", icon: Users },
    { id: "empresas", label: "Empresas", icon: Building2 },
    { id: "obras", label: "Obras", icon: HardHat },
    { id: "tiposAccion", label: "Tipos de acción", icon: Layers },
    { id: "etiquetas", label: "Etiquetas", icon: Tags },
    { id: "categorias", label: "Categorías de etiquetas", icon: FolderKanban },
    { id: "cargos", label: "Cargos", icon: Briefcase },
  ];

  return (
    <div className="relative min-h-screen bg-[#F7F5F0] flex justify-center">
      <style>{`
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
      <div className="w-full max-w-md px-3 pt-5 pb-6 flex flex-col min-h-screen">
        <header className="mb-4 px-1 flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-extrabold text-[#2A2118] tracking-tight">{core.parametros.tituloApp || "Seguimiento comercial"}</h1>
            <p className={`text-[10px] font-bold uppercase tracking-wide mt-0.5 ${guardado === "error" ? "text-[#B0452E]" : "text-[#A69C88]"}`}>
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

        <nav className="flex gap-1 mb-4">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = tab === n.id && !detail;
            return (
              <button
                key={n.id}
                onClick={() => { setTab(n.id); setDetail(null); }}
                style={active ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) } : { backgroundColor: core.tema.botonInactivo, color: core.tema.ink }}
                className="flex-1 min-w-0 h-12 flex flex-col items-center justify-center gap-0.5 rounded-sm text-[9px] font-bold transition-colors"
              >
                <Icon size={15} /> <span className="truncate max-w-full px-0.5">{n.label}</span>
              </button>
            );
          })}
        </nav>

        <main className="flex-1">
          {detail ? (
            <DetailRouter detail={detail} core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onClose={closeDetail} onOpen={openDetail} />
          ) : (
            <>
              {tab === "agenda" && <AgendaView core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onOpen={openDetail} />}
              {tab === "tareas" && <TareasView core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onOpen={openDetail} />}
              {tab === "calendario" && <CalendarioView core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onOpen={openDetail} t={todayISO()} />}
              {tab === "personas" && <PersonasView core={core} setCore={setCore} onOpen={openDetail} />}
              {tab === "empresas" && <EmpresasView core={core} setCore={setCore} onOpen={openDetail} />}
              {tab === "obras" && <ObrasView core={core} setCore={setCore} onOpen={openDetail} />}
              {tab === "tiposAccion" && <TiposAccionView core={core} setCore={setCore} />}
              {tab === "etiquetas" && <EtiquetasView core={core} setCore={setCore} />}
              {tab === "categorias" && <CategoriasView core={core} setCore={setCore} />}
              {tab === "cargos" && <CargosView core={core} setCore={setCore} />}
              {tab === "informes" && <InformesView core={core} acciones={acciones} />}
              {tab === "buscar" && <BuscarView core={core} search={search} setSearch={setSearch} onOpen={openDetail} />}
              {tab === "config" && <ConfigView core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} />}
            </>
          )}
        </main>
      </div>

      {showMenu && (
        <Modal title="Menú" onClose={() => setShowMenu(false)}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#A69C88] mb-2">ABM</p>
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
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#A69C88] mb-2 pt-3 border-t border-[#E4DECF]">Sistema</p>
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
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-sm font-semibold text-[#B0452E]"
                >
                  <LogOut size={16} /> Cerrar sesión
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {showResumenHoy && (
        <ResumenHoyModal core={core} acciones={acciones} onOpen={openDetail} onClose={() => setShowResumenHoy(false)} />
      )}
    </div>
  );
}

function ResumenHoyModal({ core, acciones, onOpen, onClose }) {
  const t = todayISO();
  const pendientes = acciones.filter((a) => a.estado === "Pendiente" && a.fechaProgramada);
  const hoy = pendientes.filter((a) => a.fechaProgramada === t);
  const vencidas = pendientes.filter((a) => a.fechaProgramada < t).sort((a, b) => (a.fechaProgramada < b.fechaProgramada ? -1 : 1));

  const Fila = ({ a }) => {
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
        <p className="text-sm font-semibold text-[#2A2118] truncate">{esTarea ? hilo.titulo : (persona?.nombre || hilo.titulo)}</p>
        <p className="text-xs text-[#6B6352] truncate">{[tipoAccion?.nombre, esTarea ? "" : hilo.titulo, a.notaPlanificada].filter(Boolean).join(" · ")}</p>
      </button>
    );
  };

  return (
    <Modal title="Resumen de hoy" onClose={onClose}>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#6B6352] mb-1.5">Hoy{hoy.length > 0 ? ` (${hoy.length})` : ""}</p>
        {hoy.length === 0 ? (
          <p className="text-xs text-[#A69C88] mb-3">Nada programado para hoy.</p>
        ) : (
          <div className="mb-3">{hoy.map((a) => <Fila key={a.id} a={a} />)}</div>
        )}
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#B0452E] mb-1.5">Vencidas{vencidas.length > 0 ? ` (${vencidas.length})` : ""}</p>
        {vencidas.length === 0 ? (
          <p className="text-xs text-[#A69C88]">No hay pendientes vencidas.</p>
        ) : (
          <div>{vencidas.map((a) => <Fila key={a.id} a={a} />)}</div>
        )}
      </div>
    </Modal>
  );
}

function DetailRouter({ detail, core, setCore, acciones, setAcciones, onClose, onOpen }) {
  if (detail.type === "persona") return <PersonaDetail id={detail.id} core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onClose={onClose} onOpen={onOpen} />;
  if (detail.type === "empresa") return <EmpresaDetail id={detail.id} core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onClose={onClose} onOpen={onOpen} />;
  if (detail.type === "obra") return <ObraDetail id={detail.id} core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onClose={onClose} onOpen={onOpen} />;
  if (detail.type === "hilo") return <HiloDetail id={detail.id} core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onClose={onClose} onOpen={onOpen} />;
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

  const reprogramar = (id, nuevaFecha) => {
    setAcciones((prev) => prev.map((a) => (a.id === id ? { ...a, fechaProgramada: nuevaFecha } : a)));
  };

  return (
    <div>
      <KanbanView core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onOpen={onOpen} onReprogramar={reprogramar} t={t} soloTipo="cliente" />
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
  const [empresaId, setEmpresaId] = useState(empresaFijaId || "");
  const [obraId, setObraId] = useState(obraFijaId || "");
  const [showVincularEmpresa, setShowVincularEmpresa] = useState(false);
  const [showVincularObra, setShowVincularObra] = useState(false);
  const [showPrimerContacto, setShowPrimerContacto] = useState(false);

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
  const [confirmarEspecifica, setConfirmarEspecifica] = useState(false);
  const [prioridad, setPrioridad] = useState("Media");
  const [recurrente, setRecurrente] = useState(false);
  const [repiteCadaN, setRepiteCadaN] = useState(1);
  const [repiteUnidad, setRepiteUnidad] = useState("meses");
  const [preview, setPreview] = useState(null);

  const empresasDeLaPersona = useMemo(() => {
    if (!personaFija) return [];
    const relEmpresas = core.personaEmpresa.filter((r) => r.personaId === personaFija.id);
    return relEmpresas.map((r) => core.empresas.find((e) => e.id === r.empresaId)).filter(Boolean);
  }, [personaFija, core.personaEmpresa, core.empresas]);

  const obrasDeLaEmpresa = useMemo(() => {
    if (!empresaId) return [];
    return core.empresaObra.filter((r) => r.empresaId === empresaId).map((r) => core.obras.find((o) => o.id === r.obraId)).filter(Boolean);
  }, [empresaId, core.empresaObra, core.obras]);

  useEffect(() => {
    if (showPrimerContacto && programarProxima && modoFecha === "periodo") {
      const base = addPeriod(todayISO(), Number(cantidad) || 1, unidad);
      setPreview(computeSmartDate(base, acciones, core.parametros));
    }
  }, [showPrimerContacto, programarProxima, modoFecha, cantidad, unidad]); // eslint-disable-line

  const especificaInhabil = showPrimerContacto && programarProxima && modoFecha === "especifica" && esFechaInhabil(fechaEspecifica, core.parametros);
  const faltaVinculo = !personaFija && !empresaFijaId && !obraFijaId && !personaId && !empresaId && !obraId;

  const crear = () => {
    if (!titulo.trim() || faltaVinculo) return;
    const hoy = todayISO();
    const personaIdFinal = personaFija ? personaFija.id : personaId;
    const participantes = personaIdFinal ? [{ id: uid("part"), personaId: personaIdFinal, desde: hoy, hasta: null, principal: true }] : [];
    const nuevoHilo = { id: uid("H"), participantes, empresaId: empresaId || "", obraId: obraId || "", titulo: titulo.trim(), estado: "Activo", fechaCreacion: hoy, tipo: "cliente", columnaTareaId: null, hiloRelacionadoId: null, notaCierre: "" };
    setCore((prev) => ({ ...prev, hilos: [nuevoHilo, ...prev.hilos] }));

    if (showPrimerContacto && setAcciones) {
      setAcciones((prev) => {
        let siguienteNumero = Math.max(0, ...prev.map((a) => a.numero || 0)) + 1;
        const idPrimera = uid("A");
        let next = [{ id: idPrimera, hiloId: nuevoHilo.id, tipoAccionId: tipoAccionId1, estado: "Realizada", fechaRealizada: hoy, fechaProgramada: "", horaProgramada: "", prioridad: "", notaPlanificada: "", notaHecho: notas1, origenId: null, destinoId: null, numero: siguienteNumero++, recurrente: false, repiteCadaN: null, repiteUnidad: null, fechaCreacion: hoy, secuencia: Date.now() }, ...prev];

        if (programarProxima) {
          const fecha = modoFecha === "periodo" ? (preview || hoy) : (fechaEspecifica || hoy);
          const hora = modoFecha === "especifica" ? horaEspecifica : "";
          const idNueva = uid("A");
          next = [{ id: idNueva, hiloId: nuevoHilo.id, tipoAccionId: tipoAccionId2, estado: "Pendiente", fechaRealizada: "", fechaProgramada: fecha, horaProgramada: hora, prioridad, notaPlanificada: notas2, notaHecho: "", origenId: idPrimera, destinoId: null, numero: siguienteNumero++, recurrente, repiteCadaN: recurrente ? Number(repiteCadaN) : null, repiteUnidad: recurrente ? repiteUnidad : null, fechaCreacion: hoy, secuencia: Date.now() + 1 }, ...next];
          next = next.map((a) => (a.id === idPrimera ? { ...a, destinoId: idNueva } : a));
        }
        return next;
      });
    }

    onCreated(nuevoHilo.id);
  };

  const submit = () => {
    if (showPrimerContacto && programarProxima && especificaInhabil && !confirmarEspecifica) { setConfirmarEspecifica(true); return; }
    crear();
  };

  return (
    <div>
      <Field label="Título del tema *"><input autoFocus className={inputCls} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Presupuesto cables solares" /></Field>

      {!personaFija && (
        <Field label="Persona">
          <select className={inputCls} value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
            <option value="">— ninguna —</option>
            {core.personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Field>
      )}

      {!empresaFijaId && (
        <Field label="Empresa">
          {personaFija ? (
            empresasDeLaPersona.length === 0 ? (
              <p className="text-sm text-[#A69C88] mb-1.5">Este contacto no tiene empresas vinculadas todavía.</p>
            ) : (
              <select className={inputCls} value={empresaId} onChange={(e) => { setEmpresaId(e.target.value); setObraId(""); }}>
                <option value="">— sin empresa —</option>
                {empresasDeLaPersona.map((e) => <option key={e.id} value={e.id}>{e.denominacion}</option>)}
              </select>
            )
          ) : (
            <select className={inputCls} value={empresaId} onChange={(e) => { setEmpresaId(e.target.value); setObraId(""); }}>
              <option value="">— ninguna —</option>
              {core.empresas.map((e) => <option key={e.id} value={e.id}>{e.denominacion}</option>)}
            </select>
          )}
          {personaFija && (
            <button type="button" onClick={() => setShowVincularEmpresa(true)} className="text-xs font-bold text-[#B0452E] mt-1.5">+ Vincular otra empresa a este contacto</button>
          )}
        </Field>
      )}

      {!obraFijaId && (
        <Field label="Obra">
          {personaFija ? (
            obrasDeLaEmpresa.length === 0 ? (
              <p className="text-sm text-[#A69C88] mb-1.5">{empresaId ? "Esta empresa no tiene obras vinculadas." : "Elegí primero una empresa para poder sumar una obra."}</p>
            ) : (
              <select className={inputCls} value={obraId} onChange={(e) => setObraId(e.target.value)}>
                <option value="">— sin obra —</option>
                {obrasDeLaEmpresa.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            )
          ) : (
            <select className={inputCls} value={obraId} onChange={(e) => setObraId(e.target.value)}>
              <option value="">— ninguna —</option>
              {core.obras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          )}
          {personaFija && (
            <button
              type="button"
              disabled={!empresaId}
              onClick={() => setShowVincularObra(true)}
              className={`text-xs font-bold mt-1.5 ${empresaId ? "text-[#B0452E]" : "text-[#C9C1AE] cursor-not-allowed"}`}
            >
              + Vincular obra a esta empresa
            </button>
          )}
        </Field>
      )}

      {faltaVinculo && (
        <p className="text-xs text-[#A69C88] mb-3">Elegí al menos una — persona, empresa u obra.</p>
      )}

      {!showPrimerContacto ? (
        <button type="button" onClick={() => setShowPrimerContacto(true)} className="text-xs font-bold text-[#B0452E] mb-3">
          + Cargar primer contacto y próxima acción
        </button>
      ) : (
        <div className="border-t border-[#E4DECF] my-3 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#B0452E]">Primer contacto</p>
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
            <textarea className={inputCls} rows={2} value={notas1} onChange={(e) => setNotas1(e.target.value)} placeholder="Qué hablaron, qué resultó..." />
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
                <textarea className={inputCls} rows={2} value={notas2} onChange={(e) => setNotas2(e.target.value)} placeholder="Ej: confirmar si aceptaron la propuesta, próximos pasos a seguir..." />
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
                  <Field label="Fecha">
                    <input type="date" className={inputCls} value={fechaEspecifica} onChange={(e) => { setFechaEspecifica(e.target.value); setConfirmarEspecifica(false); }} />
                  </Field>
                  <Field label="Hora (opcional)">
                    <input type="time" className={inputCls} value={horaEspecifica} onChange={(e) => setHoraEspecifica(e.target.value)} />
                  </Field>
                  {especificaInhabil && (
                    <div className="bg-[#FBEEE7] border border-[#E8871E] rounded-sm p-2.5 mb-3">
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
        <button onClick={submit} disabled={!titulo.trim() || faltaVinculo} className={`flex-1 rounded-sm py-2.5 font-bold text-sm ${!titulo.trim() || faltaVinculo ? "bg-[#E7E2D8] text-[#A69C88] cursor-not-allowed" : "bg-[#E8871E] text-[#2A2118]"}`}>
          {especificaInhabil && confirmarEspecifica ? "Sí, crear igual" : "Crear hilo"}
        </button>
      </div>

      {showVincularEmpresa && personaFija && (
        <VincularEmpresaForm
          core={core}
          setCore={setCore}
          onClose={() => setShowVincularEmpresa(false)}
          onSave={(rel) => {
            setCore((prev) => ({ ...prev, personaEmpresa: [...prev.personaEmpresa, { ...rel, personaId: personaFija.id, id: uid("pe") }] }));
            setEmpresaId(rel.empresaId);
            setObraId("");
            setShowVincularEmpresa(false);
          }}
        />
      )}
      {showVincularObra && personaFija && (
        <VincularObraForm
          core={core}
          setCore={setCore}
          empresaId={empresaId}
          onClose={() => setShowVincularObra(false)}
          onLinked={(newObraId) => { setObraId(newObraId); setShowVincularObra(false); }}
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
  const [verCerradas, setVerCerradas] = useState(false);
  const tabsRef = useRef(null);
  const hoverRef = useRef(undefined);

  const columnas = core.kanbanColumnasTareas || [];
  const tareas = core.hilos.filter((h) => h.tipo === "tarea" && h.estado === "Activo");
  const tareasCerradas = core.hilos.filter((h) => h.tipo === "tarea" && h.estado === "Cerrado");

  const fechaDe = (hiloId) => {
    const p = acciones.find((a) => a.hiloId === hiloId && a.estado === "Pendiente");
    return p ? p.fechaProgramada : "";
  };

  const contarColumna = (colId) => tareas.filter((h) => (h.columnaTareaId || null) === colId).length;

  const tareasColumna = useMemo(() => {
    return tareas
      .filter((h) => (h.columnaTareaId || null) === columnaActiva)
      .sort((a, b) => {
        const fa = fechaDe(a.id), fb = fechaDe(b.id);
        if (fa && fb) return fa < fb ? -1 : fa > fb ? 1 : 0;
        if (fa && !fb) return -1;
        if (!fa && fb) return 1;
        return (b.fechaCreacion || "").localeCompare(a.fechaCreacion || "");
      });
  }, [tareas, columnaActiva, acciones]);

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
    const nuevoHilo = { id: uid("H"), personaId: null, empresaId: "", obraId: "", titulo: tituloNuevo.trim(), estado: "Activo", fechaCreacion: hoy, tipo: "tarea", columnaTareaId: columnaActiva, hiloRelacionadoId: null, notaCierre: "" };
    setCore((prev) => ({ ...prev, hilos: [nuevoHilo, ...prev.hilos] }));
    if (fechaNueva) {
      setAcciones((prev) => {
        const siguienteNumero = Math.max(0, ...prev.map((a) => a.numero || 0)) + 1;
        return [{ id: uid("A"), hiloId: nuevoHilo.id, tipoAccionId: "", estado: "Pendiente", fechaRealizada: "", fechaProgramada: fechaNueva, horaProgramada: horaNueva, prioridad: "Media", notaPlanificada: tituloNuevo.trim(), notaHecho: "", origenId: null, destinoId: null, numero: siguienteNumero, recurrente: false, repiteCadaN: null, repiteUnidad: null, fechaCreacion: hoy, secuencia: Date.now() }, ...prev];
      });
    }
    setTituloNuevo("");
    setFechaNueva("");
    setHoraNueva("");
    setMostrarFecha(false);
  };

  const nombreSinColumna = core.parametros.nombreSinColumnaTareas || "Sin columna";
  const nombreColumnaActiva = columnaActiva === null ? nombreSinColumna : columnas.find((c) => c.id === columnaActiva)?.nombre || "Columna";

  return (
    <div>
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
        </div>
        {mostrarFecha && (
          <div className="flex gap-2 mt-2">
            <input type="date" value={fechaNueva} onChange={(e) => setFechaNueva(e.target.value)} className={inputCls} />
            <input type="time" value={horaNueva} onChange={(e) => setHoraNueva(e.target.value)} className={inputCls} />
          </div>
        )}
        <p className="text-xs text-[#A69C88] mt-2">La fecha y hora son opcionales — si no las cargás, la tarea se guarda igual.</p>
      </div>

      {dragging && (
        <p className="text-center text-xs font-bold text-[#B0452E] uppercase tracking-wide mb-1.5 animate-pulse">
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

      <div className="mt-3">
        {tareasColumna.length === 0 ? (
          <EmptyState icon={<ListChecks size={26} />} text={`No hay tareas en "${nombreColumnaActiva}". Arrastrá una desde otra pestaña, o cargá una nueva arriba.`} />
        ) : (
          <div>
            {tareasColumna.map((h, i) => (
              <Fragment key={h.id}>
                {i > 0 && <div className="flex justify-center py-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: core.tema.botonActivo }} /></div>}
                <TareaCard
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
          <button onClick={() => setVerCerradas((v) => !v)} className="text-xs font-bold text-[#6B6352] flex items-center gap-1">
            {verCerradas ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {verCerradas ? "Ocultar" : "Ver"} tareas completadas ({tareasCerradas.length})
          </button>
          {verCerradas && (
            <div className="mt-2 space-y-2">
              {tareasCerradas.map((h) => (
                <TareaCard key={h.id} hilo={h} core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onOpen={onOpen} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Permite poner o cambiar la fecha/hora de una tarea aunque todavía no tenga ninguna acción cargada.
function EditarFechaTareaForm({ hilo, pendiente, setAcciones, onClose }) {
  const [fecha, setFecha] = useState(pendiente?.fechaProgramada || todayISO());
  const [hora, setHora] = useState(pendiente?.horaProgramada || "");

  const guardar = () => {
    if (pendiente) {
      setAcciones((prev) => prev.map((a) => (a.id === pendiente.id ? { ...a, fechaProgramada: fecha, horaProgramada: hora } : a)));
    } else {
      setAcciones((prev) => {
        const siguienteNumero = Math.max(0, ...prev.map((a) => a.numero || 0)) + 1;
        return [{ id: uid("A"), hiloId: hilo.id, tipoAccionId: "", estado: "Pendiente", fechaRealizada: "", fechaProgramada: fecha, horaProgramada: hora, prioridad: "Media", notaPlanificada: hilo.titulo, notaHecho: "", origenId: null, destinoId: null, numero: siguienteNumero, recurrente: false, repiteCadaN: null, repiteUnidad: null, fechaCreacion: todayISO(), secuencia: Date.now() }, ...prev];
      });
    }
    onClose();
  };

  const quitarFecha = () => {
    if (pendiente) setAcciones((prev) => prev.filter((a) => a.id !== pendiente.id));
    onClose();
  };

  return (
    <div>
      <Field label="Fecha"><input type="date" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field>
      <Field label="Hora (opcional)"><input type="time" className={inputCls} value={hora} onChange={(e) => setHora(e.target.value)} /></Field>
      <PrimaryBtn full onClick={guardar}>Guardar</PrimaryBtn>
      {pendiente && !pendiente.notaHecho && (
        <button onClick={quitarFecha} className="w-full text-center text-xs font-bold text-[#B0452E] mt-2">Quitar fecha (la tarea queda sin programar)</button>
      )}
    </div>
  );
}

function TareaCard({ hilo, core, setCore, acciones, setAcciones, onOpen, onIniciarDrag, arrastrando }) {
  const [showFecha, setShowFecha] = useState(false);
  const accionesDelHilo = acciones.filter((a) => a.hiloId === hilo.id);
  const pendiente = accionesDelHilo.find((a) => a.estado === "Pendiente");
  const tipo = pendiente ? core.tiposAccion.find((t) => t.id === pendiente.tipoAccionId) : null;
  const finalizada = hilo.estado === "Cerrado";
  const hiloRelacionado = hilo.hiloRelacionadoId ? core.hilos.find((h) => h.id === hilo.hiloRelacionadoId) : null;
  const personaRelacionada = hiloRelacionado ? personaPrincipalDeHilo(hiloRelacionado, core) : null;

  return (
    <div className="bg-white border border-[#E4DECF] rounded-sm p-3" style={{ opacity: arrastrando ? 0.35 : 1 }}>
      <div className="flex items-start gap-2.5">
        <CasillaFinalizar hilo={hilo} acciones={accionesDelHilo} setCore={setCore} size={18} />
        <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "#EFE6F7", color: "#6B4FA0" }}>
          <ListChecks size={14} />
        </div>
        <button onClick={() => onOpen("hilo", hilo.id)} className="flex-1 min-w-0 text-left">
          <p className={`text-sm font-bold ${finalizada ? "line-through text-[#A69C88]" : "text-[#2A2118]"}`}>{hilo.titulo}</p>
          {pendiente && (
            <p className="text-xs text-[#8A8272] mt-0.5 font-mono">{tipo?.nombre ? `${tipo.nombre} · ` : ""}{fmtDateHora(pendiente.fechaProgramada, pendiente.horaProgramada)}</p>
          )}
          {hiloRelacionado && (
            <p className="text-[11px] text-[#B0452E] font-bold mt-0.5">Vinculada a: {personaRelacionada ? personaRelacionada.nombre : hiloRelacionado.titulo}</p>
          )}
        </button>
        {setAcciones && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowFecha(true); }}
            aria-label="Fecha y hora"
            className="shrink-0 text-[#8A8272] p-1"
          >
            <CalendarClock size={16} />
          </button>
        )}
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
      {showFecha && (
        <Modal title="Fecha y hora de la tarea" onClose={() => setShowFecha(false)}>
          <EditarFechaTareaForm hilo={hilo} pendiente={pendiente} setAcciones={setAcciones} onClose={() => setShowFecha(false)} />
        </Modal>
      )}
    </div>
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
  const COLOR_TAREA = "#6B4FA0";

  const tonoDia = (iso) => {
    const n = countsClienteByDate[iso] || 0;
    if (n === 0) return null;
    if (n >= umbral) return "red";
    return "amber";
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

  const reprogramar = (id, nuevaFecha) => {
    setAcciones((prev) => prev.map((a) => (a.id === id ? { ...a, fechaProgramada: nuevaFecha } : a)));
  };

  return (
    <div>
      <div className="flex gap-1.5 mb-3">
        <button onClick={() => setModo("mes")} style={modo === "mes" ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) } : { backgroundColor: core.tema.botonInactivo, color: core.tema.ink }} className="flex-1 h-8 text-[11px] font-bold uppercase tracking-wide rounded-sm">Mensual</button>
        <button onClick={() => setModo("semana")} style={modo === "semana" ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) } : { backgroundColor: core.tema.botonInactivo, color: core.tema.ink }} className="flex-1 h-8 text-[11px] font-bold uppercase tracking-wide rounded-sm">Semanal</button>
      </div>

      <div className="flex items-center justify-between mb-2">
        <IconBtn label="Anterior" onClick={irAnterior}><ChevronLeft size={18} /></IconBtn>
        <div className="text-center">
          <p className="text-sm font-extrabold text-[#2A2118]">{tituloRango}</p>
          <button onClick={irHoy} className="text-[10px] font-bold uppercase tracking-wide text-[#B0452E]">Hoy</button>
        </div>
        <IconBtn label="Siguiente" onClick={irSiguiente}><ChevronRight size={18} /></IconBtn>
      </div>

      <div className="flex items-center justify-center gap-4 mb-2">
        <span className="flex items-center gap-1 text-[10px] font-bold text-[#6B6352]"><span className="w-2 h-2 rounded-full bg-[#E8871E]" /> Hilos de clientes</span>
        <span className="flex items-center gap-1 text-[10px] font-bold text-[#6B6352]"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLOR_TAREA }} /> Tareas</span>
      </div>

      {modo === "mes" ? (
        <div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DIAS_SEMANA.map((d) => <p key={d} className="text-center text-[10px] font-bold uppercase text-[#A69C88]">{d}</p>)}
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
                  className={`relative aspect-square rounded-sm flex items-center justify-center ${isSel ? "ring-2 ring-[#E8871E]" : ""} ${inMonth ? "bg-white border border-[#E4DECF]" : "bg-transparent"}`}
                >
                  <span className={`absolute top-1 left-1 text-[10px] leading-none ${inMonth ? (isToday ? "font-extrabold text-[#B0452E]" : "text-[#8A8272]") : "text-[#E4DECF]"}`}>{date.getDate()}</span>
                  {inMonth && (countCli > 0 || countTar > 0) && (
                    <div className="flex items-center gap-0.5">
                      {countCli > 0 && <span className={`text-base font-extrabold ${tone === "red" ? "text-[#B0452E]" : "text-[#E8871E]"}`}>{countCli}</span>}
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
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-sm ${isSel ? "ring-2 ring-[#E8871E]" : ""} bg-white border border-[#E4DECF]`}
              >
                <span className={`text-sm ${isToday ? "font-extrabold text-[#B0452E]" : "text-[#2A2118]"}`}>{DIAS_SEMANA[(date.getDay() + 6) % 7]} {date.getDate()}/{date.getMonth() + 1}</span>
                <div className="flex items-center gap-1.5">
                  {countCli > 0 && <Chip tone={tone}>{countCli}</Chip>}
                  {countTar > 0 && <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm text-white" style={{ backgroundColor: COLOR_TAREA }}>{countTar}</span>}
                  {countCli === 0 && countTar === 0 && <span className="text-xs text-[#D8D2C4]">—</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {diaSeleccionado && (
        <div className="mt-4 pt-3 border-t border-[#E4DECF]">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352] mb-2">{fmtDate(diaSeleccionado)}</p>
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
                    onReprogramar={reprogramar}
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
// doble clic (o el link "Renombrar") para editar el nombre, "+" para crear, "Eliminar" si está vacía.
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
        style={{ width: size, height: size, backgroundColor: finalizado ? "#3F6B4A" : "#FFFFFF", border: `2px solid ${finalizado ? "#3F6B4A" : "#C9C1AE"}` }}
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
        <button onClick={() => onConfirmar(texto)} style={{ backgroundColor: "#3F6B4A", color: "#FFFFFF" }} className="flex-1 rounded-sm py-2.5 font-bold text-sm">Cerrar</button>
      </div>
    </div>
  );
}

function ExcelTabsBar({ core, tabs, activeId, incluirSinTab, sinColumnaNombre, onSelect, onCreate, onRename, onRenameSinColumna, onDelete, contarTab, tabsRef, hoverId, dragging }) {
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [editandoId, setEditandoId] = useState(undefined); // undefined = nadie editando, null = "Sin columna", id = esa pestaña

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
  const activa = incluirSinTab ? activeId : activeId;
  const tabActivaNombre = activeId === null ? nombreSinColumna : tabs.find((t) => t.id === activeId)?.nombre || "";

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
          className="shrink-0 h-8 w-24 text-[10px] font-bold uppercase tracking-wide px-2 border rounded-t-sm focus:outline-none"
          style={{ backgroundColor: core.tema.tarjeta, borderColor: core.tema.linea }}
        />
      );
    }
    return (
      <button
        key={key}
        data-tab-id={key}
        onClick={() => onSelect(id)}
        onDoubleClick={() => setEditandoId(id)}
        style={{
          backgroundColor: esHover || esActiva ? core.tema.botonActivo : core.tema.botonInactivo,
          color: esHover || esActiva ? "#FFFFFF" : "#2A2118",
          borderColor: core.tema.linea,
          marginBottom: esActiva && !esHover ? "-2px" : "0px",
          zIndex: esActiva ? 2 : 1,
          transform: esHover ? "scale(1.05)" : "none",
        }}
        className="relative shrink-0 h-8 flex items-center gap-1.5 px-3 text-[10px] font-bold uppercase tracking-wide border border-b-0 rounded-t-sm transition-transform"
      >
        {nombre}
        {contarTab(id) > 0 && <Chip tone="neutral">{contarTab(id)}</Chip>}
      </button>
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
            <button onClick={confirmarCrear} className="text-[#3F6B4A]"><Check size={14} /></button>
            <button onClick={() => { setCreando(false); setNombreNuevo(""); }} className="text-[#B0452E]"><X size={14} /></button>
          </div>
        ) : (
          <button onClick={() => setCreando(true)} className="shrink-0 flex items-center justify-center w-8 h-8 text-[#8A8272]"><Plus size={15} /></button>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-1.5 mb-1">
        <button onClick={() => setEditandoId(activeId)} className="text-[10px] font-bold uppercase tracking-wide text-[#6B6352] flex items-center gap-1">
          <Pencil size={11} /> Renombrar
        </button>
        {activeId !== null && (
          <button
            onClick={() => onDelete(activeId)}
            disabled={contarTab(activeId) > 0}
            className={`text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 ${contarTab(activeId) > 0 ? "text-[#C9C1AE] cursor-not-allowed" : "text-[#B0452E]"}`}
          >
            <Trash2 size={11} /> Eliminar "{tabActivaNombre}"{contarTab(activeId) > 0 ? " (vaciala primero)" : ""}
          </button>
        )}
      </div>
    </div>
  );
}

function KanbanView({ core, setCore, acciones, setAcciones, onOpen, onReprogramar, t, soloTipo }) {
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

  const BUCKET_TABS = [
    ["vencidas", "Vencidas", buckets.vencidas.length, "red"],
    ["hoy", "Hoy", buckets.hoy.length, "amber"],
    ["proximos", `${core.parametros.diasProximos ?? 7} días`, buckets.proximos.length, "neutral"],
    ["todas", "Todas", buckets.todas.length, "slate"],
  ];

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
      {dragging && (
        <p className="text-center text-xs font-bold text-[#B0452E] uppercase tracking-wide mb-1.5 animate-pulse">
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

      <div className="grid grid-cols-4 gap-1 mb-3">
        {BUCKET_TABS.map(([key, label, count, tone]) => (
          <button
            key={key}
            onClick={() => setBucket(key)}
            style={bucket === key ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) } : { backgroundColor: core.tema.botonInactivo, color: core.tema.ink }}
            className="h-8 flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide rounded-sm transition-colors"
          >
            {label}
            {count > 0 && <Chip tone={bucket === key ? "amber" : tone}>{count}</Chip>}
          </button>
        ))}
      </div>

      <div className="border-t border-[#E4DECF] my-3" />

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <button
          onClick={() => setShowNuevoHilo(true)}
          style={{ backgroundColor: "#E8871E", color: "#2A2118" }}
          className="h-8 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 rounded-sm shrink-0"
        >
          <Plus size={14} /> Hilo
        </button>
        <div className="flex items-center rounded-sm overflow-hidden border border-[#E4DECF] shrink-0">
          {[["activos", "Activos"], ["inactivos", "Inactivos"], ["todos", "Todos"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setEstadoFiltro(key)}
              style={estadoFiltro === key ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) } : { backgroundColor: core.tema.tarjeta, color: core.tema.mutedBase }}
              className="h-8 flex items-center text-[10px] font-bold uppercase tracking-wide px-2"
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
                onReprogramar={onReprogramar}
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
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352] mb-2">Sin acción programada ({hilosSinAccion.length})</p>
          <div>
            {hilosSinAccion.map((h, i) => (
              <Fragment key={h.id}>
                {i > 0 && <div className="flex justify-center py-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: core.tema.botonActivo }} /></div>}
                <HiloSinAccionCard hilo={h} core={core} setCore={setCore} acciones={acciones} setAcciones={setAcciones} onOpen={onOpen} />
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

function HiloSinAccionCard({ hilo, core, setCore, acciones, setAcciones, onOpen }) {
  const [showAvanzar, setShowAvanzar] = useState(false);
  const esTarea = hilo.tipo === "tarea";
  const persona = personaPrincipalDeHilo(hilo, core);
  const personasDelHilo = personasActivasDeHilo(hilo, core);
  const empresa = core.empresas.find((e) => e.id === hilo.empresaId);
  const obra = core.obras.find((o) => o.id === hilo.obraId);
  const accionesDelHilo = acciones.filter((a) => a.hiloId === hilo.id);
  const historialCompleto = accionesDelHilo.filter((a) => a.estado === "Realizada").sort(compararRecientePrimero);
  const ultimaNota = historialCompleto[0]?.notaHecho;
  const tareasVinculadas = core.hilos.filter((h) => h.tipo === "tarea" && h.hiloRelacionadoId === hilo.id).length;
  const nombrePrincipal = esTarea ? hilo.titulo : (personasDelHilo.length > 0 ? personasDelHilo.map((p) => p.nombre).join(", ") : etiquetaVinculoHilo(hilo, core));

  return (
    <div className="bg-white border border-[#E4DECF] rounded-sm p-3 relative">
      <span className="absolute -top-px left-4 w-10 h-1.5" style={{ backgroundColor: "#C9C1AE", clipPath: "polygon(8% 0, 92% 0, 100% 100%, 0% 100%)" }} />
      <div className="flex items-start gap-2.5 min-w-0 mt-1">
        <CasillaFinalizar hilo={hilo} acciones={accionesDelHilo} setCore={setCore} size={18} />
        <div
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold"
          style={{ backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) }}
        >
          {esTarea ? <ListChecks size={15} /> : getIniciales(nombrePrincipal)}
        </div>
        <button onClick={() => (esTarea || !persona ? onOpen("hilo", hilo.id) : onOpen("persona", persona.id))} className="text-left min-w-0 flex-1">
          <p className="text-base font-extrabold text-[#2A2118] truncate">{nombrePrincipal}</p>
          {(empresa || obra) && (
            <p className="text-sm mt-0.5 truncate">
              {empresa && <span className="font-bold text-[#2A2118]">{empresa.denominacion}</span>}
              {empresa && obra && <span className="text-[#8A8272]"> · </span>}
              {obra && <span className="text-[#6B6352]">{obra.nombre}</span>}
            </p>
          )}
        </button>
        {persona && <WhatsAppLink persona={persona} size={15} />}
      </div>

      {!esTarea && (
        <div className="mt-2 pt-2 border-t border-dashed border-[#E4DECF]">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#A69C88] mb-0.5">Tema del hilo</p>
          <p className="text-base font-extrabold text-[#2A2118]">{hilo.titulo}</p>
        </div>
      )}

      {ultimaNota && (
        <p className="text-xs text-[#6B6352] italic mt-2 pl-2.5 border-l-2 border-[#E4DECF]">"{ultimaNota}"</p>
      )}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-dashed border-[#E4DECF] flex-wrap">
        {tareasVinculadas > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6B6352] bg-[#F7F5F0] border border-[#E4DECF] rounded-sm px-2 py-1">
            <ListChecks size={11} /> {tareasVinculadas} tarea{tareasVinculadas === 1 ? "" : "s"}
          </span>
        )}
        {personasDelHilo.length > 1 && (
          <span className="flex items-center">
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
      </div>
      <div className="flex items-center gap-2 mt-2">
        <PrimaryBtn core={core} onClick={() => setShowAvanzar(true)}>Avanzar hilo</PrimaryBtn>
        <button onClick={() => onOpen("hilo", hilo.id)} className="rounded-sm px-3.5 py-2.5 font-bold text-sm border border-[#E4DECF] text-[#6B6352]">Ver completo</button>
      </div>
      {showAvanzar && (
        <AvanzarHiloForm
          hilo={hilo}
          pendienteActual={null}
          core={core}
          setCore={setCore}
          acciones={acciones}
          setAcciones={setAcciones}
          onClose={() => setShowAvanzar(false)}
        />
      )}
    </div>
  );
}

function HiloAgendaCard({ accionesBucket, core, setCore, acciones, setAcciones, onOpen, onReprogramar, t, onIniciarDrag, arrastrando }) {
  const [showAvanzar, setShowAvanzar] = useState(false);
  const [verResumen, setVerResumen] = useState(false);
  const [showReprogramar, setShowReprogramar] = useState(false);

  const primary = accionesBucket[0];
  const tipoPrimary = core.tiposAccion.find((tt) => tt.id === primary.tipoAccionId);
  const prioTone = primary.prioridad === "Alta" ? "red" : primary.prioridad === "Media" ? "amber" : "neutral";
  const hilo = core.hilos.find((h) => h.id === primary.hiloId);
  const esTarea = hilo?.tipo === "tarea";
  const persona = hilo ? personaPrincipalDeHilo(hilo, core) : null;
  const personasDelHilo = hilo ? personasActivasDeHilo(hilo, core) : [];
  const empresa = hilo ? core.empresas.find((e) => e.id === hilo.empresaId) : null;
  const obra = hilo ? core.obras.find((o) => o.id === hilo.obraId) : null;

  const accionesDelHilo = hilo ? acciones.filter((a) => a.hiloId === hilo.id) : [];
  const historialCompleto = accionesDelHilo.filter((a) => a.estado === "Realizada").sort(compararRecientePrimero);

  // el color de la solapa refleja la más urgente de todas las pendientes de este bucket
  const masUrgente = accionesBucket.reduce((min, a) => (a.fechaProgramada < min.fechaProgramada ? a : min), primary);
  const diasFaltantes = diasEntre(t, masUrgente.fechaProgramada);
  const diasUrgente = core.parametros.diasUrgente ?? 3;
  const colorBorde = diasFaltantes < 0 ? "#B0452E" : diasFaltantes <= diasUrgente ? "#E8871E" : "#3F6B4A";
  const ultimaNota = historialCompleto[0]?.notaHecho;
  const tareasVinculadas = hilo ? core.hilos.filter((h) => h.tipo === "tarea" && h.hiloRelacionadoId === hilo.id).length : 0;
  const nombrePrincipal = hilo ? (esTarea ? hilo.titulo : (personasDelHilo.length > 0 ? personasDelHilo.map((p) => p.nombre).join(", ") : etiquetaVinculoHilo(hilo, core))) : "";

  return (
    <div
      className="bg-white border border-[#E4DECF] rounded-sm p-3 relative"
      style={{ opacity: arrastrando ? 0.35 : 1 }}
    >
      <span className="absolute -top-px left-4 w-10 h-1.5" style={{ backgroundColor: colorBorde, clipPath: "polygon(8% 0, 92% 0, 100% 100%, 0% 100%)" }} />
      {/* Bloque 1: persona, empresa, obra */}
      <div className="flex items-start gap-2.5 min-w-0 mt-1">
        {hilo && setCore && <CasillaFinalizar hilo={hilo} acciones={accionesDelHilo} setCore={setCore} size={18} />}
        {hilo && (
          <div
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold"
            style={{ backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) }}
          >
            {esTarea ? <ListChecks size={15} /> : getIniciales(nombrePrincipal)}
          </div>
        )}
        <button onClick={() => (esTarea || !persona ? onOpen("hilo", hilo.id) : onOpen("persona", persona.id))} className="text-left min-w-0 flex-1">
          <p className="text-base font-extrabold text-[#2A2118] truncate">{nombrePrincipal}</p>
          {(empresa || obra) && (
            <p className="text-sm mt-0.5 truncate">
              {empresa && <span className="font-bold text-[#2A2118]">{empresa.denominacion}</span>}
              {empresa && obra && <span className="text-[#8A8272]"> · </span>}
              {obra && <span className="text-[#6B6352]">{obra.nombre}</span>}
            </p>
          )}
        </button>
        {persona && <WhatsAppLink persona={persona} size={15} />}
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

      {/* Bloque 2: tema del hilo */}
      {hilo && !esTarea && (
        <div className="mt-2 pt-2 border-t border-dashed border-[#E4DECF]">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#A69C88] mb-0.5">Tema del hilo</p>
          <p className="text-base font-extrabold text-[#2A2118]">{hilo.titulo}</p>
        </div>
      )}

      {ultimaNota && (
        <p className="text-xs text-[#6B6352] italic mt-2 pl-2.5 border-l-2 border-[#E4DECF]">"{ultimaNota}"</p>
      )}

      {/* Bloque 3: actividad programada */}
      {primary.notaPlanificada && (
        <p className="text-xs font-bold text-[#2A2118] mt-2 pt-2 border-t border-dashed border-[#E4DECF]">{primary.notaPlanificada}</p>
      )}

      {accionesBucket.length > 1 && (
        <p className="text-[10px] text-[#B0452E] font-bold uppercase tracking-wide mt-1.5">⚠ Este hilo tiene {accionesBucket.length} acciones pendientes a la vez — revisalo, no debería pasar.</p>
      )}

      {hilo && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-dashed border-[#E4DECF] flex-wrap">
          {tareasVinculadas > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6B6352] bg-[#F7F5F0] border border-[#E4DECF] rounded-sm px-2 py-1">
              <ListChecks size={11} /> {tareasVinculadas} tarea{tareasVinculadas === 1 ? "" : "s"}
            </span>
          )}
          {personasDelHilo.length > 1 && (
            <span className="flex items-center">
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
          {tipoPrimary && <span className="text-xs font-mono text-[#6B6352] whitespace-nowrap">{tipoPrimary.nombre}</span>}
          <span className="text-[11px] font-bold font-mono px-2 py-1 rounded-sm bg-[#F1DFB9] text-[#5C3F18]">
            Próx. {fmtDate(masUrgente.fechaProgramada)}
          </span>
          <IconBtn label="Reprogramar" onClick={() => setShowReprogramar(true)}><Pencil size={13} /></IconBtn>
          {primary.recurrente && <Repeat size={12} className="text-[#8A8272] shrink-0" />}
          {primary.prioridad && <Chip tone={prioTone}>{primary.prioridad}</Chip>}
        </div>
      )}

      {hilo && (
        <div className="flex items-center gap-2 mt-2">
          <PrimaryBtn core={core} onClick={() => setShowAvanzar(true)}>Avanzar hilo</PrimaryBtn>
          <button
            onClick={() => onOpen("hilo", hilo.id)}
            className="rounded-sm px-3.5 py-2.5 font-bold text-sm border border-[#E4DECF] text-[#6B6352]"
          >
            Ver completo
          </button>
          <button
            onClick={() => setVerResumen((v) => !v)}
            className="flex items-center gap-1 text-xs font-bold text-[#B0452E]"
          >
            Resumen {verResumen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      )}

      <p className="text-right text-[9px] font-mono text-[#C9C1AE] mt-1">{fmtNumero(primary.numero)}</p>

      {showReprogramar && (
        <ReprogramarModal
          fechaActual={primary.fechaProgramada}
          core={core}
          onClose={() => setShowReprogramar(false)}
          onSave={(nuevaFecha) => { onReprogramar(primary.id, nuevaFecha); setShowReprogramar(false); }}
        />
      )}

      {verResumen && hilo && (
        <div className="mt-2 pt-2 border-t border-dashed border-[#E4DECF]">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352] mb-1.5">Historial</p>
          {historialCompleto.length === 0 ? (
            <p className="text-xs text-[#A69C88]">Todavía no hay acciones anteriores en este hilo.</p>
          ) : (
            <div className="space-y-1.5">
              {historialCompleto.map((a) => (
                <div key={a.id} className="text-xs">
                  <span className="font-mono text-[#8A8272]">{fmtDate(a.fechaRealizada)}</span>{" "}
                  <span className="text-[#6B6352]">{a.notaHecho || core.tiposAccion.find((tt) => tt.id === a.tipoAccionId)?.nombre}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showAvanzar && hilo && (
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
        <div className="bg-[#FBEEE7] border border-[#E8871E] rounded-sm p-2.5 mb-3">
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
      personaEmpresa: prev.personaEmpresa.filter((r) => r.personaId !== id),
      entidadEtiqueta: prev.entidadEtiqueta.filter((r) => !(r.entidadTipo === "Persona" && r.entidadId === id)),
    }));
  };

  return (
    <div>
      {(googleEstado === "noConectado" || googleEstado === "reconectar" || googleEstado === "error") && (
        <div className="bg-white border border-[#E4DECF] rounded-sm p-3 mb-3 flex items-center justify-between gap-2">
          <p className="text-xs text-[#6B6352]">
            {googleEstado === "reconectar"
              ? "Tu conexión con Google Contacts venció."
              : googleEstado === "error"
              ? "No se pudo conectar con Google. Probá de nuevo."
              : "Traé tus contactos automáticamente desde Google (nombre y teléfono)."}
          </p>
          <button onClick={conectarGoogle} className="shrink-0 bg-[#E8871E] text-[#2A2118] rounded-sm px-3 py-1.5 font-bold text-xs">
            {googleEstado === "reconectar" ? "Reconectar" : "Conectar Google"}
          </button>
        </div>
      )}
      {googleEstado === "sinEtiqueta" && (
        <div className="bg-[#FBEEE7] border border-[#E8871E] rounded-sm p-3 mb-3">
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
        <button onClick={() => setModal({})} className="shrink-0 bg-[#E8871E] text-[#2A2118] rounded-sm px-3.5 py-2 font-bold"><Plus size={18} /></button>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<Users size={26} />} text="No hay personas cargadas todavía." />
      ) : (
        <div className="space-y-2">
          {list.map((p) => {
            const empresas = core.personaEmpresa.filter((r) => r.personaId === p.id).map((r) => core.empresas.find((e) => e.id === r.empresaId)?.denominacion).filter(Boolean);
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
                    <p className="font-semibold text-[#2A2118] truncate">{p.nombre}</p>
                    <p className="text-xs text-[#8A8272] truncate">{empresas.length ? empresas.join(", ") : "Sin empresa vinculada"}</p>
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

      {modal !== null && <PersonaForm initial={modal} onSave={savePersona} onDelete={modal.id ? () => { deletePersona(modal.id); setModal(null); } : null} onClose={() => setModal(null)} />}
      {deletingId && (
        <Modal title="¿Eliminar esta persona?" onClose={() => setDeletingId(null)}>
          <p className="text-sm text-[#2A2118] mb-4">Se borra la persona, sus vínculos con empresas, sus etiquetas y no se toca su historial de acciones (queda huérfano, referenciado por un id inexistente). No se puede deshacer.</p>
          <div className="flex gap-2">
            <button onClick={() => setDeletingId(null)} className="flex-1 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#6B6352]">Cancelar</button>
            <button onClick={() => { deletePersona(deletingId); setDeletingId(null); }} style={{ backgroundColor: "#B0452E", color: "#FFFFFF" }} className="flex-1 rounded-sm py-2.5 font-bold text-sm">Sí, eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PersonaForm({ initial, onSave, onDelete, onClose }) {
  const [nombre, setNombre] = useState(initial.nombre || "");
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp || "");
  const [direccion, setDireccion] = useState(initial.direccion || "");
  const [ciudad, setCiudad] = useState(initial.ciudad || "");
  const [notas, setNotas] = useState(initial.notas || "");

  const submit = () => {
    if (!nombre.trim()) return;
    onSave({ id: initial.id || uid("P"), nombre: nombre.trim(), whatsapp, direccion, ciudad, notas });
  };

  return (
    <Modal title={initial.id ? "Editar persona" : "Nueva persona"} onClose={onClose}>
      <Field label="Nombre *"><input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
      <Field label="WhatsApp"><input className={inputCls} placeholder="0351 15-555-1234" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /></Field>
      <Field label="Dirección"><input className={inputCls} value={direccion} onChange={(e) => setDireccion(e.target.value)} /></Field>
      <Field label="Ciudad"><input className={inputCls} value={ciudad} onChange={(e) => setCiudad(e.target.value)} /></Field>
      <Field label="Notas generales"><textarea className={inputCls} rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} /></Field>
      <div className="flex gap-2 mt-2">
        <PrimaryBtn onClick={submit} full>Guardar</PrimaryBtn>
        {onDelete && <button onClick={onDelete} className="shrink-0 border border-[#E4DECF] rounded-sm px-3 text-[#B0452E]"><Trash2 size={16} /></button>}
      </div>
    </Modal>
  );
}

function PersonaDetail({ id, core, setCore, acciones, setAcciones, onClose, onOpen }) {
  const persona = core.personas.find((p) => p.id === id);
  const [showRel, setShowRel] = useState(false);
  const [editRel, setEditRel] = useState(null);
  const [showNuevoHilo, setShowNuevoHilo] = useState(false);
  const [verCerrados, setVerCerrados] = useState(false);

  if (!persona) return <div><BackHeader onClose={onClose} /><p className="text-sm text-[#8A8272]">Esta persona ya no existe.</p></div>;

  const relEmpresas = core.personaEmpresa.filter((r) => r.personaId === id);

  const hilosDePersona = core.hilos.filter((h) => participantesActivos(h).some((p) => p.personaId === id));
  const hilosActivos = hilosDePersona.filter((h) => h.estado === "Activo");
  const hilosCerrados = hilosDePersona.filter((h) => h.estado === "Cerrado");

  const removeRel = (relId) => setCore((prev) => ({ ...prev, personaEmpresa: prev.personaEmpresa.filter((r) => r.id !== relId) }));
  const updateRel = (relId, cambios) => setCore((prev) => ({ ...prev, personaEmpresa: prev.personaEmpresa.map((r) => (r.id === relId ? { ...r, ...cambios } : r)) }));

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

        <div className="border-t border-dashed border-[#E4DECF] mt-3 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352]">Empresas vinculadas</p>
            <button onClick={() => setShowRel(true)} className="text-xs font-bold text-[#B0452E]">+ Vincular</button>
          </div>
          {relEmpresas.length === 0 ? (
            <p className="text-sm text-[#A69C88]">Sin empresas vinculadas.</p>
          ) : (
            <div className="space-y-1.5">
              {relEmpresas.map((r) => {
                const emp = core.empresas.find((e) => e.id === r.empresaId);
                if (!emp) return null;
                return (
                  <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <button onClick={() => onOpen("empresa", emp.id)} className="text-left flex-1 min-w-0">
                      <span className="font-semibold text-[#2A2118]">{emp.denominacion}</span>
                      <span className="text-[#8A8272]"> · {(core.cargos || []).find((c) => c.id === r.cargoId)?.nombre || "sin cargo"}</span>
                      {r.principal && <span className="ml-1"><Star size={11} className="inline text-[#E8871E]" /></span>}
                    </button>
                    <IconBtn label="Editar cargo" onClick={() => setEditRel(r)}><Pencil size={14} /></IconBtn>
                    <IconBtn label="Quitar vínculo" danger onClick={() => removeRel(r.id)}><X size={14} /></IconBtn>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352]">Hilos de seguimiento</p>
        <button onClick={() => setShowNuevoHilo(true)} className="text-xs font-bold text-[#B0452E] flex items-center gap-1"><Plus size={12} /> Nuevo hilo</button>
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
          <button onClick={() => setVerCerrados((v) => !v)} className="text-xs font-bold text-[#6B6352] flex items-center gap-1">
            {verCerrados ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Ver hilos cerrados ({hilosCerrados.length})
          </button>
          {verCerrados && (
            <div className="space-y-2 mt-2">
              {hilosCerrados.map((h) => <HiloRow key={h.id} hilo={h} core={core} acciones={acciones} onOpen={onOpen} />)}
            </div>
          )}
        </div>
      )}

      {showRel && (
        <VincularEmpresaForm
          core={core}
          setCore={setCore}
          onClose={() => setShowRel(false)}
          onSave={(rel) => { setCore((prev) => ({ ...prev, personaEmpresa: [...prev.personaEmpresa, { ...rel, personaId: id, id: uid("pe") }] })); setShowRel(false); }}
        />
      )}
      {editRel && (
        <EditRelacionForm
          core={core}
          setCore={setCore}
          relacion={editRel}
          onClose={() => setEditRel(null)}
          onSave={(cambios) => { updateRel(editRel.id, cambios); setEditRel(null); }}
        />
      )}
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
    </div>
  );
}

function HiloRow({ hilo, core, acciones, onOpen }) {
  const empresa = core.empresas.find((e) => e.id === hilo.empresaId);
  const obra = core.obras.find((o) => o.id === hilo.obraId);
  const accionesDelHilo = acciones.filter((a) => a.hiloId === hilo.id);
  const pendiente = accionesDelHilo.find((a) => a.estado === "Pendiente");
  const tipoPendiente = pendiente ? core.tiposAccion.find((t) => t.id === pendiente.tipoAccionId) : null;
  const tareasVinculadas = core.hilos.filter((h) => h.tipo === "tarea" && h.hiloRelacionadoId === hilo.id).length;
  return (
    <button onClick={() => onOpen("hilo", hilo.id)} className="w-full text-left bg-white border border-[#E4DECF] rounded-sm p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-[#2A2118] truncate">{hilo.titulo}</p>
          <p className="text-xs text-[#8A8272] mt-0.5">{[empresa?.denominacion, obra?.nombre].filter(Boolean).join(" · ") || "Sin empresa/obra"}</p>
        </div>
        <Chip tone={hilo.estado === "Activo" ? "green" : "neutral"}>{hilo.estado}</Chip>
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
    </button>
  );
}

function EditRelacionForm({ core, setCore, relacion, onClose, onSave }) {
  const [cargoId, setCargoId] = useState(relacion.cargoId || (core.cargos || [])[0]?.id || "");
  const [principal, setPrincipal] = useState(!!relacion.principal);
  return (
    <Modal title="Editar vínculo" onClose={onClose}>
      <SelectConCrear
        label="Cargo"
        opciones={core.cargos || []}
        value={cargoId}
        onChange={setCargoId}
        placeholderCrear="Ej: Encargado de compras"
        onCrear={(nombre) => {
          const nuevo = { id: uid("C"), nombre };
          setCore((prev) => ({ ...prev, cargos: [...(prev.cargos || []), nuevo] }));
          return nuevo;
        }}
      />
      <label className="flex items-center gap-2 mb-3 text-sm text-[#2A2118]">
        <input type="checkbox" checked={principal} onChange={(e) => setPrincipal(e.target.checked)} /> Es el contacto principal de esta empresa
      </label>
      <PrimaryBtn full onClick={() => onSave({ cargoId, principal })}>Guardar</PrimaryBtn>
    </Modal>
  );
}

function VerContextoOrigen({ accion, acciones }) {
  const [ver, setVer] = useState(false);
  const origen = accion.origenId ? (acciones || []).find((a) => a.id === accion.origenId) : null;
  return (
    <div className="mt-1.5">
      <button onClick={() => setVer((v) => !v)} className="text-[10px] font-bold uppercase tracking-wide text-[#B0452E] flex items-center gap-0.5">
        {ver ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {ver ? "Ocultar contexto" : "Ver contexto"}
      </button>
      {ver && (
        <p className="text-xs text-[#6B6352] mt-1">
          <span className="font-bold text-[#8A8272]">Se generó a partir de:</span>{" "}
          {origen ? (origen.notaHecho || "Sin registro.") : "Es la primera acción de este hilo."}
        </p>
      )}
    </div>
  );
}

function AccionCard({ accion, acciones, core, onEdit, onDelete }) {
  const [verContexto, setVerContexto] = useState(false);
  const tipo = core.tiposAccion.find((t) => t.id === accion.tipoAccionId);
  const isPend = accion.estado === "Pendiente";
  const prioTone = accion.prioridad === "Alta" ? "red" : accion.prioridad === "Media" ? "amber" : "neutral";
  const destino = accion.destinoId ? (acciones || []).find((a) => a.id === accion.destinoId) : null;
  return (
    <div className={`border-l-4 ${isPend ? "border-[#E8871E]" : "border-[#3F6B4A]"} border-y border-r border-[#E4DECF] rounded-sm p-3`} style={{ backgroundColor: isPend ? "#FFFFFF" : "#F2F1EF" }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Chip tone={isPend ? "amber" : "green"}>{accion.estado}</Chip>
          {tipo && <span className="text-sm font-semibold text-[#2A2118]">{tipo.nombre}</span>}
          <span className="text-[9px] font-mono text-[#C9C1AE]">{fmtNumero(accion.numero)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[#8A8272]">{fmtDate(isPend ? accion.fechaProgramada : accion.fechaRealizada)}</span>
          {onEdit && <IconBtn label="Editar acción" onClick={onEdit}><Pencil size={13} /></IconBtn>}
          {onDelete && <IconBtn label="Eliminar acción" danger onClick={onDelete}><Trash2 size={13} /></IconBtn>}
        </div>
      </div>
      {accion.notaHecho && <p className="text-sm text-[#6B6352] mt-1.5">{accion.notaHecho}</p>}
      <div className="flex items-center gap-2 mt-1.5">
        {accion.prioridad && <Chip tone={prioTone}>{accion.prioridad}</Chip>}
        {accion.recurrente && <span className="text-[10px] text-[#8A8272] flex items-center gap-1"><Repeat size={11} /> cada {accion.repiteCadaN} {accion.repiteUnidad}</span>}
        <button onClick={() => setVerContexto((v) => !v)} className="text-[10px] font-bold uppercase tracking-wide text-[#B0452E] flex items-center gap-0.5 ml-auto">
          {verContexto ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {verContexto ? "Ocultar contexto" : "Ver contexto"}
        </button>
      </div>
      {verContexto && (
        <div className="mt-2 pt-2 border-t border-[#EFEBE0] space-y-1.5">
          <p className="text-xs text-[#6B6352]"><span className="font-bold text-[#8A8272]">Se había planificado:</span> {accion.notaPlanificada || "Sin registro."}</p>
          <p className="text-xs text-[#6B6352]"><span className="font-bold text-[#8A8272]">Se hizo:</span> {accion.notaHecho || "Sin registro."}</p>
          <p className="text-xs text-[#6B6352]"><span className="font-bold text-[#8A8272]">Se planificó:</span> {destino ? (destino.notaPlanificada || "Sin registro.") : "No se generó una próxima acción en ese momento."}</p>
        </div>
      )}
    </div>
  );
}

function VincularEmpresaForm({ core, setCore, onClose, onSave }) {
  const [modo, setModo] = useState("existente"); // 'existente' | 'nueva'
  const [empresaId, setEmpresaId] = useState(core.empresas[0]?.id || "");
  const [nombreNueva, setNombreNueva] = useState("");
  const [direccionNueva, setDireccionNueva] = useState("");
  const [ciudadNueva, setCiudadNueva] = useState("");
  const [cargoId, setCargoId] = useState((core.cargos || [])[0]?.id || "");
  const [principal, setPrincipal] = useState(false);

  const submit = () => {
    if (modo === "existente") {
      if (!empresaId) return;
      onSave({ empresaId, cargoId, principal });
    } else {
      if (!nombreNueva.trim()) return;
      const nueva = { id: uid("E"), denominacion: nombreNueva.trim(), direccion: direccionNueva, ciudad: ciudadNueva };
      setCore((prev) => ({ ...prev, empresas: [nueva, ...prev.empresas] }));
      onSave({ empresaId: nueva.id, cargoId, principal });
    }
  };

  return (
    <Modal title="Vincular a una empresa" onClose={onClose}>
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setModo("existente")}
          style={{ backgroundColor: modo === "existente" ? "#2A2F36" : "#E7E2D8", color: modo === "existente" ? "#FFFFFF" : "#6B6352" }}
          className="flex-1 py-2 rounded-sm text-sm font-bold"
        >Empresa existente</button>
        <button
          type="button"
          onClick={() => setModo("nueva")}
          style={{ backgroundColor: modo === "nueva" ? "#2A2F36" : "#E7E2D8", color: modo === "nueva" ? "#FFFFFF" : "#6B6352" }}
          className="flex-1 py-2 rounded-sm text-sm font-bold"
        >Agregar empresa</button>
      </div>

      {modo === "existente" ? (
        <Field label="Empresa">
          <select className={inputCls} value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
            {core.empresas.map((e) => <option key={e.id} value={e.id}>{e.denominacion}</option>)}
          </select>
        </Field>
      ) : (
        <>
          <Field label="Denominación *"><input className={inputCls} value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} /></Field>
          <Field label="Dirección"><input className={inputCls} value={direccionNueva} onChange={(e) => setDireccionNueva(e.target.value)} /></Field>
          <Field label="Ciudad"><input className={inputCls} value={ciudadNueva} onChange={(e) => setCiudadNueva(e.target.value)} /></Field>
        </>
      )}

      <SelectConCrear
        label="Cargo"
        opciones={core.cargos || []}
        value={cargoId}
        onChange={setCargoId}
        placeholderCrear="Ej: Encargado de compras"
        onCrear={(nombre) => {
          const nuevo = { id: uid("C"), nombre };
          setCore((prev) => ({ ...prev, cargos: [...(prev.cargos || []), nuevo] }));
          return nuevo;
        }}
      />
      <label className="flex items-center gap-2 mb-3 text-sm text-[#2A2118]">
        <input type="checkbox" checked={principal} onChange={(e) => setPrincipal(e.target.checked)} /> Es el contacto principal de esta empresa
      </label>
      <PrimaryBtn full onClick={submit}>Vincular</PrimaryBtn>
    </Modal>
  );
}

// Agrega una persona (existente o nueva) como participante de un hilo ya creado.
function AgregarPersonaAlHiloForm({ core, setCore, hilo, personasDelHilo, agregarPersona, onClose }) {
  const [modo, setModo] = useState("existente"); // 'existente' | 'nueva'
  const [nombreNueva, setNombreNueva] = useState("");
  const disponibles = core.personas.filter((p) => !participantesActivos(hilo).some((pa) => pa.personaId === p.id));

  const crearYAgregar = () => {
    if (!nombreNueva.trim()) return;
    const nueva = { id: uid("P"), nombre: nombreNueva.trim(), whatsapp: "", direccion: "", ciudad: "", notas: "" };
    setCore((prev) => ({ ...prev, personas: [nueva, ...prev.personas] }));
    agregarPersona(nueva.id, personasDelHilo.length === 0);
    onClose();
  };

  return (
    <>
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setModo("existente")}
          style={{ backgroundColor: modo === "existente" ? "#2A2F36" : "#E7E2D8", color: modo === "existente" ? "#FFFFFF" : "#6B6352" }}
          className="flex-1 py-2 rounded-sm text-sm font-bold"
        >Persona existente</button>
        <button
          type="button"
          onClick={() => setModo("nueva")}
          style={{ backgroundColor: modo === "nueva" ? "#2A2F36" : "#E7E2D8", color: modo === "nueva" ? "#FFFFFF" : "#6B6352" }}
          className="flex-1 py-2 rounded-sm text-sm font-bold"
        >Nueva persona</button>
      </div>
      {modo === "existente" ? (
        disponibles.length === 0 ? (
          <p className="text-sm text-[#A69C88]">No hay más personas para agregar (o ya están todas vinculadas) — probá creando una nueva.</p>
        ) : (
          <div className="space-y-1.5">
            {disponibles.map((p) => (
              <button
                key={p.id}
                onClick={() => { agregarPersona(p.id, personasDelHilo.length === 0); onClose(); }}
                className="w-full text-left bg-[#F7F5F0] border border-[#E4DECF] rounded-sm p-2.5 text-sm font-semibold text-[#2A2118]"
              >
                {p.nombre}
              </button>
            ))}
          </div>
        )
      ) : (
        <>
          <Field label="Nombre *"><input autoFocus className={inputCls} value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} /></Field>
          <PrimaryBtn full onClick={crearYAgregar}>Crear y agregar</PrimaryBtn>
        </>
      )}
    </>
  );
}

function HiloDetail({ id, core, setCore, acciones, setAcciones, onClose, onOpen }) {
  const hilo = core.hilos.find((h) => h.id === id);
  const [showAvanzar, setShowAvanzar] = useState(false);
  const [showReprogramar, setShowReprogramar] = useState(false);
  const [showEditarTitulo, setShowEditarTitulo] = useState(false);
  const [showVincularCliente, setShowVincularCliente] = useState(false);
  const [showAgregarTarea, setShowAgregarTarea] = useState(false);
  const [editingAccion, setEditingAccion] = useState(null);
  const [deletingAccionId, setDeletingAccionId] = useState(null);
  const [showFechaTarea, setShowFechaTarea] = useState(false);
  const [showAgregarPersona, setShowAgregarPersona] = useState(false);
  const [verHistorialPersonas, setVerHistorialPersonas] = useState(false);

  if (!hilo) return <div><BackHeader onClose={onClose} /><p className="text-sm text-[#8A8272]">Este hilo ya no existe.</p></div>;

  const esTarea = hilo.tipo === "tarea";
  const personasDelHilo = personasActivasDeHilo(hilo, core);
  const persona = personasDelHilo[0] || null;
  const empresa = core.empresas.find((e) => e.id === hilo.empresaId);
  const obra = core.obras.find((o) => o.id === hilo.obraId);
  const hiloRelacionado = hilo.hiloRelacionadoId ? core.hilos.find((h) => h.id === hilo.hiloRelacionadoId) : null;
  const personaRelacionada = hiloRelacionado ? personaPrincipalDeHilo(hiloRelacionado, core) : null;
  const tareasVinculadas = core.hilos.filter((h) => h.tipo === "tarea" && h.hiloRelacionadoId === id);
  const accionesDelHilo = acciones.filter((a) => a.hiloId === id);
  const pendienteActual = accionesDelHilo.filter((a) => a.estado === "Pendiente").sort((a, b) => (a.fechaProgramada < b.fechaProgramada ? -1 : 1))[0] || null;
  const historial = accionesDelHilo.filter((a) => a.estado === "Realizada").sort(compararRecientePrimero);
  const tipoPendiente = pendienteActual ? core.tiposAccion.find((t) => t.id === pendienteActual.tipoAccionId) : null;
  const prioTone = pendienteActual?.prioridad === "Alta" ? "red" : pendienteActual?.prioridad === "Media" ? "amber" : "neutral";

  const participantesInactivos = (hilo.participantes || []).filter((p) => p.hasta).sort((a, b) => (b.hasta || "").localeCompare(a.hasta || ""));

  const toggleEstadoHilo = () => setCore((prev) => ({ ...prev, hilos: prev.hilos.map((h) => (h.id === id ? { ...h, estado: h.estado === "Activo" ? "Cerrado" : "Activo" } : h)) }));
  const marcarPrincipal = (partId) => setCore((prev) => ({
    ...prev,
    hilos: prev.hilos.map((h) => (h.id === id ? { ...h, participantes: h.participantes.map((p) => ({ ...p, principal: p.id === partId })) } : h)),
  }));
  const desvincularParticipante = (partId) => setCore((prev) => ({
    ...prev,
    hilos: prev.hilos.map((h) => (h.id === id ? { ...h, participantes: h.participantes.map((p) => (p.id === partId ? { ...p, hasta: todayISO(), principal: false } : p)) } : h)),
  }));
  const desvincularTarea = (tareaId) => setCore((prev) => ({
    ...prev,
    hilos: prev.hilos.map((h) => (h.id === tareaId ? { ...h, hiloRelacionadoId: null } : h)),
  }));
  const agregarPersona = (personaId, comoPrincipal) => setCore((prev) => ({
    ...prev,
    hilos: prev.hilos.map((h) => {
      if (h.id !== id) return h;
      const yaActivo = participantesActivos(h).some((p) => p.personaId === personaId);
      if (yaActivo) return h;
      const nuevos = comoPrincipal ? h.participantes.map((p) => (p.hasta ? p : { ...p, principal: false })) : h.participantes;
      return { ...h, participantes: [...nuevos, { id: uid("part"), personaId, desde: todayISO(), hasta: null, principal: comoPrincipal || participantesActivos(h).length === 0 }] };
    }),
  }));
  const updateAccion = (accId, cambios) => setAcciones((prev) => prev.map((a) => (a.id === accId ? { ...a, ...cambios } : a)));
  const deleteAccion = (accId) => setAcciones((prev) => prev.filter((a) => a.id !== accId));
  const reprogramar = (nuevaFecha) => { if (pendienteActual) updateAccion(pendienteActual.id, { fechaProgramada: nuevaFecha }); setShowReprogramar(false); };

  const colorSolapa = !pendienteActual
    ? "#C9C1AE"
    : diasEntre(todayISO(), pendienteActual.fechaProgramada) < 0
    ? "#B0452E"
    : diasEntre(todayISO(), pendienteActual.fechaProgramada) <= (core.parametros.diasUrgente ?? 3)
    ? "#E8871E"
    : "#3F6B4A";
  const nombrePrincipalHilo = esTarea ? hilo.titulo : (personasDelHilo.length > 0 ? personasDelHilo.map((p) => p.nombre).join(", ") : etiquetaVinculoHilo(hilo, core));

  return (
    <div>
      <BackHeader onClose={onClose} />
      <div className="bg-white border border-[#E4DECF] rounded-sm p-4 mb-3 relative">
        <span className="absolute -top-px left-4 w-10 h-1.5" style={{ backgroundColor: colorSolapa, clipPath: "polygon(8% 0, 92% 0, 100% 100%, 0% 100%)" }} />
        <div className="flex items-start justify-between gap-2 mt-1">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            <CasillaFinalizar hilo={hilo} acciones={accionesDelHilo} setCore={setCore} size={22} />
            <div
              className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold"
              style={{ backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) }}
            >
              {esTarea ? <ListChecks size={17} /> : getIniciales(nombrePrincipalHilo)}
            </div>
            <h2 className="text-lg font-extrabold text-[#2A2118] flex-1 min-w-0">{hilo.titulo}</h2>
          </div>
          <Chip tone={hilo.estado === "Activo" ? "green" : "neutral"}>{hilo.estado}</Chip>
        </div>
        <p className="text-xs text-[#8A8272] mt-1">
          {personasDelHilo.length > 0 && (
            <>
              {personasDelHilo.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  <button onClick={() => onOpen("persona", p.id)} className="font-semibold text-[#2A2118] underline underline-offset-2">{p.nombre}</button>
                </span>
              ))}
              {" "}<WhatsAppLink persona={persona} size={13} />
            </>
          )}
          {(empresa || obra) && <> · {[empresa?.denominacion, obra?.nombre].filter(Boolean).join(" · ")}</>}
        </p>
        <p className="text-xs text-[#A69C88] mt-1">
          {accionesDelHilo.length} acci{accionesDelHilo.length === 1 ? "ón" : "ones"} en este hilo
          {tareasVinculadas.length > 0 && ` · ${tareasVinculadas.length} tarea${tareasVinculadas.length === 1 ? "" : "s"} vinculada${tareasVinculadas.length === 1 ? "" : "s"}`}
        </p>
        {hilo.estado === "Cerrado" && hilo.notaCierre && (
          <p className="text-xs text-[#6B6352] mt-2 italic bg-white/60 rounded-sm p-2">"{hilo.notaCierre}"</p>
        )}
        <div className="flex gap-2 mt-3">
          <button onClick={toggleEstadoHilo} className="text-xs font-bold uppercase tracking-wide px-2.5 py-1.5 rounded-sm bg-[#E7E2D8] text-[#6B6352] flex items-center gap-1">
            {hilo.estado === "Activo" ? <><Archive size={12} /> Cerrar hilo</> : <><GitBranch size={12} /> Reabrir hilo</>}
          </button>
          <button onClick={() => setShowEditarTitulo(true)} className="text-xs font-bold uppercase tracking-wide px-2.5 py-1.5 rounded-sm bg-[#E7E2D8] text-[#6B6352] flex items-center gap-1">
            <Pencil size={12} /> Editar título
          </button>
        </div>

      {hilo.tipo === "cliente" && (
        <div className="border-t border-dashed border-[#E4DECF] mt-3 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352]">Personas vinculadas</p>
            <button onClick={() => setShowAgregarPersona(true)} className="text-xs font-bold text-[#B0452E]">+ Agregar persona</button>
          </div>
          {personasDelHilo.length === 0 ? (
            <p className="text-sm text-[#A69C88]">Sin personas vinculadas todavía.</p>
          ) : (
            <div className="space-y-1.5">
              {participantesActivos(hilo).sort((a, b) => (b.principal ? 1 : 0) - (a.principal ? 1 : 0)).map((part) => {
                const p = core.personas.find((pp) => pp.id === part.personaId);
                if (!p) return null;
                return (
                  <div key={part.id} className="flex items-center justify-between gap-2 text-sm">
                    <button onClick={() => onOpen("persona", p.id)} className="text-left flex-1 min-w-0">
                      <span className="font-semibold text-[#2A2118]">{p.nombre}</span>
                      {part.principal && <Star size={11} className="inline text-[#E8871E] ml-1" />}
                      <span className="text-xs text-[#A69C88]"> · desde {fmtDate(part.desde)}</span>
                    </button>
                    <div className="flex items-center gap-1">
                      {!part.principal && (
                        <IconBtn label="Marcar principal" onClick={() => marcarPrincipal(part.id)}><Star size={14} /></IconBtn>
                      )}
                      <IconBtn label="Desvincular" danger onClick={() => desvincularParticipante(part.id)}><X size={14} /></IconBtn>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {participantesInactivos.length > 0 && (
            <div className="mt-2">
              <button onClick={() => setVerHistorialPersonas((v) => !v)} className="text-[11px] font-bold text-[#6B6352] flex items-center gap-1">
                {verHistorialPersonas ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {verHistorialPersonas ? "Ocultar" : "Ver"} historial de interlocutores ({participantesInactivos.length})
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
        </div>
      )}

      {hilo.tipo === "tarea" && (
        <div className="border-t border-dashed border-[#E4DECF] mt-3 pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352] mb-2">Vínculo con un cliente (opcional)</p>
          {hiloRelacionado ? (
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => onOpen("hilo", hiloRelacionado.id)} className="text-left text-sm">
                <span className="font-semibold text-[#2A2118]">{hiloRelacionado.titulo}</span>
                {personaRelacionada && <span className="text-[#8A8272]"> · {personaRelacionada.nombre}</span>}
              </button>
              <IconBtn label="Desvincular" danger onClick={() => setCore((prev) => ({ ...prev, hilos: prev.hilos.map((h) => (h.id === id ? { ...h, hiloRelacionadoId: null } : h)) }))}><X size={14} /></IconBtn>
            </div>
          ) : (
            <button onClick={() => setShowVincularCliente(true)} className="text-xs font-bold text-[#B0452E]">+ Vincular a un hilo de cliente</button>
          )}
        </div>
      )}

      {hilo.tipo === "cliente" && (
        <div className="border-t border-dashed border-[#E4DECF] mt-3 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352]">Tareas vinculadas</p>
            <button onClick={() => setShowAgregarTarea(true)} className="text-xs font-bold text-[#B0452E]">+ Agregar tarea</button>
          </div>
          {tareasVinculadas.length === 0 ? (
            <p className="text-sm text-[#A69C88]">Sin tareas vinculadas todavía.</p>
          ) : (
            <div className="space-y-1.5">
              {tareasVinculadas.map((tv) => (
                <div key={tv.id} className="flex items-center justify-between gap-2 text-sm">
                  <button onClick={() => onOpen("hilo", tv.id)} className="text-left flex-1 min-w-0 flex items-center gap-1.5">
                    <span className={tv.estado === "Cerrado" ? "line-through text-[#A69C88]" : "text-[#2A2118] font-semibold"}>{tv.titulo}</span>
                    {tv.estado === "Cerrado" && <Chip tone="neutral">Cerrada</Chip>}
                  </button>
                  <IconBtn label="Desvincular" danger onClick={() => desvincularTarea(tv.id)}><X size={14} /></IconBtn>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </div>

      <div className="bg-white border border-[#E4DECF] rounded-sm p-3 mb-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352] mb-2">Próxima acción</p>
        {pendienteActual ? (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm font-semibold text-[#2A2118]">{tipoPendiente ? `${tipoPendiente.nombre} · ` : ""}{fmtDateHora(pendienteActual.fechaProgramada, pendienteActual.horaProgramada)} <span className="text-[9px] font-mono text-[#C9C1AE]">{fmtNumero(pendienteActual.numero)}</span></span>
              {pendienteActual.prioridad && <Chip tone={prioTone}>{pendienteActual.prioridad}</Chip>}
            </div>
            {pendienteActual.notaPlanificada && <p className="text-sm text-[#6B6352] mt-1.5">"{pendienteActual.notaPlanificada}"</p>}
            {pendienteActual.recurrente && <p className="text-[10px] text-[#8A8272] flex items-center gap-1 mt-1"><Repeat size={11} /> cada {pendienteActual.repiteCadaN} {pendienteActual.repiteUnidad}</p>}
            <VerContextoOrigen accion={pendienteActual} acciones={accionesDelHilo} />
            <div className="flex gap-2 mt-3 flex-wrap">
              <PrimaryBtn core={core} onClick={() => setShowAvanzar(true)}>Avanzar este hilo</PrimaryBtn>
              {esTarea ? (
                <button onClick={() => setShowFechaTarea(true)} className="text-xs font-bold uppercase tracking-wide px-2.5 py-2 rounded-sm bg-[#E7E2D8] text-[#6B6352]">Editar fecha y hora</button>
              ) : (
                <button onClick={() => setShowReprogramar(true)} className="text-xs font-bold uppercase tracking-wide px-2.5 py-2 rounded-sm bg-[#E7E2D8] text-[#6B6352]">Reprogramar</button>
              )}
              <IconBtn label="Editar" onClick={() => setEditingAccion(pendienteActual)}><Pencil size={16} /></IconBtn>
              <IconBtn label="Eliminar" danger onClick={() => setDeletingAccionId(pendienteActual.id)}><Trash2 size={16} /></IconBtn>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-[#A69C88]">Sin próxima acción programada.</p>
            <div className="flex gap-2 flex-wrap">
              <PrimaryBtn core={core} onClick={() => setShowAvanzar(true)}>Avanzar este hilo</PrimaryBtn>
              {esTarea && (
                <button onClick={() => setShowFechaTarea(true)} className="text-xs font-bold uppercase tracking-wide px-2.5 py-2 rounded-sm bg-[#E7E2D8] text-[#6B6352]">Poner fecha y hora</button>
              )}
            </div>
          </>
        )}
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352] mb-2">Historial de este hilo</p>
        {historial.length === 0 ? (
          <EmptyState icon={<Clock3 size={22} />} text="Todavía no hay acciones registradas en este hilo." />
        ) : (
          <div className="space-y-2">
            {historial.map((a) => <AccionCard key={a.id} accion={a} acciones={accionesDelHilo} core={core} onEdit={() => setEditingAccion(a)} onDelete={() => setDeletingAccionId(a.id)} />)}
          </div>
        )}
      </div>

      {showAvanzar && (
        <AvanzarHiloForm
          hilo={hilo}
          pendienteActual={pendienteActual}
          core={core}
          setCore={setCore}
          acciones={acciones}
          setAcciones={setAcciones}
          onClose={() => setShowAvanzar(false)}
        />
      )}
      {showReprogramar && pendienteActual && (
        <ReprogramarModal fechaActual={pendienteActual.fechaProgramada} core={core} onClose={() => setShowReprogramar(false)} onSave={reprogramar} />
      )}
      {showFechaTarea && (
        <Modal title="Fecha y hora de la tarea" onClose={() => setShowFechaTarea(false)}>
          <EditarFechaTareaForm hilo={hilo} pendiente={pendienteActual} setAcciones={setAcciones} onClose={() => setShowFechaTarea(false)} />
        </Modal>
      )}
      {showEditarTitulo && (
        <Modal title="Editar título del hilo" onClose={() => setShowEditarTitulo(false)}>
          <EditarTituloHiloForm hilo={hilo} onSave={(nuevoTitulo) => { setCore((prev) => ({ ...prev, hilos: prev.hilos.map((h) => (h.id === id ? { ...h, titulo: nuevoTitulo } : h)) })); setShowEditarTitulo(false); }} />
        </Modal>
      )}
      {showVincularCliente && (
        <Modal title="Vincular a un hilo de cliente" onClose={() => setShowVincularCliente(false)}>
          {core.hilos.filter((h) => h.tipo === "cliente" && h.estado === "Activo").length === 0 ? (
            <p className="text-sm text-[#A69C88]">No hay hilos de clientes activos para vincular.</p>
          ) : (
            <div className="space-y-1.5">
              {core.hilos.filter((h) => h.tipo === "cliente" && h.estado === "Activo").map((h) => {
                const p = personaPrincipalDeHilo(h, core);
                return (
                  <button
                    key={h.id}
                    onClick={() => { setCore((prev) => ({ ...prev, hilos: prev.hilos.map((hh) => (hh.id === id ? { ...hh, hiloRelacionadoId: h.id } : hh)) })); setShowVincularCliente(false); }}
                    className="w-full text-left bg-[#F7F5F0] border border-[#E4DECF] rounded-sm p-2.5 text-sm"
                  >
                    <span className="font-semibold text-[#2A2118]">{h.titulo}</span>
                    {p && <span className="text-[#8A8272]"> · {p.nombre}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </Modal>
      )}
      {showAgregarPersona && (
        <Modal title="Agregar persona al hilo" onClose={() => setShowAgregarPersona(false)}>
          <AgregarPersonaAlHiloForm
            core={core}
            setCore={setCore}
            hilo={hilo}
            personasDelHilo={personasDelHilo}
            agregarPersona={agregarPersona}
            onClose={() => setShowAgregarPersona(false)}
          />
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
              setShowAgregarTarea(false);
            }}
            onCrear={(nuevoHilo, fecha, hora) => {
              setCore((prev) => ({ ...prev, hilos: [nuevoHilo, ...prev.hilos] }));
              if (fecha) {
                setAcciones((prev) => {
                  const siguienteNumero = Math.max(0, ...prev.map((a) => a.numero || 0)) + 1;
                  return [{ id: uid("A"), hiloId: nuevoHilo.id, tipoAccionId: "", estado: "Pendiente", fechaRealizada: "", fechaProgramada: fecha, horaProgramada: hora, prioridad: "Media", notaPlanificada: nuevoHilo.titulo, notaHecho: "", origenId: null, destinoId: null, numero: siguienteNumero, recurrente: false, repiteCadaN: null, repiteUnidad: null, fechaCreacion: todayISO(), secuencia: Date.now() }, ...prev];
                });
              }
              setShowAgregarTarea(false);
            }}
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
          <p className="text-sm text-[#2A2118] mb-4">Se borra del hilo de forma permanente. No se puede deshacer.</p>
          <div className="flex gap-2">
            <button onClick={() => setDeletingAccionId(null)} className="flex-1 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#6B6352]">Cancelar</button>
            <button onClick={() => { deleteAccion(deletingAccionId); setDeletingAccionId(null); }} style={{ backgroundColor: "#B0452E", color: "#FFFFFF" }} className="flex-1 rounded-sm py-2.5 font-bold text-sm">Sí, eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EditarTituloHiloForm({ hilo, onSave }) {
  const [titulo, setTitulo] = useState(hilo.titulo);
  return (
    <div>
      <Field label="Título"><input className={inputCls} value={titulo} onChange={(e) => setTitulo(e.target.value)} /></Field>
      <PrimaryBtn full onClick={() => titulo.trim() && onSave(titulo.trim())}>Guardar</PrimaryBtn>
    </div>
  );
}

// Agrega una tarea a un hilo de cliente: buscando entre las tareas sueltas (sin vincular
// todavía a ningún hilo de cliente) — priorizando las que comparten alguna persona con este
// hilo — o creando una nueva si no la encuentra.
function AgregarTareaAlHiloForm({ core, hiloClienteId, personasDelHilo, onVincular, onCrear }) {
  const [modo, setModo] = useState("existente"); // 'existente' | 'nueva'
  const [q, setQ] = useState("");
  const [titulo, setTitulo] = useState("");
  const [columnaId, setColumnaId] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
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
      id: uid("H"), participantes: [], empresaId: "", obraId: "", titulo: titulo.trim(),
      estado: "Activo", fechaCreacion: todayISO(), tipo: "tarea",
      columnaTareaId: columnaId || null, hiloRelacionadoId: hiloClienteId, notaCierre: "",
    };
    onCrear(nuevoHilo, fecha, hora);
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
          <Field label="Título de la tarea *"><input autoFocus className={inputCls} value={titulo} onChange={(e) => setTitulo(e.target.value)} /></Field>
          <Field label="Columna del Kanban de Tareas (opcional)">
            <select className={inputCls} value={columnaId} onChange={(e) => setColumnaId(e.target.value)}>
              <option value="">— Sin columna —</option>
              {columnas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Field>
          <Field label="Fecha (opcional)"><input type="date" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field>
          <Field label="Hora (opcional)"><input type="time" className={inputCls} value={hora} onChange={(e) => setHora(e.target.value)} /></Field>
          <p className="text-xs text-[#A69C88] mb-3">Si cargás fecha, se crea con esa acción pendiente. Si no, la tarea queda sin fecha hasta que la avances.</p>
          <PrimaryBtn full onClick={crear}>Crear tarea</PrimaryBtn>
        </>
      )}
    </>
  );
}

// Avanzar un hilo: registra lo que se acaba de hacer y, opcionalmente, programa la próxima acción — en un solo paso.
function AvanzarHiloForm({ hilo, pendienteActual, core, setCore, acciones, setAcciones, onClose }) {
  const esTarea = hilo.tipo === "tarea";
  const [tipoAccionId1, setTipoAccionId1] = useState(pendienteActual?.tipoAccionId || (esTarea ? "" : tipoDefaultId(core)));
  const [notas1, setNotas1] = useState("");
  const [programarProxima, setProgramarProxima] = useState(true);
  const [tipoAccionId2, setTipoAccionId2] = useState(esTarea ? "" : tipoDefaultId(core));
  const [notas2, setNotas2] = useState("");
  const [modoFecha, setModoFecha] = useState("periodo"); // 'periodo' | 'especifica'
  const [cantidad, setCantidad] = useState(1);
  const [unidad, setUnidad] = useState("semanas");
  const [fechaEspecifica, setFechaEspecifica] = useState(todayISO());
  const [horaEspecifica, setHoraEspecifica] = useState("");
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
    setAcciones((prev) => {
      let siguienteNumero = Math.max(0, ...prev.map((a) => a.numero || 0)) + 1;
      let next = prev;
      let idCompletada;

      if (pendienteActual) {
        idCompletada = pendienteActual.id;
        next = next.map((a) => (a.id === pendienteActual.id ? { ...a, estado: "Realizada", fechaRealizada: hoy, fechaProgramada: "", horaProgramada: "", prioridad: "", tipoAccionId: tipoAccionId1, notaHecho: notas1, secuencia: Date.now() } : a));
      } else {
        idCompletada = uid("A");
        next = [{ id: idCompletada, hiloId: hilo.id, tipoAccionId: tipoAccionId1, estado: "Realizada", fechaRealizada: hoy, fechaProgramada: "", horaProgramada: "", prioridad: "", notaPlanificada: "", notaHecho: notas1, origenId: null, destinoId: null, numero: siguienteNumero++, recurrente: false, repiteCadaN: null, repiteUnidad: null, fechaCreacion: hoy, secuencia: Date.now() }, ...next];
      }

      if (programarProxima) {
        const idNueva = uid("A");
        next = [{ id: idNueva, hiloId: hilo.id, tipoAccionId: tipoAccionId2, estado: "Pendiente", fechaRealizada: "", fechaProgramada: fecha, horaProgramada: hora, prioridad, notaPlanificada: notas2, notaHecho: "", origenId: idCompletada, destinoId: null, numero: siguienteNumero++, recurrente, repiteCadaN: recurrente ? Number(repiteCadaN) : null, repiteUnidad: recurrente ? repiteUnidad : null, fechaCreacion: hoy, secuencia: Date.now() + 1 }, ...next];
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
    <Modal title={`${esTarea ? "Avanzar tarea" : "Avanzar hilo"} — ${hilo.titulo}`} onClose={onClose}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#B0452E] mb-2">{pendienteActual ? "Lo que acabás de hacer" : "Registrar contacto"}</p>
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
        <textarea className={inputCls} rows={2} value={notas1} onChange={(e) => setNotas1(e.target.value)} placeholder="Qué hablaron, qué resultó..." />
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
              <textarea className={inputCls} rows={2} value={notas2} onChange={(e) => setNotas2(e.target.value)} placeholder="Ej: confirmar si aceptaron la propuesta, próximos pasos a seguir..." />
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
                <Field label="Fecha">
                  <input type="date" className={inputCls} value={fechaEspecifica} onChange={(e) => { setFechaEspecifica(e.target.value); setConfirmarEspecifica(false); }} />
                </Field>
                <Field label="Hora (opcional)">
                  <input type="time" className={inputCls} value={horaEspecifica} onChange={(e) => setHoraEspecifica(e.target.value)} />
                </Field>
                {especificaInhabil && (
                  <div className="bg-[#FBEEE7] border border-[#E8871E] rounded-sm p-2.5 mb-3">
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
      onSave({ tipoAccionId, estado, fechaRealizada, fechaProgramada: "", horaProgramada: "", prioridad: "", notaPlanificada, notaHecho, recurrente: false, repiteCadaN: null, repiteUnidad: null, secuencia: accion.secuencia || Date.now() });
    } else {
      onSave({ tipoAccionId, estado, fechaRealizada: "", fechaProgramada, horaProgramada, prioridad, notaPlanificada, notaHecho, recurrente, repiteCadaN: recurrente ? Number(repiteCadaN) : null, repiteUnidad: recurrente ? repiteUnidad : null });
    }
  };

  return (
    <Modal title="Editar acción" onClose={onClose}>
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setEstado("Realizada")}
          style={{ backgroundColor: estado === "Realizada" ? "#3F6B4A" : "#E7E2D8", color: estado === "Realizada" ? "#FFFFFF" : "#6B6352" }}
          className="flex-1 py-2 rounded-sm text-sm font-bold"
        >Realizada</button>
        <button
          type="button"
          onClick={() => setEstado("Pendiente")}
          style={{ backgroundColor: estado === "Pendiente" ? "#E8871E" : "#E7E2D8", color: estado === "Pendiente" ? "#2A2118" : "#6B6352" }}
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
            <div className="bg-[#FBEEE7] border border-[#B0452E] rounded-sm p-2.5 mb-3">
              <p className="text-xs text-[#2A2118]">Este hilo ya tiene otra acción pendiente. No se puede guardar como Pendiente hasta resolver esa — reprogramala o marcala como Realizada primero.</p>
            </div>
          )}
          <Field label="Fecha programada"><input type="date" className={inputCls} value={fechaProgramada} onChange={(e) => { setFechaProgramada(e.target.value); setConfirmar(false); }} /></Field>
          <Field label="Hora (opcional)"><input type="time" className={inputCls} value={horaProgramada} onChange={(e) => setHoraProgramada(e.target.value)} /></Field>
          {inhabil && (
            <div className="bg-[#FBEEE7] border border-[#E8871E] rounded-sm p-2.5 mb-3">
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
        <textarea className={inputCls} rows={2} value={notaPlanificada} onChange={(e) => setNotaPlanificada(e.target.value)} />
      </Field>
      {estado === "Realizada" && (
        <Field label="Se hizo">
          <textarea className={inputCls} rows={2} value={notaHecho} onChange={(e) => setNotaHecho(e.target.value)} />
        </Field>
      )}

      <PrimaryBtn full onClick={submit} disabled={yaHayPendiente}>{inhabil && confirmar ? "Sí, guardar igual" : "Guardar cambios"}</PrimaryBtn>
    </Modal>
  );
}

function VincularObraForm({ core, setCore, empresaId, onClose, onLinked }) {
  const [modo, setModo] = useState("existente"); // 'existente' | 'nueva'
  const yaVinculadas = new Set(core.empresaObra.filter((r) => r.empresaId === empresaId).map((r) => r.obraId));
  const disponibles = core.obras.filter((o) => !yaVinculadas.has(o.id));
  const [obraId, setObraId] = useState(disponibles[0]?.id || "");
  const [nombreNueva, setNombreNueva] = useState("");
  const [descripcionNueva, setDescripcionNueva] = useState("");
  const [ciudadNueva, setCiudadNueva] = useState("");

  const submit = () => {
    if (modo === "existente") {
      if (!obraId) return;
      setCore((prev) => ({ ...prev, empresaObra: [...prev.empresaObra, { id: uid("eo"), empresaId, obraId }] }));
      onLinked(obraId);
    } else {
      if (!nombreNueva.trim()) return;
      const nueva = { id: uid("O"), nombre: nombreNueva.trim(), descripcion: descripcionNueva, metros2: 0, direccion: "", ciudad: ciudadNueva };
      setCore((prev) => ({ ...prev, obras: [nueva, ...prev.obras], empresaObra: [...prev.empresaObra, { id: uid("eo"), empresaId, obraId: nueva.id }] }));
      onLinked(nueva.id);
    }
  };

  return (
    <Modal title="Vincular obra a la empresa" onClose={onClose}>
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setModo("existente")}
          style={{ backgroundColor: modo === "existente" ? "#2A2F36" : "#E7E2D8", color: modo === "existente" ? "#FFFFFF" : "#6B6352" }}
          className="flex-1 py-2 rounded-sm text-sm font-bold"
        >Obra existente</button>
        <button
          type="button"
          onClick={() => setModo("nueva")}
          style={{ backgroundColor: modo === "nueva" ? "#2A2F36" : "#E7E2D8", color: modo === "nueva" ? "#FFFFFF" : "#6B6352" }}
          className="flex-1 py-2 rounded-sm text-sm font-bold"
        >Agregar obra</button>
      </div>
      {modo === "existente" ? (
        disponibles.length === 0 ? (
          <p className="text-sm text-[#A69C88] mb-3">No hay más obras disponibles para vincular — probá creando una nueva.</p>
        ) : (
          <Field label="Obra">
            <select className={inputCls} value={obraId} onChange={(e) => setObraId(e.target.value)}>
              {disponibles.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </Field>
        )
      ) : (
        <>
          <Field label="Nombre de la obra *"><input className={inputCls} value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} /></Field>
          <Field label="Descripción"><input className={inputCls} value={descripcionNueva} onChange={(e) => setDescripcionNueva(e.target.value)} /></Field>
          <Field label="Ciudad"><input className={inputCls} value={ciudadNueva} onChange={(e) => setCiudadNueva(e.target.value)} /></Field>
        </>
      )}
      <PrimaryBtn full onClick={submit}>Vincular</PrimaryBtn>
    </Modal>
  );
}

// Agrega una persona de contacto a una empresa (existente o nueva), desde la ficha de la empresa.
function VincularPersonaForm({ core, setCore, empresaId, onClose, onLinked }) {
  const [modo, setModo] = useState("existente"); // 'existente' | 'nueva'
  const yaVinculadas = new Set(core.personaEmpresa.filter((r) => r.empresaId === empresaId).map((r) => r.personaId));
  const disponibles = core.personas.filter((p) => !yaVinculadas.has(p.id));
  const [personaId, setPersonaId] = useState(disponibles[0]?.id || "");
  const [nombreNueva, setNombreNueva] = useState("");
  const [cargoId, setCargoId] = useState((core.cargos || [])[0]?.id || "");
  const [principal, setPrincipal] = useState(false);

  const submit = () => {
    if (modo === "existente") {
      if (!personaId) return;
      setCore((prev) => ({ ...prev, personaEmpresa: [...prev.personaEmpresa, { id: uid("pe"), personaId, empresaId, cargoId, principal }] }));
      onLinked(personaId);
    } else {
      if (!nombreNueva.trim()) return;
      const nueva = { id: uid("P"), nombre: nombreNueva.trim(), whatsapp: "", direccion: "", ciudad: "", notas: "" };
      setCore((prev) => ({ ...prev, personas: [nueva, ...prev.personas], personaEmpresa: [...prev.personaEmpresa, { id: uid("pe"), personaId: nueva.id, empresaId, cargoId, principal }] }));
      onLinked(nueva.id);
    }
  };

  return (
    <Modal title="Agregar persona de contacto" onClose={onClose}>
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setModo("existente")}
          style={{ backgroundColor: modo === "existente" ? "#2A2F36" : "#E7E2D8", color: modo === "existente" ? "#FFFFFF" : "#6B6352" }}
          className="flex-1 py-2 rounded-sm text-sm font-bold"
        >Persona existente</button>
        <button
          type="button"
          onClick={() => setModo("nueva")}
          style={{ backgroundColor: modo === "nueva" ? "#2A2F36" : "#E7E2D8", color: modo === "nueva" ? "#FFFFFF" : "#6B6352" }}
          className="flex-1 py-2 rounded-sm text-sm font-bold"
        >Agregar persona</button>
      </div>
      {modo === "existente" ? (
        disponibles.length === 0 ? (
          <p className="text-sm text-[#A69C88] mb-3">No hay más personas disponibles para vincular — probá creando una nueva.</p>
        ) : (
          <Field label="Persona">
            <select className={inputCls} value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
              {disponibles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Field>
        )
      ) : (
        <Field label="Nombre *"><input className={inputCls} value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} /></Field>
      )}
      <SelectConCrear
        label="Cargo"
        opciones={core.cargos || []}
        value={cargoId}
        onChange={setCargoId}
        placeholderCrear="Ej: Encargado de compras"
        onCrear={(nombre) => {
          const nuevo = { id: uid("C"), nombre };
          setCore((prev) => ({ ...prev, cargos: [...(prev.cargos || []), nuevo] }));
          return nuevo;
        }}
      />
      <label className="flex items-center gap-2 mb-3 text-sm text-[#2A2118]">
        <input type="checkbox" checked={principal} onChange={(e) => setPrincipal(e.target.checked)} /> Es el contacto principal de esta empresa
      </label>
      <PrimaryBtn full onClick={submit}>Agregar</PrimaryBtn>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Empresas
// ---------------------------------------------------------------------------
function EmpresasView({ core, setCore, onOpen }) {
  const [modal, setModal] = useState(null);
  const [q, setQ] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const list = core.empresas.filter((e) => e.denominacion.toLowerCase().includes(q.toLowerCase()));

  const save = (data, vinculoPersona) => {
    setCore((prev) => {
      const exists = prev.empresas.some((e) => e.id === data.id);
      let empresas = exists ? prev.empresas.map((e) => (e.id === data.id ? data : e)) : [data, ...prev.empresas];
      let personas = prev.personas;
      let personaEmpresa = prev.personaEmpresa;
      if (vinculoPersona) {
        let personaId = vinculoPersona.personaId;
        if (vinculoPersona.tipo === "nueva") {
          const nuevaPersona = { id: uid("P"), nombre: vinculoPersona.nombre, whatsapp: "", direccion: "", ciudad: "", notas: "" };
          personas = [nuevaPersona, ...personas];
          personaId = nuevaPersona.id;
        }
        if (personaId) personaEmpresa = [...personaEmpresa, { id: uid("pe"), personaId, empresaId: data.id, cargoId: vinculoPersona.cargoId, principal: true }];
      }
      return { ...prev, empresas, personas, personaEmpresa };
    });
    setModal(null);
  };
  const del = (id) => setCore((prev) => ({
    ...prev,
    empresas: prev.empresas.filter((e) => e.id !== id),
    personaEmpresa: prev.personaEmpresa.filter((r) => r.empresaId !== id),
    empresaObra: prev.empresaObra.filter((r) => r.empresaId !== id),
    entidadEtiqueta: prev.entidadEtiqueta.filter((r) => !(r.entidadTipo === "Empresa" && r.entidadId === id)),
  }));

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A69C88]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa..." className={`${inputCls} pl-8`} />
        </div>
        <button onClick={() => setModal({})} className="shrink-0 bg-[#E8871E] text-[#2A2118] rounded-sm px-3.5 py-2 font-bold"><Plus size={18} /></button>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<Building2 size={26} />} text="No hay empresas cargadas todavía." />
      ) : (
        <div className="space-y-2">
          {list.map((e) => {
            const nPersonas = core.personaEmpresa.filter((r) => r.empresaId === e.id).length;
            return (
              <div key={e.id} className="w-full bg-white border border-[#E4DECF] rounded-sm p-3 flex items-center gap-3">
                <button onClick={() => onOpen("empresa", e.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) }}><Building2 size={16} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#2A2118] truncate">{e.denominacion}</p>
                    {nPersonas > 0 ? (
                      <p className="text-xs text-[#8A8272] truncate">{e.ciudad ? `${e.ciudad} · ` : ""}{nPersonas} contacto{nPersonas !== 1 ? "s" : ""}</p>
                    ) : (
                      <Chip tone="amber">A definir</Chip>
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
          <p className="text-sm text-[#2A2118] mb-4">Se borra la empresa, sus vínculos con personas y obras, y sus etiquetas. No se puede deshacer.</p>
          <div className="flex gap-2">
            <button onClick={() => setDeletingId(null)} className="flex-1 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#6B6352]">Cancelar</button>
            <button onClick={() => { del(deletingId); setDeletingId(null); }} style={{ backgroundColor: "#B0452E", color: "#FFFFFF" }} className="flex-1 rounded-sm py-2.5 font-bold text-sm">Sí, eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EmpresaForm({ initial, core, setCore, onSave, onDelete, onClose }) {
  const esNueva = !initial.id;
  const [denominacion, setDenominacion] = useState(initial.denominacion || "");
  const [direccion, setDireccion] = useState(initial.direccion || "");
  const [ciudad, setCiudad] = useState(initial.ciudad || "");

  const [personaModo, setPersonaModo] = useState(core?.personas?.length ? "existente" : "nueva"); // 'existente' | 'nueva' | 'adefinir'
  const [personaId, setPersonaId] = useState(core?.personas?.[0]?.id || "");
  const [nombrePersonaNueva, setNombrePersonaNueva] = useState("");
  const [cargoId, setCargoId] = useState((core?.cargos || [])[0]?.id || "");

  const submit = () => {
    if (!denominacion.trim()) return;
    const data = { id: initial.id || uid("E"), denominacion: denominacion.trim(), direccion, ciudad };
    let vinculoPersona = null;
    if (esNueva) {
      if (personaModo === "existente" && personaId) vinculoPersona = { tipo: "existente", personaId, cargoId };
      else if (personaModo === "nueva" && nombrePersonaNueva.trim()) vinculoPersona = { tipo: "nueva", nombre: nombrePersonaNueva.trim(), cargoId };
    }
    onSave(data, vinculoPersona);
  };

  return (
    <Modal title={initial.id ? "Editar empresa" : "Nueva empresa"} onClose={onClose}>
      <Field label="Denominación *"><input className={inputCls} value={denominacion} onChange={(e) => setDenominacion(e.target.value)} /></Field>
      <Field label="Dirección"><input className={inputCls} value={direccion} onChange={(e) => setDireccion(e.target.value)} /></Field>
      <Field label="Ciudad"><input className={inputCls} value={ciudad} onChange={(e) => setCiudad(e.target.value)} /></Field>

      {esNueva && (
        <div className="border-t border-[#E4DECF] my-3 pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#B0452E] mb-2">Persona que la representa</p>
          <div className="flex gap-1.5 mb-2">
            <button type="button" onClick={() => setPersonaModo("existente")} style={{ backgroundColor: personaModo === "existente" ? "#2A2F36" : "#E7E2D8", color: personaModo === "existente" ? "#FFFFFF" : "#6B6352" }} className="flex-1 py-2 rounded-sm text-xs font-bold">Existente</button>
            <button type="button" onClick={() => setPersonaModo("nueva")} style={{ backgroundColor: personaModo === "nueva" ? "#2A2F36" : "#E7E2D8", color: personaModo === "nueva" ? "#FFFFFF" : "#6B6352" }} className="flex-1 py-2 rounded-sm text-xs font-bold">Nueva</button>
            <button type="button" onClick={() => setPersonaModo("adefinir")} style={{ backgroundColor: personaModo === "adefinir" ? "#2A2F36" : "#E7E2D8", color: personaModo === "adefinir" ? "#FFFFFF" : "#6B6352" }} className="flex-1 py-2 rounded-sm text-xs font-bold">A definir</button>
          </div>
          {personaModo === "existente" && (
            (core?.personas || []).length === 0 ? (
              <p className="text-sm text-[#A69C88] mb-3">Todavía no hay personas cargadas — probá "Nueva".</p>
            ) : (
              <Field label="Persona">
                <select className={inputCls} value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
                  {core.personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </Field>
            )
          )}
          {personaModo === "nueva" && (
            <Field label="Nombre *"><input className={inputCls} value={nombrePersonaNueva} onChange={(e) => setNombrePersonaNueva(e.target.value)} /></Field>
          )}
          {personaModo === "adefinir" && (
            <p className="text-sm text-[#A69C88] mb-3">La empresa va a quedar marcada como "A definir" hasta que le asignes una persona.</p>
          )}
          {personaModo !== "adefinir" && (
            <SelectConCrear
              label="Cargo"
              opciones={core?.cargos || []}
              value={cargoId}
              onChange={setCargoId}
              placeholderCrear="Ej: Encargado de compras"
              onCrear={(nombre) => {
                const nuevo = { id: uid("C"), nombre };
                setCore((prev) => ({ ...prev, cargos: [...(prev.cargos || []), nuevo] }));
                return nuevo;
              }}
            />
          )}
        </div>
      )}

      <div className="flex gap-2 mt-2">
        <PrimaryBtn onClick={submit} full>Guardar</PrimaryBtn>
        {onDelete && <button onClick={onDelete} className="shrink-0 border border-[#E4DECF] rounded-sm px-3 text-[#B0452E]"><Trash2 size={16} /></button>}
      </div>
    </Modal>
  );
}

function EmpresaDetail({ id, core, setCore, acciones, setAcciones, onClose, onOpen }) {
  const empresa = core.empresas.find((e) => e.id === id);
  const [showObraLink, setShowObraLink] = useState(false);
  const [showPersonaLink, setShowPersonaLink] = useState(false);
  const [editRel, setEditRel] = useState(null);
  const [showNuevoHiloEmpresa, setShowNuevoHiloEmpresa] = useState(false);
  if (!empresa) return <div><BackHeader onClose={onClose} /><p className="text-sm text-[#8A8272]">Esta empresa ya no existe.</p></div>;

  const personas = core.personaEmpresa.filter((r) => r.empresaId === id);
  const obras = core.empresaObra.filter((r) => r.empresaId === id);
  const hilosDeEmpresa = core.hilos.filter((h) => h.empresaId === id).map((h) => h.id);
  const hilosDeEstaEmpresa = core.hilos.filter((h) => h.empresaId === id && h.estado === "Activo");
  const accCount = acciones.filter((a) => hilosDeEmpresa.includes(a.hiloId)).length;

  const updateRel = (relId, cambios) => setCore((prev) => ({ ...prev, personaEmpresa: prev.personaEmpresa.map((r) => (r.id === relId ? { ...r, ...cambios } : r)) }));
  const unlinkObra = (relId) => setCore((prev) => ({ ...prev, empresaObra: prev.empresaObra.filter((r) => r.id !== relId) }));

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
            {(empresa.direccion || empresa.ciudad) && <p className="text-xs text-[#8A8272] mt-0.5">{[empresa.direccion, empresa.ciudad].filter(Boolean).join(" · ")}</p>}
          </div>
        </div>
        <TagsSection core={core} setCore={setCore} entidadTipo="Empresa" entidadId={id} />
        <p className="text-xs text-[#8A8272] mt-3">{accCount} acción{accCount !== 1 ? "es" : ""} registrada{accCount !== 1 ? "s" : ""} en total</p>

        <div className="border-t border-dashed border-[#E4DECF] mt-3 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352]">Personas de contacto</p>
            <button onClick={() => setShowPersonaLink(true)} className="text-xs font-bold text-[#B0452E]">+ Agregar</button>
          </div>
          {personas.length === 0 ? <Chip tone="amber">A definir</Chip> : (
            <div className="space-y-1.5">
              {personas.map((r) => {
                const p = core.personas.find((pp) => pp.id === r.personaId);
                if (!p) return null;
                return (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <button onClick={() => onOpen("persona", p.id)} className="text-left flex-1 min-w-0">
                      <span className="font-semibold text-[#2A2118]">{p.nombre}</span>
                      <span className="text-[#8A8272]"> · {(core.cargos || []).find((c) => c.id === r.cargoId)?.nombre || "sin cargo"}</span>
                      {r.principal && <Star size={11} className="inline text-[#E8871E] ml-1" />}
                    </button>
                    <WhatsAppLink persona={p} size={15} />
                    <IconBtn label="Editar cargo" onClick={() => setEditRel(r)}><Pencil size={14} /></IconBtn>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-dashed border-[#E4DECF] mt-3 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352]">Hilos de esta empresa</p>
            <button onClick={() => setShowNuevoHiloEmpresa(true)} className="text-xs font-bold text-[#B0452E]">+ Nuevo hilo</button>
          </div>
          {hilosDeEstaEmpresa.length === 0 ? (
            <p className="text-sm text-[#A69C88]">Sin hilos todavía. Podés arrancar uno acá aunque todavía no tengas el contacto.</p>
          ) : (
            <div className="space-y-1.5">
              {hilosDeEstaEmpresa.map((h) => (
                <button key={h.id} onClick={() => onOpen("hilo", h.id)} className="w-full text-left text-sm flex items-center justify-between">
                  <span className="font-semibold text-[#2A2118]">{h.titulo}</span>
                  <span className="text-xs text-[#8A8272]">{etiquetaVinculoHilo(h, core)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-dashed border-[#E4DECF] mt-3 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352]">Obras vinculadas</p>
            <button onClick={() => setShowObraLink(true)} className="text-xs font-bold text-[#B0452E]">+ Vincular</button>
          </div>
          {obras.length === 0 ? <p className="text-sm text-[#A69C88]">Sin obras vinculadas.</p> : (
            <div className="space-y-1.5">
              {obras.map((r) => {
                const o = core.obras.find((oo) => oo.id === r.obraId);
                if (!o) return null;
                return (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <button onClick={() => onOpen("obra", o.id)} className="font-semibold text-[#2A2118] text-left">{o.nombre}</button>
                    <IconBtn danger label="Desvincular" onClick={() => unlinkObra(r.id)}><X size={14} /></IconBtn>
                  </div>
                );
              })}
            </div>
          )}
        </div>
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
      {showObraLink && (
        <VincularObraForm
          core={core}
          setCore={setCore}
          empresaId={id}
          onClose={() => setShowObraLink(false)}
          onLinked={() => setShowObraLink(false)}
        />
      )}
      {showPersonaLink && (
        <VincularPersonaForm
          core={core}
          setCore={setCore}
          empresaId={id}
          onClose={() => setShowPersonaLink(false)}
          onLinked={() => setShowPersonaLink(false)}
        />
      )}
      {editRel && (
        <EditRelacionForm
          core={core}
          setCore={setCore}
          relacion={editRel}
          onClose={() => setEditRel(null)}
          onSave={(cambios) => { updateRel(editRel.id, cambios); setEditRel(null); }}
        />
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
  const save = (data, vinculoEmpresa) => {
    setCore((prev) => {
      const exists = prev.obras.some((o) => o.id === data.id);
      let obras = exists ? prev.obras.map((o) => (o.id === data.id ? data : o)) : [data, ...prev.obras];
      let empresas = prev.empresas;
      let empresaObra = prev.empresaObra;
      if (vinculoEmpresa) {
        let empresaId = vinculoEmpresa.empresaId;
        if (vinculoEmpresa.tipo === "nueva") {
          const nuevaEmpresa = { id: uid("E"), denominacion: vinculoEmpresa.denominacion, direccion: vinculoEmpresa.direccion || "", ciudad: vinculoEmpresa.ciudad || "" };
          empresas = [nuevaEmpresa, ...empresas];
          empresaId = nuevaEmpresa.id;
        }
        if (empresaId) empresaObra = [...empresaObra, { id: uid("eo"), empresaId, obraId: data.id }];
      }
      return { ...prev, obras, empresas, empresaObra };
    });
    setModal(null);
  };
  const del = (id) => setCore((prev) => ({
    ...prev,
    obras: prev.obras.filter((o) => o.id !== id),
    empresaObra: prev.empresaObra.filter((r) => r.obraId !== id),
    entidadEtiqueta: prev.entidadEtiqueta.filter((r) => !(r.entidadTipo === "Obra" && r.entidadId === id)),
  }));

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setModal({})} className="bg-[#E8871E] text-[#2A2118] rounded-sm px-3.5 py-2 font-bold"><Plus size={18} /></button>
      </div>
      {core.obras.length === 0 ? (
        <EmptyState icon={<HardHat size={26} />} text="No hay obras cargadas todavía." />
      ) : (
        <div className="space-y-2">
          {core.obras.map((o) => {
            const empresas = core.empresaObra.filter((r) => r.obraId === o.id).map((r) => core.empresas.find((e) => e.id === r.empresaId)?.denominacion).filter(Boolean);
            return (
              <div key={o.id} className="w-full bg-white border border-[#E4DECF] rounded-sm p-3 flex items-center gap-3">
                <button onClick={() => onOpen("obra", o.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) }}><HardHat size={16} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#2A2118] truncate">{o.nombre}</p>
                    {empresas.length ? (
                      <p className="text-xs text-[#8A8272] truncate">{empresas.join(", ")}</p>
                    ) : (
                      <Chip tone="amber">A definir</Chip>
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
      {modal !== null && <ObraForm initial={modal} core={core} onSave={save} onDelete={modal.id ? () => { del(modal.id); setModal(null); } : null} onClose={() => setModal(null)} />}
      {deletingId && (
        <Modal title="¿Eliminar esta obra?" onClose={() => setDeletingId(null)}>
          <p className="text-sm text-[#2A2118] mb-4">Se borra la obra, sus vínculos con empresas y sus etiquetas. No se puede deshacer.</p>
          <div className="flex gap-2">
            <button onClick={() => setDeletingId(null)} className="flex-1 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#6B6352]">Cancelar</button>
            <button onClick={() => { del(deletingId); setDeletingId(null); }} style={{ backgroundColor: "#B0452E", color: "#FFFFFF" }} className="flex-1 rounded-sm py-2.5 font-bold text-sm">Sí, eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ObraForm({ initial, core, onSave, onDelete, onClose }) {
  const esNueva = !initial.id;
  const [nombre, setNombre] = useState(initial.nombre || "");
  const [descripcion, setDescripcion] = useState(initial.descripcion || "");
  const [metros2, setMetros2] = useState(initial.metros2 || "");
  const [direccion, setDireccion] = useState(initial.direccion || "");
  const [ciudad, setCiudad] = useState(initial.ciudad || "");

  const [empresaModo, setEmpresaModo] = useState(core?.empresas?.length ? "existente" : "nueva"); // 'existente' | 'nueva' | 'adefinir'
  const [empresaId, setEmpresaId] = useState(core?.empresas?.[0]?.id || "");
  const [nombreEmpresaNueva, setNombreEmpresaNueva] = useState("");
  const [direccionEmpresaNueva, setDireccionEmpresaNueva] = useState("");
  const [ciudadEmpresaNueva, setCiudadEmpresaNueva] = useState("");

  const submit = () => {
    if (!nombre.trim()) return;
    const data = { id: initial.id || uid("O"), nombre: nombre.trim(), descripcion, metros2: Number(metros2) || 0, direccion, ciudad };
    let vinculoEmpresa = null;
    if (esNueva) {
      if (empresaModo === "existente" && empresaId) vinculoEmpresa = { tipo: "existente", empresaId };
      else if (empresaModo === "nueva" && nombreEmpresaNueva.trim()) vinculoEmpresa = { tipo: "nueva", denominacion: nombreEmpresaNueva.trim(), direccion: direccionEmpresaNueva, ciudad: ciudadEmpresaNueva };
    }
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
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#B0452E] mb-2">Empresa a la que pertenece</p>
          <div className="flex gap-1.5 mb-2">
            <button type="button" onClick={() => setEmpresaModo("existente")} style={{ backgroundColor: empresaModo === "existente" ? "#2A2F36" : "#E7E2D8", color: empresaModo === "existente" ? "#FFFFFF" : "#6B6352" }} className="flex-1 py-2 rounded-sm text-xs font-bold">Existente</button>
            <button type="button" onClick={() => setEmpresaModo("nueva")} style={{ backgroundColor: empresaModo === "nueva" ? "#2A2F36" : "#E7E2D8", color: empresaModo === "nueva" ? "#FFFFFF" : "#6B6352" }} className="flex-1 py-2 rounded-sm text-xs font-bold">Nueva</button>
            <button type="button" onClick={() => setEmpresaModo("adefinir")} style={{ backgroundColor: empresaModo === "adefinir" ? "#2A2F36" : "#E7E2D8", color: empresaModo === "adefinir" ? "#FFFFFF" : "#6B6352" }} className="flex-1 py-2 rounded-sm text-xs font-bold">A definir</button>
          </div>
          {empresaModo === "existente" && (
            (core?.empresas || []).length === 0 ? (
              <p className="text-sm text-[#A69C88] mb-3">Todavía no hay empresas cargadas — probá "Nueva".</p>
            ) : (
              <Field label="Empresa">
                <select className={inputCls} value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
                  {core.empresas.map((e) => <option key={e.id} value={e.id}>{e.denominacion}</option>)}
                </select>
              </Field>
            )
          )}
          {empresaModo === "nueva" && (
            <>
              <Field label="Denominación *"><input className={inputCls} value={nombreEmpresaNueva} onChange={(e) => setNombreEmpresaNueva(e.target.value)} /></Field>
              <Field label="Dirección"><input className={inputCls} value={direccionEmpresaNueva} onChange={(e) => setDireccionEmpresaNueva(e.target.value)} /></Field>
              <Field label="Ciudad"><input className={inputCls} value={ciudadEmpresaNueva} onChange={(e) => setCiudadEmpresaNueva(e.target.value)} /></Field>
            </>
          )}
          {empresaModo === "adefinir" && (
            <p className="text-sm text-[#A69C88] mb-3">La obra va a quedar marcada como "A definir" hasta que le asignes una empresa.</p>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-2">
        <PrimaryBtn onClick={submit} full>Guardar</PrimaryBtn>
        {onDelete && <button onClick={onDelete} className="shrink-0 border border-[#E4DECF] rounded-sm px-3 text-[#B0452E]"><Trash2 size={16} /></button>}
      </div>
    </Modal>
  );
}

function ObraDetail({ id, core, setCore, acciones, setAcciones, onClose, onOpen }) {
  const obra = core.obras.find((o) => o.id === id);
  const [showNuevoHiloObra, setShowNuevoHiloObra] = useState(false);
  const [showEmpresaLink, setShowEmpresaLink] = useState(false);
  if (!obra) return <div><BackHeader onClose={onClose} /><p className="text-sm text-[#8A8272]">Esta obra ya no existe.</p></div>;
  const empresas = core.empresaObra.filter((r) => r.obraId === id);
  const hilosDeEstaObra = core.hilos.filter((h) => h.obraId === id && h.estado === "Activo");
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

        <div className="border-t border-dashed border-[#E4DECF] mt-3 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352]">Empresas vinculadas</p>
            <button onClick={() => setShowEmpresaLink(true)} className="text-xs font-bold text-[#B0452E]">+ Vincular</button>
          </div>
          {empresas.length === 0 ? <Chip tone="amber">A definir</Chip> : (
            <div className="space-y-1.5">
              {empresas.map((r) => {
                const e = core.empresas.find((ee) => ee.id === r.empresaId);
                if (!e) return null;
                return <button key={r.id} onClick={() => onOpen("empresa", e.id)} className="w-full text-left text-sm font-semibold text-[#2A2118]">{e.denominacion}</button>;
              })}
            </div>
          )}
        </div>

        <div className="border-t border-dashed border-[#E4DECF] mt-3 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352]">Hilos de esta obra</p>
            <button onClick={() => setShowNuevoHiloObra(true)} className="text-xs font-bold text-[#B0452E]">+ Nuevo hilo</button>
          </div>
          {hilosDeEstaObra.length === 0 ? (
            <p className="text-sm text-[#A69C88]">Sin hilos todavía. Podés arrancar uno acá aunque todavía no sepas la empresa o el contacto.</p>
          ) : (
            <div className="space-y-1.5">
              {hilosDeEstaObra.map((h) => (
                <button key={h.id} onClick={() => onOpen("hilo", h.id)} className="w-full text-left text-sm flex items-center justify-between">
                  <span className="font-semibold text-[#2A2118]">{h.titulo}</span>
                  <span className="text-xs text-[#8A8272]">{etiquetaVinculoHilo(h, core)}</span>
                </button>
              ))}
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
      {showEmpresaLink && (
        <VincularEmpresaDesdeObraForm
          core={core}
          setCore={setCore}
          obraId={id}
          onClose={() => setShowEmpresaLink(false)}
          onLinked={() => setShowEmpresaLink(false)}
        />
      )}
    </div>
  );
}

// Vincula esta obra a una empresa (existente o nueva), desde la ficha de la obra.
function VincularEmpresaDesdeObraForm({ core, setCore, obraId, onClose, onLinked }) {
  const [modo, setModo] = useState("existente"); // 'existente' | 'nueva'
  const yaVinculadas = new Set(core.empresaObra.filter((r) => r.obraId === obraId).map((r) => r.empresaId));
  const disponibles = core.empresas.filter((e) => !yaVinculadas.has(e.id));
  const [empresaId, setEmpresaId] = useState(disponibles[0]?.id || "");
  const [nombreNueva, setNombreNueva] = useState("");
  const [direccionNueva, setDireccionNueva] = useState("");
  const [ciudadNueva, setCiudadNueva] = useState("");

  const submit = () => {
    if (modo === "existente") {
      if (!empresaId) return;
      setCore((prev) => ({ ...prev, empresaObra: [...prev.empresaObra, { id: uid("eo"), empresaId, obraId }] }));
      onLinked(empresaId);
    } else {
      if (!nombreNueva.trim()) return;
      const nueva = { id: uid("E"), denominacion: nombreNueva.trim(), direccion: direccionNueva, ciudad: ciudadNueva };
      setCore((prev) => ({ ...prev, empresas: [nueva, ...prev.empresas], empresaObra: [...prev.empresaObra, { id: uid("eo"), empresaId: nueva.id, obraId }] }));
      onLinked(nueva.id);
    }
  };

  return (
    <Modal title="Vincular empresa a la obra" onClose={onClose}>
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setModo("existente")}
          style={{ backgroundColor: modo === "existente" ? "#2A2F36" : "#E7E2D8", color: modo === "existente" ? "#FFFFFF" : "#6B6352" }}
          className="flex-1 py-2 rounded-sm text-sm font-bold"
        >Empresa existente</button>
        <button
          type="button"
          onClick={() => setModo("nueva")}
          style={{ backgroundColor: modo === "nueva" ? "#2A2F36" : "#E7E2D8", color: modo === "nueva" ? "#FFFFFF" : "#6B6352" }}
          className="flex-1 py-2 rounded-sm text-sm font-bold"
        >Agregar empresa</button>
      </div>
      {modo === "existente" ? (
        disponibles.length === 0 ? (
          <p className="text-sm text-[#A69C88] mb-3">No hay más empresas disponibles para vincular — probá creando una nueva.</p>
        ) : (
          <Field label="Empresa">
            <select className={inputCls} value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
              {disponibles.map((e) => <option key={e.id} value={e.id}>{e.denominacion}</option>)}
            </select>
          </Field>
        )
      ) : (
        <>
          <Field label="Denominación *"><input className={inputCls} value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} /></Field>
          <Field label="Dirección"><input className={inputCls} value={direccionNueva} onChange={(e) => setDireccionNueva(e.target.value)} /></Field>
          <Field label="Ciudad"><input className={inputCls} value={ciudadNueva} onChange={(e) => setCiudadNueva(e.target.value)} /></Field>
        </>
      )}
      <PrimaryBtn full onClick={submit}>Vincular</PrimaryBtn>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Buscar
// ---------------------------------------------------------------------------
function BuscarView({ core, search, setSearch, onOpen }) {
  const q = search.trim().toLowerCase();
  const personas = q ? core.personas.filter((p) => p.nombre.toLowerCase().includes(q)) : [];
  const empresas = q ? core.empresas.filter((e) => e.denominacion.toLowerCase().includes(q)) : [];
  const obras = q ? core.obras.filter((o) => o.nombre.toLowerCase().includes(q)) : [];

  return (
    <div>
      <div className="relative mb-4">
        <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A69C88]" />
        <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar persona, empresa u obra..." className={`${inputCls} pl-8`} />
      </div>

      {!q ? (
        <EmptyState icon={<Search size={26} />} text="Escribí un nombre para buscar en toda tu cartera." />
      ) : personas.length + empresas.length + obras.length === 0 ? (
        <EmptyState icon={<Search size={26} />} text="Sin resultados." />
      ) : (
        <div className="space-y-4">
          {personas.length > 0 && <ResultGroup title="Personas" items={personas.map((p) => ({ id: p.id, label: p.nombre, type: "persona", persona: p }))} onOpen={onOpen} />}
          {empresas.length > 0 && <ResultGroup title="Empresas" items={empresas.map((e) => ({ id: e.id, label: e.denominacion, type: "empresa" }))} onOpen={onOpen} />}
          {obras.length > 0 && <ResultGroup title="Obras" items={obras.map((o) => ({ id: o.id, label: o.nombre, type: "obra" }))} onOpen={onOpen} />}
        </div>
      )}
    </div>
  );
}

function ResultGroup({ title, items, onOpen }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352] mb-1.5">{title}</p>
      <div className="space-y-1.5">
        {items.map((it) => (
          <div key={it.id} className="w-full bg-white border border-[#E4DECF] rounded-sm p-2.5 text-sm flex items-center gap-2">
            <button onClick={() => onOpen(it.type, it.id)} className="flex-1 text-left font-semibold text-[#2A2118]">
              {it.label}
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
  const hilosIds = core.hilos.filter((h) => (h.participantes || []).some((p) => p.personaId === persona.id)).map((h) => h.id);
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
      <div className="flex gap-1.5 mb-4">
        <button
          onClick={() => setSubVista("tablero")}
          style={subVista === "tablero" ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) } : { backgroundColor: core.tema.tarjeta, color: core.tema.mutedBase }}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wide px-2.5 py-1.5 rounded-sm border border-[#E4DECF]"
        >
          <BarChart3 size={13} /> Tablero de control
        </button>
        <button
          onClick={() => setSubVista("informes")}
          style={subVista === "informes" ? { backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) } : { backgroundColor: core.tema.tarjeta, color: core.tema.mutedBase }}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wide px-2.5 py-1.5 rounded-sm border border-[#E4DECF]"
        >
          <FileSpreadsheet size={13} /> Informes
        </button>
      </div>
      {subVista === "tablero" ? <TableroControl core={core} acciones={acciones} /> : <ReportesView core={core} acciones={acciones} />}
    </div>
  );
}

function IndicadorCard({ label, value, tone = "neutral" }) {
  const tones = { neutral: "#2A2118", red: "#B0452E", green: "#3F6B4A", amber: "#E8871E" };
  return (
    <div className="bg-white border border-[#E4DECF] rounded-sm p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#8A8272] mb-1">{label}</p>
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
    if (!core.hilos.some((h) => (h.participantes || []).some((pa) => pa.personaId === p.id))) return false;
    const ultimo = ultimoContactoPorPersona(p, core, acciones);
    if (!ultimo) return true;
    return diasEntre(ultimo, t) > umbralSinContacto;
  }).length;

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <IndicadorCard label="Hilos activos" value={hilosActivos} tone="green" />
        <IndicadorCard label="Hilos cerrados" value={hilosCerrados} />
        <IndicadorCard label="Acciones vencidas" value={vencidas} tone={vencidas > 0 ? "red" : "neutral"} />
        <IndicadorCard label="Pendientes totales" value={pendientes.length} tone="amber" />
        <IndicadorCard label="Realizadas este mes" value={realizadasEsteMes} tone="green" />
        <IndicadorCard label={`Sin contacto +${umbralSinContacto}d`} value={sinContacto} tone={sinContacto > 0 ? "red" : "neutral"} />
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
            className="shrink-0 text-xs font-bold uppercase tracking-wide px-2.5 py-1.5 rounded-sm border border-[#E4DECF]"
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
    .filter((o) => !core.empresaObra.some((r) => r.obraId === o.id))
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
    .filter((e) => !core.personaEmpresa.some((r) => r.empresaId === e.id))
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
        <button onClick={onExportar} disabled={rows.length === 0} style={rows.length === 0 ? { backgroundColor: "#E7E2D8", color: "#A69C88", cursor: "not-allowed" } : { backgroundColor: "#3F6B4A", color: "#FFFFFF" }} className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide px-2.5 py-1.5 rounded-sm">
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
                {headers.map((h) => <th key={h} className="text-left px-2.5 py-2 text-[10px] font-bold uppercase tracking-wide text-[#6B6352] whitespace-nowrap">{h}</th>)}
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
          <select className={inputCls} value={tipoAccionId} onChange={(e) => setTipoAccionId(e.target.value)}>
            <option value="">Todos</option>
            {core.tiposAccion.map((tp) => <option key={tp.id} value={tp.id}>{tp.nombre}</option>)}
          </select>
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

  const hilosFiltrados = core.hilos.filter((h) => estadoFiltro === "Todos" || h.estado === estadoFiltro);
  const porEmpresa = {};
  for (const h of hilosFiltrados) {
    const key = h.empresaId || "__sin_empresa__";
    if (!porEmpresa[key]) porEmpresa[key] = { hilos: 0, acciones: 0 };
    porEmpresa[key].hilos += 1;
    porEmpresa[key].acciones += acciones.filter((a) => a.hiloId === h.id).length;
  }
  const rows = Object.entries(porEmpresa)
    .map(([empresaId, datos]) => {
      const emp = core.empresas.find((e) => e.id === empresaId);
      return [emp ? emp.denominacion : "Sin empresa", datos.hilos, datos.acciones];
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
    .filter((p) => core.hilos.some((h) => (h.participantes || []).some((pa) => pa.personaId === p.id)))
    .map((p) => {
      const ultimo = ultimoContactoPorPersona(p, core, acciones);
      const dias = ultimo ? diasEntre(ultimo, t) : Infinity;
      const empresas = core.personaEmpresa.filter((r) => r.personaId === p.id).map((r) => core.empresas.find((e) => e.id === r.empresaId)?.denominacion).filter(Boolean).join(", ");
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
function TiposAccionView({ core, setCore }) {
  const [modal, setModal] = useState(null);
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
      <div className="flex justify-end mb-2"><button onClick={() => setModal({})} className="bg-[#E8871E] text-[#2A2118] rounded-sm px-3 py-1.5 font-bold text-sm flex items-center gap-1"><Plus size={14} /> Agregar</button></div>
      <div className="space-y-1.5">
        {core.tiposAccion.map((t) => (
          <div key={t.id} className="bg-white border border-[#E4DECF] rounded-sm p-2.5 flex items-center justify-between text-sm">
            <span className="font-semibold text-[#2A2118]">{t.nombre}</span>
            <div className="flex gap-1">
              <IconBtn label="Editar" onClick={() => setModal(t)}><Pencil size={14} /></IconBtn>
              <IconBtn label="Eliminar" danger onClick={() => delTipo(t.id)}><Trash2 size={14} /></IconBtn>
            </div>
          </div>
        ))}
      </div>
      {modal !== null && (
        <Modal title={modal.id ? "Editar tipo de acción" : "Nuevo tipo de acción"} onClose={() => setModal(null)}>
          <TipoAccionForm data={modal} onSave={saveTipo} />
        </Modal>
      )}
    </div>
  );
}

function EtiquetasView({ core, setCore }) {
  const [modal, setModal] = useState(null);
  const saveEtiqueta = (data) => {
    setCore((prev) => {
      const exists = prev.etiquetas.some((t) => t.id === data.id);
      return { ...prev, etiquetas: exists ? prev.etiquetas.map((t) => (t.id === data.id ? data : t)) : [...prev.etiquetas, data] };
    });
    setModal(null);
  };
  const delEtiqueta = (id) => setCore((prev) => ({
    ...prev,
    etiquetas: prev.etiquetas.filter((t) => t.id !== id),
    entidadEtiqueta: prev.entidadEtiqueta.filter((r) => r.etiquetaId !== id),
  }));

  return (
    <div>
      <div className="flex justify-end mb-2"><button onClick={() => setModal({})} className="bg-[#E8871E] text-[#2A2118] rounded-sm px-3 py-1.5 font-bold text-sm flex items-center gap-1"><Plus size={14} /> Agregar</button></div>
      <div className="space-y-1.5">
        {core.etiquetas.map((t) => (
          <div key={t.id} className="bg-white border border-[#E4DECF] rounded-sm p-2.5 flex items-center justify-between text-sm">
            <div>
              <span className="font-semibold text-[#2A2118]">{t.etiqueta}</span>
              <span className="text-[#8A8272]"> · {(core.categorias || []).find((c) => c.id === t.categoriaId)?.nombre || "sin categoría"} · aplica a {t.aplicaA}</span>
            </div>
            <div className="flex gap-1">
              <IconBtn label="Editar" onClick={() => setModal(t)}><Pencil size={14} /></IconBtn>
              <IconBtn label="Eliminar" danger onClick={() => delEtiqueta(t.id)}><Trash2 size={14} /></IconBtn>
            </div>
          </div>
        ))}
      </div>
      {modal !== null && (
        <Modal title={modal.id ? "Editar etiqueta" : "Nueva etiqueta"} onClose={() => setModal(null)}>
          <EtiquetaForm data={modal} core={core} setCore={setCore} onSave={saveEtiqueta} />
        </Modal>
      )}
    </div>
  );
}

function CategoriasView({ core, setCore }) {
  const [modal, setModal] = useState(null);
  const saveCategoria = (data) => {
    setCore((prev) => {
      const exists = (prev.categorias || []).some((c) => c.id === data.id);
      return { ...prev, categorias: exists ? prev.categorias.map((c) => (c.id === data.id ? data : c)) : [...(prev.categorias || []), data] };
    });
    setModal(null);
  };
  const delCategoria = (id) => setCore((prev) => ({ ...prev, categorias: (prev.categorias || []).filter((c) => c.id !== id) }));

  return (
    <div>
      <div className="flex justify-end mb-2"><button onClick={() => setModal({})} className="bg-[#E8871E] text-[#2A2118] rounded-sm px-3 py-1.5 font-bold text-sm flex items-center gap-1"><Plus size={14} /> Agregar</button></div>
      <div className="space-y-1.5">
        {(core.categorias || []).map((c) => (
          <div key={c.id} className="bg-white border border-[#E4DECF] rounded-sm p-2.5 flex items-center justify-between text-sm">
            <span className="font-semibold text-[#2A2118]">{c.nombre}</span>
            <div className="flex gap-1">
              <IconBtn label="Editar" onClick={() => setModal(c)}><Pencil size={14} /></IconBtn>
              <IconBtn label="Eliminar" danger onClick={() => delCategoria(c.id)}><Trash2 size={14} /></IconBtn>
            </div>
          </div>
        ))}
      </div>
      {modal !== null && (
        <Modal title={modal.id ? "Editar categoría" : "Nueva categoría"} onClose={() => setModal(null)}>
          <CategoriaForm data={modal} onSave={saveCategoria} />
        </Modal>
      )}
    </div>
  );
}

function CargosView({ core, setCore }) {
  const [modal, setModal] = useState(null);
  const saveCargo = (data) => {
    setCore((prev) => {
      const exists = prev.cargos.some((c) => c.id === data.id);
      return { ...prev, cargos: exists ? prev.cargos.map((c) => (c.id === data.id ? data : c)) : [...prev.cargos, data] };
    });
    setModal(null);
  };
  const delCargo = (id) => setCore((prev) => ({ ...prev, cargos: prev.cargos.filter((c) => c.id !== id) }));

  return (
    <div>
      <div className="flex justify-end mb-2"><button onClick={() => setModal({})} className="bg-[#E8871E] text-[#2A2118] rounded-sm px-3 py-1.5 font-bold text-sm flex items-center gap-1"><Plus size={14} /> Agregar</button></div>
      <div className="space-y-1.5">
        {(core.cargos || []).map((c) => (
          <div key={c.id} className="bg-white border border-[#E4DECF] rounded-sm p-2.5 flex items-center justify-between text-sm">
            <span className="font-semibold text-[#2A2118]">{c.nombre}</span>
            <div className="flex gap-1">
              <IconBtn label="Editar" onClick={() => setModal(c)}><Pencil size={14} /></IconBtn>
              <IconBtn label="Eliminar" danger onClick={() => delCargo(c.id)}><Trash2 size={14} /></IconBtn>
            </div>
          </div>
        ))}
      </div>
      {modal !== null && (
        <Modal title={modal.id ? "Editar cargo" : "Nuevo cargo"} onClose={() => setModal(null)}>
          <CargoForm data={modal} onSave={saveCargo} />
        </Modal>
      )}
    </div>
  );
}

function ConfigView({ core, setCore, acciones, setAcciones }) {
  const [section, setSection] = useState("parametros");
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmVaciar, setConfirmVaciar] = useState(false);

  const resetDemo = () => {
    setCore(seedCore());
    setAcciones(seedAcciones());
    setConfirmReset(false);
  };

  // Borra personas, empresas, obras, hilos (seguimientos y tareas) y acciones,
  // sin tocar etiquetas, categorías, cargos, tipos de acción, parámetros ni apariencia.
  const vaciarDatos = () => {
    setCore((prev) => ({
      ...prev,
      personas: [],
      empresas: [],
      obras: [],
      hilos: [],
      personaEmpresa: [],
      empresaObra: [],
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
  const restablecerTema = () => setCore((prev) => ({ ...prev, tema: { botonActivo: "#1B4D2E", botonInactivo: "#D9F0DE", tarjeta: "#FFFFFF", linea: "#E4DECF", fondo: "#F7F5F0", ink: "#2A2118", mutedBase: "#6B6352" } }));

  const PALETAS = [
    {
      id: "panel-obra-oscuro", nombre: "Panel de obra (oscuro)",
      tema: { botonActivo: "#5FB8C4", botonInactivo: "#232C37", tarjeta: "#1E262F", linea: "#303B47", fondo: "#171D24", ink: "#E7ECF2", mutedBase: "#8E9AA8" },
    },
    {
      id: "panel-obra-claro", nombre: "Panel de obra (claro)",
      tema: { botonActivo: "#1F7A86", botonInactivo: "#F3F5F6", tarjeta: "#FFFFFF", linea: "#D8DEE4", fondo: "#FFFFFF", ink: "#1B2430", mutedBase: "#5B6674" },
    },
    {
      id: "ficha-viva", nombre: "Ficha viva",
      tema: { botonActivo: "#3B5B8C", botonInactivo: "#EFE6D4", tarjeta: "#FBF8F1", linea: "#D9CBAF", fondo: "#F4EEE1", ink: "#2B2420", mutedBase: "#736555" },
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
            className="text-xs font-bold uppercase tracking-wide px-2.5 py-1.5 rounded-sm border border-[#E4DECF]"
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
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352] mb-2">Colores de urgencia en Seguimientos</p>
            <div className="flex items-center gap-2 mb-2 text-sm">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: "#B0452E" }} /> Vencida
            </div>
            <div className="flex items-center gap-2 mb-2 text-sm">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: "#E8871E" }} /> Próxima a vencer
            </div>
            <div className="flex items-center gap-2 mb-3 text-sm">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: "#3F6B4A" }} /> Con tiempo
            </div>
            <Field label="¿Cuántos días de acá en adelante se consideran 'próxima a vencer' (amarillo)?">
              <input type="number" min={0} className={inputCls} value={core.parametros.diasUrgente ?? 3} onChange={(e) => setDiasUrgente(e.target.value)} />
            </Field>
            <p className="text-xs text-[#8A8272]">Hoy y hasta {core.parametros.diasUrgente ?? 3} día{(core.parametros.diasUrgente ?? 3) === 1 ? "" : "s"} adelante: amarillo. Más lejos: verde. Ya pasada la fecha: rojo.</p>
          </div>

          <div className="bg-white border border-[#E4DECF] rounded-sm p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352] mb-2">Días hábiles</p>
            <div className="grid grid-cols-7 gap-1">
              {[["Lu", 1], ["Ma", 2], ["Mi", 3], ["Ju", 4], ["Vi", 5], ["Sá", 6], ["Do", 0]].map(([label, num]) => {
                const activo = (core.parametros.diasHabiles || []).includes(num);
                return (
                  <button
                    key={num}
                    onClick={() => toggleDiaHabil(num)}
                    style={{ backgroundColor: activo ? "#3F6B4A" : "#E7E2D8", color: activo ? "#FFFFFF" : "#6B6352" }}
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
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352] mb-2">Fechas puntuales no hábiles</p>
            <div className="flex gap-2 mb-3">
              <input type="date" className={inputCls} value={nuevaFechaNoHabil} onChange={(e) => setNuevaFechaNoHabil(e.target.value)} />
              <button onClick={agregarFechaNoHabil} className="shrink-0 bg-[#E8871E] text-[#2A2118] rounded-sm px-3 font-bold"><Plus size={16} /></button>
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
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352] mb-3">Paletas</p>
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
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352] mb-3">Botones</p>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-[#2A2118]">Botón activo (seleccionado)</label>
              <input type="color" value={core.tema.botonActivo} onChange={(e) => setTemaColor("botonActivo", e.target.value)} className="w-10 h-8 rounded-sm border border-[#E4DECF] cursor-pointer" />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-[#2A2118]">Botón inactivo</label>
              <input type="color" value={core.tema.botonInactivo} onChange={(e) => setTemaColor("botonInactivo", e.target.value)} className="w-10 h-8 rounded-sm border border-[#E4DECF] cursor-pointer" />
            </div>
            <div className="flex gap-2 mt-3">
              <button
                style={{ backgroundColor: core.tema.botonActivo, color: contrastText(core.tema.botonActivo) }}
                className="flex-1 py-2 rounded-sm text-xs font-bold uppercase tracking-wide"
              >
                Vista previa activo
              </button>
              <button
                style={{ backgroundColor: core.tema.botonInactivo, color: core.tema.ink }}
                className="flex-1 py-2 rounded-sm text-xs font-bold uppercase tracking-wide"
              >
                Vista previa inactivo
              </button>
            </div>
          </div>

          <div className="bg-white border border-[#E4DECF] rounded-sm p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352] mb-3">Fondo y tarjetas</p>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-[#2A2118]">Fondo de la página</label>
              <input type="color" value={core.tema.fondo} onChange={(e) => setTemaColor("fondo", e.target.value)} className="w-10 h-8 rounded-sm border border-[#E4DECF] cursor-pointer" />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-[#2A2118]">Fondo de las tarjetas</label>
              <input type="color" value={core.tema.tarjeta} onChange={(e) => setTemaColor("tarjeta", e.target.value)} className="w-10 h-8 rounded-sm border border-[#E4DECF] cursor-pointer" />
            </div>
          </div>

          <div className="bg-white border border-[#E4DECF] rounded-sm p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352] mb-3">Texto</p>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-[#2A2118]">Texto principal</label>
              <input type="color" value={core.tema.ink} onChange={(e) => setTemaColor("ink", e.target.value)} className="w-10 h-8 rounded-sm border border-[#E4DECF] cursor-pointer" />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-[#2A2118]">Texto secundario</label>
              <input type="color" value={core.tema.mutedBase} onChange={(e) => setTemaColor("mutedBase", e.target.value)} className="w-10 h-8 rounded-sm border border-[#E4DECF] cursor-pointer" />
            </div>
          </div>

          <div className="bg-white border border-[#E4DECF] rounded-sm p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B6352] mb-3">Líneas</p>
            <div className="flex items-center justify-between">
              <label className="text-sm text-[#2A2118]">Color de bordes y separadores</label>
              <input type="color" value={core.tema.linea} onChange={(e) => setTemaColor("linea", e.target.value)} className="w-10 h-8 rounded-sm border border-[#E4DECF] cursor-pointer" />
            </div>
          </div>

          <button onClick={restablecerTema} className="text-xs font-bold uppercase tracking-wide text-[#B0452E]">Restablecer colores originales</button>

          <p className="text-xs text-[#A69C88]">Esto cambia el fondo, el texto, los botones principales, las tarjetas y las líneas divisorias en toda la app. Los bordes de urgencia de Seguimientos (rojo/amarillo/verde) y los colores de prioridad no se ven afectados — esos siguen su propia lógica.</p>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-[#E4DECF]">
        <button onClick={() => setConfirmVaciar(true)} className="text-xs font-bold uppercase tracking-wide text-[#B0452E] flex items-center gap-1.5">
          <AlertTriangle size={13} /> Vaciar todos los datos cargados
        </button>
        <p className="text-xs text-[#A69C88] mt-1">Borra personas, empresas, obras, seguimientos, tareas y acciones. No toca etiquetas, categorías, cargos, tipos de acción ni la apariencia.</p>
      </div>

      <div className="mt-4 pt-4 border-t border-[#E4DECF]">
        <button onClick={() => setConfirmReset(true)} className="text-xs font-bold uppercase tracking-wide text-[#B0452E] flex items-center gap-1.5">
          <AlertTriangle size={13} /> Reiniciar datos de demo
        </button>
        <p className="text-xs text-[#A69C88] mt-1">Borra todo lo que cargaste y vuelve a dejar los datos ficticios originales.</p>
      </div>

      <p className="text-center text-[10px] font-mono text-[#C9C1AE] mt-6">Versión {APP_VERSION}</p>

      {confirmVaciar && (
        <Modal title="¿Vaciar todos los datos cargados?" onClose={() => setConfirmVaciar(false)}>
          <p className="text-sm text-[#2A2118] mb-4">Esto borra permanentemente todas las personas, empresas, obras, seguimientos, tareas y acciones. Las etiquetas, categorías, cargos, tipos de acción y la apariencia quedan como están. No se puede deshacer.</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmVaciar(false)} className="flex-1 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#6B6352]">Cancelar</button>
            <button onClick={vaciarDatos} style={{ backgroundColor: "#B0452E", color: "#FFFFFF" }} className="flex-1 rounded-sm py-2.5 font-bold text-sm">Sí, vaciar todo</button>
          </div>
        </Modal>
      )}

      {confirmReset && (
        <Modal title="¿Reiniciar datos de demo?" onClose={() => setConfirmReset(false)}>
          <p className="text-sm text-[#2A2118] mb-4">Esto borra todas las personas, empresas, obras, acciones y configuraciones que cargaste, y los reemplaza por los datos ficticios de ejemplo. No se puede deshacer.</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmReset(false)} className="flex-1 border border-[#D8D2C4] rounded-sm py-2.5 font-bold text-sm text-[#6B6352]">Cancelar</button>
            <button onClick={resetDemo} style={{ backgroundColor: "#B0452E", color: "#FFFFFF" }} className="flex-1 rounded-sm py-2.5 font-bold text-sm">Sí, reiniciar</button>
          </div>
        </Modal>
      )}

    </div>
  );
}

function CargoForm({ data, onSave }) {
  const [nombre, setNombre] = useState(data.nombre || "");
  return (
    <div>
      <Field label="Nombre"><input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Gerente de Compras" /></Field>
      <PrimaryBtn full onClick={() => nombre.trim() && onSave({ id: data.id || uid("C"), nombre: nombre.trim() })}>Guardar</PrimaryBtn>
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
