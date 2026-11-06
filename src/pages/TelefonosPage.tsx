import { useMemo, useState } from "react";
import { AlertTriangle, Ban, Loader2, PhoneOff, Plus, Trash2 } from "lucide-react";
import { PageHeader, Vacio } from "../components/ui";
import { useDatos } from "../lib/useDatos";
import { actualizarTelefono, agregarExclusion, quitarExclusion } from "../lib/api";
import { categoria, fecha, nombreLindo, telefonoLindo } from "../lib/format";
import { esCandidato, normalizarTelefono } from "../lib/importacion";
import { FilaTelefono } from "./CargaPage";

type Tab = "invalidos" | "excluidos";

export default function TelefonosPage() {
  const { reclamos, exclusiones, ultimaNotif, recargar, exclusionesDisponible } = useDatos();
  const [tab, setTab] = useState<Tab>("invalidos");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [nuevoTel, setNuevoTel] = useState("");
  const [nuevoMotivo, setNuevoMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const setExcl = useMemo(() => new Set(exclusiones.map((e) => e.telefono)), [exclusiones]);

  // Reclamos que cumplen las reglas salvo por el teléfono, y que todavía no se avisaron (o el envío falló)
  const invalidos = useMemo(
    () =>
      reclamos.filter((r) => {
        if (r.telefono_valido || !esCandidato(r.estado, r.situacion)) return false;
        const n = ultimaNotif.get(r.id);
        return !n || ["pendiente", "error"].includes((n.estado ?? "").toLowerCase()) || categoria(n) === "error";
      }),
    [reclamos, ultimaNotif],
  );

  const porTelefono = useMemo(() => {
    const m = new Map<string, typeof reclamos>();
    for (const r of reclamos) {
      if (!r.telefono_normalizado) continue;
      if (!m.has(r.telefono_normalizado)) m.set(r.telefono_normalizado, []);
      m.get(r.telefono_normalizado)!.push(r);
    }
    return m;
  }, [reclamos]);

  const s = q.toLowerCase();
  const invVisibles = invalidos.filter((r) => !q || [r.solicitante, r.numero_reclamo, r.telefono_original].some((x) => x?.toLowerCase().includes(s)));
  const exVisibles = exclusiones.filter((e) => !q || [e.telefono, e.motivo, ...(porTelefono.get(e.telefono) ?? []).map((r) => r.solicitante)].some((x) => x?.toLowerCase().includes(s)));

  const telNuevo = normalizarTelefono(nuevoTel);
  const coincidencias = telNuevo.valido ? porTelefono.get(telNuevo.normalizado!) ?? [] : [];

  async function agregar() {
    setGuardando(true);
    setError("");
    try {
      await agregarExclusion(nuevoTel, nuevoMotivo);
      setNuevoTel("");
      setNuevoMotivo("");
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <PageHeader title="Teléfonos" subtitle="Corregí teléfonos mal cargados y administrá los números a los que no hay que avisar." />
      <div className="space-y-4 p-4 md:p-8">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <AlertTriangle size={18} /> {error}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-slate-200/60 p-0.5 text-sm font-medium">
            <button onClick={() => setTab("invalidos")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${tab === "invalidos" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
              <PhoneOff size={15} /> Teléfonos inválidos <span className="text-xs text-slate-400">{invalidos.length}</span>
            </button>
            <button onClick={() => setTab("excluidos")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${tab === "excluidos" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
              <Ban size={15} /> No elegibles <span className="text-xs text-slate-400">{exclusiones.length}</span>
            </button>
          </div>
          <input className="input ml-auto w-64" placeholder="Buscar nombre, Nro. o teléfono…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {tab === "invalidos" ? (
          <div className="card overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
              Reclamos <b>cerrados con respuesta positiva</b> que no se pueden avisar porque el teléfono está mal cargado. Al guardar un teléfono válido, el reclamo pasa a la cola del bot.
            </div>
            <div className="divide-y divide-slate-100">
              {invVisibles.map((r) => (
                <FilaTelefono
                  key={r.id}
                  fila={{ numero_reclamo: r.numero_reclamo, advertencias: [], data: { solicitante: nombreLindo(r.solicitante), telefono_original: r.telefono_original, submotivo: r.submotivo } }}
                  onGuardar={async (v) => {
                    try {
                      await actualizarTelefono(r, v, setExcl);
                      await recargar();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    }
                  }}
                />
              ))}
              {!invVisibles.length && <Vacio>No hay reclamos para avisar con el teléfono mal cargado. 🎉</Vacio>}
            </div>
          </div>
        ) : (
          <>
            {!exclusionesDisponible && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle size={18} /> Falta crear la tabla en Supabase: ejecutá <code>supabase/exclusiones.sql</code>.
              </div>
            )}
            <form
              className="card flex flex-wrap items-end gap-3 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                agregar();
              }}
            >
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Teléfono</span>
                <input className={`input w-48 ${nuevoTel && !telNuevo.valido ? "border-rose-300" : ""}`} placeholder="Ej: 11 4433-2211" value={nuevoTel} onChange={(e) => setNuevoTel(e.target.value)} />
              </label>
              <label className="block min-w-48 flex-1">
                <span className="mb-1 block text-xs font-medium text-slate-600">Motivo</span>
                <input className="input" placeholder="Ej: Director de Alumbrado" value={nuevoMotivo} onChange={(e) => setNuevoMotivo(e.target.value)} />
              </label>
              <button className="btn-primary" disabled={!telNuevo.valido || guardando || setExcl.has(telNuevo.normalizado ?? "") || !exclusionesDisponible}>
                {guardando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Agregar
              </button>
              {telNuevo.valido && (
                <div className="w-full text-xs text-slate-500">
                  {setExcl.has(telNuevo.normalizado!)
                    ? "Ese número ya está en la lista."
                    : coincidencias.length
                      ? `${telefonoLindo(telNuevo.normalizado)} aparece en ${coincidencias.length} reclamo(s): ${[...new Set(coincidencias.map((r) => nombreLindo(r.solicitante)))].slice(0, 3).join(", ")}`
                      : `${telefonoLindo(telNuevo.normalizado)} no aparece en ningún reclamo cargado.`}
                </div>
              )}
            </form>
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2">Teléfono</th>
                    <th className="px-4 py-2">Motivo</th>
                    <th className="px-4 py-2">Reclamos con este número</th>
                    <th className="px-4 py-2">Agregado</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {exVisibles.map((e) => {
                    const rs = porTelefono.get(e.telefono) ?? [];
                    return (
                      <tr key={e.telefono}>
                        <td className="px-4 py-2.5 font-medium whitespace-nowrap">{telefonoLindo(e.telefono)}</td>
                        <td className="px-4 py-2.5">{e.motivo ?? "—"}</td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {rs.length ? (
                            <>
                              <b>{rs.length}</b> · {[...new Set(rs.map((r) => nombreLindo(r.solicitante)))].slice(0, 2).join(", ")}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs whitespace-nowrap text-slate-500">
                          {fecha(e.created_at)}
                          {e.creado_por && <div>{e.creado_por}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            className="btn-ghost py-1 text-xs"
                            onClick={async () => {
                              if (!confirm(`¿Quitar ${telefonoLindo(e.telefono)} de la lista? Sus reclamos que cumplan las reglas van a volver a la cola del bot.`)) return;
                              try {
                                await quitarExclusion(e.telefono);
                                await recargar();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : String(err));
                              }
                            }}
                          >
                            <Trash2 size={14} /> Quitar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!exVisibles.length && <Vacio>No hay números en la lista de no elegibles.</Vacio>}
            </div>
          </>
        )}
      </div>
    </>
  );
}
