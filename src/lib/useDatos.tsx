import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { leerVistos, marcarVisto } from "./api";
import {
  cargarConversaciones,
  cargarExclusiones,
  cargarMonitoreo,
  cargarTelefonosInvalidos,
  suscribirCambios,
  type Periodo,
} from "./consultas";
import type { Conversacion, Exclusion, Notificacion, Reclamo } from "./types";

interface Ctx {
  /* Monitoreo (solo el período elegido, columnas livianas) */
  periodo: Periodo;
  setPeriodo: (p: Periodo) => void;
  reclamos: Reclamo[];
  notificaciones: Notificacion[];
  ultimaNotif: Map<string, Notificacion>;
  /* Lista de no elegibles */
  exclusiones: Exclusion[];
  exclusionesDisponible: boolean;
  /* Reclamos con teléfono para corregir */
  telInvalidos: Reclamo[];
  /* Los 100 chats más recientes (para los contadores del menú) */
  recientes: Conversacion[];
  conversacionesDisponible: boolean;
  /** Cambia cada vez que llega un mensaje o una respuesta: las pantallas de chat lo usan para refrescarse */
  versionChat: number;
  noLeido: (c: Pick<Conversacion, "reclamo_id" | "ultima_entrada">) => boolean;
  verConversacion: (reclamoId: string) => void;
  /** Vuelve a traer la lista de chats (por ejemplo después de enviar un mensaje) */
  refrescarChats: () => void;
  cargando: boolean;
  error: string | null;
  actualizado: string | null;
  recargar: () => Promise<void>;
}

const DatosCtx = createContext<Ctx | null>(null);
const LS_PERIODO = "reclamos-bot-periodo";

function leerPeriodo(): Periodo {
  try {
    return (localStorage.getItem(LS_PERIODO) as Periodo) || "3m";
  } catch {
    return "3m";
  }
}

export function DatosProvider({ children }: { children: ReactNode }) {
  const [periodo, setPeriodoState] = useState<Periodo>(leerPeriodo);
  const [mon, setMon] = useState<{ reclamos: Reclamo[]; notificaciones: Notificacion[] }>({ reclamos: [], notificaciones: [] });
  const [excl, setExcl] = useState<{ exclusiones: Exclusion[]; disponible: boolean }>({ exclusiones: [], disponible: true });
  const [telInvalidos, setTelInvalidos] = useState<Reclamo[]>([]);
  const [conv, setConv] = useState<{ lista: Conversacion[]; disponible: boolean }>({ lista: [], disponible: true });
  const [versionChat, setVersionChat] = useState(0);
  const [vistos, setVistos] = useState(leerVistos);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actualizado, setActualizado] = useState<string | null>(null);
  const periodoRef = useRef(periodo);
  periodoRef.current = periodo;

  const proteger = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
      setError(null);
      setActualizado(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const recargarMonitoreo = useCallback(() => proteger(async () => setMon(await cargarMonitoreo(periodoRef.current))), [proteger]);
  const recargarExcl = useCallback(() => proteger(async () => setExcl(await cargarExclusiones())), [proteger]);
  const recargarTel = useCallback(() => proteger(async () => setTelInvalidos(await cargarTelefonosInvalidos())), [proteger]);
  const recargarConv = useCallback(() => proteger(async () => setConv(await cargarConversaciones())), [proteger]);

  const recargar = useCallback(async () => {
    setCargando(true);
    await Promise.all([recargarMonitoreo(), recargarExcl(), recargarTel(), recargarConv()]);
    setVersionChat((v) => v + 1);
    setCargando(false);
  }, [recargarMonitoreo, recargarExcl, recargarTel, recargarConv]);

  useEffect(() => {
    recargar();
    return suscribirCambios((tablas) => {
      const chat = tablas.has("whatsapp_mensajes") || tablas.has("whatsapp_notificaciones");
      if (tablas.has("reclamos") || tablas.has("whatsapp_notificaciones")) recargarMonitoreo();
      if (tablas.has("reclamos") || tablas.has("whatsapp_notificaciones")) recargarTel();
      if (tablas.has("whatsapp_exclusiones")) recargarExcl();
      if (chat) {
        recargarConv();
        setVersionChat((v) => v + 1);
      }
    });
  }, [recargar, recargarMonitoreo, recargarTel, recargarExcl, recargarConv]);

  const setPeriodo = useCallback(
    (p: Periodo) => {
      try {
        localStorage.setItem(LS_PERIODO, p);
      } catch {
        /* ignorar */
      }
      periodoRef.current = p;
      setPeriodoState(p);
      setCargando(true);
      recargarMonitoreo().finally(() => setCargando(false));
    },
    [recargarMonitoreo],
  );

  const ultimaNotif = useMemo(() => {
    const m = new Map<string, Notificacion>();
    for (const n of mon.notificaciones) {
      const prev = m.get(n.reclamo_id);
      if (!prev || n.created_at >= prev.created_at) m.set(n.reclamo_id, n);
    }
    return m;
  }, [mon.notificaciones]);

  const noLeido = useCallback(
    (c: Pick<Conversacion, "reclamo_id" | "ultima_entrada">) => !!c.ultima_entrada && c.ultima_entrada > (vistos[c.reclamo_id] ?? ""),
    [vistos],
  );

  const verConversacion = useCallback((id: string) => {
    marcarVisto(id);
    setVistos(leerVistos());
  }, []);

  return (
    <DatosCtx.Provider
      value={{
        periodo,
        setPeriodo,
        reclamos: mon.reclamos,
        notificaciones: mon.notificaciones,
        ultimaNotif,
        exclusiones: excl.exclusiones,
        exclusionesDisponible: excl.disponible,
        telInvalidos,
        recientes: conv.lista,
        conversacionesDisponible: conv.disponible,
        versionChat,
        noLeido,
        verConversacion,
        refrescarChats: () => {
          recargarConv();
          setVersionChat((v) => v + 1);
        },
        cargando,
        error,
        actualizado,
        recargar,
      }}
    >
      {children}
    </DatosCtx.Provider>
  );
}

export function useDatos() {
  const c = useContext(DatosCtx);
  if (!c) throw new Error("useDatos fuera de DatosProvider");
  return c;
}
