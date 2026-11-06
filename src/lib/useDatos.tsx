import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { cargarDatos, suscribirCambios, type Datos } from "./api";

interface Ctx extends Datos {
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
}

const DatosCtx = createContext<Ctx | null>(null);

export function DatosProvider({ children }: { children: ReactNode }) {
  const [datos, setDatos] = useState<Datos>({ reclamos: [], mensajes: [], lotes: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      setDatos(await cargarDatos());
      setError(null);
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

  return <DatosCtx.Provider value={{ ...datos, cargando, error, recargar }}>{children}</DatosCtx.Provider>;
}

export function useDatos() {
  const c = useContext(DatosCtx);
  if (!c) throw new Error("useDatos fuera de DatosProvider");
  return c;
}
