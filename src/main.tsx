import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import "./index.css";
import Layout from "./components/Layout";
import Login from "./components/Login";
import { DatosProvider } from "./lib/useDatos";
import { MODO_DEMO, escucharSesion, obtenerSesion } from "./lib/api";
import CargaPage from "./pages/CargaPage";
import MonitoreoPage from "./pages/MonitoreoPage";
import ConversacionesPage from "./pages/ConversacionesPage";
import TelefonosPage from "./pages/TelefonosPage";

function App() {
  const [listo, setListo] = useState(MODO_DEMO);
  const [sesion, setSesion] = useState<Session | null>(null);

  useEffect(() => {
    if (MODO_DEMO) return;
    obtenerSesion().then((s) => {
      setSesion(s);
      setListo(true);
    });
    return escucharSesion(setSesion);
  }, []);

  if (!listo) return null;
  if (!MODO_DEMO && !sesion) return <Login />;

  return (
    <DatosProvider>
      <Routes>
        <Route element={<Layout email={sesion?.user.email} />}>
          <Route index element={<Navigate to="/monitoreo" replace />} />
          <Route path="/carga" element={<CargaPage />} />
          <Route path="/monitoreo" element={<MonitoreoPage />} />
          <Route path="/telefonos" element={<TelefonosPage />} />
          <Route path="/conversaciones" element={<ConversacionesPage />} />
          <Route path="/conversaciones/:reclamoId" element={<ConversacionesPage />} />
          <Route path="*" element={<Navigate to="/monitoreo" replace />} />
        </Route>
      </Routes>
    </DatosProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
