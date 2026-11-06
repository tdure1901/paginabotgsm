/**
 * Lecturas de la base, pensadas para no descargar todo:
 * - Monitoreo: solo columnas livianas y solo el período elegido.
 * - Conversaciones: como máximo los 100 chats más recientes (vista `conversaciones`), y el hilo completo
 *   solo del chat abierto.
 * - Importación: consulta puntual de los Nro. de reclamo del archivo.
 */
import { leerDemo, supabase } from "./api";
import { categoria } from "./format";
import { esCandidato } from "./importacion";
import type { Conversacion, Exclusion, MensajeChat, Notificacion, Reclamo } from "./types";

export const LIMITE_CONVERSACIONES = 100;
const PAG = 1000;

/** Columnas que necesitan las listas (sin los textos largos) */
const COLS_RECLAMO =
  "id,numero_reclamo,fecha_ingreso,estado,situacion,motivo,submotivo,localidad,calle,numero_domicilio,solicitante,telefono_original,telefono_normalizado,telefono_valido,whatsapp_eligible,updated_at";
const COLS_NOTIF = "id,created_at,updated_at,reclamo_id,estado,respuesta_usuario,notificado_at,respondido_at,telefono_destino";

const aStr = <T extends object>(x: T): T => {
  const o = { ...x } as Record<string, unknown>;
  if (o.id != null) o.id = String(o.id);
  if (o.reclamo_id != null) o.reclamo_id = String(o.reclamo_id);
  return o as T;
};

/* ---------------- Período ---------------- */

export type Periodo = "30d" | "3m" | "6m" | "12m" | "todo";
export const PERIODOS: { id: Periodo; label: string }[] = [
  { id: "30d", label: "Últimos 30 días" },
  { id: "3m", label: "Últimos 3 meses" },
  { id: "6m", label: "Últimos 6 meses" },
  { id: "12m", label: "Último año" },
  { id: "todo", label: "Todo" },
];

/** Fecha desde la que se traen reclamos (por fecha de ingreso) */
export function desdePeriodo(p: Periodo): string | null {
  if (p === "todo") return null;
  const d = new Date();
  if (p === "30d") d.setDate(d.getDate() - 30);
  else d.setMonth(d.getMonth() - { "3m": 3, "6m": 6, "12m": 12 }[p]);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 19);
}

/* ---------------- Monitoreo ---------------- */

export interface DatosMonitoreo {
  reclamos: Reclamo[];
  notificaciones: Notificacion[];
}

export async function cargarMonitoreo(periodo: Periodo): Promise<DatosMonitoreo> {
  const desde = desdePeriodo(periodo);
  if (!supabase) {
    const d = leerDemo();
    const reclamos = d.reclamos.filter((r) => !desde || !r.fecha_ingreso || r.fecha_ingreso >= desde);
    const ids = new Set(reclamos.map((r) => r.id));
    return { reclamos, notificaciones: d.notificaciones.filter((n) => ids.has(n.reclamo_id)) };
  }
  const reclamos: Reclamo[] = [];
  for (let i = 0; ; i += PAG) {
    let q = supabase.from("reclamos").select(COLS_RECLAMO).order("numero_reclamo", { ascending: false }).range(i, i + PAG - 1);
    if (desde) q = q.or(`fecha_ingreso.gte.${desde},fecha_ingreso.is.null`);
    const { data, error } = await q;
    if (error) throw error;
    reclamos.push(...(data as unknown as Reclamo[]).map(aStr));
    if (data.length < PAG) break;
  }
  // Un aviso siempre es posterior al ingreso del reclamo, así que alcanza con traer los avisos desde la misma fecha
  const notificaciones: Notificacion[] = [];
  for (let i = 0; ; i += PAG) {
    let q = supabase.from("whatsapp_notificaciones").select(COLS_NOTIF).order("created_at", { ascending: true }).range(i, i + PAG - 1);
    if (desde) q = q.gte("created_at", desde);
    const { data, error } = await q;
    if (error) throw error;
    notificaciones.push(...(data as unknown as Notificacion[]).map(aStr));
    if (data.length < PAG) break;
  }
  return { reclamos, notificaciones };
}

/** Reclamo completo (con textos), para las fichas */
export async function obtenerReclamo(id: string): Promise<Reclamo | null> {
  if (!supabase) return leerDemo().reclamos.find((r) => r.id === id) ?? null;
  const { data, error } = await supabase.from("reclamos").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? aStr(data as Reclamo) : null;
}

/* ---------------- Conversaciones ---------------- */

export type FiltroConv = "todas" | "sin_contestar" | "si" | "no" | "respondido_otro" | "pendiente";

/** Los chats más recientes (máximo 100), con búsqueda y filtro resueltos en la base */
export async function cargarConversaciones(filtro: FiltroConv = "todas", busqueda = ""): Promise<{ lista: Conversacion[]; disponible: boolean }> {
  const q = busqueda.trim().toLowerCase();
  if (!supabase) {
    const lista = conversacionesDemo()
      .filter((c) => (filtro === "todas" ? true : filtro === "sin_contestar" ? c.ultima_direccion === "entrante" : c.categoria === filtro))
      .filter((c) => !q || [c.solicitante, c.numero_reclamo, c.telefono_normalizado].some((x) => x?.toLowerCase().includes(q)))
      .slice(0, LIMITE_CONVERSACIONES);
    return { lista, disponible: true };
  }
  let consulta = supabase.from("conversaciones").select("*").order("ultima_fecha", { ascending: false }).limit(LIMITE_CONVERSACIONES);
  if (filtro === "sin_contestar") consulta = consulta.eq("ultima_direccion", "entrante");
  else if (filtro !== "todas") consulta = consulta.eq("categoria", filtro);
  if (q) {
    const t = q.replace(/[%,()*]/g, " ").trim();
    consulta = consulta.or(`solicitante.ilike.*${t}*,numero_reclamo.ilike.*${t}*,telefono_normalizado.ilike.*${t.replace(/\D/g, "") || t}*`);
  }
  const { data, error } = await consulta;
  if (error) {
    // La vista todavía no se creó
    if (/conversaciones/.test(error.message) && /(does not exist|not find|schema cache)/i.test(error.message)) return { lista: [], disponible: false };
    throw error;
  }
  return { lista: (data as Conversacion[]).map(aStr), disponible: true };
}

/** Hilo completo de UN reclamo: mensajes + avisos/respuestas anteriores a whatsapp_mensajes */
export async function cargarHilo(reclamoId: string): Promise<{ mensajes: MensajeChat[]; notificaciones: Notificacion[]; chatDisponible: boolean }> {
  if (!supabase) {
    const d = leerDemo();
    return {
      mensajes: d.mensajes.filter((m) => m.reclamo_id === reclamoId),
      notificaciones: d.notificaciones.filter((n) => n.reclamo_id === reclamoId),
      chatDisponible: true,
    };
  }
  const [m, n] = await Promise.all([
    supabase.from("whatsapp_mensajes").select("*").eq("reclamo_id", reclamoId).order("created_at"),
    supabase.from("whatsapp_notificaciones").select(COLS_NOTIF).eq("reclamo_id", reclamoId).order("created_at"),
  ]);
  if (n.error) throw n.error;
  return {
    mensajes: m.error ? [] : (m.data as MensajeChat[]).map(aStr),
    notificaciones: (n.data as unknown as Notificacion[]).map(aStr),
    chatDisponible: !m.error,
  };
}

function conversacionesDemo(): Conversacion[] {
  const d = leerDemo();
  const porId = new Map(d.reclamos.map((r) => [r.id, r]));
  const out = new Map<string, Conversacion>();
  const ev = (id: string, fecha: string, contenido: string, direccion: "saliente" | "entrante", origen: Conversacion["ultimo_origen"]) => {
    const r = porId.get(id);
    if (!r) return;
    const c =
      out.get(id) ??
      ({
        reclamo_id: id,
        numero_reclamo: r.numero_reclamo,
        solicitante: r.solicitante,
        telefono_normalizado: r.telefono_normalizado,
        motivo: r.motivo,
        submotivo: r.submotivo,
        ultima_fecha: "",
        ultimo_contenido: null,
        ultima_direccion: direccion,
        ultimo_origen: origen,
        ultima_entrada: null,
        notif_estado: null,
        notif_respuesta: null,
        categoria: null,
      } as Conversacion);
    if (fecha >= c.ultima_fecha) Object.assign(c, { ultima_fecha: fecha, ultimo_contenido: contenido, ultima_direccion: direccion, ultimo_origen: origen });
    if (direccion === "entrante" && (!c.ultima_entrada || fecha > c.ultima_entrada)) c.ultima_entrada = fecha;
    out.set(id, c);
  };
  for (const m of d.mensajes) ev(m.reclamo_id, m.created_at, m.contenido, m.direccion, m.origen);
  const ultimaN = new Map<string, Notificacion>();
  for (const n of d.notificaciones) {
    ev(n.reclamo_id, n.notificado_at ?? n.created_at, "Notificación de WhatsApp enviada.", "saliente", "bot");
    if (n.respuesta_usuario) ev(n.reclamo_id, n.respondido_at ?? n.updated_at ?? n.created_at, n.respuesta_usuario, "entrante", "vecino");
    const p = ultimaN.get(n.reclamo_id);
    if (!p || n.created_at >= p.created_at) ultimaN.set(n.reclamo_id, n);
  }
  for (const c of out.values()) {
    const n = ultimaN.get(c.reclamo_id);
    if (n) Object.assign(c, { notif_estado: n.estado, notif_respuesta: n.respuesta_usuario, categoria: categoria(n) });
  }
  return [...out.values()].sort((a, b) => b.ultima_fecha.localeCompare(a.ultima_fecha));
}

/* ---------------- Teléfonos ---------------- */

/** Reclamos que cumplen las reglas salvo el teléfono y todavía no se avisaron (o el aviso falló) */
export async function cargarTelefonosInvalidos(): Promise<Reclamo[]> {
  let candidatos: Reclamo[];
  let notifs: Notificacion[];
  if (!supabase) {
    const d = leerDemo();
    candidatos = d.reclamos.filter((r) => !r.telefono_valido && esCandidato(r.estado, r.situacion, r.motivo));
    const ids = new Set(candidatos.map((r) => r.id));
    notifs = d.notificaciones.filter((n) => ids.has(n.reclamo_id));
  } else {
    const { data, error } = await supabase
      .from("reclamos")
      .select(COLS_RECLAMO)
      .eq("telefono_valido", false)
      .eq("estado", "Cerrado")
      .eq("situacion", "Resp.Positiva")
      .order("numero_reclamo", { ascending: false })
      .limit(2000);
    if (error) throw error;
    candidatos = (data as unknown as Reclamo[]).map(aStr).filter((r) => esCandidato(r.estado, r.situacion, r.motivo));
    notifs = [];
    const ids = candidatos.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 150) {
      const { data: n, error: e2 } = await supabase.from("whatsapp_notificaciones").select("reclamo_id,estado").in("reclamo_id", ids.slice(i, i + 150));
      if (e2) throw e2;
      notifs.push(...(n as unknown as Notificacion[]).map(aStr));
    }
  }
  const yaAvisados = new Set(notifs.filter((n) => !["pendiente", "error"].includes((n.estado ?? "").toLowerCase())).map((n) => n.reclamo_id));
  return candidatos.filter((r) => !yaAvisados.has(r.id));
}

export async function cargarExclusiones(): Promise<{ exclusiones: Exclusion[]; disponible: boolean }> {
  if (!supabase) return { exclusiones: leerDemo().exclusiones, disponible: true };
  const { data, error } = await supabase.from("whatsapp_exclusiones").select("*").order("created_at", { ascending: false });
  if (error) return { exclusiones: [], disponible: false };
  return { exclusiones: data as Exclusion[], disponible: true };
}

/** Reclamos que tienen alguno de estos teléfonos (para mostrar a quién pertenece cada número) */
export async function reclamosPorTelefonos(tels: string[]): Promise<Reclamo[]> {
  if (!tels.length) return [];
  if (!supabase) return leerDemo().reclamos.filter((r) => r.telefono_normalizado && tels.includes(r.telefono_normalizado));
  const out: Reclamo[] = [];
  for (let i = 0; i < tels.length; i += 150) {
    const { data, error } = await supabase.from("reclamos").select(COLS_RECLAMO).in("telefono_normalizado", tels.slice(i, i + 150));
    if (error) throw error;
    out.push(...(data as unknown as Reclamo[]).map(aStr));
  }
  return out;
}

/* ---------------- Importación ---------------- */

export interface ExistenteImport {
  numero_reclamo: string;
  telefono_original: string | null;
  telefono_normalizado: string | null;
  telefono_valido: boolean;
}

/** Cuáles de estos Nro. de reclamo ya están en la base (y con qué teléfono) */
export async function buscarExistentes(nros: string[]): Promise<Map<string, ExistenteImport>> {
  const m = new Map<string, ExistenteImport>();
  if (!supabase) {
    const set = new Set(nros);
    for (const r of leerDemo().reclamos) if (set.has(r.numero_reclamo)) m.set(r.numero_reclamo, r);
    return m;
  }
  for (let i = 0; i < nros.length; i += 200) {
    const { data, error } = await supabase
      .from("reclamos")
      .select("numero_reclamo,telefono_original,telefono_normalizado,telefono_valido")
      .in("numero_reclamo", nros.slice(i, i + 200));
    if (error) throw error;
    for (const r of data as ExistenteImport[]) m.set(r.numero_reclamo, r);
  }
  return m;
}

/* ---------------- Tiempo real ---------------- */

export type Tabla = "reclamos" | "whatsapp_notificaciones" | "whatsapp_mensajes" | "whatsapp_exclusiones";

/** Avisa qué tabla cambió (agrupando cambios seguidos para no recargar de más) */
export function suscribirCambios(onChange: (tablas: Set<Tabla>) => void): () => void {
  if (!supabase) return () => {};
  let t: ReturnType<typeof setTimeout> | undefined;
  let pendientes = new Set<Tabla>();
  const ch = supabase.channel("panel-reclamos");
  for (const table of ["reclamos", "whatsapp_notificaciones", "whatsapp_mensajes", "whatsapp_exclusiones"] as Tabla[]) {
    ch.on("postgres_changes", { event: "*", schema: "public", table }, () => {
      pendientes.add(table);
      clearTimeout(t);
      // Durante una importación llegan cientos de cambios: se espera a que terminen
      t = setTimeout(() => {
        const p = pendientes;
        pendientes = new Set();
        onChange(p);
      }, 1500);
    });
  }
  ch.subscribe();
  return () => {
    clearTimeout(t);
    supabase!.removeChannel(ch);
  };
}
