import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { CheckCircle2, FileSpreadsheet, Loader2, Send, Trash2, UploadCloud, AlertTriangle, Download } from "lucide-react";
import { PageHeader } from "../components/ui";
import { CAMPOS_IMPORTABLES, type CampoImportable, type FilaImportada } from "../lib/types";
import { enviarLoteAlBot, importarLote } from "../lib/api";
import { useDatos } from "../lib/useDatos";
import { fechaHora } from "../lib/format";

type FilaCruda = Record<string, string>;

/** Sinónimos para detectar columnas automáticamente */
const SINONIMOS: Record<CampoImportable, string[]> = {
  numero_reclamo: ["numero", "nro", "n°", "reclamo", "id", "expediente", "codigo"],
  nombre: ["nombre", "vecino", "apellido", "contacto", "solicitante"],
  telefono: ["telefono", "teléfono", "tel", "celular", "whatsapp", "movil", "móvil"],
  direccion: ["direccion", "dirección", "domicilio", "calle", "ubicacion"],
  barrio: ["barrio", "zona", "sector"],
  tipo: ["tipo", "categoria", "categoría", "motivo", "area", "área"],
  descripcion: ["descripcion", "descripción", "detalle", "observacion", "comentario"],
  fecha_reclamo: ["fecha"],
};

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function autoMapear(cabeceras: string[]): Partial<Record<CampoImportable, string>> {
  const m: Partial<Record<CampoImportable, string>> = {};
  const usadas = new Set<string>();
  for (const campo of CAMPOS_IMPORTABLES) {
    const hit = cabeceras.find((c) => !usadas.has(c) && SINONIMOS[campo.key].some((s) => norm(c).includes(norm(s))));
    if (hit) {
      m[campo.key] = hit;
      usadas.add(hit);
    }
  }
  return m;
}

async function leerArchivo(file: File): Promise<FilaCruda[]> {
  if (file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv") {
    return new Promise((res, rej) =>
      Papa.parse<FilaCruda>(file, { header: true, skipEmptyLines: true, complete: (r) => res(r.data), error: rej }),
    );
  }
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? "")])));
}

function descargarPlantilla() {
  const header = CAMPOS_IMPORTABLES.map((c) => c.label).join(",");
  const ej = "R-1001,María González,+5493415551234,Av. Mitre 450,Centro,Alumbrado público,Luminaria apagada,2026-11-01";
  const blob = new Blob([header + "\n" + ej + "\n"], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "plantilla_reclamos.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function CargaPage() {
  const { lotes, reclamos, recargar } = useDatos();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [filas, setFilas] = useState<FilaCruda[]>([]);
  const [cabeceras, setCabeceras] = useState<string[]>([]);
  const [mapeo, setMapeo] = useState<Partial<Record<CampoImportable, string>>>({});
  const [arrastrando, setArrastrando] = useState(false);
  const [enviarAlBot, setEnviarAlBot] = useState(true);
  const [estado, setEstado] = useState<"idle" | "leyendo" | "importando" | "ok" | "error">("idle");
  const [mensaje, setMensaje] = useState("");
  const [enviandoLote, setEnviandoLote] = useState<string | null>(null);

  async function procesar(file: File) {
    setEstado("leyendo");
    setMensaje("");
    try {
      const data = await leerArchivo(file);
      const cab = data.length ? Object.keys(data[0]) : [];
      setArchivo(file);
      setFilas(data);
      setCabeceras(cab);
      setMapeo(autoMapear(cab));
      setEstado("idle");
    } catch (e) {
      setEstado("error");
      setMensaje("No se pudo leer el archivo: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  function limpiar() {
    setArchivo(null);
    setFilas([]);
    setCabeceras([]);
    setMapeo({});
    if (inputRef.current) inputRef.current.value = "";
  }

  const mapeadas: FilaImportada[] = useMemo(
    () =>
      filas.map((f) => {
        const o: FilaImportada = {};
        for (const c of CAMPOS_IMPORTABLES) {
          const col = mapeo[c.key];
          if (col) o[c.key] = f[col];
        }
        return o;
      }),
    [filas, mapeo],
  );

  const invalidas = mapeadas.filter((f) => !f.nombre?.trim() || (f.telefono ?? "").replace(/\D/g, "").length < 8);
  const faltanRequeridos = CAMPOS_IMPORTABLES.filter((c) => c.requerido && !mapeo[c.key]);
  const validas = mapeadas.filter((f) => !invalidas.includes(f));

  async function importar() {
    if (!archivo) return;
    setEstado("importando");
    try {
      await importarLote(archivo.name, validas, enviarAlBot);
      await recargar();
      setEstado("ok");
      setMensaje(`${validas.length} reclamos importados${enviarAlBot ? " y enviados al bot" : ""}.`);
      limpiar();
    } catch (e) {
      setEstado("error");
      setMensaje("Error al importar: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function enviarPendientes(loteId: string) {
    setEnviandoLote(loteId);
    try {
      await enviarLoteAlBot(loteId);
      await recargar();
    } finally {
      setEnviandoLote(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Carga de datos"
        subtitle="Subí un Excel o CSV con los reclamos para que el bot contacte a los vecinos."
        actions={
          <button className="btn-ghost" onClick={descargarPlantilla}>
            <Download size={16} /> Plantilla CSV
          </button>
        }
      />
      <div className="space-y-6 p-4 md:p-8">
        {estado === "ok" && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 size={18} /> {mensaje}
          </div>
        )}
        {estado === "error" && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <AlertTriangle size={18} /> {mensaje}
          </div>
        )}

        {!archivo ? (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastrando(false);
              const f = e.dataTransfer.files[0];
              if (f) procesar(f);
            }}
            className={`card flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed px-6 py-14 text-center transition ${
              arrastrando ? "border-brand-500 bg-brand-50" : "hover:border-brand-500"
            }`}
          >
            {estado === "leyendo" ? (
              <Loader2 className="animate-spin text-brand-600" size={36} />
            ) : (
              <UploadCloud className="text-brand-600" size={36} />
            )}
            <div>
              <div className="font-medium text-slate-900">Arrastrá tu archivo acá o hacé clic para elegirlo</div>
              <div className="text-sm text-slate-500">Formatos: .xlsx, .xls, .csv</div>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && procesar(e.target.files[0])}
            />
          </label>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            {/* Mapeo de columnas */}
            <div className="card h-fit p-5">
              <div className="mb-4 flex items-center gap-3">
                <FileSpreadsheet className="text-brand-600" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{archivo.name}</div>
                  <div className="text-xs text-slate-500">{filas.length} filas detectadas</div>
                </div>
                <button className="text-slate-400 hover:text-rose-600" onClick={limpiar} title="Quitar archivo">
                  <Trash2 size={18} />
                </button>
              </div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Columnas</h3>
              <p className="mb-3 text-xs text-slate-500">Detectamos las columnas automáticamente. Revisá que estén bien.</p>
              <div className="space-y-2.5">
                {CAMPOS_IMPORTABLES.map((c) => (
                  <div key={c.key}>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      {c.label} {c.requerido && <span className="text-rose-500">*</span>}
                    </label>
                    <select
                      className="input py-1.5"
                      value={mapeo[c.key] ?? ""}
                      onChange={(e) => setMapeo({ ...mapeo, [c.key]: e.target.value || undefined })}
                    >
                      <option value="">— No importar —</option>
                      {cabeceras.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Vista previa */}
            <div className="card flex min-w-0 flex-col">
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3">
                <h3 className="text-sm font-semibold text-slate-900">Vista previa</h3>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">{validas.length} válidas</span>
                {invalidas.length > 0 && (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                    {invalidas.length} con errores (se omiten)
                  </span>
                )}
              </div>
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500 uppercase">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      {CAMPOS_IMPORTABLES.filter((c) => mapeo[c.key]).map((c) => (
                        <th key={c.key} className="px-3 py-2 whitespace-nowrap">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {mapeadas.slice(0, 100).map((f, i) => {
                      const mala = invalidas.includes(f);
                      return (
                        <tr key={i} className={mala ? "bg-rose-50/60" : ""}>
                          <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                          {CAMPOS_IMPORTABLES.filter((c) => mapeo[c.key]).map((c) => (
                            <td key={c.key} className="max-w-56 truncate px-3 py-2">
                              {f[c.key] || <span className="text-slate-300">—</span>}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {mapeadas.length > 100 && (
                  <div className="p-3 text-center text-xs text-slate-500">Mostrando 100 de {mapeadas.length} filas</div>
                )}
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="h-4 w-4 accent-teal-700" checked={enviarAlBot} onChange={(e) => setEnviarAlBot(e.target.checked)} />
                  Enviar mensajes con el bot al importar
                </label>
                <button className="btn-primary" disabled={!validas.length || faltanRequeridos.length > 0 || estado === "importando"} onClick={importar}>
                  {estado === "importando" ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                  Importar {validas.length} reclamos
                </button>
              </div>
              {faltanRequeridos.length > 0 && (
                <div className="px-5 pb-4 text-xs text-rose-600">Falta asignar: {faltanRequeridos.map((c) => c.label).join(", ")}</div>
              )}
            </div>
          </div>
        )}

        {/* Historial de lotes */}
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Historial de cargas</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-2">Archivo</th>
                  <th className="px-5 py-2">Fecha</th>
                  <th className="px-5 py-2 text-right">Reclamos</th>
                  <th className="px-5 py-2 text-right">Enviados</th>
                  <th className="px-5 py-2 text-right">Respondidos</th>
                  <th className="px-5 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lotes.map((l) => {
                  const rs = reclamos.filter((r) => r.lote_id === l.id);
                  const env = rs.filter((r) => r.estado_envio === "enviado").length;
                  const resp = rs.filter((r) => r.respuesta !== "sin_respuesta").length;
                  const pend = rs.filter((r) => r.estado_envio === "pendiente").length;
                  return (
                    <tr key={l.id}>
                      <td className="px-5 py-3 font-medium whitespace-nowrap">{l.nombre_archivo}</td>
                      <td className="px-5 py-3 whitespace-nowrap text-slate-500">{fechaHora(l.created_at)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{rs.length || l.cantidad}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{env}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{resp}</td>
                      <td className="px-5 py-3 text-right">
                        {pend > 0 && (
                          <button className="btn-ghost py-1 text-xs" disabled={enviandoLote === l.id} onClick={() => enviarPendientes(l.id)}>
                            {enviandoLote === l.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            Enviar {pend} pendientes
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!lotes.length && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                      Todavía no se cargó ningún archivo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
