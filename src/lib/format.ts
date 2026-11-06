import type { Notificacion, Reclamo } from "./types";

export function fechaHora(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
export function fecha(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
export function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}
export function telefonoLindo(t: string | null) {
  if (!t) return "—";
  if (!/^549\d{10}$/.test(t)) return t;
  const n = t.slice(3);
  // AMBA (11): +54 9 11 XXXX-XXXX · resto: característica de 3 dígitos
  if (n.startsWith("11")) return `+54 9 11 ${n.slice(2, 6)}-${n.slice(6)}`;
  return `+54 9 ${n.slice(0, 3)} ${n.slice(3, 6)}-${n.slice(6)}`;
}
export const v = (x: string | null | undefined) => (x == null || x === "" ? "—" : x);

/* ---------- Categorías de respuesta (misma lógica que el monitoreo de Lovable) ---------- */

export type Categoria = "pendiente" | "si" | "no" | "sin_respuesta" | "respondido_otro" | "error" | "otro";

function tokens(s: string | null) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function categoria(n: Pick<Notificacion, "estado" | "respuesta_usuario">): Categoria {
  const r = tokens(n.respuesta_usuario);
  if (r.length === 1 && (r[0] === "si" || r[0] === "1")) return "si";
  if (r.length === 1 && (r[0] === "no" || r[0] === "2")) return "no";
  const e = tokens(n.estado);
  if (e.includes("error")) return "error";
  if (e.includes("sin")) return "sin_respuesta";
  if (e.includes("respondido") || e.includes("respondio")) return e.includes("si") ? "si" : e.includes("no") ? "no" : "respondido_otro";
  if (e.includes("enviado") || e.includes("enviando")) return "pendiente";
  return "otro";
}

/** Estado visible de un reclamo: categoría de su última notificación, o si todavía no se envió */
export type EstadoVisible = Categoria | "no_enviado" | "no_elegible";

export function estadoReclamo(r: Reclamo, ultima?: Notificacion): EstadoVisible {
  if (ultima) return categoria(ultima);
  return r.whatsapp_eligible ? "no_enviado" : "no_elegible";
}

export const ESTADOS: Record<EstadoVisible, { label: string; corto: string; clase: string; color: string }> = {
  si: { label: "Respondió SÍ", corto: "SÍ", clase: "bg-emerald-100 text-emerald-700", color: "#059669" },
  no: { label: "Respondió NO", corto: "NO", clase: "bg-rose-100 text-rose-700", color: "#e11d48" },
  pendiente: { label: "Enviado, sin responder aún", corto: "Esperando", clase: "bg-sky-100 text-sky-700", color: "#0284c7" },
  sin_respuesta: { label: "Sin respuesta del vecino", corto: "Sin respuesta", clase: "bg-amber-100 text-amber-700", color: "#d97706" },
  respondido_otro: { label: "Respondió (otro)", corto: "Otra respuesta", clase: "bg-violet-100 text-violet-700", color: "#7c3aed" },
  error: { label: "Error de envío", corto: "Error", clase: "bg-orange-100 text-orange-700", color: "#ea580c" },
  otro: { label: "Otro estado", corto: "Otro", clase: "bg-slate-100 text-slate-600", color: "#64748b" },
  no_enviado: { label: "Elegible, no enviado", corto: "No enviado", clase: "bg-slate-100 text-slate-600", color: "#94a3b8" },
  no_elegible: { label: "No elegible", corto: "No elegible", clase: "bg-slate-50 text-slate-400", color: "#cbd5e1" },
};

/** "GONZALEZ MARIA" → "Gonzalez Maria" */
export function nombreLindo(n: string | null | undefined) {
  if (!n) return "Sin nombre";
  return n.toLowerCase().replace(/(^|[\s,.-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
}
