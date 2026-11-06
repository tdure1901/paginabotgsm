# Reclamos Bot · Panel municipal

Panel para el bot de seguimiento de reclamos (Supabase + n8n + WhatsApp).
Usa **la misma base de Supabase** que la app de Lovable (`subirreclamosbot.lovable.app`): tablas `reclamos` y `whatsapp_notificaciones`, y el mismo login por email y contraseña.

## Secciones

| Sección | Ruta | Qué hace |
|---|---|---|
| **Importación** | `/carga` | Sube el `.xls` exportado del sistema de reclamos (también `.xlsx`/`.csv` con las mismas columnas). Mismas reglas que Lovable: normaliza teléfonos argentinos a `549…`, valida fechas, marca **elegibles para WhatsApp** (Estado `Cerrado` + Situación `Resp.Positiva` + teléfono válido), avisa teléfonos repetidos y deduplica por Nro. de reclamo. Permite corregir teléfonos y quitar filas antes de importar. Hace *upsert* por `numero_reclamo` en lotes de 500. |
| **Monitoreo** | `/monitoreo` | KPIs (cargados, elegibles, enviados, sin responder aún, SÍ, NO, sin respuesta, tasa de respuesta), gráficos por estado, por día y por submotivo, tabla filtrable con export CSV y ficha completa de cada reclamo. |
| **Conversaciones** | `/conversaciones` | CRM tipo WhatsApp: chats por reclamo con la notificación del bot, la respuesta del vecino y los mensajes manuales. Filtros por resultado y no leídos, respuestas rápidas y envío de mensajes por n8n. |

La clasificación de respuestas es la misma del monitoreo de Lovable: `respuesta_usuario` = `si`/`1` → SÍ, `no`/`2` → NO; si no, se mira `estado` (`sin …` → sin respuesta, `respondido …`, `enviado` → esperando).

## Correr local

```bash
npm install
cp .env.example .env   # completar con la URL y anon key de Supabase del proyecto Lovable
npm run dev
```

Sin `.env` arranca en **modo demo** con datos de ejemplo.

## Para habilitar el chat (sección Conversaciones)

Importar y monitorear funcionan con las tablas que ya existen. Para **escribirle al vecino desde el panel** hacen falta dos cosas:

1. Ejecutar `supabase/chat.sql` (crea la tabla `whatsapp_mensajes`).
2. Un webhook en n8n (`VITE_N8N_WEBHOOK_MENSAJE`) que reciba `{ reclamo_id, numero_reclamo, telefono, solicitante, mensaje }` y mande el WhatsApp. El panel guarda el mensaje en `whatsapp_mensajes`.

Opcional: para ver en el chat lo que el vecino escribe **después** de su primera respuesta, el flujo de n8n que recibe WhatsApp puede insertar en `whatsapp_mensajes` con `direccion='entrante'`, `origen='vecino'`.

## Stack

React 19 + Vite + TypeScript + Tailwind CSS 4, Recharts, SheetJS, Supabase JS.
