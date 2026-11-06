import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, MessageCircle, Search, Send, ThumbsDown, ThumbsUp, Clock, X, MapPin, Phone, Inbox, RefreshCw } from "lucide-react";
import { EstadoBadge, PageHeader, Vacio } from "../components/ui";
import { useDatos } from "../lib/useDatos";
import { ESTADOS, estadoVisible, fecha, fechaHora, hora, type EstadoVisible } from "../lib/format";
import { actualizarRespuesta } from "../lib/api";
import type { Reclamo } from "../lib/types";

function Kpi({ label, valor, sub, icon: Icon, color }: { label: string; valor: number | string; sub?: string; icon: typeof Send; color: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <span className="grid h-7 w-7 place-items-center rounded-md" style={{ background: color + "1a", color }}>
          <Icon size={15} />
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">{valor}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function pct(a: number, b: number) {
  return b ? `${Math.round((a / b) * 100)}%` : "0%";
}

function exportarCSV(rs: Reclamo[]) {
  const cols: (keyof Reclamo)[] = ["numero_reclamo", "nombre", "telefono", "direccion", "barrio", "tipo", "descripcion", "fecha_reclamo", "estado_envio", "respuesta", "enviado_at", "respondido_at"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...rs.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `reclamos_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function MonitoreoPage() {
  const { reclamos, mensajes, lotes, recargar, cargando } = useDatos();
  const [q, setQ] = useState("");
  const [fEstado, setFEstado] = useState<EstadoVisible | "">("");
  const [fTipo, setFTipo] = useState("");
  const [fBarrio, setFBarrio] = useState("");
  const [fLote, setFLote] = useState("");
  const [sel, setSel] = useState<Reclamo | null>(null);

  const base = useMemo(() => (fLote ? reclamos.filter((r) => r.lote_id === fLote) : reclamos), [reclamos, fLote]);

  const k = useMemo(() => {
    const enviados = base.filter((r) => r.estado_envio === "enviado");
    const pos = enviados.filter((r) => r.respuesta === "positiva").length;
    const neg = enviados.filter((r) => r.respuesta === "negativa").length;
    const sin = enviados.length - pos - neg;
    return {
      total: base.length,
      enviados: enviados.length,
      pendientes: base.filter((r) => r.estado_envio === "pendiente").length,
      errores: base.filter((r) => r.estado_envio === "error").length,
      pos,
      neg,
      sin,
    };
  }, [base]);

  const dona = (["positiva", "negativa", "sin_respuesta", "pendiente", "error"] as EstadoVisible[])
    .map((e) => ({ name: ESTADOS[e].label, value: base.filter((r) => estadoVisible(r) === e).length, color: ESTADOS[e].color }))
    .filter((d) => d.value > 0);

  const porDia = useMemo(() => {
    const m = new Map<string, { dia: string; Enviados: number; Respondidos: number }>();
    const key = (iso: string) => iso.slice(0, 10);
    for (const r of base) {
      if (r.enviado_at) {
        const d = key(r.enviado_at);
        m.set(d, m.get(d) ?? { dia: d, Enviados: 0, Respondidos: 0 });
        m.get(d)!.Enviados++;
      }
      if (r.respondido_at) {
        const d = key(r.respondido_at);
        m.set(d, m.get(d) ?? { dia: d, Enviados: 0, Respondidos: 0 });
        m.get(d)!.Respondidos++;
      }
    }
    return [...m.values()].sort((a, b) => a.dia.localeCompare(b.dia)).map((x) => ({ ...x, dia: fecha(x.dia).slice(0, 5) }));
  }, [base]);

  const porTipo = useMemo(() => {
    const m = new Map<string, { tipo: string; Positiva: number; Negativa: number; "Sin respuesta": number }>();
    for (const r of base) {
      if (r.estado_envio !== "enviado") continue;
      const t = r.tipo || "Sin tipo";
      m.set(t, m.get(t) ?? { tipo: t, Positiva: 0, Negativa: 0, "Sin respuesta": 0 });
      const o = m.get(t)!;
      if (r.respuesta === "positiva") o.Positiva++;
      else if (r.respuesta === "negativa") o.Negativa++;
      else o["Sin respuesta"]++;
    }
    return [...m.values()];
  }, [base]);

  const tipos = [...new Set(reclamos.map((r) => r.tipo).filter(Boolean))].sort();
  const barrios = [...new Set(reclamos.map((r) => r.barrio).filter(Boolean))].sort();

  const filtrados = base.filter((r) => {
    if (fEstado && estadoVisible(r) !== fEstado) return false;
    if (fTipo && r.tipo !== fTipo) return false;
    if (fBarrio && r.barrio !== fBarrio) return false;
    if (q) {
      const s = q.toLowerCase();
      return [r.nombre, r.telefono, r.numero_reclamo, r.direccion, r.descripcion].some((v) => v?.toLowerCase().includes(s));
    }
    return true;
  });

  const selActual = sel ? reclamos.find((r) => r.id === sel.id) ?? sel : null;
  const msgsSel = selActual ? mensajes.filter((m) => m.reclamo_id === selActual.id) : [];

  return (
    <>
      <PageHeader
        title="Monitoreo"
        subtitle="Estado de los envíos del bot y respuestas de los vecinos."
        actions={
          <>
            <select className="input w-auto py-1.5" value={fLote} onChange={(e) => setFLote(e.target.value)}>
              <option value="">Todas las cargas</option>
              {lotes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre_archivo}
                </option>
              ))}
            </select>
            <button className="btn-ghost" onClick={recargar} title="Actualizar">
              <RefreshCw size={16} className={cargando ? "animate-spin" : ""} />
            </button>
          </>
        }
      />
      <div className="space-y-6 p-4 md:p-8">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Kpi label="Reclamos cargados" valor={k.total} sub={`${k.pendientes} pendientes · ${k.errores} con error`} icon={Inbox} color="#475569" />
          <Kpi label="Mensajes enviados" valor={k.enviados} sub={`${pct(k.enviados, k.total)} del total`} icon={Send} color="#0f766e" />
          <Kpi label="Sin respuesta" valor={k.sin} sub={`${pct(k.sin, k.enviados)} de enviados`} icon={Clock} color={ESTADOS.sin_respuesta.color} />
          <Kpi label="Respuestas positivas" valor={k.pos} sub={`${pct(k.pos, k.pos + k.neg)} de las respuestas`} icon={ThumbsUp} color={ESTADOS.positiva.color} />
          <Kpi label="Respuestas negativas" valor={k.neg} sub={`${pct(k.neg, k.pos + k.neg)} de las respuestas`} icon={ThumbsDown} color={ESTADOS.negativa.color} />
        </div>

        {/* Gráficos */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card p-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Distribución por estado</h3>
            <div className="h-60">
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
            </div>
          </div>
          <div className="card p-5 lg:col-span-2">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Actividad por día</h3>
            <div className="h-60">
              <ResponsiveContainer>
                <BarChart data={porDia} barGap={2}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="dia" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={28} />
                  <Tooltip cursor={{ fill: "#f1f5f9" }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Enviados" fill="#0f766e" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="Respondidos" fill="#5eead4" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card p-5 lg:col-span-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Respuestas por tipo de reclamo</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={porTipo} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis type="category" dataKey="tipo" tickLine={false} axisLine={false} fontSize={12} width={150} />
                  <Tooltip cursor={{ fill: "#f1f5f9" }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Positiva" stackId="a" fill={ESTADOS.positiva.color} maxBarSize={22} />
                  <Bar dataKey="Negativa" stackId="a" fill={ESTADOS.negativa.color} maxBarSize={22} />
                  <Bar dataKey="Sin respuesta" stackId="a" fill={ESTADOS.sin_respuesta.color} radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Tabla de reclamos */}
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
            <h3 className="mr-auto text-sm font-semibold text-slate-900">Reclamos ({filtrados.length})</h3>
            <div className="relative">
              <Search size={15} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
              <input className="input w-56 py-1.5 pl-8" placeholder="Buscar nombre, tel, N°…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="input w-auto py-1.5" value={fEstado} onChange={(e) => setFEstado(e.target.value as EstadoVisible | "")}>
              <option value="">Todos los estados</option>
              {(Object.keys(ESTADOS) as EstadoVisible[]).map((e) => (
                <option key={e} value={e}>
                  {ESTADOS[e].label}
                </option>
              ))}
            </select>
            <select className="input w-auto py-1.5" value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
              <option value="">Todos los tipos</option>
              {tipos.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select className="input w-auto py-1.5" value={fBarrio} onChange={(e) => setFBarrio(e.target.value)}>
              <option value="">Todos los barrios</option>
              {barrios.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <button className="btn-ghost py-1.5" onClick={() => exportarCSV(filtrados)}>
              <Download size={15} /> Exportar
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2">N°</th>
                  <th className="px-4 py-2">Vecino</th>
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2">Barrio</th>
                  <th className="px-4 py-2">Enviado</th>
                  <th className="px-4 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.map((r) => (
                  <tr key={r.id} onClick={() => setSel(r)} className={`cursor-pointer hover:bg-slate-50 ${selActual?.id === r.id ? "bg-brand-50/60" : ""}`}>
                    <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap text-slate-500">{r.numero_reclamo}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium whitespace-nowrap text-slate-900">{r.nombre}</div>
                      <div className="text-xs text-slate-500">{r.telefono}</div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.tipo || "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.barrio || "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">{fechaHora(r.enviado_at)}</td>
                    <td className="px-4 py-2.5">
                      <EstadoBadge estado={estadoVisible(r)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtrados.length && <Vacio>No hay reclamos que coincidan con los filtros.</Vacio>}
          </div>
        </div>
      </div>

      {/* Panel de detalle */}
      {selActual && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={() => setSel(null)}>
          <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 border-b border-slate-200 p-5">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs text-slate-500">{selActual.numero_reclamo}</div>
                <h2 className="text-lg font-semibold text-slate-900">{selActual.nombre}</h2>
                <div className="mt-1">
                  <EstadoBadge estado={estadoVisible(selActual)} />
                </div>
              </div>
              <button className="text-slate-400 hover:text-slate-700" onClick={() => setSel(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-5 text-sm">
              <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2">
                <dt className="text-slate-500">Teléfono</dt>
                <dd className="flex items-center gap-1.5">
                  <Phone size={13} className="text-slate-400" /> {selActual.telefono}
                </dd>
                <dt className="text-slate-500">Dirección</dt>
                <dd className="flex items-center gap-1.5">
                  <MapPin size={13} className="text-slate-400" /> {selActual.direccion || "—"}
                </dd>
                <dt className="text-slate-500">Barrio</dt>
                <dd>{selActual.barrio || "—"}</dd>
                <dt className="text-slate-500">Tipo</dt>
                <dd>{selActual.tipo || "—"}</dd>
                <dt className="text-slate-500">Fecha reclamo</dt>
                <dd>{fecha(selActual.fecha_reclamo)}</dd>
                <dt className="text-slate-500">Enviado</dt>
                <dd>{fechaHora(selActual.enviado_at)}</dd>
                <dt className="text-slate-500">Respondido</dt>
                <dd>{fechaHora(selActual.respondido_at)}</dd>
              </dl>
              {selActual.descripcion && (
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-500 uppercase">Descripción</div>
                  <p className="rounded-lg bg-slate-50 p-3 text-slate-700">{selActual.descripcion}</p>
                </div>
              )}
              {selActual.estado_envio === "enviado" && (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-slate-500 uppercase">Clasificar respuesta</div>
                  <div className="flex gap-2">
                    {(["positiva", "negativa", "sin_respuesta"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={async () => {
                          await actualizarRespuesta(selActual.id, v);
                          await recargar();
                        }}
                        className={`btn flex-1 border py-1.5 text-xs ${
                          selActual.respuesta === v ? ESTADOS[v].clase + " border-transparent" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {ESTADOS[v].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="mb-2 text-xs font-medium text-slate-500 uppercase">Últimos mensajes</div>
                <div className="space-y-2">
                  {msgsSel.slice(-4).map((m) => (
                    <div key={m.id} className={`flex ${m.direccion === "saliente" ? "justify-end" : ""}`}>
                      <div className={`max-w-[85%] rounded-xl px-3 py-2 ${m.direccion === "saliente" ? "bg-brand-50 text-slate-800" : "bg-slate-100"}`}>
                        <div>{m.contenido}</div>
                        <div className="mt-0.5 text-right text-[10px] text-slate-400">{hora(m.created_at)}</div>
                      </div>
                    </div>
                  ))}
                  {!msgsSel.length && <div className="text-slate-400">Sin mensajes todavía.</div>}
                </div>
              </div>
            </div>
            <div className="border-t border-slate-200 p-4">
              <Link to={`/conversaciones/${selActual.id}`} className="btn-primary w-full">
                <MessageCircle size={16} /> Abrir conversación
              </Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
