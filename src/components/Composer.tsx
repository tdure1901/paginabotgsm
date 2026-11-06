import { useEffect, useMemo, useState } from "react";
import { Clock, FileText, Info, Loader2, SendHorizontal, Zap } from "lucide-react";
import { enviarMensaje, type EnvioChat } from "../lib/api";
import { PLANTILLAS, VENTANA_MS } from "../lib/plantillas";
import type { Reclamo } from "../lib/types";

const RESPUESTAS_RAPIDAS = [
  "Hola! Te escribimos de la Municipalidad para hacer seguimiento de tu reclamo.",
  "Gracias por avisarnos. Ya derivamos tu caso al área correspondiente.",
  "Una cuadrilla va a pasar en los próximos días.",
  "¿Nos podrías mandar una foto del problema?",
  "¡Gracias por tu respuesta! Que tengas un buen día.",
];

function useAhora(ms = 30_000) {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return t;
}

function duracion(ms: number) {
  const h = Math.floor(ms / 36e5);
  const m = Math.floor((ms % 36e5) / 6e4);
  return h ? `${h} h ${m} min` : `${m} min`;
}

interface Props {
  reclamo: Reclamo;
  /** Fecha del último mensaje del vecino, o null si nunca escribió */
  ultimaEntrada: string | null;
  bloqueo: string | null;
  onEnviado: () => void;
}

export default function Composer({ reclamo, ultimaEntrada, bloqueo, onEnviado }: Props) {
  const ahora = useAhora();
  const restante = ultimaEntrada ? new Date(ultimaEntrada).getTime() + VENTANA_MS - ahora : -1;
  const ventanaAbierta = restante > 0;

  const [modo, setModo] = useState<"texto" | "plantilla">("texto");
  const [texto, setTexto] = useState("");
  const [rapidas, setRapidas] = useState(false);
  const [plantilla, setPlantilla] = useState(PLANTILLAS[0].nombre);
  const [params, setParams] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const p = PLANTILLAS.find((x) => x.nombre === plantilla) ?? PLANTILLAS[0];
  const modoEfectivo = ventanaAbierta ? modo : "plantilla";

  // Prellenar parámetros al cambiar de plantilla o de reclamo
  useEffect(() => {
    setParams(p.parametros.map((x) => x.valor(reclamo)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.nombre, reclamo.id]);
  useEffect(() => {
    setError("");
    setTexto("");
  }, [reclamo.id]);

  const vista = useMemo(() => p.texto(params), [p, params]);

  async function enviar() {
    let envio: EnvioChat;
    if (modoEfectivo === "texto") {
      if (!texto.trim()) return;
      envio = { tipo: "texto", mensaje: texto.trim() };
    } else {
      if (params.some((x) => !x.trim())) return setError("Completá todos los campos de la plantilla.");
      envio = { tipo: "plantilla", plantilla: p.nombre, idioma: p.idioma, parametros: params.map((x) => x.trim()), texto: vista };
    }
    setEnviando(true);
    setError("");
    try {
      await enviarMensaje(reclamo, envio);
      setTexto("");
      setModo("texto");
      onEnviado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  if (bloqueo) {
    return (
      <footer className="border-t border-slate-200 bg-white p-3">
        <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <Info size={15} className="mt-0.5 shrink-0 text-slate-400" /> {bloqueo}
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t border-slate-200 bg-white p-3">
      {/* Estado de la ventana de 24 hs */}
      {ventanaAbierta ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-emerald-700">
            <Clock size={13} /> Chat abierto · se cierra en {duracion(restante)}
          </span>
          <button className={`ml-auto rounded-full px-2 py-0.5 ${modo === "plantilla" ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600"}`} onClick={() => setModo(modo === "texto" ? "plantilla" : "texto")}>
            <FileText size={12} className="mr-1 inline" />
            {modo === "plantilla" ? "Volver a texto libre" : "Usar plantilla"}
          </button>
        </div>
      ) : (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          <Clock size={14} className="mt-0.5 shrink-0" />
          <span>
            {ultimaEntrada ? "Pasaron más de 24 hs desde el último mensaje del vecino." : "El vecino todavía no respondió."} WhatsApp solo permite enviar una <b>plantilla aprobada</b>. Cuando el vecino conteste, se reabre el chat por 24 hs.
          </span>
        </div>
      )}

      {error && <div className="mb-2 text-xs text-rose-600">No se pudo enviar: {error}</div>}

      {modoEfectivo === "plantilla" ? (
        <div className="space-y-2">
          <select className="input py-1.5" value={plantilla} onChange={(e) => setPlantilla(e.target.value)}>
            {PLANTILLAS.map((x) => (
              <option key={x.nombre} value={x.nombre}>
                {x.titulo}
              </option>
            ))}
          </select>
          <div className="grid gap-2 sm:grid-cols-2">
            {p.parametros.map((par, i) => (
              <label key={par.label} className="block">
                <span className="mb-0.5 block text-[11px] font-medium text-slate-500">
                  {`{{${i + 1}}}`} {par.label}
                </span>
                <input
                  className="input py-1.5"
                  value={params[i] ?? ""}
                  onChange={(e) => {
                    const n = [...params];
                    n[i] = e.target.value;
                    setParams(n);
                  }}
                />
              </label>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1 rounded-xl bg-brand-50 px-3 py-2 text-sm text-slate-700">
              <div className="mb-0.5 text-[10px] font-semibold text-brand-700 uppercase">Vista previa · {p.nombre}</div>
              {vista}
            </div>
            <button className="btn-primary h-10" disabled={enviando} onClick={enviar}>
              {enviando ? <Loader2 size={18} className="animate-spin" /> : <SendHorizontal size={18} />} Enviar plantilla
            </button>
          </div>
        </div>
      ) : (
        <>
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
  );
}
