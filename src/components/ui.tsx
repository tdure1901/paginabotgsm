import type { ReactNode } from "react";
import { ESTADOS, type EstadoVisible } from "../lib/format";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 bg-white px-4 py-5 md:px-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EstadoBadge({ estado }: { estado: EstadoVisible }) {
  const e = ESTADOS[estado];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${e.clase}`}>{e.label}</span>;
}

export function Avatar({ nombre, size = 36 }: { nombre: string; size?: number }) {
  const ini = nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full bg-brand-100 font-semibold text-brand-700"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {ini}
    </div>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="p-10 text-center text-sm text-slate-500">{children}</div>;
}
