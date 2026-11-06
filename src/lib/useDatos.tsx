import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { cargarDatos, leerVistos, marcarVisto, suscribirCambios, type Datos } from "./api";
import type { Notificacion } from "./types";

export interface EventoChat {
  id: string;
  fecha: string;
  direccion: "saliente" | "entrante";
  origen: "bot" | "operador" | "vecino";
  contenido: string;
  tipo: "notificacion" | "respuesta" | "mensaje";
}

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
  verConversacion: (reclamoId: string) => void;
}

const DatosCtx = createContext<Ctx | null>(null);

export function DatosProvider({ children }: { children: ReactNode }) {
  const [datos, setDatos] = useState<Datos>({ reclamos: [], notificaciones: [], mensajes: [], chatDisponible: true });
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
    for (const n of datos.notificaciones) {
      push(n.reclamo_id, {
        id: `n-${n.id}`,
        fecha: n.created_at,
        direccion: "saliente",
        origen: "bot",
        contenido: "Notificación de WhatsApp enviada consultando si el reclamo fue resuelto.",
        tipo: "notificacion",
      });
      if (n.respuesta_usuario?.trim()) {
        push(n.reclamo_id, {
          id: `r-${n.id}`,
          fecha: n.updated_at ?? n.created_at,
          direccion: "entrante",
          origen: "vecino",
          contenido: n.respuesta_usuario.trim(),
          tipo: "respuesta",
        });
      }
    }
    for (const x of datos.mensajes) {
      push(x.reclamo_id, { id: `m-${x.id}`, fecha: x.created_at, direccion: x.direccion, origen: x.origen, contenido: x.contenido, tipo: "mensaje" });
    }
    for (const arr of m.values()) arr.sort((a, b) => a.fecha.localeCompare(b.fecha));
    return m;
  }, [datos.notificaciones, datos.mensajes]);

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
    <DatosCtx.Provider value={{ ...datos, cargando, error, actualizado, recargar, ultimaNotif, hilos, noLeidos, verConversacion }}>
      {children}
    </DatosCtx.Provider>
  );
}

export function useDatos() {
  const c = useContext(DatosCtx);
  if (!c) throw new Error("useDatos fuera de DatosProvider");
  return c;
}
