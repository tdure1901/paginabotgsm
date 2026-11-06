import { useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { ingresar } from "../lib/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-4">
      <form
        className="card w-full max-w-sm space-y-4 p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setCargando(true);
          setError("");
          try {
            await ingresar(email, pass);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setCargando(false);
          }
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-700 text-white">
            <Bot size={22} />
          </div>
          <div>
            <div className="font-semibold text-slate-900">Reclamos Bot</div>
            <div className="text-xs text-slate-500">Ingresá con tu usuario</div>
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Email</span>
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Contraseña</span>
          <input className="input" type="password" autoComplete="current-password" required value={pass} onChange={(e) => setPass(e.target.value)} />
        </label>
        {error && <div className="text-sm text-rose-600">{error}</div>}
        <button className="btn-primary w-full" disabled={cargando}>
          {cargando && <Loader2 size={16} className="animate-spin" />} Ingresar
        </button>
      </form>
    </div>
  );
}
