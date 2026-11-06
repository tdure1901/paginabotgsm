import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generarDemo } from "./demo";
import type { FilaImportada, Lote, Mensaje, Reclamo } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const N8N_LOTE = import.meta.env.VITE_N8N_WEBHOOK_LOTE as string | undefined;
const N8N_MENSAJE = import.meta.env.VITE_N8N_WEBHOOK_MENSAJE as string | undefined;

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

export const MODO_DEMO = !supabase;

export interface Datos {
  reclamos: Reclamo[];
  mensajes: Mensaje[];
  lotes: Lote[];
}

/* ---------------- Modo demo (localStorage) ---------------- */

const LS_KEY = "reclamos-bot-demo-v1";

function leerDemo(): Datos {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as Datos;
  } catch {
    /* ignorar */
  }
  const d = generarDemo();
  guardarDemo(d);
  return d;
}
function guardarDemo(d: Datos) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(d));
  } catch {
    /* ignorar */
  }
}
export function reiniciarDemo() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignorar */
  }
}

/* ---------------- Lectura ---------------- */

export async function cargarDatos(): Promise<Datos> {
  if (!supabase) return leerDemo();
  const [r, m, l] = await Promise.all([
    supabase.from("reclamos").select("*").order("created_at", { ascending: false }),
    supabase.from("mensajes").select("*").order("created_at", { ascending: true }),
    supabase.from("lotes").select("*").order("created_at", { ascending: false }),
  ]);
  if (r.error) throw r.error;
  if (m.error) throw m.error;
  if (l.error) throw l.error;
  return { reclamos: r.data as Reclamo[], mensajes: m.data as Mensaje[], lotes: l.data as Lote[] };
}

/** Suscripción a cambios en tiempo real (Supabase Realtime). Devuelve función para desuscribirse. */
export function suscribirCambios(onChange: () => void): () => void {
  if (!supabase) return () => {};
  const ch = supabase
    .channel("panel-reclamos")
    .on("postgres_changes", { event: "*", schema: "public", table: "reclamos" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "mensajes" }, onChange)
    .subscribe();
  return () => {
    supabase!.removeChannel(ch);
  };
}

/* ---------------- Escritura ---------------- */

async function llamarWebhook(url: string | undefined, body: unknown) {
  if (!url) return { ok: true, simulado: true };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`n8n respondió ${res.status}`);
  return { ok: true, simulado: false };
}

export async function importarLote(nombreArchivo: string, filas: FilaImportada[], enviarAlBot: boolean): Promise<Lote> {
  const ahora = new Date().toISOString();
  const nuevos = filas.map((f, i) => ({
    numero_reclamo: f.numero_reclamo?.trim() || `R-${Date.now().toString().slice(-6)}-${i + 1}`,
    nombre: f.nombre?.trim() ?? "",
    telefono: normalizarTelefono(f.telefono ?? ""),
    direccion: f.direccion?.trim() ?? "",
    barrio: f.barrio?.trim() ?? "",
    tipo: f.tipo?.trim() ?? "",
    descripcion: f.descripcion?.trim() ?? "",
    fecha_reclamo: normalizarFecha(f.fecha_reclamo),
  }));

  if (!supabase) {
    const d = leerDemo();
    const lote: Lote = { id: crypto.randomUUID(), created_at: ahora, nombre_archivo: nombreArchivo, cantidad: nuevos.length };
    const reclamos: Reclamo[] = nuevos.map((n) => ({
      ...n,
      id: crypto.randomUUID(),
      created_at: ahora,
      lote_id: lote.id,
      estado_envio: "pendiente",
      respuesta: "sin_respuesta",
      enviado_at: null,
      respondido_at: null,
    }));
    d.lotes.unshift(lote);
    d.reclamos.unshift(...reclamos);
    if (enviarAlBot) simularEnvioDemo(d, reclamos);
    guardarDemo(d);
    return lote;
  }

  const { data: lote, error: e1 } = await supabase
    .from("lotes")
    .insert({ nombre_archivo: nombreArchivo, cantidad: nuevos.length })
    .select()
    .single();
  if (e1) throw e1;
  const { error: e2 } = await supabase.from("reclamos").insert(nuevos.map((n) => ({ ...n, lote_id: lote.id })));
  if (e2) throw e2;
  if (enviarAlBot) await llamarWebhook(N8N_LOTE, { lote_id: lote.id, cantidad: nuevos.length });
  return lote as Lote;
}

export async function enviarLoteAlBot(loteId: string) {
  if (!supabase) {
    const d = leerDemo();
    simularEnvioDemo(d, d.reclamos.filter((r) => r.lote_id === loteId && r.estado_envio === "pendiente"));
    guardarDemo(d);
    return;
  }
  await llamarWebhook(N8N_LOTE, { lote_id: loteId });
}

export async function enviarMensaje(reclamo: Reclamo, contenido: string): Promise<Mensaje> {
  const msg = {
    reclamo_id: reclamo.id,
    direccion: "saliente" as const,
    origen: "operador" as const,
    contenido,
    leido: true,
  };
  if (!supabase) {
    const d = leerDemo();
    const m: Mensaje = { ...msg, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    d.mensajes.push(m);
    guardarDemo(d);
    return m;
  }
  // n8n se encarga de mandar el WhatsApp; nosotros registramos el mensaje en la base
  await llamarWebhook(N8N_MENSAJE, { reclamo_id: reclamo.id, telefono: reclamo.telefono, nombre: reclamo.nombre, mensaje: contenido });
  const { data, error } = await supabase.from("mensajes").insert(msg).select().single();
  if (error) throw error;
  return data as Mensaje;
}

export async function marcarLeidos(reclamoId: string) {
  if (!supabase) {
    const d = leerDemo();
    d.mensajes.forEach((m) => {
      if (m.reclamo_id === reclamoId) m.leido = true;
    });
    guardarDemo(d);
    return;
  }
  await supabase.from("mensajes").update({ leido: true }).eq("reclamo_id", reclamoId).eq("leido", false);
}

export async function actualizarRespuesta(reclamoId: string, respuesta: Reclamo["respuesta"]) {
  const respondido_at = respuesta === "sin_respuesta" ? null : new Date().toISOString();
  if (!supabase) {
    const d = leerDemo();
    const r = d.reclamos.find((x) => x.id === reclamoId);
    if (r) {
      r.respuesta = respuesta;
      r.respondido_at = respondido_at;
    }
    guardarDemo(d);
    return;
  }
  const { error } = await supabase.from("reclamos").update({ respuesta, respondido_at }).eq("id", reclamoId);
  if (error) throw error;
}

/* ---------------- Utilidades ---------------- */

function simularEnvioDemo(d: Datos, reclamos: Reclamo[]) {
  const ahora = new Date().toISOString();
  for (const r of reclamos) {
    const real = d.reclamos.find((x) => x.id === r.id);
    if (!real) continue;
    real.estado_envio = "enviado";
    real.enviado_at = ahora;
    d.mensajes.push({
      id: crypto.randomUUID(),
      reclamo_id: r.id,
      direccion: "saliente",
      origen: "bot",
      contenido: `Hola ${r.nombre.split(" ")[0]}! Te escribimos desde la Municipalidad por tu reclamo ${r.numero_reclamo}${r.tipo ? ` (${r.tipo})` : ""}. ¿Se solucionó el problema? Respondé SÍ o NO.`,
      created_at: ahora,
      leido: true,
    });
  }
}

export function normalizarTelefono(t: string) {
  return t.replace(/[^\d+]/g, "");
}

function normalizarFecha(v?: string): string | null {
  if (!v) return null;
  const s = v.trim();
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const yy = y.length === 2 ? `20${y}` : y;
    return `${yy}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}
