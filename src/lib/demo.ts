import type { MensajeChat, Notificacion, Reclamo } from "./types";

const NOMBRES = ["GONZALEZ MARIA", "PEREZ JUAN CARLOS", "FERNANDEZ LUCIA", "RODRIGUEZ CARLOS", "LOPEZ ANA", "MARTINEZ DIEGO", "GOMEZ SOFIA", "DIAZ MARTIN", "ROMERO VALENTINA", "SOSA PABLO", "TORRES CAMILA", "ALVAREZ FEDERICO", "RUIZ JULIETA", "BENITEZ SANTIAGO", "ACOSTA FLORENCIA", "MEDINA NICOLAS", "HERRERA AGUSTINA", "CASTRO MATIAS", "SUAREZ ROCIO", "MOLINA GONZALO", "ORTIZ CARLA", "SILVA HERNAN", "ROJAS PAULA", "VEGA EMILIANO", "NUÑEZ LAURA", "CABRERA JORGE"];
const SUB = [
  ["Alumbrado", "Luminaria apagada"],
  ["Vía pública", "Bacheo"],
  ["Higiene urbana", "Recolección de residuos"],
  ["Arbolado", "Poda"],
  ["Hidráulica", "Limpieza de desagües"],
  ["Tránsito", "Señalización"],
];
const LOCALIDADES = ["Centro", "Villa Nueva", "San Martín", "Los Álamos", "Barrio Norte"];
const CALLES = ["MITRE", "SAN JUAN", "RIVADAVIA", "BELGRANO", "SARMIENTO", "9 DE JULIO", "MORENO"];

const pick = <T,>(a: T[], i: number) => a[i % a.length];

export function generarDemo(): { reclamos: Reclamo[]; notificaciones: Notificacion[]; mensajes: MensajeChat[] } {
  const now = Date.now();
  const reclamos: Reclamo[] = [];
  const notificaciones: Notificacion[] = [];
  const mensajes: MensajeChat[] = [];

  NOMBRES.forEach((nombre, i) => {
    const [motivo, submotivo] = pick(SUB, i * 5);
    const elegible = i % 9 !== 8;
    const tel = `549341${String(4100000 + i * 37919).slice(0, 7)}`;
    const ingreso = new Date(now - (20 - (i % 7)) * 864e5);
    const r: Reclamo = {
      id: crypto.randomUUID(),
      numero_reclamo: `${2026}-${String(48120 + i * 3)}`,
      fecha_ingreso: ingreso.toISOString().slice(0, 19),
      estado: elegible ? "Cerrado" : "En curso",
      situacion: elegible ? "Resp.Positiva" : "Derivado",
      motivo,
      submotivo,
      localidad: pick(LOCALIDADES, i * 3),
      calle: pick(CALLES, i * 7),
      numero_domicilio: String(100 + i * 47),
      texto_reclamo: `Vecino solicita ${submotivo.toLowerCase()} frente a su domicilio.`,
      solicitante: nombre,
      telefono_original: `0341-15-${tel.slice(6, 9)}-${tel.slice(9)}`,
      telefono_normalizado: tel,
      telefono_valido: true,
      whatsapp_eligible: elegible,
      texto_respuesta: elegible ? "Se realizó el trabajo solicitado." : null,
      fecha_respuesta: elegible ? new Date(ingreso.getTime() + 5 * 864e5).toISOString().slice(0, 19) : null,
      fecha_verificacion: null,
      forma_verificacion: null,
      observaciones_verificacion: null,
      contacto_verificacion: null,
      conformidad_verificacion: null,
      estado_verificacion: null,
      resultado_verificacion: null,
      updated_at: new Date(now - 6 * 864e5).toISOString(),
    };
    reclamos.push(r);
    if (!elegible || i > 22) return;

    const enviado = new Date(now - (5 - (i % 5)) * 864e5 - (i % 6) * 36e5);
    const tipo = i % 4 === 0 ? "no" : i % 5 === 1 ? "pendiente" : i % 7 === 3 ? "sin" : "si";
    const resp = tipo === "si" ? pick(["Si", "SI", "si", "1"], i) : tipo === "no" ? pick(["No", "NO", "2"], i) : null;
    const respondido = new Date(enviado.getTime() + (1 + (i % 4)) * 36e5);
    notificaciones.push({
      id: crypto.randomUUID(),
      created_at: enviado.toISOString(),
      updated_at: resp ? respondido.toISOString() : enviado.toISOString(),
      reclamo_id: r.id,
      estado: tipo === "si" ? "respondido si" : tipo === "no" ? "respondido no" : tipo === "sin" ? "sin respuesta" : "enviado",
      respuesta_usuario: resp,
    });
    if (tipo === "no" && i % 8 === 0) {
      mensajes.push({
        id: crypto.randomUUID(),
        created_at: new Date(respondido.getTime() + 6e4).toISOString(),
        reclamo_id: r.id,
        direccion: "entrante",
        origen: "vecino",
        contenido: "Sigue igual, nadie vino a arreglarlo",
      });
    }
  });

  return { reclamos, notificaciones, mensajes };
}
