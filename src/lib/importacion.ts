/**
 * Lectura y validación del archivo de reclamos exportado por el sistema municipal.
 * Replica las reglas de la app de Lovable: columnas, normalización de teléfonos,
 * fechas, elegibilidad para WhatsApp y deduplicación por Nro. de reclamo.
 */
import * as XLSX from "xlsx";
import type { ReclamoImport } from "./types";

type FilaCruda = Record<string, string>;

export type EstadoFila = "VALIDA" | "VALIDA_CON_ADVERTENCIAS" | "RECHAZADA";

export interface FilaAnalizada {
  fila: number;
  status: EstadoFila;
  numero_reclamo: string | null;
  data: ReclamoImport | null;
  advertencias: string[];
}

export interface Analisis {
  filas: FilaAnalizada[];
  validos: ReclamoImport[];
  stats: {
    total: number;
    validos: number;
    conAdvertencias: number;
    rechazados: number;
    telValidos: number;
    telInvalidos: number;
    elegibles: number;
    duplicadosReclamo: number;
    telefonosRepetidos: number;
  };
}

const COLUMNAS: Record<string, keyof ReclamoImport> = {
  "Nro. Reclamo": "numero_reclamo",
  "Fecha Ingreso": "fecha_ingreso",
  Estado: "estado",
  Situación: "situacion",
  Motivo: "motivo",
  SubMotivo: "submotivo",
  "Localidad problema": "localidad",
  "Calle problema": "calle",
  Número: "numero_domicilio",
  "Texto Reclamo": "texto_reclamo",
  Solicitante: "solicitante",
  "Tel. Solicitante": "telefono_original",
  "Texto Respuesta": "texto_respuesta",
  "Fecha Respuesta": "fecha_respuesta",
  "Fecha de Verificación": "fecha_verificacion",
  "Forma de Verificación": "forma_verificacion",
  "Observaciones de Verificación": "observaciones_verificacion",
  "Contacto de Verificación": "contacto_verificacion",
  "Conformidad de Verificación": "conformidad_verificacion",
  "Estado de Verificación": "estado_verificacion",
  "Resultado de Verificación": "resultado_verificacion",
};
const CAMPOS_FECHA = ["fecha_ingreso", "fecha_respuesta", "fecha_verificacion"] as const;

const limpiar = (s: string) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const clave = (s: string) => limpiar(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const MAPA = new Map(Object.entries(COLUMNAS).map(([k, val]) => [clave(k), val]));

/* ---------------- Lectura del archivo ---------------- */

/** Devuelve la tabla como matriz de celdas (texto). Soporta el .xls-HTML del sistema, .xlsx, .xls binario y .csv */
async function leerMatriz(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer();
  const inicio = new TextDecoder().decode(buf.slice(0, 2048)).trimStart().toLowerCase();
  if (inicio.startsWith("<")) {
    // El sistema exporta un .xls que en realidad es una tabla HTML
    const html = new TextDecoder(detectarCharset(inicio)).decode(buf);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const tablas = Array.from(doc.querySelectorAll("table"));
    if (!tablas.length) throw new Error("No se encontró una tabla válida en el archivo.");
    const t = tablas.reduce((a, b) => (b.rows.length > a.rows.length ? b : a));
    return Array.from(t.rows).map((r) => Array.from(r.cells).map((c) => (c.textContent ?? "").replace(/ /g, " ").trim()));
  }
  const wb = XLSX.read(buf, { cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" }).map((r) => r.map((c) => String(c ?? "").trim()));
}

function detectarCharset(head: string) {
  const m = head.match(/charset=["']?([\w-]+)/);
  return m?.[1] ?? "utf-8";
}

export async function leerArchivo(file: File): Promise<{ rows: FilaCruda[]; filas: number[] }> {
  const m = await leerMatriz(file);
  if (m.length < 2) throw new Error("La tabla del archivo no contiene filas de datos.");
  const idx = m.slice(0, 10).findIndex((r) => r.some((c) => clave(c) === "nro. reclamo"));
  if (idx < 0) throw new Error('No se pudo reconocer el formato del archivo (no se encontró la columna "Nro. Reclamo").');
  const cab = m[idx].map(limpiar);
  const rows: FilaCruda[] = [];
  const filas: number[] = [];
  m.slice(idx + 1).forEach((cells, i) => {
    if (cells.every((c) => !c)) return;
    const o: FilaCruda = {};
    cab.forEach((h, j) => {
      if (h) o[h] = cells[j] ?? "";
    });
    rows.push(o);
    filas.push(idx + i + 2);
  });
  return { rows, filas };
}

/* ---------------- Normalizaciones ---------------- */

export function normalizarTelefono(raw: string | null | undefined): { normalizado: string | null; valido: boolean } {
  const no = { normalizado: null, valido: false };
  if (raw == null) return no;
  const t = String(raw).trim();
  if (!t || !/^\+?[\d\s\-().]+$/.test(t)) return no;
  let n = t.replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("54")) {
    n = n.slice(2);
    if (n.startsWith("9")) n = n.slice(1);
  } else if (n.startsWith("0")) n = n.slice(1);
  if (n.length === 12) {
    // característica + 15 + número → sacar el 15
    const pos = [2, 3, 4].filter((p) => n.slice(p, p + 2) === "15");
    if (pos.length !== 1) return no;
    n = n.slice(0, pos[0]) + n.slice(pos[0] + 2);
  }
  if (n.length !== 10 || n.startsWith("0") || n.startsWith("15") || /^(\d)\1+$/.test(n)) return no;
  return { normalizado: `549${n}`, valido: true };
}

const p2 = (x: number) => String(x).padStart(2, "0");

function normalizarFecha(raw: string | null): { value: string | null; invalida: boolean } {
  const t = (raw ?? "").trim();
  if (!t || /^[-–—]+$/.test(t)) return { value: null, invalida: false };
  let y: number, mo: number, d: number, resto: string | undefined;
  let m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})(?:[\sT]+(.*))?$/);
  if (m) {
    d = +m[1];
    mo = +m[2];
    y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    resto = m[4];
  } else {
    m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[\sT]+(.*))?$/);
    if (!m) return { value: null, invalida: true };
    y = +m[1];
    mo = +m[2];
    d = +m[3];
    resto = m[4];
  }
  let h = 0,
    mi = 0,
    s = 0;
  if (resto?.trim()) {
    const hm = resto.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!hm) return { value: null, invalida: true };
    h = +hm[1];
    mi = +hm[2];
    s = hm[3] ? +hm[3] : 0;
    if (h > 23 || mi > 59 || s > 59) return { value: null, invalida: true };
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return { value: null, invalida: true };
  return { value: `${y}-${p2(mo)}-${p2(d)}T${p2(h)}:${p2(mi)}:${p2(s)}`, invalida: false };
}

const vacioANull = (x: string | undefined) => {
  const t = (x ?? "").trim();
  return t === "" || /^[-–—]$/.test(t) ? null : t;
};
const normalizarNro = (x: string | undefined) =>
  vacioANull(x)
    ?.replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim() || null;

/** Se envía WhatsApp solo a reclamos cerrados con respuesta positiva y teléfono válido */
export function esElegible(estado: string | null, situacion: string | null, telValido: boolean) {
  return (estado ?? "").trim() === "Cerrado" && (situacion ?? "").trim() === "Resp.Positiva" && telValido;
}

/* ---------------- Análisis ---------------- */

export function analizar(rows: FilaCruda[], filas: number[]): Analisis {
  const res: FilaAnalizada[] = rows.map((row, i) => {
    const fila = filas[i] ?? i + 2;
    const a: Partial<Record<keyof ReclamoImport, string | null>> = {};
    for (const [k, val] of Object.entries(row)) {
      const campo = MAPA.get(clave(k));
      if (campo) a[campo] = vacioANull(val);
    }
    const nro = normalizarNro(a.numero_reclamo ?? undefined);
    if (!nro) return { fila, status: "RECHAZADA", numero_reclamo: null, data: null, advertencias: ["Falta Nro. Reclamo"] };
    const adv: string[] = [];
    for (const f of CAMPOS_FECHA) {
      const r = normalizarFecha(a[f] ?? null);
      if (r.invalida) adv.push(`Fecha inválida en ${f}: "${a[f]}"`);
      a[f] = r.value;
    }
    const tel = normalizarTelefono(a.telefono_original);
    if (!tel.valido) adv.push(a.telefono_original ? `Teléfono inválido: "${a.telefono_original}"` : "Sin teléfono");
    const data = {
      ...(Object.fromEntries(Object.values(COLUMNAS).map((c) => [c, a[c] ?? null])) as Record<string, string | null>),
      numero_reclamo: nro,
      telefono_normalizado: tel.normalizado,
      telefono_valido: tel.valido,
      whatsapp_eligible: esElegible(a.estado ?? null, a.situacion ?? null, tel.valido),
    } as ReclamoImport;
    return { fila, status: "VALIDA", numero_reclamo: nro, data, advertencias: adv };
  });
  return recalcular(res);
}

/** Recalcula advertencias de teléfonos repetidos, estados y estadísticas */
export function recalcular(entrada: FilaAnalizada[]): Analisis {
  const filas = entrada.map((f) => ({ ...f, advertencias: f.advertencias.filter((a) => !a.startsWith("Teléfono repetido ")) }));
  const cuenta = new Map<string, number>();
  for (const f of filas) {
    const t = f.data?.telefono_normalizado;
    if (t) cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
  }
  for (const f of filas) {
    const t = f.data?.telefono_normalizado;
    const n = t ? cuenta.get(t) ?? 1 : 1;
    if (n > 1) f.advertencias.push(`Teléfono repetido ${n} veces en el archivo`);
    if (f.status !== "RECHAZADA") f.status = f.advertencias.length ? "VALIDA_CON_ADVERTENCIAS" : "VALIDA";
  }
  const unicos = new Map<string, ReclamoImport>();
  let conData = 0;
  for (const f of filas)
    if (f.data) {
      unicos.set(f.data.numero_reclamo, f.data);
      conData++;
    }
  const validos = [...unicos.values()];
  return {
    filas,
    validos,
    stats: {
      total: filas.length,
      validos: filas.filter((f) => f.status === "VALIDA").length,
      conAdvertencias: filas.filter((f) => f.status === "VALIDA_CON_ADVERTENCIAS").length,
      rechazados: filas.filter((f) => f.status === "RECHAZADA").length,
      telValidos: validos.filter((d) => d.telefono_valido).length,
      telInvalidos: validos.filter((d) => !d.telefono_valido).length,
      elegibles: validos.filter((d) => d.whatsapp_eligible).length,
      duplicadosReclamo: conData - validos.length,
      telefonosRepetidos: [...cuenta.values()].filter((n) => n > 1).length,
    },
  };
}

export function quitarFilas(a: Analisis, nros: Set<number>): Analisis {
  return recalcular(a.filas.filter((f) => !nros.has(f.fila)));
}

export function corregirTelefono(a: Analisis, fila: number, nuevo: string): Analisis {
  const raw = vacioANull(nuevo);
  const tel = normalizarTelefono(raw);
  return recalcular(
    a.filas.map((f) => {
      if (f.fila !== fila || !f.data) return f;
      const adv = f.advertencias.filter((x) => x !== "Sin teléfono" && !x.startsWith("Teléfono inválido:"));
      if (!tel.valido) adv.push(raw ? `Teléfono inválido: "${raw}"` : "Sin teléfono");
      return {
        ...f,
        advertencias: adv,
        data: {
          ...f.data,
          telefono_original: raw,
          telefono_normalizado: tel.normalizado,
          telefono_valido: tel.valido,
          whatsapp_eligible: esElegible(f.data.estado, f.data.situacion, tel.valido),
        },
      };
    }),
  );
}
