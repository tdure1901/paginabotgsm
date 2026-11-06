import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import Layout from "./components/Layout";
import { DatosProvider } from "./lib/useDatos";
import CargaPage from "./pages/CargaPage";
import MonitoreoPage from "./pages/MonitoreoPage";
import ConversacionesPage from "./pages/ConversacionesPage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <DatosProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/monitoreo" replace />} />
            <Route path="/carga" element={<CargaPage />} />
            <Route path="/monitoreo" element={<MonitoreoPage />} />
            <Route path="/conversaciones" element={<ConversacionesPage />} />
            <Route path="/conversaciones/:reclamoId" element={<ConversacionesPage />} />
            <Route path="*" element={<Navigate to="/monitoreo" replace />} />
          </Route>
        </Routes>
      </DatosProvider>
    </BrowserRouter>
  </StrictMode>,
);
