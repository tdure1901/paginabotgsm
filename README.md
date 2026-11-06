# Reclamos Bot · Panel municipal

Panel para el bot de seguimiento de reclamos (Supabase + n8n + WhatsApp).
Usa **la misma base de Supabase** que la app de Lovable (`subirreclamosbot.lovable.app`): tablas `reclamos` y `whatsapp_notificaciones`, y el mismo login por email y contraseña.

## Secciones

| Sección | Ruta | Qué hace |
|---|---|---|
| **Importación** | `/carga` | Sube el `.xls` exportado del sistema de reclamos (también `.xlsx`/`.csv` con las mismas columnas). Mismas reglas que Lovable: normaliza teléfonos argentinos a `549…`, valida fechas, marca **elegibles para WhatsApp** (Estado `Cerrado` + Situación `Resp.Positiva` + teléfono válido), avisa teléfonos repetidos y deduplica por Nro. de reclamo. Permite corregir teléfonos y quitar filas antes de importar. Hace *upsert* por `numero_reclamo` en lotes de 500. |
| **Monitoreo** | `/monitoreo` | KPIs (cargados, elegibles, enviados, sin responder aún, SÍ, NO, sin respuesta, tasa de respuesta), gráficos por estado, por día y por submotivo, tabla filtrable con export CSV y ficha completa de cada reclamo. |
| **Teléfonos** | `/telefonos` | *Inválidos*: reclamos cerrados con Resp.Positiva que no se pueden avisar por el teléfono, con corrección y sugerencia automática (ej. `134554433` → `11 3455-4433`). *No elegibles*: lista de números que nunca reciben el aviso (directores, empleados), con motivo. |
| **Conversaciones** | `/conversaciones` | CRM tipo WhatsApp: chats por reclamo con la notificación del bot, la respuesta del vecino y los mensajes manuales. Filtros por resultado y no leídos, respuestas rápidas y envío de mensajes por n8n. |

### Reglas de elegibilidad para WhatsApp

Las mismas que la vista `reclamos_para_notificar`: Estado `Cerrado` + Situación `Resp.Positiva` + teléfono válido + `whatsapp_eligible`, y que no tenga notificación o esté en `pendiente`/`error`. El panel calcula `whatsapp_eligible` al importar y lo pone en `false` si el teléfono está en la lista de no elegibles (`supabase/exclusiones.sql`). Al corregir o excluir un teléfono desde el panel también se actualizan los reclamos ya cargados. Si un archivo nuevo trae mal un teléfono que ya se había corregido, se conserva la corrección.

La clasificación de respuestas es la misma del monitoreo de Lovable: `respuesta_usuario` = `si`/`1` → SÍ, `no`/`2` → NO; si no, se mira `estado` (`sin …` → sin respuesta, `respondido …`, `enviado` → esperando).

## Correr local

```bash
npm install
cp .env.example .env   # completar con la URL y anon key de Supabase del proyecto Lovable
npm run dev
```

Sin `.env` arranca en **modo demo** con datos de ejemplo.

## Chat con el vecino (sección Conversaciones)

Toda la conversación se guarda en la tabla nueva `whatsapp_mensajes`, y **la escribe solo n8n**:

| Workflow (`n8n/`) | Qué guarda |
|---|---|
| `bot-reclamos.json` | El aviso inicial (plantilla `aviso_reclamo`) como mensaje `bot`. |
| `respuestas-bot.json` | **Todo** lo que escribe el vecino (`vecino`) y las respuestas automáticas del bot. Clasifica SÍ/NO solo si la notificación está en estado `enviado`; si el vecino ya respondió, el bot no contesta más y el mensaje queda para el operador en el panel. |
| `mensajes-panel.json` (nuevo) | Mensajes del operador. Verifica que el usuario esté logueado, manda el WhatsApp y **solo si Meta lo acepta** lo guarda (`operador`, con el email de quien lo envió). |

**Ventana de 24 hs:** WhatsApp solo permite texto libre dentro de las 24 hs desde el último mensaje del vecino. Pasado ese tiempo (o si nunca respondió), el panel solo deja enviar una **plantilla aprobada** para reabrir la conversación. Las plantillas disponibles se configuran en `src/lib/plantillas.ts`; `retomar_conversacion` hay que crearla y aprobarla en Meta.

Los reclamos notificados antes de este cambio se siguen viendo: el panel arma su chat con `whatsapp_notificaciones` y evita duplicados cuando ya existe el mensaje real.

### Pasos para activarlo

1. Ejecutar `supabase/chat.sql` (tabla `whatsapp_mensajes` + vista `ultima_notificacion_por_telefono`) y `supabase/exclusiones.sql` (lista de no elegibles; agregar también la condición que indica a la vista `reclamos_para_notificar`).
2. En n8n crear una credencial **Header Auth** llamada `WhatsApp Cloud API` con nombre `Authorization` y valor `Bearer <token>` (token nuevo de Meta).
3. Importar los 3 workflows de `n8n/`, elegir las credenciales en los nodos marcados y desactivar los workflows viejos. En `mensajes-panel.json` pegar la anon key en el nodo *Verificar usuario*.
4. Crear en Meta la plantilla `retomar_conversacion` (categoría *Utilidad*, idioma `es_AR`) con dos variables: `{{1}}` nombre y `{{2}}` nro. de reclamo. El texto tiene que coincidir con el de `src/lib/plantillas.ts`.
5. Poner la URL de producción del webhook `panel-mensaje` en `VITE_N8N_WEBHOOK_MENSAJE`.

## Stack

React 19 + Vite + TypeScript + Tailwind CSS 4, Recharts, SheetJS, Supabase JS.
