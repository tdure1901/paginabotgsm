import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { cargarDatos, leerVistos, marcarVisto, suscribirCambios, type Datos } from "./api";
import type { MensajeChat, Notificacion } from "./types";
import { categoria } from "./format";

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

interface Ctx extends Datos {
  cargando: boolean;
  error: string | null;
  actualizado: string | null;
  recargar: () => Promise<void>;
  /** Última notificación de WhatsApp de cada reclamo */
  ultimaNotif: Map<string, Notificacion>;
  /** Línea de tiempo de chat por reclamo */
  hilos: Map<string, EventoChat[]>;
  noLeidos: (reclamoId: string) => number;
  ultimaEntrada: (reclamoId: string) => string | null;
  verConversacion: (reclamoId: string) => void;
}

const DatosCtx = createContext<Ctx | null>(null);

export function DatosProvider({ children }: { children: ReactNode }) {
  const [datos, setDatos] = useState<Datos>({ reclamos: [], notificaciones: [], mensajes: [], exclusiones: [], chatDisponible: true, exclusionesDisponible: true });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actualizado, setActualizado] = useState<string | null>(null);
  const [vistos, setVistos] = useState(leerVistos);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      setDatos(await cargarDatos());
      setError(null);
      setActualizado(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    recargar();
    return suscribirCambios(recargar);
  }, [recargar]);

  const ultimaNotif = useMemo(() => {
    const m = new Map<string, Notificacion>();
    for (const n of datos.notificaciones) {
      const prev = m.get(n.reclamo_id);
      if (!prev || n.created_at >= prev.created_at) m.set(n.reclamo_id, n);
    }
    return m;
  }, [datos.notificaciones]);

  const hilos = useMemo(() => {
    const m = new Map<string, EventoChat[]>();
    const push = (id: string, e: EventoChat) => {
      if (!m.has(id)) m.set(id, []);
      m.get(id)!.push(e);
    };
    // 1) Mensajes reales guardados por n8n / el panel
    const reales = new Map<string, MensajeChat[]>();
    for (const x of datos.mensajes) {
      if (!reales.has(x.reclamo_id)) reales.set(x.reclamo_id, []);
      reales.get(x.reclamo_id)!.push(x);
      push(x.reclamo_id, {
        id: `m-${x.id}`,
        fecha: x.created_at,
        direccion: x.direccion,
        origen: x.origen,
        contenido: x.contenido,
        tipo: x.tipo === "plantilla" ? "plantilla" : "mensaje",
        enviadoPor: x.enviado_por ?? undefined,
      });
    }
    // 2) Notificaciones viejas (anteriores a whatsapp_mensajes): se agregan solo si no hay un mensaje real equivalente
    const hayCerca = (id: string, fecha: string, pred: (x: MensajeChat) => boolean) =>
      (reales.get(id) ?? []).some((x) => pred(x) && Math.abs(new Date(x.created_at).getTime() - new Date(fecha).getTime()) < VENTANA_DEDUP);
    for (const n of datos.notificaciones) {
      const fEnvio = n.notificado_at ?? n.created_at;
      const cat = categoria(n);
      if (!hayCerca(n.reclamo_id, fEnvio, (x) => x.direccion === "saliente" && x.origen === "bot")) {
        push(n.reclamo_id, {
          id: `n-${n.id}`,
          fecha: fEnvio,
          direccion: "saliente",
          origen: "bot",
          contenido: cat === "error" ? "⚠️ No se pudo enviar la notificación de WhatsApp." : "Notificación de WhatsApp enviada consultando si el reclamo fue resuelto.",
          tipo: "notificacion",
        });
      }
      if (n.respuesta_usuario?.trim()) {
        const fResp = n.respondido_at ?? n.updated_at ?? n.created_at;
        if (!hayCerca(n.reclamo_id, fResp, (x) => x.direccion === "entrante")) {
          push(n.reclamo_id, { id: `r-${n.id}`, fecha: fResp, direccion: "entrante", origen: "vecino", contenido: n.respuesta_usuario.trim(), tipo: "respuesta" });
        }
      }
    }
    for (const arr of m.values()) arr.sort((a, b) => a.fecha.localeCompare(b.fecha));
    return m;
  }, [datos.notificaciones, datos.mensajes]);

  /** Fecha del último mensaje del vecino (abre la ventana de 24 hs de WhatsApp) */
  const ultimaEntrada = useCallback(
    (id: string) => {
      const h = hilos.get(id) ?? [];
      for (let i = h.length - 1; i >= 0; i--) if (h[i].direccion === "entrante") return h[i].fecha;
      return null;
    },
    [hilos],
  );

  const noLeidos = useCallback(
    (id: string) => {
      const visto = vistos[id] ?? "";
      return (hilos.get(id) ?? []).filter((e) => e.direccion === "entrante" && e.fecha > visto).length;
    },
    [hilos, vistos],
  );

  const verConversacion = useCallback((id: string) => {
    marcarVisto(id);
    setVistos(leerVistos());
  }, []);

  return (
    <DatosCtx.Provider value={{ ...datos, cargando, error, actualizado, recargar, ultimaNotif, hilos, noLeidos, ultimaEntrada, verConversacion }}>
      {children}
    </DatosCtx.Provider>
  );
}

export function useDatos() {
  const c = useContext(DatosCtx);
  if (!c) throw new Error("useDatos fuera de DatosProvider");
  return c;
}
