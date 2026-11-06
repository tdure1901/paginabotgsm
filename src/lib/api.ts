import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { generarDemo } from "./demo";
import type { MensajeChat, Notificacion, Reclamo, ReclamoImport } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined;
const N8N_MENSAJE = import.meta.env.VITE_N8N_WEBHOOK_MENSAJE as string | undefined;

export const supabase: SupabaseClient | null = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
export const MODO_DEMO = !supabase;
export const CHAT_MANUAL_HABILITADO = MODO_DEMO || !!N8N_MENSAJE;

export interface Datos {
  reclamos: Reclamo[];
  notificaciones: Notificacion[];
  mensajes: MensajeChat[];
  /** false si la tabla whatsapp_mensajes todavía no existe */
  chatDisponible: boolean;
}

/* ---------------- Sesión ---------------- */

export async function obtenerSesion(): Promise<Session | null> {
  if (!supabase) return null;
  return (await supabase.auth.getSession()).data.session;
}
export function escucharSesion(cb: (s: Session | null) => void) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_e, s) => cb(s));
  return () => data.subscription.unsubscribe();
}
export async function ingresar(email: string, password: string) {
  const { error } = await supabase!.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === "Invalid login credentials" ? "Email o contraseña incorrectos." : error.message);
}
export async function salir() {
  await supabase?.auth.signOut();
}

/* ---------------- Modo demo (localStorage) ---------------- */

const LS_KEY = "reclamos-bot-demo-v2";
type Demo = Omit<Datos, "chatDisponible">;

function leerDemo(): Demo {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as Demo;
  } catch {
    /* ignorar */
  }
  const d = generarDemo();
  guardarDemo(d);
  return d;
}
function guardarDemo(d: Demo) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(d));
  } catch {
    /* ignorar */
  }
}

/* ---------------- Lectura ---------------- */

const str = <T extends { id: unknown; reclamo_id?: unknown }>(x: T) =>
  ({ ...x, id: String(x.id), ...(x.reclamo_id !== undefined ? { reclamo_id: String(x.reclamo_id) } : {}) }) as T;

async function traerTodo<T>(tabla: string, orden: string, asc: boolean): Promise<T[]> {
  const out: T[] = [];
  const PAG = 1000;
  for (let desde = 0; ; desde += PAG) {
    const { data, error } = await supabase!
      .from(tabla)
      .select("*")
      .order(orden, { ascending: asc })
      .range(desde, desde + PAG - 1);
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < PAG) break;
  }
  return out;
}

export async function cargarDatos(): Promise<Datos> {
  if (!supabase) return { ...leerDemo(), chatDisponible: true };
  const [reclamos, notificaciones] = await Promise.all([
    traerTodo<Reclamo>("reclamos", "numero_reclamo", false),
    traerTodo<Notificacion>("whatsapp_notificaciones", "created_at", true),
  ]);
  let mensajes: MensajeChat[] = [];
  let chatDisponible = true;
  try {
    mensajes = await traerTodo<MensajeChat>("whatsapp_mensajes", "created_at", true);
  } catch {
    chatDisponible = false; // la tabla del chat todavía no se creó
  }
  return {
    reclamos: reclamos.map(str),
    notificaciones: notificaciones.map(str),
    mensajes: mensajes.map(str),
    chatDisponible,
  };
}

export function suscribirCambios(onChange: () => void): () => void {
  if (!supabase) return () => {};
  let t: ReturnType<typeof setTimeout> | undefined;
  const debounced = () => {
    clearTimeout(t);
    t = setTimeout(onChange, 400);
  };
  const ch = supabase.channel("panel-reclamos");
  for (const table of ["reclamos", "whatsapp_notificaciones", "whatsapp_mensajes"])
    ch.on("postgres_changes", { event: "*", schema: "public", table }, debounced);
  ch.subscribe();
  return () => {
    clearTimeout(t);
    supabase!.removeChannel(ch);
  };
}

/* ---------------- Importación ---------------- */

export interface ResultadoImport {
  procesados: number;
  lotesFallidos: { lote: number; desde: number; hasta: number; motivo: string }[];
}

/** Upsert por numero_reclamo en lotes de 500 (igual que la app de Lovable) */
export async function importarReclamos(validos: ReclamoImport[], progreso?: (hechos: number, total: number) => void): Promise<ResultadoImport> {
  const ahora = new Date().toISOString();
  const LOTE = 500;
  if (!supabase) {
    const d = leerDemo();
    const idx = new Map(d.reclamos.map((r, i) => [r.numero_reclamo, i]));
    for (const v of validos) {
      const i = idx.get(v.numero_reclamo);
      if (i !== undefined) d.reclamos[i] = { ...d.reclamos[i], ...v, updated_at: ahora };
      else d.reclamos.unshift({ ...v, id: crypto.randomUUID(), updated_at: ahora });
    }
    guardarDemo(d);
    progreso?.(validos.length, validos.length);
    return { procesados: validos.length, lotesFallidos: [] };
  }
  let procesados = 0;
  const lotesFallidos: ResultadoImport["lotesFallidos"] = [];
  for (let i = 0; i < validos.length; i += LOTE) {
    const chunk = validos.slice(i, i + LOTE).map((r) => ({ ...r, updated_at: ahora }));
    const { error } = await supabase.from("reclamos").upsert(chunk, { onConflict: "numero_reclamo" });
    if (error) lotesFallidos.push({ lote: i / LOTE + 1, desde: i + 1, hasta: i + chunk.length, motivo: error.message });
    else procesados += chunk.length;
    progreso?.(Math.min(i + chunk.length, validos.length), validos.length);
  }
  return { procesados, lotesFallidos };
}

/* ---------------- Chat ---------------- */

export async function enviarMensaje(reclamo: Reclamo, contenido: string): Promise<void> {
  const msg = { reclamo_id: reclamo.id, direccion: "saliente" as const, origen: "operador" as const, contenido };
  if (!supabase) {
    const d = leerDemo();
    d.mensajes.push({ ...msg, id: crypto.randomUUID(), created_at: new Date().toISOString() });
    guardarDemo(d);
    return;
  }
  if (!N8N_MENSAJE) throw new Error("Falta configurar VITE_N8N_WEBHOOK_MENSAJE.");
  const res = await fetch(N8N_MENSAJE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reclamo_id: reclamo.id,
      numero_reclamo: reclamo.numero_reclamo,
      telefono: reclamo.telefono_normalizado,
      solicitante: reclamo.solicitante,
      mensaje: contenido,
    }),
  });
  if (!res.ok) throw new Error(`n8n respondió ${res.status}`);
  const { error } = await supabase.from("whatsapp_mensajes").insert(msg);
  if (error) throw error;
}

/* ---------------- "Leído" por conversación (se guarda en este navegador) ---------------- */

const LS_VISTO = "reclamos-bot-visto";
export function leerVistos(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LS_VISTO) ?? "{}");
  } catch {
    return {};
  }
}
export function marcarVisto(reclamoId: string) {
  const v = leerVistos();
  v[reclamoId] = new Date().toISOString();
  try {
    localStorage.setItem(LS_VISTO, JSON.stringify(v));
  } catch {
    /* ignorar */
  }
}
