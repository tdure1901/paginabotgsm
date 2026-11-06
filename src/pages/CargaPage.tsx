import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Pencil, Trash2, UploadCloud, X } from "lucide-react";
import { PageHeader } from "../components/ui";
import { analizar, corregirTelefono, leerArchivo, quitarFilas, type Analisis, type FilaAnalizada } from "../lib/importacion";
import { importarReclamos, type ResultadoImport } from "../lib/api";
import { useDatos } from "../lib/useDatos";
import { telefonoLindo, v } from "../lib/format";

type Filtro = "todos" | "validos" | "adv" | "rech" | "telinv" | "eleg";
const FILTROS: { id: Filtro; label: string; test: (f: FilaAnalizada) => boolean }[] = [
  { id: "todos", label: "Todos", test: () => true },
  { id: "validos", label: "Válidos", test: (f) => f.status === "VALIDA" },
  { id: "adv", label: "Con advertencias", test: (f) => f.status === "VALIDA_CON_ADVERTENCIAS" },
  { id: "rech", label: "Rechazados", test: (f) => f.status === "RECHAZADA" },
  { id: "telinv", label: "Teléfono inválido", test: (f) => !!f.data && !f.data.telefono_valido },
  { id: "eleg", label: "Elegibles WhatsApp", test: (f) => !!f.data?.whatsapp_eligible },
];

const BADGE: Record<FilaAnalizada["status"], [string, string]> = {
  VALIDA: ["Válida", "bg-emerald-100 text-emerald-700"],
  VALIDA_CON_ADVERTENCIAS: ["Advertencia", "bg-amber-100 text-amber-700"],
  RECHAZADA: ["Rechazada", "bg-rose-100 text-rose-700"],
};

function Stat({ label, valor, tono = "text-slate-900" }: { label: string; valor: number; tono?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${tono}`}>{valor}</div>
    </div>
  );
}

export default function CargaPage() {
  const { recargar, reclamos } = useDatos();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [editando, setEditando] = useState<{ fila: number; valor: string } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [progreso, setProgreso] = useState<[number, number] | null>(null);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);

  const existentes = useMemo(() => new Set(reclamos.map((r) => r.numero_reclamo)), [reclamos]);

  async function procesar(file: File) {
    setLeyendo(true);
    setError("");
    setResultado(null);
    try {
      const { rows, filas } = await leerArchivo(file);
      setArchivo(file);
      setAnalisis(analizar(rows, filas));
      setFiltro("todos");
      setSel(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLeyendo(false);
    }
  }

  function cancelar() {
    setArchivo(null);
    setAnalisis(null);
    setSel(new Set());
  }

  async function importar() {
    if (!analisis) return;
    setError("");
    setProgreso([0, analisis.validos.length]);
    try {
      const r = await importarReclamos(analisis.validos, (a, b) => setProgreso([a, b]));
      setResultado(r);
      cancelar();
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgreso(null);
    }
  }

  const visibles = analisis ? analisis.filas.filter(FILTROS.find((f) => f.id === filtro)!.test) : [];
  const nuevos = analisis ? analisis.validos.filter((r) => !existentes.has(r.numero_reclamo)).length : 0;

  return (
    <>
      <PageHeader title="Importación de reclamos" subtitle='Subí el archivo .xls exportado del sistema de reclamos (con la columna "Nro. Reclamo").' />
      <div className="space-y-5 p-4 md:p-8">
        {resultado && (
          <div
            className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
              resultado.lotesFallidos.length ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <b>{resultado.procesados}</b> reclamos importados / actualizados.
              {resultado.lotesFallidos.map((l) => (
                <div key={l.lote}>
                  Lote {l.lote} (registros {l.desde}–{l.hasta}) falló: {l.motivo}
                </div>
              ))}
            </div>
            <button onClick={() => setResultado(null)}>
              <X size={16} />
            </button>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <AlertTriangle size={18} /> {error}
          </div>
        )}

        {!analisis ? (
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
            className={`card flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed px-6 py-16 text-center transition ${
              arrastrando ? "border-brand-500 bg-brand-50" : "hover:border-brand-500"
            }`}
          >
            {leyendo ? <Loader2 className="animate-spin text-brand-600" size={36} /> : <UploadCloud className="text-brand-600" size={36} />}
            <div>
              <div className="font-medium text-slate-900">Arrastrá el archivo acá o hacé clic para elegirlo</div>
              <div className="text-sm text-slate-500">.xls exportado del sistema · también .xlsx o .csv con las mismas columnas</div>
            </div>
            <input type="file" accept=".xls,.xlsx,.csv,.html,.htm" className="hidden" onChange={(e) => e.target.files?.[0] && procesar(e.target.files[0])} />
          </label>
        ) : (
          <>
            <div className="card flex flex-wrap items-center gap-3 px-5 py-4">
              <FileSpreadsheet className="text-brand-600" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{archivo?.name}</div>
                <div className="text-xs text-slate-500">
                  {analisis.stats.total} filas · {analisis.validos.length} reclamos a importar ({nuevos} nuevos, {analisis.validos.length - nuevos} ya existentes se actualizan)
                </div>
              </div>
              <button className="btn-ghost" onClick={cancelar} disabled={!!progreso}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={importar} disabled={!analisis.validos.length || !!progreso}>
                {progreso ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                {progreso ? `Importando ${progreso[0]}/${progreso[1]}…` : `Importar ${analisis.validos.length} reclamos`}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
              <Stat label="Filas" valor={analisis.stats.total} />
              <Stat label="Válidas" valor={analisis.stats.validos} tono="text-emerald-700" />
              <Stat label="Con advertencias" valor={analisis.stats.conAdvertencias} tono="text-amber-600" />
              <Stat label="Rechazadas" valor={analisis.stats.rechazados} tono="text-rose-600" />
              <Stat label="Tel. válidos" valor={analisis.stats.telValidos} />
              <Stat label="Tel. inválidos" valor={analisis.stats.telInvalidos} tono="text-rose-600" />
              <Stat label="Elegibles WhatsApp" valor={analisis.stats.elegibles} tono="text-brand-700" />
              <Stat label="Nro. duplicados" valor={analisis.stats.duplicadosReclamo} />
            </div>

            <div className="card overflow-hidden">
              <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 px-4 py-3">
                {FILTROS.map((f) => {
                  const n = analisis.filas.filter(f.test).length;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setFiltro(f.id)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${filtro === f.id ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                    >
                      {f.label} <span className="opacity-70">{n}</span>
                    </button>
                  );
                })}
                {sel.size > 0 && (
                  <div className="ml-auto flex items-center gap-2 text-xs">
                    <span className="text-slate-500">{sel.size} seleccionadas</span>
                    <button
                      className="btn-ghost py-1 text-xs text-rose-600"
                      onClick={() => {
                        setAnalisis(quitarFilas(analisis, sel));
                        setSel(new Set());
                      }}
                    >
                      <Trash2 size={14} /> Quitar del archivo
                    </button>
                    <button className="text-slate-500 hover:underline" onClick={() => setSel(new Set())}>
                      Cancelar selección
                    </button>
                  </div>
                )}
              </div>
              <div className="max-h-[560px] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500 uppercase">
                    <tr>
                      <th className="w-8 px-3 py-2">
                        <input
                          type="checkbox"
                          className="accent-teal-700"
                          checked={visibles.length > 0 && visibles.every((f) => sel.has(f.fila))}
                          onChange={(e) => setSel(e.target.checked ? new Set(visibles.map((f) => f.fila)) : new Set())}
                        />
                      </th>
                      <th className="px-3 py-2">Fila</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Nro. Reclamo</th>
                      <th className="px-3 py-2">Solicitante</th>
                      <th className="px-3 py-2">Submotivo</th>
                      <th className="px-3 py-2">Teléfono</th>
                      <th className="px-3 py-2">Estado / Situación</th>
                      <th className="px-3 py-2">WhatsApp</th>
                      <th className="px-3 py-2">Advertencias</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibles.slice(0, 500).map((f) => (
                      <tr key={f.fila} className={sel.has(f.fila) ? "bg-brand-50/60" : f.status === "RECHAZADA" ? "bg-rose-50/50" : ""}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            className="accent-teal-700"
                            checked={sel.has(f.fila)}
                            onChange={(e) => {
                              const s = new Set(sel);
                              if (e.target.checked) s.add(f.fila);
                              else s.delete(f.fila);
                              setSel(s);
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-400">{f.fila}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${BADGE[f.status][1]}`}>{BADGE[f.status][0]}</span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{v(f.numero_reclamo)}</td>
                        <td className="max-w-48 truncate px-3 py-2">{v(f.data?.solicitante)}</td>
                        <td className="max-w-48 truncate px-3 py-2">{v(f.data?.submotivo)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {f.data &&
                            (editando?.fila === f.fila ? (
                              <form
                                className="flex gap-1"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  setAnalisis(corregirTelefono(analisis, f.fila, editando.valor));
                                  setEditando(null);
                                }}
                              >
                                <input autoFocus className="input w-36 py-1" value={editando.valor} onChange={(e) => setEditando({ ...editando, valor: e.target.value })} />
                                <button className="btn-primary px-2 py-1 text-xs">OK</button>
                              </form>
                            ) : (
                              <button
                                className={`group flex items-center gap-1.5 ${f.data.telefono_valido ? "" : "text-rose-600"}`}
                                onClick={() => setEditando({ fila: f.fila, valor: f.data!.telefono_original ?? "" })}
                                title="Corregir teléfono"
                              >
                                {f.data.telefono_valido ? telefonoLindo(f.data.telefono_normalizado) : v(f.data.telefono_original)}
                                <Pencil size={12} className="text-slate-300 group-hover:text-slate-600" />
                              </button>
                            ))}
                        </td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap text-slate-600">
                          {v(f.data?.estado)} · {v(f.data?.situacion)}
                        </td>
                        <td className="px-3 py-2 text-xs">{f.data ? (f.data.whatsapp_eligible ? <span className="font-medium text-brand-700">Sí</span> : <span className="text-slate-400">No</span>) : "—"}</td>
                        <td className="min-w-56 px-3 py-2 text-xs text-amber-700">{f.advertencias.join(" · ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visibles.length > 500 && <div className="p-3 text-center text-xs text-slate-500">Mostrando 500 de {visibles.length} filas</div>}
                {!visibles.length && <div className="p-8 text-center text-sm text-slate-500">No hay filas para mostrar.</div>}
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Se marcan como <b>elegibles para WhatsApp</b> los reclamos con Estado “Cerrado”, Situación “Resp.Positiva” y teléfono válido. Si el Nro. de reclamo ya existe, se actualiza.
            </p>
          </>
        )}
      </div>
    </>
  );
}
