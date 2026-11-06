import type { EstadoEnvio, Reclamo, Respuesta } from "./types";

export function fechaHora(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
export function fecha(iso: string | null) {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(iso + "T12:00:00") : new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
export function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}
export function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Estado unificado para mostrar: combina estado de envío + respuesta */
export type EstadoVisible = "pendiente" | "error" | "sin_respuesta" | "positiva" | "negativa";
export function estadoVisible(r: Reclamo): EstadoVisible {
  if (r.estado_envio !== "enviado") return r.estado_envio as Exclude<EstadoEnvio, "enviado">;
  return r.respuesta as Respuesta;
}

export const ESTADOS: Record<EstadoVisible, { label: string; clase: string; color: string }> = {
  pendiente: { label: "Pendiente", clase: "bg-slate-100 text-slate-600", color: "#94a3b8" },
  error: { label: "Error de envío", clase: "bg-orange-100 text-orange-700", color: "#ea580c" },
  sin_respuesta: { label: "Sin respuesta", clase: "bg-amber-100 text-amber-700", color: "#d97706" },
  positiva: { label: "Positiva", clase: "bg-emerald-100 text-emerald-700", color: "#059669" },
  negativa: { label: "Negativa", clase: "bg-rose-100 text-rose-700", color: "#e11d48" },
};
