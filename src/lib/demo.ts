import type { Exclusion, MensajeChat, Notificacion, Reclamo } from "./types";

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

export function generarDemo(): { reclamos: Reclamo[]; notificaciones: Notificacion[]; mensajes: MensajeChat[]; exclusiones: Exclusion[] } {
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

    // El más reciente respondió hace un par de horas (chat abierto); el resto, días atrás
    const enviado = i === 22 ? new Date(now - 5 * 36e5) : new Date(now - (5 - (i % 5)) * 864e5 - (i % 6) * 36e5);
    const tipo = i === 22 ? "no" : i % 4 === 0 ? "no" : i % 5 === 1 ? "pendiente" : i % 7 === 3 ? "sin" : "si";
    const resp = tipo === "si" ? pick(["si", "Si", "sí"], i) : tipo === "no" ? pick(["no", "No"], i) : null;
    const respondido = i === 22 ? new Date(now - 3 * 36e5) : new Date(enviado.getTime() + (1 + (i % 4)) * 36e5);
    notificaciones.push({
      id: crypto.randomUUID(),
      created_at: enviado.toISOString(),
      updated_at: resp ? respondido.toISOString() : enviado.toISOString(),
      notificado_at: enviado.toISOString(),
      respondido_at: resp ? respondido.toISOString() : null,
      reclamo_id: r.id,
      estado: tipo === "si" ? "respondido_si" : tipo === "no" ? "respondido_no" : tipo === "sin" ? "sin respuesta" : "enviado",
      respuesta_usuario: resp ? (resp.toLowerCase().startsWith("s") ? "si" : "no") : null,
    });

    // Los reclamos "nuevos" ya tienen la conversación completa en whatsapp_mensajes (como la guarda n8n)
    if (i % 3 !== 0 && i !== 22) return;
    const msg = (fecha: Date, direccion: "saliente" | "entrante", origen: "bot" | "vecino" | "operador", contenido: string, extra: Partial<MensajeChat> = {}) =>
      mensajes.push({ id: crypto.randomUUID(), created_at: fecha.toISOString(), reclamo_id: r.id, direccion, origen, contenido, ...extra });
    msg(enviado, "saliente", "bot", `Hola ${nombre}, te escribimos por tu reclamo N° ${r.numero_reclamo} (${motivo}) en ${r.calle} ${r.numero_domicilio}. ¿Se resolvió el problema?`, { tipo: "plantilla" });
    if (!resp) return;
    msg(respondido, "entrante", "vecino", resp);
    msg(
      new Date(respondido.getTime() + 2e3),
      "saliente",
      "bot",
      tipo === "si"
        ? "¡Qué bueno que el problema se haya solucionado! 🙌 Gracias por confirmarlo."
        : "Lamentamos que tu problema continúe. Vamos a reabrir el reclamo y nos pondremos en contacto con vos.",
    );
    if (tipo === "no") msg(new Date(respondido.getTime() + 5 * 6e4), "entrante", "vecino", "Sigue igual, nadie vino a arreglarlo");
  });

  // Algunos reclamos cerrados con teléfono mal cargado, para la sección Teléfonos
  const malos = ["134554433", "45678912", "15 4433-2211", "011-4455"];
  malos.forEach((tel, j) => {
    const base = reclamos[j * 2 + 1];
    reclamos.push({
      ...base,
      id: crypto.randomUUID(),
      numero_reclamo: `2026-${49001 + j}`,
      solicitante: ["QUIROGA MARTA", "LEDESMA RAUL", "PAZ GRACIELA", "IBARRA OSCAR"][j],
      estado: "Cerrado",
      situacion: "Resp.Positiva",
      telefono_original: tel,
      telefono_normalizado: null,
      telefono_valido: false,
      whatsapp_eligible: false,
    });
  });
  // Un director que cargó un reclamo con su teléfono
  const director = reclamos[25];
  director.solicitante = "FERREYRA JORGE (DIR. ALUMBRADO)";
  director.whatsapp_eligible = false;
  const exclusiones: Exclusion[] = [
    { telefono: director.telefono_normalizado!, motivo: "Director de Alumbrado", created_at: new Date(now - 30 * 864e5).toISOString(), creado_por: "demo" },
  ];

  return { reclamos, notificaciones, mensajes, exclusiones };
}
