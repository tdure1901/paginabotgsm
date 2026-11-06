# Reclamos Bot · Panel municipal

Panel web para gestionar el bot de seguimiento de reclamos municipales (n8n + WhatsApp).

Tiene 3 secciones:

| Sección | Ruta | Qué hace |
|---|---|---|
| **Carga de datos** | `/carga` | Subir Excel/CSV, detección automática de columnas, vista previa con validación (nombre + teléfono), importación a la base y disparo opcional del bot. Historial de cargas con botón para enviar pendientes. |
| **Monitoreo** | `/monitoreo` | KPIs (cargados, enviados, sin respuesta, positivas, negativas), gráficos por estado, por día y por tipo de reclamo. Tabla filtrable (estado, tipo, barrio, carga, búsqueda), exportar CSV y panel de detalle de cada reclamo. |
| **Conversaciones** | `/conversaciones` | CRM tipo WhatsApp: lista de chats con no leídos y filtros, hilo de mensajes (bot / operador / vecino), envío de mensajes manuales, respuestas rápidas y clasificación manual del resultado. |

## Correr local

```bash
npm install
cp .env.example .env   # opcional: completar Supabase y webhooks
npm run dev
```

Sin variables de entorno funciona en **modo demo** (datos de ejemplo guardados en el navegador).

## Conectar con Supabase

1. Ejecutar `supabase/schema.sql` en el SQL Editor.
2. Completar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en `.env`.

Si ya tenés tablas creadas en Lovable con otros nombres de columnas, ajustá `src/lib/types.ts` y las consultas en `src/lib/api.ts`.

## Integración con n8n

El panel llama a dos webhooks (POST JSON):

- `VITE_N8N_WEBHOOK_LOTE` → `{ lote_id, cantidad? }`
  El flujo debe leer los reclamos `pendiente` de ese lote, enviar el WhatsApp y por cada uno:
  - `update reclamos set estado_envio='enviado', enviado_at=now()` (o `'error'`)
  - `insert into mensajes (reclamo_id, direccion, origen, contenido) values (..., 'saliente', 'bot', '<texto>')`
- `VITE_N8N_WEBHOOK_MENSAJE` → `{ reclamo_id, telefono, nombre, mensaje }`
  Solo debe enviar el WhatsApp; el panel ya guarda el mensaje en la tabla `mensajes`.

Cuando el vecino responde, el flujo de n8n que recibe el WhatsApp debe:
1. Buscar el reclamo por `telefono`.
2. `insert into mensajes (..., direccion='entrante', origen='vecino', contenido, leido=false)`.
3. Clasificar (SÍ/NO o con IA) y `update reclamos set respuesta='positiva'|'negativa', respondido_at=now()`.

Gracias a Supabase Realtime el panel se actualiza solo.

## Stack

React 19 + Vite + TypeScript + Tailwind CSS 4, Recharts, SheetJS/PapaParse, Supabase JS.
