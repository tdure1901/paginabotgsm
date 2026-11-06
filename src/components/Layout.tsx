import { NavLink, Outlet } from "react-router-dom";
import { BarChart3, MessagesSquare, UploadCloud, Bot, FlaskConical } from "lucide-react";
import { MODO_DEMO } from "../lib/api";
import { useDatos } from "../lib/useDatos";

const NAV = [
  { to: "/carga", label: "Carga de datos", icon: UploadCloud },
  { to: "/monitoreo", label: "Monitoreo", icon: BarChart3 },
  { to: "/conversaciones", label: "Conversaciones", icon: MessagesSquare },
];

export default function Layout() {
  const { mensajes } = useDatos();
  const noLeidos = mensajes.filter((m) => m.direccion === "entrante" && !m.leido).length;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-slate-200 bg-white md:sticky md:top-0 md:h-screen md:w-60 md:border-r md:border-b-0">
        <div className="flex items-center gap-2.5 px-5 py-4 md:py-6">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-700 text-white">
            <Bot size={20} />
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-slate-900">Reclamos Bot</div>
            <div className="text-xs text-slate-500">Panel municipal</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`
              }
            >
              <Icon size={18} />
              <span className="flex-1">{label}</span>
              {to === "/conversaciones" && noLeidos > 0 && (
                <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{noLeidos}</span>
              )}
            </NavLink>
          ))}
        </nav>
        {MODO_DEMO && (
          <div className="mx-3 mt-auto mb-4 hidden rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 md:block">
            <div className="mb-1 flex items-center gap-1.5 font-semibold">
              <FlaskConical size={14} /> Modo demo
            </div>
            Datos de ejemplo guardados en este navegador. Configurá Supabase en <code>.env</code> para usar la base real.
          </div>
        )}
      </aside>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
