import { categoria } from "./format";
import type { MensajeChat, Notificacion } from "./types";

export interface EventoChat {
  id: string;
  fecha: string;
  direccion: "saliente" | "entrante";
  origen: "bot" | "operador" | "vecino";
  contenido: string;
  tipo: "notificacion" | "respuesta" | "mensaje" | "plantilla";
  enviadoPor?: string;
}

/** Margen para considerar que un mensaje real y una notificación son el mismo evento */
const VENTANA_DEDUP = 15 * 60 * 1000;

/**
 * Arma la línea de tiempo de un chat: los mensajes de whatsapp_mensajes y, para los avisos
 * anteriores a esa tabla, lo que quedó en whatsapp_notificaciones (sin duplicar).
 */
export function armarHilo(mensajes: MensajeChat[], notificaciones: Notificacion[]): EventoChat[] {
  const out: EventoChat[] = mensajes.map((x) => ({
    id: `m-${x.id}`,
    fecha: x.created_at,
    direccion: x.direccion,
    origen: x.origen,
    contenido: x.contenido,
    tipo: x.tipo === "plantilla" ? "plantilla" : "mensaje",
    enviadoPor: x.enviado_por ?? undefined,
  }));
  const hayCerca = (fecha: string, pred: (x: MensajeChat) => boolean) =>
    mensajes.some((x) => pred(x) && Math.abs(new Date(x.created_at).getTime() - new Date(fecha).getTime()) < VENTANA_DEDUP);
  for (const n of notificaciones) {
    const fEnvio = n.notificado_at ?? n.created_at;
    if (!hayCerca(fEnvio, (x) => x.direccion === "saliente" && x.origen === "bot")) {
      out.push({
        id: `n-${n.id}`,
        fecha: fEnvio,
        direccion: "saliente",
        origen: "bot",
        contenido: categoria(n) === "error" ? "⚠️ No se pudo enviar la notificación de WhatsApp." : "Notificación de WhatsApp enviada consultando si el reclamo fue resuelto.",
        tipo: "notificacion",
      });
    }
    if (n.respuesta_usuario?.trim()) {
      const fResp = n.respondido_at ?? n.updated_at ?? n.created_at;
      if (!hayCerca(fResp, (x) => x.direccion === "entrante")) {
        out.push({ id: `r-${n.id}`, fecha: fResp, direccion: "entrante", origen: "vecino", contenido: n.respuesta_usuario.trim(), tipo: "respuesta" });
      }
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function ultimaEntrada(hilo: EventoChat[]): string | null {
  for (let i = hilo.length - 1; i >= 0; i--) if (hilo[i].direccion === "entrante") return hilo[i].fecha;
  return null;
}
