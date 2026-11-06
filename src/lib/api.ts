import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { generarDemo } from "./demo";
import type { Exclusion, MensajeChat, Notificacion, Reclamo, ReclamoImport } from "./types";
import { esElegible, normalizarTelefono } from "./importacion";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined;
const N8N_MENSAJE = import.meta.env.VITE_N8N_WEBHOOK_MENSAJE as string | undefined;

export const supabase: SupabaseClient | null = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
export const MODO_DEMO = !supabase;
export const CHAT_MANUAL_HABILITADO = MODO_DEMO || !!N8N_MENSAJE;

/** Contenido completo del modo demo (se guarda en el navegador) */
export interface Demo {
  reclamos: Reclamo[];
  notificaciones: Notificacion[];
  mensajes: MensajeChat[];
  exclusiones: Exclusion[];
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

const LS_KEY = "reclamos-bot-demo-v5";
export function leerDemo(): Demo {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { exclusiones: [], ...JSON.parse(raw) } as Demo;
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

/* ---------------- Teléfonos y lista de no elegibles ---------------- */

async function emailActual() {
  return supabase ? ((await supabase.auth.getUser()).data.user?.email ?? null) : "demo";
}

/** Agrega un número a la lista de no elegibles y saca de la cola a sus reclamos */
export async function agregarExclusion(telefonoCrudo: string, motivo: string) {
  const t = normalizarTelefono(telefonoCrudo);
  if (!t.valido || !t.normalizado) throw new Error("El teléfono no es válido.");
  const tel = t.normalizado;
  const fila: Exclusion = { telefono: tel, motivo: motivo.trim() || null, created_at: new Date().toISOString(), creado_por: await emailActual() };
  if (!supabase) {
    const d = leerDemo();
    d.exclusiones = [fila, ...d.exclusiones.filter((e) => e.telefono !== tel)];
    d.reclamos.forEach((r) => {
      if (r.telefono_normalizado === tel) r.whatsapp_eligible = false;
    });
    guardarDemo(d);
    return;
  }
  const { error } = await supabase.from("whatsapp_exclusiones").upsert({ telefono: tel, motivo: fila.motivo, creado_por: fila.creado_por });
  if (error) throw error;
  const { error: e2 } = await supabase.from("reclamos").update({ whatsapp_eligible: false }).eq("telefono_normalizado", tel);
  if (e2) throw e2;
}

/** Quita un número de la lista y vuelve a habilitar los reclamos que cumplen las reglas */
export async function quitarExclusion(tel: string, reclamos: Reclamo[]) {
  const habilitar = reclamos
    .filter((r) => r.telefono_normalizado === tel && esElegible(r, { normalizado: tel, valido: r.telefono_valido }))
    .map((r) => r.id);
  if (!supabase) {
    const d = leerDemo();
    d.exclusiones = d.exclusiones.filter((e) => e.telefono !== tel);
    d.reclamos.forEach((r) => {
      if (habilitar.includes(r.id)) r.whatsapp_eligible = true;
    });
    guardarDemo(d);
    return;
  }
  const { error } = await supabase.from("whatsapp_exclusiones").delete().eq("telefono", tel);
  if (error) throw error;
  if (habilitar.length) {
    const { error: e2 } = await supabase.from("reclamos").update({ whatsapp_eligible: true }).in("id", habilitar);
    if (e2) throw e2;
  }
}

/** Corrige el teléfono de un reclamo ya cargado y recalcula si es elegible */
export async function actualizarTelefono(r: Reclamo, nuevo: string, exclusiones: Set<string>) {
  const original = nuevo.trim() || null;
  const t = normalizarTelefono(original);
  const cambios = {
    telefono_original: original,
    telefono_normalizado: t.normalizado,
    telefono_valido: t.valido,
    whatsapp_eligible: esElegible(r, t, new Map([...exclusiones].map((x) => [x, ""]))),
    updated_at: new Date().toISOString(),
  };
  if (!supabase) {
    const d = leerDemo();
    const x = d.reclamos.find((y) => y.id === r.id);
    if (x) Object.assign(x, cambios);
    guardarDemo(d);
    return t.valido;
  }
  const { error } = await supabase.from("reclamos").update(cambios).eq("id", r.id);
  if (error) throw error;
  return t.valido;
}

/* ---------------- Chat ---------------- */

export type EnvioChat = { tipo: "texto"; mensaje: string } | { tipo: "plantilla"; plantilla: string; idioma: string; parametros: string[]; texto: string };

/**
 * Manda un mensaje al vecino a través de n8n. n8n envía el WhatsApp y, si Meta lo acepta,
 * lo guarda en whatsapp_mensajes (así nunca queda en el chat un mensaje que no salió).
 */
export async function enviarMensaje(reclamo: Reclamo, envio: EnvioChat): Promise<void> {
  const contenido = envio.tipo === "texto" ? envio.mensaje : envio.texto;
  if (!supabase) {
    const d = leerDemo();
    d.mensajes.push({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      reclamo_id: reclamo.id,
      direccion: "saliente",
      origen: "operador",
      contenido,
      tipo: envio.tipo,
      enviado_por: "demo",
    });
    guardarDemo(d);
    return;
  }
  if (!N8N_MENSAJE) throw new Error("Falta configurar VITE_N8N_WEBHOOK_MENSAJE.");
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  const res = await fetch(N8N_MENSAJE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
    body: JSON.stringify({ reclamo_id: reclamo.id, ...envio }),
  });
  let cuerpo: { ok?: boolean; error?: string } = {};
  try {
    cuerpo = await res.json();
  } catch {
    /* respuesta sin JSON */
  }
  if (!res.ok || cuerpo.ok === false) throw new Error(traducirError(cuerpo.error) ?? `n8n respondió ${res.status}`);
}

function traducirError(e?: string) {
  if (!e) return undefined;
  if (/131047|re-engagement|24 hours/i.test(e)) return "Pasaron más de 24 hs desde el último mensaje del vecino: solo se puede enviar una plantilla.";
  if (/132001|template.*(not exist|does not exist)/i.test(e)) return "La plantilla no existe o no está aprobada en Meta.";
  return e;
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
