import type { Reclamo } from "./types";
import { nombreLindo } from "./format";

/**
 * Plantillas de WhatsApp aprobadas en Meta que se pueden mandar desde el panel.
 * Son las únicas que se pueden enviar cuando pasaron más de 24 hs desde el último mensaje del vecino.
 *
 * Para agregar una: creala y hacé que la aprueben en Meta (WhatsApp Manager → Plantillas),
 * y después sumala acá con el mismo nombre, idioma y cantidad de parámetros ({{1}}, {{2}}, …).
 * `texto` es solo la vista previa que se muestra y se guarda en el chat; tiene que coincidir con la plantilla.
 */
export interface Plantilla {
  nombre: string;
  idioma: string;
  titulo: string;
  parametros: { label: string; valor: (r: Reclamo) => string }[];
  texto: (p: string[]) => string;
}

const direccion = (r: Reclamo) => [r.calle, r.numero_domicilio].filter(Boolean).join(" ") || "Sin especificar";

export const PLANTILLAS: Plantilla[] = [
  {
    nombre: "retomar_conversacion",
    idioma: "es_AR",
    titulo: "Retomar la conversación",
    parametros: [
      { label: "Nombre", valor: (r) => nombreLindo(r.solicitante) },
      { label: "Nro. de reclamo", valor: (r) => r.numero_reclamo },
    ],
    texto: ([nombre, nro]) =>
      `Hola ${nombre}, te escribimos desde el Área de Espacio Público de la Municipalidad de General San Martín por tu reclamo N° ${nro}. Queremos seguir en contacto con vos: respondé este mensaje para continuar la conversación.`,
  },
  {
    nombre: "aviso_reclamo",
    idioma: "es_AR",
    titulo: "Reenviar aviso del reclamo (¿se resolvió?)",
    parametros: [
      { label: "Solicitante", valor: (r) => r.solicitante ?? "" },
      { label: "Nro. de reclamo", valor: (r) => r.numero_reclamo },
      { label: "Motivo", valor: (r) => r.motivo || "Sin especificar" },
      { label: "Dirección", valor: direccion },
    ],
    texto: ([sol, nro, motivo, dir]) => `[Plantilla aviso_reclamo] ${sol} · Reclamo N° ${nro} · ${motivo} · ${dir}`,
  },
];

/** Ventana de atención de WhatsApp: 24 hs desde el último mensaje del vecino */
export const VENTANA_MS = 24 * 60 * 60 * 1000;
