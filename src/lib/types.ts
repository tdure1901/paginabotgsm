/** Fila de la tabla `reclamos` (mismo esquema que la app de Lovable) */
export interface Reclamo {
  id: string;
  numero_reclamo: string;
  fecha_ingreso: string | null;
  estado: string | null;
  situacion: string | null;
  motivo: string | null;
  submotivo: string | null;
  localidad: string | null;
  calle: string | null;
  numero_domicilio: string | null;
  texto_reclamo: string | null;
  solicitante: string | null;
  telefono_original: string | null;
  telefono_normalizado: string | null;
  telefono_valido: boolean;
  whatsapp_eligible: boolean;
  texto_respuesta: string | null;
  fecha_respuesta: string | null;
  fecha_verificacion: string | null;
  forma_verificacion: string | null;
  observaciones_verificacion: string | null;
  contacto_verificacion: string | null;
  conformidad_verificacion: string | null;
  estado_verificacion: string | null;
  resultado_verificacion: string | null;
  updated_at?: string | null;
}

/** Datos que se importan (sin id) */
export type ReclamoImport = Omit<Reclamo, "id" | "updated_at">;

/** Fila de `whatsapp_notificaciones` (la escribe el flujo de n8n) */
export interface Notificacion {
  id: string;
  created_at: string;
  updated_at: string | null;
  reclamo_id: string;
  estado: string | null;
  respuesta_usuario: string | null;
}

/** Fila de `whatsapp_mensajes` (tabla nueva para el chat del CRM) */
export interface MensajeChat {
  id: string;
  created_at: string;
  reclamo_id: string;
  direccion: "saliente" | "entrante";
  origen: "bot" | "operador" | "vecino";
  contenido: string;
}
