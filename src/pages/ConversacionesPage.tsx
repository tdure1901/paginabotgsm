import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bot, Loader2, MapPin, Phone, Search, SendHorizontal, UserRound, Zap } from "lucide-react";
import { Avatar, EstadoBadge, Vacio } from "../components/ui";
import { useDatos } from "../lib/useDatos";
import { estadoVisible, fecha, fechaHora, hora, ESTADOS, type EstadoVisible } from "../lib/format";
import { actualizarRespuesta, enviarMensaje, marcarLeidos } from "../lib/api";
import type { Mensaje } from "../lib/types";

const RESPUESTAS_RAPIDAS = [
  "Hola! Te escribimos de la Municipalidad para hacer seguimiento de tu reclamo.",
  "Gracias por avisarnos. Ya derivamos tu caso al área correspondiente.",
  "Una cuadrilla va a pasar en las próximas 48 hs.",
  "¿Nos podrías mandar una foto del problema?",
  "¡Gracias por tu respuesta! Que tengas un buen día.",
];

type Filtro = "todas" | "no_leidas" | EstadoVisible;

function diaSeparador(iso: string) {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(Date.now() - 864e5);
  if (d.toDateString() === hoy.toDateString()) return "Hoy";
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}

export default function ConversacionesPage() {
  const { reclamoId } = useParams();
  const navigate = useNavigate();
  const { reclamos, mensajes, recargar } = useDatos();
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [rapidas, setRapidas] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  // Agrupa mensajes por reclamo
  const porReclamo = useMemo(() => {
    const m = new Map<string, Mensaje[]>();
    for (const msg of mensajes) {
      if (!m.has(msg.reclamo_id)) m.set(msg.reclamo_id, []);
      m.get(msg.reclamo_id)!.push(msg);
    }
    return m;
  }, [mensajes]);

  const conversaciones = useMemo(() => {
    return reclamos
      .map((r) => {
        const ms = porReclamo.get(r.id) ?? [];
        const ultimo = ms[ms.length - 1];
        const noLeidos = ms.filter((x) => x.direccion === "entrante" && !x.leido).length;
        return { r, ultimo, noLeidos };
      })
      .filter(({ r, ultimo, noLeidos }) => {
        if (!ultimo && r.id !== reclamoId) return false;
        if (filtro === "no_leidas" && !noLeidos) return false;
        if (filtro !== "todas" && filtro !== "no_leidas" && estadoVisible(r) !== filtro) return false;
        if (q) {
          const s = q.toLowerCase();
          return [r.nombre, r.telefono, r.numero_reclamo].some((v) => v.toLowerCase().includes(s));
        }
        return true;
      })
      .sort((a, b) => (b.ultimo?.created_at ?? b.r.created_at).localeCompare(a.ultimo?.created_at ?? a.r.created_at));
  }, [reclamos, porReclamo, filtro, q, reclamoId]);

  const activo = reclamos.find((r) => r.id === reclamoId) ?? null;
  const hilo = activo ? porReclamo.get(activo.id) ?? [] : [];

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [reclamoId, hilo.length]);

  useEffect(() => {
    if (activo && hilo.some((m) => m.direccion === "entrante" && !m.leido)) {
      marcarLeidos(activo.id).then(recargar);
    }
  }, [activo, hilo, recargar]);

  async function enviar() {
    if (!activo || !texto.trim()) return;
    setEnviando(true);
    setError("");
    try {
      await enviarMensaje(activo, texto.trim());
      setTexto("");
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  const FILTROS: { k: Filtro; label: string }[] = [
    { k: "todas", label: "Todas" },
    { k: "no_leidas", label: "No leídas" },
    { k: "negativa", label: "Negativas" },
    { k: "positiva", label: "Positivas" },
    { k: "sin_respuesta", label: "Sin respuesta" },
  ];

  return (
    <div className="flex h-[calc(100vh-108px)] md:h-screen">
      {/* Lista de conversaciones */}
      <section className={`flex w-full flex-col border-r border-slate-200 bg-white md:w-80 lg:w-96 ${activo ? "hidden md:flex" : "flex"}`}>
        <div className="space-y-3 border-b border-slate-200 p-4">
          <h1 className="text-lg font-semibold text-slate-900">Conversaciones</h1>
          <div className="relative">
            <Search size={15} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
            <input className="input pl-8" placeholder="Buscar vecino, teléfono o N°" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {FILTROS.map((f) => (
              <button
                key={f.k}
                onClick={() => setFiltro(f.k)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition ${
                  filtro === f.k ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {conversaciones.map(({ r, ultimo, noLeidos }) => (
            <li key={r.id}>
              <button
                onClick={() => navigate(`/conversaciones/${r.id}`)}
                className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${r.id === reclamoId ? "bg-brand-50" : ""}`}
              >
                <Avatar nombre={r.nombre} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={`flex-1 truncate text-sm ${noLeidos ? "font-semibold text-slate-900" : "font-medium text-slate-800"}`}>{r.nombre}</span>
                    {ultimo && <span className="shrink-0 text-[11px] text-slate-400">{fechaHora(ultimo.created_at)}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`flex-1 truncate text-xs ${noLeidos ? "text-slate-700" : "text-slate-500"}`}>
                      {ultimo ? (ultimo.direccion === "saliente" ? (ultimo.origen === "bot" ? "🤖 " : "Vos: ") : "") + ultimo.contenido : "Sin mensajes"}
                    </span>
                    {noLeidos > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">{noLeidos}</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: ESTADOS[estadoVisible(r)].color }} />
                    <span className="truncate text-[11px] text-slate-400">
                      {r.numero_reclamo} · {r.tipo || "Sin tipo"}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          ))}
          {!conversaciones.length && <Vacio>No hay conversaciones.</Vacio>}
        </ul>
      </section>

      {/* Chat */}
      {activo ? (
        <section className="flex min-w-0 flex-1 flex-col bg-slate-100">
          <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
            <button className="text-slate-500 md:hidden" onClick={() => navigate("/conversaciones")}>
              <ArrowLeft size={20} />
            </button>
            <Avatar nombre={activo.nombre} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-slate-900">{activo.nombre}</div>
              <div className="text-xs text-slate-500">{activo.telefono}</div>
            </div>
            <EstadoBadge estado={estadoVisible(activo)} />
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8">
            {hilo.map((m, i) => {
              const sale = m.direccion === "saliente";
              const nuevoDia = i === 0 || new Date(hilo[i - 1].created_at).toDateString() !== new Date(m.created_at).toDateString();
              return (
                <div key={m.id}>
                  {nuevoDia && (
                    <div className="my-3 text-center">
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500 capitalize shadow-sm">{diaSeparador(m.created_at)}</span>
                    </div>
                  )}
                  <div className={`mb-2 flex ${sale ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm md:max-w-[65%] ${
                        sale ? (m.origen === "bot" ? "rounded-br-sm bg-brand-100 text-slate-800" : "rounded-br-sm bg-brand-700 text-white") : "rounded-bl-sm bg-white text-slate-800"
                      }`}
                    >
                      {sale && (
                        <div className={`mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase ${m.origen === "bot" ? "text-brand-700" : "text-brand-100"}`}>
                          {m.origen === "bot" ? <Bot size={11} /> : <UserRound size={11} />}
                          {m.origen === "bot" ? "Bot" : "Operador"}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap">{m.contenido}</div>
                      <div className={`mt-0.5 text-right text-[10px] ${sale && m.origen !== "bot" ? "text-brand-100" : "text-slate-400"}`}>{hora(m.created_at)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            {!hilo.length && <Vacio>Todavía no hay mensajes con este vecino. Escribí el primero abajo.</Vacio>}
            <div ref={finRef} />
          </div>

          <footer className="border-t border-slate-200 bg-white p-3">
            {error && <div className="mb-2 text-xs text-rose-600">No se pudo enviar: {error}</div>}
            {rapidas && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {RESPUESTAS_RAPIDAS.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTexto(t);
                      setRapidas(false);
                    }}
                    className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-brand-500 hover:text-brand-700"
                  >
                    {t.length > 48 ? t.slice(0, 48) + "…" : t}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <button className={`btn-ghost h-10 px-2.5 ${rapidas ? "text-brand-700" : ""}`} onClick={() => setRapidas(!rapidas)} title="Respuestas rápidas">
                <Zap size={18} />
              </button>
              <textarea
                rows={1}
                className="input max-h-32 min-h-10 resize-none"
                placeholder="Escribí un mensaje…"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviar();
                  }
                }}
              />
              <button className="btn-primary h-10 px-3" disabled={!texto.trim() || enviando} onClick={enviar}>
                {enviando ? <Loader2 size={18} className="animate-spin" /> : <SendHorizontal size={18} />}
              </button>
            </div>
          </footer>
        </section>
      ) : (
        <section className="hidden flex-1 place-items-center bg-slate-100 md:grid">
          <div className="text-center text-slate-500">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-white text-brand-600 shadow-sm">
              <SendHorizontal />
            </div>
            Elegí una conversación para ver los mensajes y responder.
          </div>
        </section>
      )}

      {/* Ficha del reclamo */}
      {activo && (
        <aside className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-white p-5 text-sm xl:flex">
          <div className="text-center">
            <div className="flex justify-center">
              <Avatar nombre={activo.nombre} size={56} />
            </div>
            <div className="mt-2 font-semibold text-slate-900">{activo.nombre}</div>
            <div className="font-mono text-xs text-slate-500">{activo.numero_reclamo}</div>
          </div>
          <div className="space-y-2 rounded-lg bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <Phone size={14} className="text-slate-400" /> {activo.telefono}
            </div>
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-slate-400" /> {activo.direccion || "—"}
              {activo.barrio && <span className="text-slate-400">· {activo.barrio}</span>}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase">Reclamo</div>
            <div className="mt-1 font-medium">{activo.tipo || "Sin tipo"}</div>
            <p className="mt-1 text-slate-600">{activo.descripcion || "—"}</p>
            <div className="mt-1 text-xs text-slate-400">Fecha: {fecha(activo.fecha_reclamo)}</div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-500 uppercase">Resultado</div>
            <div className="grid gap-1.5">
              {(["positiva", "negativa", "sin_respuesta"] as const).map((v) => (
                <button
                  key={v}
                  onClick={async () => {
                    await actualizarRespuesta(activo.id, v);
                    await recargar();
                  }}
                  className={`btn justify-start border py-1.5 text-xs ${
                    activo.respuesta === v ? ESTADOS[v].clase + " border-transparent" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: ESTADOS[v].color }} />
                  {ESTADOS[v].label}
                </button>
              ))}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
