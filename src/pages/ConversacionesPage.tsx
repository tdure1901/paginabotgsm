import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bot, Info, Loader2, MapPin, Phone, Search, SendHorizontal, UserRound, Zap } from "lucide-react";
import { Avatar, EstadoBadge, Vacio } from "../components/ui";
import { useDatos } from "../lib/useDatos";
import { ESTADOS, estadoReclamo, fechaHora, hora, nombreLindo, telefonoLindo, v, type EstadoVisible } from "../lib/format";
import { CHAT_MANUAL_HABILITADO, enviarMensaje } from "../lib/api";

const RESPUESTAS_RAPIDAS = [
  "Hola! Te escribimos de la Municipalidad para hacer seguimiento de tu reclamo.",
  "Gracias por avisarnos. Ya derivamos tu caso al área correspondiente.",
  "Una cuadrilla va a pasar en los próximos días.",
  "¿Nos podrías mandar una foto del problema?",
  "¡Gracias por tu respuesta! Que tengas un buen día.",
];

type Filtro = "todas" | "no_leidas" | EstadoVisible;
const FILTROS: { k: Filtro; label: string }[] = [
  { k: "todas", label: "Todas" },
  { k: "no_leidas", label: "No leídas" },
  { k: "no", label: "Respondió NO" },
  { k: "si", label: "Respondió SÍ" },
  { k: "respondido_otro", label: "Otra respuesta" },
  { k: "pendiente", label: "Esperando" },
];

function diaSeparador(iso: string) {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return "Hoy";
  if (d.toDateString() === new Date(Date.now() - 864e5).toDateString()) return "Ayer";
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}

export default function ConversacionesPage() {
  const { reclamoId } = useParams();
  const navigate = useNavigate();
  const { reclamos, hilos, ultimaNotif, noLeidos, verConversacion, recargar, chatDisponible } = useDatos();
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [rapidas, setRapidas] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  const conversaciones = useMemo(
    () =>
      reclamos
        .filter((r) => hilos.has(r.id) || r.id === reclamoId)
        .map((r) => {
          const h = hilos.get(r.id) ?? [];
          return { r, ultimo: h[h.length - 1], nl: noLeidos(r.id), est: estadoReclamo(r, ultimaNotif.get(r.id)) };
        })
        .filter(({ r, nl, est }) => {
          if (filtro === "no_leidas" && !nl) return false;
          if (filtro !== "todas" && filtro !== "no_leidas" && est !== filtro) return false;
          if (q) {
            const s = q.toLowerCase();
            return [r.solicitante, r.telefono_normalizado, r.numero_reclamo].some((x) => x?.toLowerCase().includes(s));
          }
          return true;
        })
        .sort((a, b) => (b.ultimo?.fecha ?? "").localeCompare(a.ultimo?.fecha ?? "")),
    [reclamos, hilos, ultimaNotif, noLeidos, filtro, q, reclamoId],
  );

  const activo = reclamos.find((r) => r.id === reclamoId) ?? null;
  const hilo = activo ? hilos.get(activo.id) ?? [] : [];
  const estActivo = activo ? estadoReclamo(activo, ultimaNotif.get(activo.id)) : null;

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [reclamoId, hilo.length]);

  useEffect(() => {
    if (activo && noLeidos(activo.id) > 0) verConversacion(activo.id);
  }, [activo, noLeidos, verConversacion]);

  async function enviar() {
    if (!activo || !texto.trim()) return;
    setEnviando(true);
    setError("");
    try {
      await enviarMensaje(activo, texto.trim());
      setTexto("");
      await recargar();
      verConversacion(activo.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  const puedeEscribir = CHAT_MANUAL_HABILITADO && chatDisponible && !!activo?.telefono_valido;

  return (
    <div className="flex h-[calc(100vh-108px)] md:h-screen">
      <section className={`w-full flex-col border-r border-slate-200 bg-white md:flex md:w-80 lg:w-96 ${activo ? "hidden" : "flex"}`}>
        <div className="space-y-3 border-b border-slate-200 p-4">
          <h1 className="text-lg font-semibold text-slate-900">Conversaciones</h1>
          <div className="relative">
            <Search size={15} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
            <input className="input pl-8" placeholder="Buscar solicitante, teléfono o Nro." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTROS.map((f) => (
              <button
                key={f.k}
                onClick={() => setFiltro(f.k)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition ${filtro === f.k ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {conversaciones.map(({ r, ultimo, nl, est }) => (
            <li key={r.id}>
              <button onClick={() => navigate(`/conversaciones/${r.id}`)} className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${r.id === reclamoId ? "bg-brand-50" : ""}`}>
                <Avatar nombre={nombreLindo(r.solicitante)} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={`flex-1 truncate text-sm ${nl ? "font-semibold text-slate-900" : "font-medium text-slate-800"}`}>{nombreLindo(r.solicitante)}</span>
                    {ultimo && <span className="shrink-0 text-[11px] text-slate-400">{fechaHora(ultimo.fecha)}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`flex-1 truncate text-xs ${nl ? "text-slate-700" : "text-slate-500"}`}>
                      {ultimo ? (ultimo.direccion === "saliente" ? (ultimo.origen === "bot" ? "🤖 " : "Vos: ") : "") + ultimo.contenido : "Sin mensajes"}
                    </span>
                    {nl > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">{nl}</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ESTADOS[est].color }} />
                    <span className="truncate text-[11px] text-slate-400">
                      {r.numero_reclamo} · {r.submotivo ?? "—"}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          ))}
          {!conversaciones.length && <Vacio>No hay conversaciones.</Vacio>}
        </ul>
      </section>

      {activo ? (
        <section className="flex min-w-0 flex-1 flex-col bg-slate-100">
          <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
            <button className="text-slate-500 md:hidden" onClick={() => navigate("/conversaciones")}>
              <ArrowLeft size={20} />
            </button>
            <Avatar nombre={nombreLindo(activo.solicitante)} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-slate-900">{nombreLindo(activo.solicitante)}</div>
              <div className="text-xs text-slate-500">
                {telefonoLindo(activo.telefono_normalizado)} · Reclamo {activo.numero_reclamo}
              </div>
            </div>
            {estActivo && <EstadoBadge estado={estActivo} />}
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8">
            {hilo.map((m, i) => {
              const sale = m.direccion === "saliente";
              const nuevoDia = i === 0 || new Date(hilo[i - 1].fecha).toDateString() !== new Date(m.fecha).toDateString();
              const op = sale && m.origen === "operador";
              return (
                <div key={m.id}>
                  {nuevoDia && (
                    <div className="my-3 text-center">
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500 capitalize shadow-sm">{diaSeparador(m.fecha)}</span>
                    </div>
                  )}
                  <div className={`mb-2 flex ${sale ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm md:max-w-[65%] ${
                        sale ? (op ? "rounded-br-sm bg-brand-700 text-white" : "rounded-br-sm bg-brand-100 text-slate-800") : "rounded-bl-sm bg-white text-slate-800"
                      } ${m.tipo === "notificacion" ? "italic" : ""}`}
                    >
                      {sale && (
                        <div className={`mb-0.5 flex items-center gap-1 text-[10px] font-semibold not-italic uppercase ${op ? "text-brand-100" : "text-brand-700"}`}>
                          {op ? <UserRound size={11} /> : <Bot size={11} />}
                          {op ? "Operador" : "Bot"}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap">{m.contenido}</div>
                      <div className={`mt-0.5 text-right text-[10px] not-italic ${op ? "text-brand-100" : "text-slate-400"}`}>{hora(m.fecha)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            {!hilo.length && <Vacio>Todavía no hay mensajes con este vecino.</Vacio>}
            <div ref={finRef} />
          </div>

          <footer className="border-t border-slate-200 bg-white p-3">
            {!puedeEscribir ? (
              <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                <Info size={15} className="mt-0.5 shrink-0 text-slate-400" />
                {!activo.telefono_valido
                  ? "Este reclamo no tiene un teléfono válido para WhatsApp."
                  : !chatDisponible
                    ? "Para escribir desde el panel falta crear la tabla whatsapp_mensajes en Supabase (ver supabase/chat.sql)."
                    : "Para escribir desde el panel falta configurar el webhook de n8n (VITE_N8N_WEBHOOK_MENSAJE)."}
              </div>
            ) : (
              <>
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
              </>
            )}
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

      {activo && (
        <aside className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-white p-5 text-sm xl:flex">
          <div className="text-center">
            <div className="flex justify-center">
              <Avatar nombre={nombreLindo(activo.solicitante)} size={56} />
            </div>
            <div className="mt-2 font-semibold text-slate-900">{nombreLindo(activo.solicitante)}</div>
            <div className="font-mono text-xs text-slate-500">{activo.numero_reclamo}</div>
          </div>
          <div className="space-y-2 rounded-lg bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <Phone size={14} className="shrink-0 text-slate-400" /> {telefonoLindo(activo.telefono_normalizado)}
            </div>
            <div className="flex items-start gap-2">
              <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
              <span>
                {[activo.calle, activo.numero_domicilio].filter(Boolean).join(" ") || "—"}
                {activo.localidad && <span className="text-slate-400"> · {activo.localidad}</span>}
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase">Reclamo</div>
            <div className="mt-1 font-medium">
              {v(activo.motivo)} · {v(activo.submotivo)}
            </div>
            <p className="mt-1 line-clamp-6 text-slate-600">{v(activo.texto_reclamo)}</p>
            <div className="mt-1 text-xs text-slate-400">Ingreso: {fechaHora(activo.fecha_ingreso)}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase">Estado en el sistema</div>
            <div className="mt-1">
              {v(activo.estado)} · {v(activo.situacion)}
            </div>
            {activo.texto_respuesta && <p className="mt-1 line-clamp-4 text-slate-600">{activo.texto_respuesta}</p>}
          </div>
        </aside>
      )}
    </div>
  );
}
