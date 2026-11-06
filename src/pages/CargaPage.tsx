import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Pencil, Trash2, UploadCloud, X, PhoneOff, Wand2, Ban } from "lucide-react";
import { PageHeader } from "../components/ui";
import { MOTIVOS_ELEGIBLES, columnasFaltantes, motivoNoElegible, analizar, conExclusiones, corregirTelefono, esCandidato, leerArchivo, quitarFilas, sugerirTelefono, type Analisis, type FilaAnalizada } from "../lib/importacion";
import { agregarExclusion, importarReclamos, type ResultadoImport } from "../lib/api";
import { useDatos } from "../lib/useDatos";
import { buscarExistentes } from "../lib/consultas";
import { telefonoLindo, v } from "../lib/format";
import { normalizarTelefono } from "../lib/importacion";

type Filtro = "todos" | "validos" | "adv" | "rech" | "telinv" | "eleg" | "excl";
const FILTROS: { id: Filtro; label: string; test: (f: FilaAnalizada) => boolean }[] = [
  { id: "todos", label: "Todos", test: () => true },
  { id: "validos", label: "Válidos", test: (f) => f.status === "VALIDA" },
  { id: "adv", label: "Con advertencias", test: (f) => f.status === "VALIDA_CON_ADVERTENCIAS" },
  { id: "rech", label: "Rechazados", test: (f) => f.status === "RECHAZADA" },
  { id: "telinv", label: "Teléfono inválido", test: (f) => !!f.data && !f.data.telefono_valido },
  { id: "eleg", label: "Elegibles WhatsApp", test: (f) => !!f.data?.whatsapp_eligible },
  { id: "excl", label: "No elegibles (lista)", test: (f) => f.advertencias.some((a) => a.startsWith("Teléfono en lista de no elegibles")) },
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
  const { recargar, exclusiones } = useDatos();
  // Nro. de reclamo del archivo que ya están en la base (se consulta solo eso, no toda la tabla)
  const [existentes, setExistentes] = useState<Set<string>>(new Set());
  const mapaExcl = useMemo(() => new Map(exclusiones.map((e) => [e.telefono, e.motivo ?? ""])), [exclusiones]);
  const [excluyendo, setExcluyendo] = useState<{ tel: string; nombre: string; motivo: string } | null>(null);
  const [verTodosInvalidos, setVerTodosInvalidos] = useState(false);
  const [faltantes, setFaltantes] = useState<string[]>([]);
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


  async function procesar(file: File) {
    setLeyendo(true);
    setError("");
    setResultado(null);
    try {
      const { rows, filas, cabeceras } = await leerArchivo(file);
      setFaltantes(columnasFaltantes(cabeceras));
      setArchivo(file);
      // 1) Primer análisis para obtener los Nro. de reclamo ya normalizados
      const previo = analizar(rows, filas, mapaExcl);
      // 2) Se consulta cuáles ya existen y con qué teléfono, para no pisar teléfonos corregidos
      const ex = await buscarExistentes(previo.validos.map((r) => r.numero_reclamo));
      setExistentes(new Set(ex.keys()));
      const enBase = new Map(
        [...ex.values()].filter((r) => r.telefono_valido && r.telefono_normalizado).map((r) => [r.numero_reclamo, { original: r.telefono_original, normalizado: r.telefono_normalizado! }]),
      );
      setAnalisis(analizar(rows, filas, mapaExcl, enBase));
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

  // Si la lista de no elegibles cambia mientras se revisa el archivo, se recalcula
  useEffect(() => {
    setAnalisis((a) => (a ? conExclusiones(a, mapaExcl) : a));
  }, [mapaExcl]);

  async function confirmarExclusion() {
    if (!excluyendo) return;
    try {
      await agregarExclusion(excluyendo.tel, excluyendo.motivo);
      setExcluyendo(null);
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const invalidos = analisis ? analisis.filas.filter((f) => f.data && !f.data.telefono_valido) : [];
  const aRevisar = verTodosInvalidos ? invalidos : invalidos.filter((f) => esCandidato(f.data!.estado, f.data!.situacion, f.data!.motivo));

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

            {faltantes.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <div>
                  No se encontraron estas columnas en el archivo: <b>{faltantes.join(", ")}</b>. Sin ellas ningún reclamo puede ser elegible para WhatsApp.
                  Revisá que el archivo sea el export completo del sistema.
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 xl:grid-cols-9">
              <Stat label="Filas" valor={analisis.stats.total} />
              <Stat label="Válidas" valor={analisis.stats.validos} tono="text-emerald-700" />
              <Stat label="Con advertencias" valor={analisis.stats.conAdvertencias} tono="text-amber-600" />
              <Stat label="Rechazadas" valor={analisis.stats.rechazados} tono="text-rose-600" />
              <Stat label="Tel. válidos" valor={analisis.stats.telValidos} />
              <Stat label="Tel. inválidos" valor={analisis.stats.telInvalidos} tono="text-rose-600" />
              <Stat label="Elegibles WhatsApp" valor={analisis.stats.elegibles} tono="text-brand-700" />
              <Stat label="No elegibles (lista)" valor={analisis.stats.excluidos} tono="text-slate-500" />
              <Stat label="Nro. duplicados" valor={analisis.stats.duplicadosReclamo} />
            </div>

            {invalidos.length > 0 && (
              <div className="card overflow-hidden border-amber-200">
                <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3">
                  <PhoneOff size={16} className="text-amber-700" />
                  <h3 className="text-sm font-semibold text-amber-900">Teléfonos a revisar</h3>
                  <span className="text-xs text-amber-800">
                    {analisis.stats.telARevisar === 1 ? "1 reclamo cerrado con respuesta positiva no se puede" : `${analisis.stats.telARevisar} reclamos cerrados con respuesta positiva no se pueden`} avisar porque el teléfono está mal cargado. Corregilos antes de importar.
                  </span>
                  <label className="ml-auto flex items-center gap-1.5 text-xs text-amber-900">
                    <input type="checkbox" className="accent-teal-700" checked={verTodosInvalidos} onChange={(e) => setVerTodosInvalidos(e.target.checked)} />
                    Ver todos los inválidos ({invalidos.length})
                  </label>
                </div>
                <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                  {aRevisar.map((f) => (
                    <FilaTelefono
                      key={f.fila}
                      fila={f}
                      onGuardar={(v) => setAnalisis(corregirTelefono(analisis, f.fila, v))}
                    />
                  ))}
                  {!aRevisar.length && <div className="p-4 text-center text-sm text-slate-500">No hay reclamos para avisar con el teléfono mal cargado. 🎉</div>}
                </div>
              </div>
            )}

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
                      <th className="px-3 py-2"></th>
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
                        <td className="max-w-56 px-3 py-2 text-xs">
                          {f.data ? (
                            f.data.whatsapp_eligible ? (
                              <span className="font-medium text-brand-700">Sí</span>
                            ) : (
                              <span className="text-slate-400">
                                No
                                <span className="block text-[11px] leading-tight text-slate-400">
                                  {motivoNoElegible(f.data, { normalizado: f.data.telefono_normalizado, valido: f.data.telefono_valido }, analisis.exclusiones)}
                                </span>
                              </span>
                            )
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="min-w-56 px-3 py-2 text-xs text-amber-700">{f.advertencias.join(" · ")}</td>
                        <td className="px-3 py-2">
                          {f.data?.telefono_valido && !mapaExcl.has(f.data.telefono_normalizado!) && (
                            <button
                              className="text-slate-300 hover:text-rose-600"
                              title="Agregar el teléfono a la lista de no elegibles"
                              onClick={() => setExcluyendo({ tel: f.data!.telefono_normalizado!, nombre: f.data!.solicitante ?? "", motivo: "" })}
                            >
                              <Ban size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visibles.length > 500 && <div className="p-3 text-center text-xs text-slate-500">Mostrando 500 de {visibles.length} filas</div>}
                {!visibles.length && <div className="p-8 text-center text-sm text-slate-500">No hay filas para mostrar.</div>}
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Se marcan como <b>elegibles para WhatsApp</b> los reclamos con Estado “Cerrado”, Situación “Resp.Positiva”, motivo {MOTIVOS_ELEGIBLES.map((m) => `“${m}”`).join(", ")}, teléfono válido y que no estén en la lista de no elegibles. Con <Ban size={12} className="inline" /> agregás un teléfono a esa lista. Si el Nro. de reclamo ya existe, se actualiza.
            </p>
          </>
        )}
      </div>

      {excluyendo && <ModalExclusion valor={excluyendo} onChange={setExcluyendo} onConfirmar={confirmarExclusion} />}
    </>
  );
}

export function ModalExclusion({
  valor,
  onChange,
  onConfirmar,
}: {
  valor: { tel: string; nombre: string; motivo: string };
  onChange: (v: { tel: string; nombre: string; motivo: string } | null) => void;
  onConfirmar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4" onClick={() => onChange(null)}>
      <form
        className="card w-full max-w-sm space-y-3 p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onConfirmar();
        }}
      >
        <h3 className="flex items-center gap-2 font-semibold text-slate-900">
          <Ban size={18} className="text-rose-600" /> No avisar a este número
        </h3>
        <p className="text-sm text-slate-600">
          <b>{telefonoLindo(valor.tel)}</b>
          {valor.nombre && <> · {valor.nombre}</>}
          <br />
          Ningún reclamo con este teléfono va a recibir el WhatsApp, ni los de este archivo ni los ya cargados.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Motivo (opcional)</span>
          <input autoFocus className="input" placeholder="Ej: Director de Alumbrado" value={valor.motivo} onChange={(e) => onChange({ ...valor, motivo: e.target.value })} />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => onChange(null)}>
            Cancelar
          </button>
          <button className="btn bg-rose-600 text-white hover:bg-rose-700">Agregar a la lista</button>
        </div>
      </form>
    </div>
  );
}

/** Fila editable para corregir un teléfono, con sugerencia automática */
export function FilaTelefono({
  fila,
  onGuardar,
}: {
  fila: Pick<FilaAnalizada, "numero_reclamo" | "advertencias"> & { data: { solicitante: string | null; telefono_original: string | null; submotivo: string | null } | null };
  onGuardar: (v: string) => void | Promise<void>;
}) {
  const original = fila.data?.telefono_original ?? "";
  const [valor, setValor] = useState(original);
  const sugerido = sugerirTelefono(original);
  const ok = normalizarTelefono(valor).valido;
  return (
    <form
      className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar(valor);
      }}
    >
      <div className="w-44 min-w-0">
        <div className="truncate font-medium">{fila.data?.solicitante ?? "—"}</div>
        <div className="truncate font-mono text-xs text-slate-500">
          {fila.numero_reclamo} · {fila.data?.submotivo ?? ""}
        </div>
      </div>
      <div className="w-36 text-xs">
        <div className="text-slate-400">Cargado</div>
        <div className="font-medium text-rose-600">{original || "(vacío)"}</div>
      </div>
      <input
        className={`input w-44 py-1.5 ${valor && ok ? "border-emerald-400" : ""}`}
        placeholder="Ej: 11 3455-4433"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
      />
      {sugerido && valor === original && (
        <button type="button" className="btn-ghost py-1 text-xs text-brand-700" onClick={() => setValor(sugerido)} title="Sugerencia automática">
          <Wand2 size={13} /> ¿{telefonoLindo(normalizarTelefono(sugerido).normalizado)}?
        </button>
      )}
      <span className="text-xs">{valor && valor !== original ? (ok ? <span className="text-emerald-600">✓ válido</span> : <span className="text-rose-600">sigue inválido</span>) : null}</span>
      <button className="btn-primary ml-auto py-1 text-xs" disabled={!valor.trim() || valor === original || !ok}>
        Guardar
      </button>
    </form>
  );
}
