import type { Lote, Mensaje, Reclamo, Respuesta, EstadoEnvio } from "./types";

const NOMBRES = ["María González", "Juan Pérez", "Lucía Fernández", "Carlos Rodríguez", "Ana López", "Diego Martínez", "Sofía Gómez", "Martín Díaz", "Valentina Romero", "Pablo Sosa", "Camila Torres", "Federico Álvarez", "Julieta Ruiz", "Santiago Benítez", "Florencia Acosta", "Nicolás Medina", "Agustina Herrera", "Matías Castro", "Rocío Suárez", "Gonzalo Molina", "Carla Ortiz", "Hernán Silva", "Paula Rojas", "Emiliano Vega"];
const BARRIOS = ["Centro", "Villa Nueva", "San Martín", "Los Álamos", "Barrio Norte", "La Loma", "Belgrano"];
const TIPOS = ["Alumbrado público", "Bacheo", "Recolección de residuos", "Poda de árboles", "Desagües", "Señalización"];
const CALLES = ["Av. Mitre", "San Juan", "Rivadavia", "Belgrano", "Sarmiento", "9 de Julio", "Moreno", "Urquiza"];

const POSITIVAS = ["Sí, ya lo solucionaron, muchas gracias!", "Si, quedó perfecto 👍", "Todo bien, vinieron ayer", "Sí, excelente atención"];
const NEGATIVAS = ["No, todavía sigue igual", "No vino nadie todavía", "No, lo arreglaron mal y volvió a romperse", "No, sigue el problema"];

function rnd<T>(arr: T[], i: number) {
  return arr[i % arr.length];
}
function uid() {
  return crypto.randomUUID();
}

export function generarDemo(): { reclamos: Reclamo[]; mensajes: Mensaje[]; lotes: Lote[] } {
  const now = Date.now();
  const lotes: Lote[] = [
    { id: uid(), created_at: new Date(now - 6 * 864e5).toISOString(), nombre_archivo: "reclamos_octubre.xlsx", cantidad: 14 },
    { id: uid(), created_at: new Date(now - 2 * 864e5).toISOString(), nombre_archivo: "reclamos_semana_44.csv", cantidad: 10 },
  ];
  const reclamos: Reclamo[] = [];
  const mensajes: Mensaje[] = [];

  NOMBRES.forEach((nombre, i) => {
    const lote = i < 14 ? lotes[0] : lotes[1];
    const base = new Date(lote.created_at).getTime() + (i % 5) * 36e5;
    const estado: EstadoEnvio = i % 11 === 10 ? "error" : i > 21 ? "pendiente" : "enviado";
    let respuesta: Respuesta = "sin_respuesta";
    if (estado === "enviado") respuesta = i % 3 === 0 ? "negativa" : i % 4 === 1 ? "sin_respuesta" : "positiva";
    const tipo = rnd(TIPOS, i * 7);
    const r: Reclamo = {
      id: uid(),
      created_at: new Date(base).toISOString(),
      lote_id: lote.id,
      numero_reclamo: `R-${2026}${String(1040 + i).padStart(5, "0")}`,
      nombre,
      telefono: `+54 9 341 ${String(5000000 + i * 13791).slice(0, 3)}-${String(1000 + i * 37).slice(0, 4)}`,
      direccion: `${rnd(CALLES, i * 3)} ${100 + i * 47}`,
      barrio: rnd(BARRIOS, i * 5),
      tipo,
      descripcion: `Reclamo por ${tipo.toLowerCase()} frente al domicilio.`,
      fecha_reclamo: new Date(base - 10 * 864e5).toISOString().slice(0, 10),
      estado_envio: estado,
      respuesta,
      enviado_at: estado === "enviado" ? new Date(base + 6e5).toISOString() : null,
      respondido_at: respuesta !== "sin_respuesta" ? new Date(base + 3 * 36e5 + i * 6e5).toISOString() : null,
    };
    reclamos.push(r);

    if (estado === "enviado") {
      mensajes.push({
        id: uid(),
        reclamo_id: r.id,
        direccion: "saliente",
        origen: "bot",
        contenido: `Hola ${nombre.split(" ")[0]}! Te escribimos desde la Municipalidad por tu reclamo ${r.numero_reclamo} (${tipo}). ¿Se solucionó el problema? Respondé SÍ o NO.`,
        created_at: r.enviado_at!,
        leido: true,
      });
      if (respuesta !== "sin_respuesta") {
        mensajes.push({
          id: uid(),
          reclamo_id: r.id,
          direccion: "entrante",
          origen: "vecino",
          contenido: respuesta === "positiva" ? rnd(POSITIVAS, i) : rnd(NEGATIVAS, i),
          created_at: r.respondido_at!,
          leido: i % 2 === 0,
        });
        mensajes.push({
          id: uid(),
          reclamo_id: r.id,
          direccion: "saliente",
          origen: "bot",
          contenido:
            respuesta === "positiva"
              ? "¡Gracias por tu respuesta! Nos alegra que se haya resuelto. 🙌"
              : "Lamentamos que siga el problema. Un operador va a revisar tu caso y te contactará a la brevedad.",
          created_at: new Date(new Date(r.respondido_at!).getTime() + 3e4).toISOString(),
          leido: true,
        });
      }
    }
  });

  return { reclamos, mensajes, lotes };
}
