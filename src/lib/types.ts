export type EstadoEnvio = "pendiente" | "enviado" | "error";
export type Respuesta = "sin_respuesta" | "positiva" | "negativa";

export interface Reclamo {
  id: string;
  created_at: string;
  lote_id: string | null;
  numero_reclamo: string;
  nombre: string;
  telefono: string;
  direccion: string;
  barrio: string;
  tipo: string;
  descripcion: string;
  fecha_reclamo: string | null;
  estado_envio: EstadoEnvio;
  respuesta: Respuesta;
  enviado_at: string | null;
  respondido_at: string | null;
}

export type DireccionMensaje = "saliente" | "entrante";
export type OrigenMensaje = "bot" | "operador" | "vecino";

export interface Mensaje {
  id: string;
  reclamo_id: string;
  direccion: DireccionMensaje;
  origen: OrigenMensaje;
  contenido: string;
  created_at: string;
  leido: boolean;
}

export interface Lote {
  id: string;
  created_at: string;
  nombre_archivo: string;
  cantidad: number;
}

/** Campos que se pueden importar desde un Excel/CSV */
export const CAMPOS_IMPORTABLES = [
  { key: "numero_reclamo", label: "N° de reclamo", requerido: false },
  { key: "nombre", label: "Nombre del vecino", requerido: true },
  { key: "telefono", label: "Teléfono / WhatsApp", requerido: true },
  { key: "direccion", label: "Dirección", requerido: false },
  { key: "barrio", label: "Barrio", requerido: false },
  { key: "tipo", label: "Tipo de reclamo", requerido: false },
  { key: "descripcion", label: "Descripción", requerido: false },
  { key: "fecha_reclamo", label: "Fecha del reclamo", requerido: false },
] as const;

export type CampoImportable = (typeof CAMPOS_IMPORTABLES)[number]["key"];
export type FilaImportada = Partial<Record<CampoImportable, string>>;
