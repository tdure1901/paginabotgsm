import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Bot, FileText, Loader2, MapPin, Phone, Search, SendHorizontal, UserRound } from "lucide-react";
import { Avatar, EstadoBadge, Vacio } from "../components/ui";
import Composer from "../components/Composer";
import { useDatos } from "../lib/useDatos";
import { useFicha } from "../lib/useFicha";
import { ESTADOS, estadoReclamo, fechaHora, hora, nombreLindo, telefonoLindo, v, type EstadoVisible } from "../lib/format";
import { CHAT_MANUAL_HABILITADO } from "../lib/api";
import { cargarConversaciones, LIMITE_CONVERSACIONES, type FiltroConv } from "../lib/consultas";
import type { Conversacion } from "../lib/types";

type Filtro = FiltroConv | "no_leidas";
const FILTROS: { k: Filtro; label: string }[] = [
  { k: "todas", label: "Todas" },
  { k: "no_leidas", label: "No leídas" },
  { k: "sin_contestar", label: "Sin contestar" },
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

/** Texto corto del último mensaje para la lista */
function vistaPrevia(c: Conversacion) {
  const pre = c.ultima_direccion === "saliente" ? (c.ultimo_origen === "bot" ? "🤖 " : "Vos: ") : "";
  return pre + (c.ultimo_contenido ?? "");
}

export default function ConversacionesPage() {
  const { reclamoId } = useParams();
  const navigate = useNavigate();
  const { recientes, conversacionesDisponible, noLeido, verConversacion, versionChat, refrescarChats } = useDatos();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [lista, setLista] = useState<Conversacion[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [errorLista, setErrorLista] = useState("");
  const finRef = useRef<HTMLDivElement>(null);

  // Espera a que se termine de escribir antes de buscar en la base
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  // Sin filtros se usa la lista que ya está cargada; con filtros o búsqueda se consulta la base (máx. 100)
  const consultaServidor = (filtro !== "todas" && filtro !== "no_leidas") || !!qDebounced.trim();
  useEffect(() => {
    if (!consultaServidor) {
      setLista(null);
      return;
    }
    let vigente = true;
    setBuscando(true);
    cargarConversaciones(filtro as FiltroConv, qDebounced)
      .then((r) => vigente && (setLista(r.lista), setErrorLista("")))
      .catch((e) => vigente && setErrorLista(e instanceof Error ? e.message : String(e)))
      .finally(() => vigente && setBuscando(false));
    return () => {
      vigente = false;
    };
  }, [consultaServidor, filtro, qDebounced, versionChat]);

  const conversaciones = useMemo(() => {
    const base = lista ?? recientes;
    return filtro === "no_leidas" ? base.filter(noLeido) : base;
  }, [lista, recientes, filtro, noLeido]);

  const ficha = useFicha(reclamoId);
  const activo = ficha.reclamo;
  const hilo = ficha.hilo;
  const estActivo: EstadoVisible | null = activo ? estadoReclamo(activo, ficha.ultimaNotif) : null;

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [reclamoId, hilo.length]);

  // Marca como leído al abrir (o cuando llega algo nuevo mientras está abierto)
  useEffect(() => {
    if (reclamoId && ficha.ultimaEntrada) verConversacion(reclamoId);
  }, [reclamoId, ficha.ultimaEntrada, verConversacion]);

  return (
    <div className="flex h-[calc(100vh-108px)] md:h-screen">
      <section className={`w-full flex-col border-r border-slate-200 bg-white md:flex md:w-80 lg:w-96 ${reclamoId ? "hidden" : "flex"}`}>
        <div className="space-y-3 border-b border-slate-200 p-4">
          <h1 className="text-lg font-semibold text-slate-900">Conversaciones</h1>
          <div className="relative">
            {buscando ? (
              <Loader2 size={15} className="absolute top-1/2 left-2.5 -translate-y-1/2 animate-spin text-slate-400" />
            ) : (
              <Search size={15} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
            )}
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
        {!conversacionesDisponible && (
          <div className="m-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle size={15} className="shrink-0" /> Falta crear la vista de conversaciones: ejecutá <code>supabase/conversaciones.sql</code> en Supabase.
          </div>
        )}
        {errorLista && <div className="m-3 text-xs text-rose-600">{errorLista}</div>}
        <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {conversaciones.map((c) => {
            const nl = noLeido(c);
            const est: EstadoVisible = c.categoria ?? "otro";
            return (
              <li key={c.reclamo_id}>
                <button
                  onClick={() => navigate(`/conversaciones/${c.reclamo_id}`)}
                  className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${c.reclamo_id === reclamoId ? "bg-brand-50" : ""}`}
                >
                  <Avatar nombre={nombreLindo(c.solicitante)} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className={`flex-1 truncate text-sm ${nl ? "font-semibold text-slate-900" : "font-medium text-slate-800"}`}>{nombreLindo(c.solicitante)}</span>
                      <span className="shrink-0 text-[11px] text-slate-400">{fechaHora(c.ultima_fecha)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`flex-1 truncate text-xs ${nl ? "text-slate-700" : "text-slate-500"}`}>{vistaPrevia(c)}</span>
                      {nl && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600" title="No leído" />}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ESTADOS[est].color }} />
                      <span className="truncate text-[11px] text-slate-400">
                        {c.numero_reclamo} · {c.submotivo ?? "—"}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
          {!conversaciones.length && <Vacio>{q || filtro !== "todas" ? "No hay conversaciones que coincidan." : "No hay conversaciones."}</Vacio>}
        </ul>
        {conversaciones.length >= LIMITE_CONVERSACIONES && (
          <div className="border-t border-slate-200 px-4 py-2 text-center text-[11px] text-slate-500">
            Se muestran los {LIMITE_CONVERSACIONES} chats más recientes. Usá el buscador o los filtros para encontrar otros.
          </div>
        )}
      </section>

      {reclamoId && !activo ? (
        <section className="grid flex-1 place-items-center bg-slate-100 text-slate-400">
          {ficha.error ? <span className="text-sm text-rose-600">{ficha.error}</span> : <Loader2 className="animate-spin" />}
        </section>
      ) : activo ? (
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
                          {op ? m.enviadoPor ?? "Operador" : "Bot"}
                          {m.tipo === "plantilla" && (
                            <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-black/10 px-1 normal-case">
                              <FileText size={10} /> plantilla
                            </span>
                          )}
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

          <Composer
            reclamo={activo}
            ultimaEntrada={ficha.ultimaEntrada}
            bloqueo={
              !activo.telefono_valido
                ? "Este reclamo no tiene un teléfono válido para WhatsApp."
                : !ficha.chatDisponible
                  ? "Para escribir desde el panel falta crear la tabla whatsapp_mensajes en Supabase (ver supabase/chat.sql)."
                  : !CHAT_MANUAL_HABILITADO
                    ? "Para escribir desde el panel falta configurar el webhook de n8n (VITE_N8N_WEBHOOK_MENSAJE)."
                    : null
            }
            onEnviado={async () => {
              refrescarChats();
              verConversacion(activo.id);
            }}
          />
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
