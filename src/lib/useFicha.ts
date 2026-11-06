import { useEffect, useState } from "react";
import { cargarHilo, obtenerReclamo } from "./consultas";
import { armarHilo, ultimaEntrada, type EventoChat } from "./hilo";
import { useDatos } from "./useDatos";
import type { Notificacion, Reclamo } from "./types";

/** Reclamo completo + su chat, cargados solo cuando se abren (y refrescados cuando llega un mensaje) */
export function useFicha(reclamoId: string | null | undefined) {
  const { versionChat } = useDatos();
  const [reclamo, setReclamo] = useState<Reclamo | null>(null);
  const [hilo, setHilo] = useState<EventoChat[]>([]);
  const [ultimaNotif, setUltimaNotif] = useState<Notificacion | undefined>();
  const [chatDisponible, setChatDisponible] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // Al cambiar de reclamo se limpia lo anterior
  useEffect(() => {
    setReclamo(null);
    setHilo([]);
    setUltimaNotif(undefined);
  }, [reclamoId]);

  useEffect(() => {
    if (!reclamoId) return;
    let vigente = true;
    setCargando(true);
    Promise.all([obtenerReclamo(reclamoId), cargarHilo(reclamoId)])
      .then(([r, h]) => {
        if (!vigente) return;
        setReclamo(r);
        setHilo(armarHilo(h.mensajes, h.notificaciones));
        setUltimaNotif(h.notificaciones[h.notificaciones.length - 1]);
        setChatDisponible(h.chatDisponible);
        setError(null);
      })
      .catch((e) => vigente && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [reclamoId, versionChat, version]);

  return { reclamo, hilo, ultimaNotif, ultimaEntrada: ultimaEntrada(hilo), chatDisponible, cargando, error, refrescar: () => setVersion((v) => v + 1) };
}
