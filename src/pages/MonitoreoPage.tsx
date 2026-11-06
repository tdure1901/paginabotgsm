import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Clock, Download, FileText, MessageCircle, RefreshCw, Search, Send, ThumbsDown, ThumbsUp, Users, X, MapPin, Phone, Percent } from "lucide-react";
import { EstadoBadge, PageHeader, Vacio } from "../components/ui";
import { useDatos } from "../lib/useDatos";
import { ESTADOS, estadoReclamo, fecha, fechaHora, hora, nombreLindo, telefonoLindo, v, type EstadoVisible } from "../lib/format";
import type { Notificacion, Reclamo } from "../lib/types";

function Kpi({ label, valor, sub, icon: Icon, color }: { label: string; valor: number | string; sub?: string; icon: typeof Send; color: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md" style={{ background: color + "1a", color }}>
          <Icon size={15} />
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">{valor}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "0%");

interface Fila {
  r: Reclamo;
  n?: Notificacion;
  est: EstadoVisible;
}

function csvCelda(x: string) {
  return `"${(/^[\s\u0000-\u001f]*[=+@-]/.test(x) ? `'${x}` : x).replace(/"/g, '""')}"`;
}
function exportarCSV(filas: Fila[]) {
  const cab = ["Nro. de reclamo", "Solicitante", "Submotivo", "Teléfono", "Localidad", "Enviado", "Estado", "Respuesta del vecino"];
  const rows = filas.map(({ r, n, est }) => [r.numero_reclamo, r.solicitante ?? "", r.submotivo ?? "", r.telefono_normalizado ?? "", r.localidad ?? "", n ? fechaHora(n.created_at) : "", ESTADOS[est].label, n?.respuesta_usuario ?? ""]);
  const csv = "﻿" + [cab, ...rows].map((r) => r.map(csvCelda).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `monitoreo-whatsapp-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3e4);
}

type Alcance = "enviados" | "elegibles" | "todos";

export default function MonitoreoPage() {
  const { reclamos, notificaciones, ultimaNotif, hilos, recargar, cargando, actualizado } = useDatos();
  const [q, setQ] = useState("");
  const [alcance, setAlcance] = useState<Alcance>("enviados");
  const [fEstado, setFEstado] = useState<EstadoVisible | "">("");
  const [fSub, setFSub] = useState("");
  const [fLoc, setFLoc] = useState("");
  const [selId, setSelId] = useState<string | null>(null);

  const todas: Fila[] = useMemo(
    () =>
      reclamos.map((r) => {
        const n = ultimaNotif.get(r.id);
        return { r, n, est: estadoReclamo(r, n) };
      }),
    [reclamos, ultimaNotif],
  );

  const k = useMemo(() => {
    const c = Object.fromEntries(Object.keys(ESTADOS).map((e) => [e, 0])) as Record<EstadoVisible, number>;
    for (const f of todas) c[f.est]++;
    const enviados = todas.filter((f) => f.n).length;
    const respondidos = c.si + c.no + c.respondido_otro;
    return { c, enviados, respondidos, elegibles: reclamos.filter((r) => r.whatsapp_eligible).length };
  }, [todas, reclamos]);

  const dona = (["si", "no", "respondido_otro", "pendiente", "sin_respuesta", "otro"] as EstadoVisible[])
    .map((e) => ({ name: ESTADOS[e].label, value: k.c[e], color: ESTADOS[e].color }))
    .filter((d) => d.value > 0);

  const porDia = useMemo(() => {
    const m = new Map<string, { d: string; Enviados: number; Respondidos: number }>();
    const add = (iso: string, campo: "Enviados" | "Respondidos") => {
      const d = iso.slice(0, 10);
      if (!m.has(d)) m.set(d, { d, Enviados: 0, Respondidos: 0 });
      m.get(d)![campo]++;
    };
    for (const n of notificaciones) {
      add(n.created_at, "Enviados");
      if (n.respuesta_usuario?.trim() && n.updated_at) add(n.updated_at, "Respondidos");
    }
    return [...m.values()]
      .sort((a, b) => a.d.localeCompare(b.d))
      .slice(-30)
      .map((x) => ({ ...x, dia: fecha(x.d + "T12:00:00").slice(0, 5) }));
  }, [notificaciones]);

  const porSub = useMemo(() => {
    const m = new Map<string, { sub: string; SÍ: number; NO: number; "Sin responder": number; total: number }>();
    for (const f of todas) {
      if (!f.n) continue;
      const s = f.r.submotivo || "Sin submotivo";
      if (!m.has(s)) m.set(s, { sub: s, SÍ: 0, NO: 0, "Sin responder": 0, total: 0 });
      const o = m.get(s)!;
      o.total++;
      if (f.est === "si") o.SÍ++;
      else if (f.est === "no") o.NO++;
      else o["Sin responder"]++;
    }
    return [...m.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  }, [todas]);

  const subs = [...new Set(reclamos.map((r) => r.submotivo).filter(Boolean) as string[])].sort();
  const locs = [...new Set(reclamos.map((r) => r.localidad).filter(Boolean) as string[])].sort();

  const filtrados = todas
    .filter(({ r, n, est }) => {
      if (alcance === "enviados" && !n) return false;
      if (alcance === "elegibles" && !r.whatsapp_eligible) return false;
      if (fEstado && est !== fEstado) return false;
      if (fSub && r.submotivo !== fSub) return false;
      if (fLoc && r.localidad !== fLoc) return false;
      if (q) {
        const s = q.toLowerCase();
        return [r.numero_reclamo, r.solicitante, r.telefono_normalizado, r.submotivo, r.calle, n?.respuesta_usuario].some((x) => x?.toLowerCase().includes(s));
      }
      return true;
    })
    .sort((a, b) => (b.n?.created_at ?? "").localeCompare(a.n?.created_at ?? "") || b.r.numero_reclamo.localeCompare(a.r.numero_reclamo));

  const sel = selId ? todas.find((f) => f.r.id === selId) : undefined;
  const hiloSel = sel ? hilos.get(sel.r.id) ?? [] : [];

  return (
    <>
      <PageHeader
        title="Monitoreo WhatsApp"
        subtitle={`Envíos del bot y respuestas de los vecinos${actualizado ? ` · actualizado ${hora(actualizado)}` : ""}`}
        actions={
          <button className="btn-ghost" onClick={recargar}>
            <RefreshCw size={16} className={cargando ? "animate-spin" : ""} /> Actualizar
          </button>
        }
      />
      <div className="space-y-6 p-4 md:p-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Reclamos cargados" valor={reclamos.length} icon={FileText} color="#475569" />
          <Kpi label="Elegibles para WhatsApp" valor={k.elegibles} sub={`${pct(k.elegibles, reclamos.length)} del total`} icon={Users} color="#0891b2" />
          <Kpi label="Enviados" valor={k.enviados} sub={`${k.c.no_enviado} elegibles sin enviar`} icon={Send} color="#0f766e" />
          <Kpi label="Tasa de respuesta" valor={pct(k.respondidos, k.enviados)} sub={`${k.respondidos} respondieron`} icon={Percent} color="#7c3aed" />
          <Kpi label="Enviados sin responder aún" valor={k.c.pendiente} icon={Clock} color={ESTADOS.pendiente.color} />
          <Kpi label="Respondieron SÍ" valor={k.c.si} sub={`${pct(k.c.si, k.respondidos)} de las respuestas`} icon={ThumbsUp} color={ESTADOS.si.color} />
          <Kpi label="Respondieron NO" valor={k.c.no} sub={`${pct(k.c.no, k.respondidos)} de las respuestas`} icon={ThumbsDown} color={ESTADOS.no.color} />
          <Kpi label="Sin respuesta del vecino" valor={k.c.sin_respuesta} sub={`${pct(k.c.sin_respuesta, k.enviados)} de enviados`} icon={MessageCircle} color={ESTADOS.sin_respuesta.color} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card p-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Estado de los enviados</h3>
            <div className="h-64">
              {dona.length ? (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={dona} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="#fff" strokeWidth={2}>
                      {dona.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Vacio>Todavía no hay envíos.</Vacio>
              )}
            </div>
          </div>
          <div className="card p-5 lg:col-span-2">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Actividad por día</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={porDia} barGap={2}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="dia" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={32} />
                  <Tooltip cursor={{ fill: "#f1f5f9" }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Enviados" fill="#0f766e" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="Respondidos" fill="#5eead4" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card p-5 lg:col-span-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Respuestas por submotivo (top 10)</h3>
            <div style={{ height: Math.max(160, porSub.length * 34 + 60) }}>
              <ResponsiveContainer>
                <BarChart data={porSub} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis type="category" dataKey="sub" tickLine={false} axisLine={false} fontSize={12} width={170} />
                  <Tooltip cursor={{ fill: "#f1f5f9" }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="SÍ" stackId="a" fill={ESTADOS.si.color} maxBarSize={20} />
                  <Bar dataKey="NO" stackId="a" fill={ESTADOS.no.color} maxBarSize={20} />
                  <Bar dataKey="Sin responder" stackId="a" fill="#cbd5e1" radius={[0, 4, 4, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
            <div className="mr-auto flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
              {(
                [
                  ["enviados", "Enviados"],
                  ["elegibles", "Elegibles"],
                  ["todos", "Todos los reclamos"],
                ] as [Alcance, string][]
              ).map(([id, l]) => (
                <button key={id} onClick={() => setAlcance(id)} className={`rounded-md px-2.5 py-1 ${alcance === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                  {l}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search size={15} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
              <input className="input w-56 py-1.5 pl-8" placeholder="Nro., solicitante, teléfono…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="input w-auto py-1.5" value={fEstado} onChange={(e) => setFEstado(e.target.value as EstadoVisible | "")}>
              <option value="">Todos los estados</option>
              {(Object.keys(ESTADOS) as EstadoVisible[]).map((e) => (
                <option key={e} value={e}>
                  {ESTADOS[e].label}
                </option>
              ))}
            </select>
            <select className="input w-auto max-w-48 py-1.5" value={fSub} onChange={(e) => setFSub(e.target.value)}>
              <option value="">Todos los submotivos</option>
              {subs.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select className="input w-auto max-w-44 py-1.5" value={fLoc} onChange={(e) => setFLoc(e.target.value)}>
              <option value="">Todas las localidades</option>
              {locs.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <button className="btn-ghost py-1.5" onClick={() => exportarCSV(filtrados)}>
              <Download size={15} /> CSV
            </button>
          </div>
          <div className="px-4 py-2 text-xs text-slate-500">{filtrados.length} reclamos</div>
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2">Nro. Reclamo</th>
                  <th className="px-4 py-2">Solicitante</th>
                  <th className="px-4 py-2">Submotivo</th>
                  <th className="px-4 py-2">Enviado</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2">Respuesta del vecino</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.slice(0, 1000).map(({ r, n, est }) => (
                  <tr key={r.id} onClick={() => setSelId(r.id)} className={`cursor-pointer hover:bg-slate-50 ${selId === r.id ? "bg-brand-50/60" : ""}`}>
                    <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap text-slate-500">{r.numero_reclamo}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium whitespace-nowrap text-slate-900">{nombreLindo(r.solicitante)}</div>
                      <div className="text-xs text-slate-500">{telefonoLindo(r.telefono_normalizado)}</div>
                    </td>
                    <td className="max-w-56 truncate px-4 py-2.5">{v(r.submotivo)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">{n ? fechaHora(n.created_at) : "—"}</td>
                    <td className="px-4 py-2.5">
                      <EstadoBadge estado={est} />
                    </td>
                    <td className="max-w-56 truncate px-4 py-2.5 text-slate-600">{v(n?.respuesta_usuario)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtrados.length > 1000 && <div className="p-3 text-center text-xs text-slate-500">Mostrando 1000 de {filtrados.length}. Usá los filtros o exportá el CSV.</div>}
            {!filtrados.length && <Vacio>No hay reclamos que coincidan con los filtros.</Vacio>}
          </div>
        </div>
      </div>

      {sel && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={() => setSelId(null)}>
          <aside className="flex h-full w-full max-w-lg flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 border-b border-slate-200 p-5">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs text-slate-500">Reclamo {sel.r.numero_reclamo}</div>
                <h2 className="text-lg font-semibold text-slate-900">{nombreLindo(sel.r.solicitante)}</h2>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <EstadoBadge estado={sel.est} />
                  {sel.r.whatsapp_eligible && <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-medium text-cyan-700">Elegible WhatsApp</span>}
                </div>
              </div>
              <button className="text-slate-400 hover:text-slate-700" onClick={() => setSelId(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-5 text-sm">
              <div className="space-y-1.5 rounded-lg bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-slate-400" /> {telefonoLindo(sel.r.telefono_normalizado)}
                  {sel.r.telefono_original && <span className="text-xs text-slate-400">(original: {sel.r.telefono_original})</span>}
                </div>
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="text-slate-400" /> {[sel.r.calle, sel.r.numero_domicilio].filter(Boolean).join(" ") || "—"}
                  {sel.r.localidad && <span className="text-slate-400">· {sel.r.localidad}</span>}
                </div>
              </div>
              <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1.5">
                {(
                  [
                    ["Motivo", sel.r.motivo],
                    ["Submotivo", sel.r.submotivo],
                    ["Estado", sel.r.estado],
                    ["Situación", sel.r.situacion],
                    ["Fecha ingreso", fechaHora(sel.r.fecha_ingreso)],
                    ["Fecha respuesta", fechaHora(sel.r.fecha_respuesta)],
                    ["Verificación", [sel.r.estado_verificacion, sel.r.resultado_verificacion].filter(Boolean).join(" · ") || null],
                  ] as [string, string | null][]
                ).map(([l, val]) => (
                  <div key={l} className="contents">
                    <dt className="text-slate-500">{l}</dt>
                    <dd>{v(val)}</dd>
                  </div>
                ))}
              </dl>
              {sel.r.texto_reclamo && (
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-500 uppercase">Texto del reclamo</div>
                  <p className="rounded-lg bg-slate-50 p-3 whitespace-pre-wrap text-slate-700">{sel.r.texto_reclamo}</p>
                </div>
              )}
              {sel.r.texto_respuesta && (
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-500 uppercase">Respuesta del municipio</div>
                  <p className="rounded-lg bg-slate-50 p-3 whitespace-pre-wrap text-slate-700">{sel.r.texto_respuesta}</p>
                </div>
              )}
              <div>
                <div className="mb-2 text-xs font-medium text-slate-500 uppercase">WhatsApp</div>
                <div className="space-y-2">
                  {hiloSel.slice(-5).map((m) => (
                    <div key={m.id} className={`flex ${m.direccion === "saliente" ? "justify-end" : ""}`}>
                      <div className={`max-w-[85%] rounded-xl px-3 py-2 ${m.direccion === "saliente" ? "bg-brand-50" : "bg-slate-100"}`}>
                        <div>{m.contenido}</div>
                        <div className="mt-0.5 text-right text-[10px] text-slate-400">{fechaHora(m.fecha)}</div>
                      </div>
                    </div>
                  ))}
                  {!hiloSel.length && <div className="text-slate-400">No se envió WhatsApp para este reclamo.</div>}
                </div>
              </div>
            </div>
            <div className="border-t border-slate-200 p-4">
              <Link to={`/conversaciones/${sel.r.id}`} className="btn-primary w-full">
                <MessageCircle size={16} /> Abrir conversación
              </Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
