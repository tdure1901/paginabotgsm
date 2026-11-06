# Manual del Panel de Reclamos Bot

Panel para seguir el bot de WhatsApp que consulta a los vecinos si su reclamo quedó resuelto.
Este manual explica **cómo usarlo**, **cómo agregar motivos y plantillas** y qué cuidados tener.

---

## Índice

1. [Cómo funciona todo junto](#1-cómo-funciona-todo-junto)
2. [Uso diario del panel](#2-uso-diario-del-panel)
   - [Ingresar](#21-ingresar)
   - [Importación de reclamos](#22-importación-de-reclamos)
   - [Monitoreo](#23-monitoreo)
   - [Conversaciones](#24-conversaciones)
   - [Teléfonos](#25-teléfonos)
3. [Reglas de elegibilidad](#3-reglas-de-elegibilidad)
4. [Cómo agregar o quitar un motivo](#4-cómo-agregar-o-quitar-un-motivo)
5. [Cómo agregar una plantilla de WhatsApp](#5-cómo-agregar-una-plantilla-de-whatsapp)
6. [Otros cambios frecuentes](#6-otros-cambios-frecuentes)
7. [Trabajo con el código](#7-trabajo-con-el-código)
8. [Recomendaciones y advertencias](#8-recomendaciones-y-advertencias)
9. [Solución de problemas](#9-solución-de-problemas)
10. [Dónde está cada cosa](#10-dónde-está-cada-cosa)

---

## 1. Cómo funciona todo junto

```
 Sistema de reclamos ──(.xls)──► PANEL: Importación ──► Supabase (tabla reclamos)
                                                              │
                                     vista reclamos_para_notificar (reglas de elegibilidad)
                                                              │
                     n8n "Bot Reclamos" (cada 2 días, 11 hs) ─┘──► WhatsApp: plantilla aviso_reclamo
                                                                            │
                                         el vecino responde Sí / No / otra cosa
                                                                            │
                     n8n "Respuestas-bot" ◄─────────────────────────────────┘
                       · clasifica SÍ / NO (whatsapp_notificaciones)
                       · guarda el mensaje (whatsapp_mensajes)
                       · responde automáticamente
                                                              │
                     PANEL: Monitoreo y Conversaciones ◄──────┘  (se actualiza en tiempo real)
                                                              │
                     PANEL: el operador escribe ──► n8n "Mensajes del panel" ──► WhatsApp
```

| Pieza | Qué hace |
|---|---|
| **Panel** (esta app) | Importa reclamos, calcula quién es elegible, muestra el monitoreo y permite chatear. |
| **Supabase** | Base de datos y usuarios. Tablas: `reclamos`, `whatsapp_notificaciones`, `whatsapp_mensajes`, `whatsapp_exclusiones`. |
| **n8n** | Manda y recibe los WhatsApp. Es el **único** que escribe en `whatsapp_mensajes`. |
| **Meta (WhatsApp Cloud API)** | El número oficial y las plantillas aprobadas. |

---

## 2. Uso diario del panel

### 2.1 Ingresar

Se entra con el email y la contraseña de Supabase (los mismos que en la app vieja de Lovable).
Los usuarios se crean en Supabase → **Authentication → Users → Add user**.

> ⚠️ Cualquier usuario que pueda entrar puede importar, cambiar teléfonos, excluir números y escribirles a los vecinos. Creá usuarios solo para el personal que corresponde.

### 2.2 Importación de reclamos

**Menú: Carga de datos**

1. Exportá el listado desde el sistema de reclamos (el `.xls` de siempre). También acepta `.xlsx` o `.csv` con las mismas columnas.
2. Arrastralo a la pantalla o hacé clic para elegirlo.
3. Revisá el resumen:

| Indicador | Qué significa |
|---|---|
| **Válidas** | Filas sin ningún problema. |
| **Con advertencias** | Se importan, pero tienen algo para mirar (teléfono inválido, fecha rara, teléfono repetido, número en la lista de no elegibles…). |
| **Rechazadas** | No tienen Nro. de reclamo: **no se importan**. |
| **Tel. válidos / inválidos** | Si el teléfono se pudo convertir a formato WhatsApp (`549…`). |
| **Elegibles WhatsApp** | Reclamos a los que el bot les va a mandar el aviso (ver [reglas](#3-reglas-de-elegibilidad)). |
| **No elegibles (lista)** | Reclamos cuyo teléfono está en la lista de no elegibles. |
| **Nro. duplicados** | El mismo Nro. de reclamo aparece más de una vez en el archivo: se importa una sola vez (la última). |

4. **Teléfonos a revisar** (recuadro amarillo): son reclamos que **se podrían avisar pero tienen el teléfono mal cargado**.
   - Escribí el número correcto y tocá **Guardar**. El borde se pone verde cuando es válido.
   - Si aparece un botón con varita mágica (por ejemplo **¿+54 9 11 3455-4433?**), es una **sugerencia**: tocala para completar el campo y después **Guardar**.
   - Con **Ver todos los inválidos** aparecen también los que igual no se iban a avisar.
5. En la tabla podés:
   - Filtrar con las pastillas (Válidos, Con advertencias, Rechazados, Teléfono inválido, Elegibles, No elegibles).
   - Corregir un teléfono tocando el lápiz ✏️.
   - Marcar filas y **Quitar del archivo** (no se importan).
   - Tocar 🚫 para **agregar ese teléfono a la lista de no elegibles** (por ejemplo, si el que cargó el reclamo es un director).
6. Tocá **Importar N reclamos**.

**Qué pasa al importar**

- Si el Nro. de reclamo **no existe**, se crea.
- Si **ya existe**, se **actualiza** con los datos del archivo (estado, situación, textos, etc.).
- **Excepción:** si el archivo trae un teléfono inválido y en la base ese reclamo ya tenía un teléfono corregido, **se conserva el corregido**.
- Importar **no manda mensajes**. Los manda n8n en su próxima corrida (cada 2 días a las 11 hs).

> 💡 Podés importar el mismo archivo varias veces sin problema: no duplica reclamos.

### 2.3 Monitoreo

**Menú: Monitoreo**

**Período:** arriba a la derecha elegís qué reclamos se analizan, según su **fecha de ingreso**: últimos 30 días, 3 meses (por defecto), 6 meses, último año o todo. El panel recuerda la elección.

> 💡 Mientras más corto el período, más rápido carga. Usá **Todo** solo cuando lo necesites: con muchos reclamos tarda más y consume más datos de Supabase.

**Indicadores**

| Indicador | Qué cuenta |
|---|---|
| Reclamos del período | Reclamos ingresados en el período elegido. |
| Elegibles para WhatsApp | Reclamos que cumplen las reglas. |
| Enviados | Reclamos con al menos un aviso enviado. Debajo: elegibles todavía sin enviar. |
| Tasa de respuesta | Respondieron ÷ enviados. |
| Enviados sin responder aún | El vecino todavía no contestó. |
| Respondieron SÍ / NO | Según la clasificación del bot. |
| Sin respuesta del vecino | Estado "sin respuesta". |

**Gráficos:** estado de los enviados, actividad por día (últimos 30 días con movimiento) y respuestas por submotivo (top 10).

**Tabla:**
- Arriba a la izquierda elegís **Enviados**, **Elegibles** o **Todos los reclamos**.
- Buscador por Nro., solicitante, teléfono, calle o respuesta, y filtros por estado, submotivo y localidad.
- **CSV** exporta lo que estás viendo (se abre con Excel).
- Tocando una fila se abre la **ficha del reclamo**: datos completos, los textos, los últimos mensajes y los botones **No avisar** (agrega el número a la lista de no elegibles) y **Abrir conversación**.

**Estados que vas a ver**

| Estado | Significado |
|---|---|
| Respondió SÍ / NO | El vecino contestó. |
| Enviado, sin responder aún | Esperando respuesta. |
| Sin respuesta del vecino | Se dio por cerrado sin respuesta. |
| Respondió (otro) | Contestó algo que no es Sí/No. |
| Error de envío | Meta rechazó el mensaje (número sin WhatsApp, plantilla con problemas…). Se reintenta hasta 3 veces. |
| Elegible, no enviado | Cumple las reglas pero el bot todavía no corrió. |
| No elegible | No cumple alguna regla. |

### 2.4 Conversaciones

**Menú: Conversaciones**

- A la izquierda están los **100 chats más recientes**, del más nuevo al más viejo. El punto verde indica mensajes **no leídos**.
- Para encontrar un chat más viejo, usá el **buscador** (nombre, teléfono o Nro. de reclamo) o los filtros: la búsqueda se hace en toda la base, no solo en los 100 que se ven.
- Filtros: Todas, No leídas, **Sin contestar** (el último mensaje es del vecino), Respondió NO, Respondió SÍ, Otra respuesta, Esperando.
- También podés abrir cualquier chat desde Monitoreo → ficha del reclamo → **Abrir conversación**.
- En el chat:
  - 🤖 **Bot** (verde claro): mensajes automáticos.
  - 👤 **Operador** (verde oscuro): mensajes escritos desde el panel, con el email de quien los mandó.
  - Blanco: lo que escribió el vecino.
  - La etiqueta **plantilla** indica que se mandó una plantilla aprobada.
- A la derecha, la ficha del reclamo.

**La regla de las 24 horas (importante)**

WhatsApp solo permite mandar **texto libre** dentro de las **24 hs desde el último mensaje del vecino**. Fuera de ese plazo solo se puede mandar una **plantilla aprobada por Meta**.

| Situación | Qué muestra el panel |
|---|---|
| El vecino escribió hace menos de 24 hs | 🟢 "Chat abierto · se cierra en X h". Podés escribir libremente o usar una plantilla. |
| Pasaron más de 24 hs, o el vecino nunca respondió | 🟡 Aviso amarillo. **Solo** se puede mandar una plantilla. |

Para **reabrir** un chat:
1. Elegí la plantilla (por ejemplo **Retomar la conversación**).
2. Revisá los campos (vienen completos con los datos del reclamo) y la **vista previa**.
3. **Enviar plantilla**.
4. Cuando el vecino conteste, el chat se reabre por 24 hs y ya podés escribir normal.

**Respuestas rápidas:** el botón ⚡ al lado del cuadro de texto tiene frases frecuentes.

**Cómo se comporta el bot**

- Mientras la notificación está en estado *enviado*, el bot interpreta Sí / No (texto o botón) y responde automáticamente.
- Si el vecino escribe otra cosa en esa etapa, el bot le contesta que responda Sí o No.
- **Después de que el vecino respondió, el bot no contesta más**: los mensajes nuevos quedan en el panel como no leídos para que los atienda una persona.

> ⚠️ "Leído / no leído" se guarda **en cada navegador**. Si dos personas atienden, cada una ve sus propios no leídos.

### 2.5 Teléfonos

**Menú: Teléfonos** (el número naranja indica cuántos hay para corregir)

**Pestaña Teléfonos inválidos**
Reclamos ya cargados que cumplen todas las reglas **menos el teléfono**, y que todavía no se avisaron (o el envío falló). Al guardar un teléfono válido, el reclamo vuelve a la cola del bot.

**Pestaña No elegibles**
Lista de números a los que **nunca** se les manda el aviso (directores, empleados municipales, números de prueba).
- **Agregar:** escribí el teléfono y un motivo. Debajo te muestra a quién pertenece en los reclamos cargados. Al agregarlo, todos sus reclamos pasan a no elegibles.
- **Quitar:** sus reclamos que cumplan las reglas vuelven a la cola del bot.

> 💡 Usá siempre el campo **Motivo** ("Director de Alumbrado", "Prueba"…). En unos meses nadie se va a acordar por qué está ese número.

---

## 3. Reglas de elegibilidad

Un reclamo recibe el aviso por WhatsApp **solo si cumple todo esto**:

| Regla | Dónde se controla |
|---|---|
| Estado = `Cerrado` (sin importar mayúsculas, espacios ni puntos) | Panel y vista |
| Situación = `Resp.Positiva` (también vale `Resp. Positiva`, `RESP.POSITIVA`…) | Panel y vista |
| Motivo = `ALUMBRADO PUBLICO`, `ARBOL` o `LIMPIEZA Y RECOLECCION DOMICILIARIA` (sin importar mayúsculas, acentos ni espacios de más) | Panel y vista |
| Teléfono válido | Panel (al importar o corregir) y vista |
| Teléfono fuera de la lista de no elegibles | Panel y vista |
| No tiene un aviso ya enviado o respondido (solo se reintentan los `pendiente` / `error`) | Vista |
| Menos de 3 intentos con error | Vista |

- El **panel** calcula la columna `whatsapp_eligible` al importar, al corregir un teléfono y al tocar la lista de no elegibles.
- La **vista** `reclamos_para_notificar` (archivo `supabase/vista_reclamos_para_notificar.sql`) es lo que lee n8n. Vuelve a chequear todo como red de seguridad.

**Teléfono válido** quiere decir que se puede llevar al formato `549` + característica + número (10 dígitos en total después del `549`). El panel:
- acepta `+54`, `0054`, `0`, el `9` y el `15` (lo saca);
- rechaza letras, números con todos los dígitos iguales y longitudes incorrectas;
- sugiere correcciones para casos típicos de AMBA (falta el `11`, falta un `1`, `15` en lugar de `11`). **Las sugerencias asumen característica 11**: para números del interior hay que corregir a mano.

---

## 4. Cómo agregar o quitar un motivo

Los motivos están en **dos lugares** que tienen que coincidir. Si cambiás uno solo, el panel y el bot van a decir cosas distintas.

### Paso 1: ver cómo viene escrito el motivo

En Supabase → SQL Editor:

```sql
select motivo, count(*) from reclamos group by 1 order by 2 desc;
```

### Paso 2: actualizar la vista (lo que usa n8n)

Abrí `supabase/vista_reclamos_para_notificar.sql`, agregá el motivo a la lista **en MAYÚSCULAS y SIN acentos**:

```sql
in ('ALUMBRADO PUBLICO', 'ARBOL', 'LIMPIEZA Y RECOLECCION DOMICILIARIA', 'NUEVO MOTIVO')
```

y ejecutá **el archivo completo** en el SQL Editor.

### Paso 3: actualizar el panel

En `src/lib/importacion.ts`:

```ts
export const MOTIVOS_ELEGIBLES = ["ALUMBRADO PUBLICO", "ARBOL", "LIMPIEZA Y RECOLECCION DOMICILIARIA", "NUEVO MOTIVO"];
```

Subí el cambio (ver [Trabajo con el código](#7-trabajo-con-el-código)) y publicá la nueva versión del panel.

### Paso 4: recalcular los reclamos que ya están cargados

`whatsapp_eligible` se calcula al importar, así que los reclamos viejos no se enteran del cambio. Ejecutá:

```sql
-- Marca como elegibles los del motivo nuevo que cumplen las demás reglas
update reclamos r set whatsapp_eligible = true
where translate(upper(regexp_replace(trim(r.motivo), '\s+', ' ', 'g')), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUAEIOUU') = 'NUEVO MOTIVO'
  and r.estado = 'Cerrado'
  and r.situacion = 'Resp.Positiva'
  and r.telefono_valido = true
  and not exists (select 1 from whatsapp_exclusiones e where e.telefono = r.telefono_normalizado);
```

Para **quitar** un motivo, sacalo de los dos lugares y ejecutá:

```sql
update reclamos set whatsapp_eligible = false
where translate(upper(regexp_replace(trim(motivo), '\s+', ' ', 'g')), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUAEIOUU') = 'MOTIVO QUE SE SACA';
```

> ⚠️ **Antes de agregar un motivo, pensá cuántos vecinos se van a avisar en la próxima corrida.** Con la consulta del paso 1 lo ves. Si son cientos o miles, mirá el [límite de mensajes de Meta](#8-recomendaciones-y-advertencias).

---

## 5. Cómo agregar una plantilla de WhatsApp

Las plantillas se usan para **iniciar** o **reabrir** conversaciones (fuera de la ventana de 24 hs). Tienen que estar **aprobadas por Meta** antes de usarlas.

### Paso 1: crearla en Meta

1. Entrá a **WhatsApp Manager** (business.facebook.com → WhatsApp Manager) → **Plantillas de mensajes** → **Crear plantilla**.
2. **Categoría:** **Utilidad** (seguimiento de un trámite del vecino). No uses *Marketing*: es más cara y Meta la restringe más.
3. **Nombre:** en minúsculas, sin espacios ni acentos, con guiones bajos. Ej: `seguimiento_reclamo`.
4. **Idioma:** Español (Argentina) → `es_AR`.
5. **Cuerpo:** el texto con variables `{{1}}`, `{{2}}`… Ejemplo:
   > Hola {{1}}, te escribimos desde la Municipalidad de General San Martín por tu reclamo N° {{2}}. ¿Podemos seguir la conversación por acá?
6. Completá los ejemplos de cada variable y enviala a revisión. Suele tardar de minutos a 24 hs.

**Consejos para que la aprueben:**
- Que quede claro quién escribe y por qué (nombre de la Municipalidad, nro. de reclamo).
- No empezar ni terminar el texto con una variable.
- No poner variables pegadas (`{{1}} {{2}}`).
- Evitar lenguaje promocional ("¡aprovechá!", "gratis", etc.).

### Paso 2: agregarla al panel

Abrí `src/lib/plantillas.ts` y sumá un bloque a `PLANTILLAS`:

```ts
{
  nombre: "seguimiento_reclamo",          // EXACTO como en Meta
  idioma: "es_AR",                        // EXACTO como en Meta
  titulo: "Seguimiento del reclamo",      // lo que ve el operador en la lista
  parametros: [                           // uno por cada {{n}}, en orden
    { label: "Nombre", valor: (r) => nombreLindo(r.solicitante) },
    { label: "Nro. de reclamo", valor: (r) => r.numero_reclamo },
  ],
  texto: ([nombre, nro]) =>               // el MISMO texto que en Meta, con las variables
    `Hola ${nombre}, te escribimos desde la Municipalidad de General San Martín por tu reclamo N° ${nro}. ¿Podemos seguir la conversación por acá?`,
},
```

- `parametros[].valor` es lo que se completa solo; el operador lo puede editar antes de enviar.
- Datos disponibles del reclamo: `r.solicitante`, `r.numero_reclamo`, `r.motivo`, `r.submotivo`, `r.calle`, `r.numero_domicilio`, `r.localidad`, `r.fecha_ingreso`, `r.texto_reclamo`, `r.texto_respuesta`.
- `texto` es solo para la vista previa y para lo que queda guardado en el chat. Si no coincide con Meta, el vecino recibe el texto de Meta pero en el panel vas a ver otro.
- La **primera** plantilla de la lista es la que aparece seleccionada por defecto.

Subí el cambio y publicá el panel.

### Paso 3: probarla

Mandala a un reclamo de prueba con tu propio número (ver [Probar sin molestar a los vecinos](#probar-sin-molestar-a-los-vecinos)).

> ⚠️ Si la plantilla tiene **botones** o **encabezado con imagen**, el workflow `Mensajes del panel` hoy solo arma el cuerpo con texto. Hay que adaptar el nodo **Armar mensaje** de n8n.

### Si cambiás la plantilla del aviso inicial (`aviso_reclamo`)

Esa la manda n8n, no el panel. Hay que tocar el workflow **Bot Reclamos**:
- nodo **Envia_mensaje**: nombre de plantilla y parámetros;
- nodo **Guarda_mensaje_bot**: el campo `contenido` (texto que se guarda en el chat);
- y, si se reenvía desde el panel, la entrada `aviso_reclamo` de `src/lib/plantillas.ts`.

---

## 6. Otros cambios frecuentes

| Quiero cambiar… | Dónde |
|---|---|
| Las **respuestas rápidas** (⚡) | `src/components/Composer.tsx`, lista `RESPUESTAS_RAPIDAS`. Solo sirven dentro de las 24 hs. |
| Las **respuestas automáticas** del bot (gracias / lamentamos / respondé Sí o No) | n8n → **Respuestas-bot** → nodos `HTTP Request1`, `HTTP Request2`, `HTTP Request` **y** los nodos `Guardar bot …` que están al lado (tienen que tener el mismo texto). |
| **Cada cuánto** corre el bot | n8n → **Bot Reclamos** → nodo `Schedule Trigger` (hoy: cada 2 días a las 11 hs). |
| La **cantidad de reintentos** por error | `supabase/vista_reclamos_para_notificar.sql`, el `< 3` del final. |
| Las **palabras** que cuentan como Sí / No | n8n → **Respuestas-bot** → nodo `Switch`. |
| Las **sugerencias** de teléfono | `src/lib/importacion.ts`, función `sugerirTelefono`. |

---

## 7. Trabajo con el código

### Ramas

- `main` es la versión estable. **No se trabaja directo sobre `main`.**
- Cada cambio va en una rama nueva (`tomas/agrego-motivo-bacheo`) y entra a `main` con un **pull request**.

```bash
git fetch origin
git checkout -b tomas/mi-cambio origin/main
# … cambios …
git add -A
git commit -m "Agrego motivo BACHEO"
git push -u origin tomas/mi-cambio
```

Después abrís el pull request en GitHub y lo mergeás.

### Correr el panel en tu compu

```bash
npm install
cp .env.example .env    # completar
npm run dev
```

Sin `.env` arranca en **modo demo** con datos de ejemplo guardados en el navegador. Es útil para probar cambios visuales sin tocar la base real.

### Variables de entorno

| Variable | Qué es | ¿Es secreta? |
|---|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase | No |
| `VITE_SUPABASE_ANON_KEY` | Clave pública (anon) de Supabase | No, está pensada para el navegador. La protección la dan el login y las reglas RLS. |
| `VITE_N8N_WEBHOOK_MENSAJE` | URL de producción del webhook `panel-mensaje` | No, pero no la publiques: n8n igual exige que el usuario esté logueado. |

> 🚫 **Nunca** pongas en el panel la `service_role` key de Supabase ni el token de WhatsApp. Todo lo que empieza con `VITE_` queda visible para cualquiera que abra la página.

### Publicar (Cloudflare Pages)

El panel está publicado en **Cloudflare Pages**, conectado al repo de GitHub: **cada merge a `main` se publica solo**.

Configuración del proyecto (por si hay que crearlo de nuevo: Workers & Pages → Create → Pages → Connect to Git):

| Campo | Valor |
|---|---|
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Variables | `NODE_VERSION` = `22`, y las tres `VITE_…` |

- Para cambiar una variable: proyecto → **Settings → Variables and Secrets**. Después hay que **volver a publicar** (Deployments → ⋯ → *Retry deployment*), porque se aplican al compilar.
- Las otras ramas generan una URL de prueba (`rama.<proyecto>.pages.dev`). Piden login igual, pero no compartas esas URLs.
- No hace falta configurar rutas: si no hay un `404.html`, Cloudflare Pages devuelve `index.html` para cualquier ruta.
- En n8n, el nodo **Panel** del workflow *Mensajes del panel* tiene que tener en *Allowed Origins* la URL del panel (ej. `https://panel-reclamos.pages.dev`).

Si algún día se usa otro hosting: `npm run build` genera la carpeta `dist/`. Hay que configurar que todas las rutas devuelvan `index.html`. En Vercel ya está resuelto con el `vercel.json` del repo.

---

## 8. Recomendaciones y advertencias

### Seguridad

- 🔑 **El token de WhatsApp va solo en la credencial de n8n** (`WhatsApp Cloud API`). Nunca escrito en un nodo ni en un archivo. Si alguna vez quedó expuesto, regeneralo en Meta y revocá el anterior.
- 🔑 La credencial de Supabase en n8n usa la **service_role** key, que salta todas las reglas de seguridad. Solo n8n la tiene.
- 👤 Desactivá el registro libre en Supabase → **Authentication → Providers → Email → Allow new users to sign up** (apagado). Los usuarios se crean a mano.
- 👤 Cuando alguien deja de trabajar en el área, borrá o bloqueá su usuario.

### WhatsApp y Meta

- 📈 **Calidad del número:** si muchos vecinos bloquean o reportan el número, Meta baja la calificación y puede limitarlo. Mandá solo a quien corresponde (para eso están las reglas y la lista de no elegibles) y con textos claros.
- 🚦 **Límite de mensajes:** los números nuevos tienen un tope de conversaciones iniciadas por día que sube a medida que se usa bien. Si importás un archivo enorme con un motivo nuevo, el bot puede chocar con ese límite y los envíos van a dar error (se reintentan hasta 3 veces). Mirá el límite actual en WhatsApp Manager.
- 💲 **Costos:** Meta cobra los mensajes de plantilla según la categoría. Los de **Utilidad** son más baratos que los de Marketing. Revisá la tabla de precios vigente de Meta.
- ⏰ **La ventana de 24 hs la controla Meta**, no el panel. El panel solo te avisa; si igual se intenta mandar texto libre fuera de plazo, Meta lo rechaza y el panel muestra el error.

### Datos

- 🔁 **Motivos en dos lugares:** vista y `MOTIVOS_ELEGIBLES`. Siempre cambialos juntos.
- 🔁 **Plantillas en dos lugares:** Meta y `src/lib/plantillas.ts`. Nombre, idioma y cantidad de variables tienen que coincidir exacto.
- 📝 Al reimportar se **pisan** los campos del reclamo con lo que trae el archivo (salvo un teléfono corregido). Si se corrigió algo a mano en la base, que no sea el teléfono, se pierde al reimportar.
- 📱 Un mismo teléfono en varios reclamos genera una advertencia "Teléfono repetido". El vecino puede recibir más de un aviso (uno por reclamo). Si es un empleado municipal, mandalo a la lista de no elegibles.
- 🧩 Si un envío se corta a la mitad, la notificación puede quedar en estado `enviando` y ese reclamo no se reintenta. Para revisarlos:
  ```sql
  select * from whatsapp_notificaciones where estado = 'enviando' and created_at < now() - interval '1 day';
  ```

### Probar sin molestar a los vecinos

- **Nunca ejecutes "Bot Reclamos" a mano sin un filtro**: le manda a todos los pendientes.
- Para probar, creá un reclamo con tu número y Nro. `PRUEBA-…`:
  ```sql
  insert into reclamos (numero_reclamo, solicitante, motivo, submotivo, estado, situacion,
    calle, numero_domicilio, telefono_original, telefono_normalizado, telefono_valido, whatsapp_eligible)
  values ('PRUEBA-001', 'PRUEBA', 'ALUMBRADO PUBLICO', 'Luminaria apagada', 'Cerrado', 'Resp.Positiva',
    'MITRE', '123', '1112345678', '5491112345678', true, true);
  ```
  y en el nodo `Consigue_fila` agregá temporalmente el filtro `numero_reclamo = PRUEBA-001`. **Sacalo al terminar.**
- Al terminar, borrá los datos de prueba. Si `whatsapp_notificaciones` no se borra sola junto con el reclamo, borrá esas filas antes:
  ```sql
  delete from reclamos where numero_reclamo like 'PRUEBA-%';
  ```

---

## 9. Solución de problemas

| Problema | Causa probable | Qué hacer |
|---|---|---|
| "No se pudo reconocer el formato del archivo" | El archivo no tiene la columna **Nro. Reclamo** | Exportarlo de nuevo del sistema, sin modificarlo. |
| Reclamos que deberían ser elegibles dan "No" | Algún dato viene distinto a lo esperado | En la importación, la columna **WhatsApp** muestra debajo del "No" el motivo (estado, situación, motivo o teléfono). |
| Al enviar desde el chat: "Failed to fetch" | El workflow **Mensajes del panel** está apagado, o falta CORS | Activarlo. En el nodo `Panel`, *Allowed Origins* = `*` (o el dominio del panel). Usar la URL de **producción**, no la `/webhook-test/`. |
| "No autorizado. Volvé a iniciar sesión" | Sesión vencida o anon key mal pegada en n8n | Cerrar sesión y volver a entrar; revisar el nodo **Verificar usuario**. |
| "Pasaron más de 24 hs…" | Ventana cerrada | Mandar una plantilla. |
| "La plantilla no existe o no está aprobada" | Nombre/idioma distinto o todavía en revisión | Comparar con WhatsApp Manager. |
| El vecino respondió pero no aparece | El workflow **Respuestas-bot** está apagado, o la notificación no tiene `telefono_destino` | Revisar **Executions** en n8n. |
| Mensajes que no aparecen en el chat pero sí llegaron | La credencial de Supabase en n8n no es la service_role | Cambiarla. |
| n8n: "Could not find the 'x' column of '…' in the schema cache" | Falta esa columna, o Supabase no refrescó las columnas | Volver a ejecutar el `.sql` correspondiente (se puede correr varias veces). Termina con `notify pgrst, 'reload schema';`, que refresca las columnas. |
| Conversaciones dice "Falta crear la vista de conversaciones" | No se ejecutó el SQL | Ejecutar `supabase/conversaciones.sql`. |
| La pantalla dice "Falta crear la tabla…" | No se ejecutó el SQL | Ejecutar `supabase/chat.sql` o `supabase/exclusiones.sql`. |
| El deploy de Cloudflare falla al compilar | Versión de Node vieja | Variable `NODE_VERSION` = `22`. |
| Al recargar una página del panel da 404 | Falta la regla de rutas del hosting | Ver [Publicar](#publicar-cloudflare-pages). |

Para cualquier error de n8n: **Executions** → abrir la ejecución en rojo → el nodo que falló muestra el detalle.

---

## 10. Dónde está cada cosa

| Archivo / lugar | Contenido |
|---|---|
| `src/lib/importacion.ts` | Lectura del .xls, normalización de teléfonos, **motivos elegibles**, reglas de elegibilidad, sugerencias. |
| `src/lib/plantillas.ts` | **Plantillas** que se pueden mandar desde el panel. |
| `src/components/Composer.tsx` | Cuadro de envío del chat, ventana de 24 hs, **respuestas rápidas**. |
| `src/lib/api.ts` | Conexión con Supabase y n8n. |
| `src/pages/` | Una pantalla por sección. |
| `supabase/chat.sql` | Tabla `whatsapp_mensajes` y vista `ultima_notificacion_por_telefono`. |
| `supabase/conversaciones.sql` | Vista `conversaciones` (un chat por fila, para la lista de los 100 más recientes) e índices. |
| `src/lib/consultas.ts` | Todas las lecturas de la base: período de Monitoreo, límite de chats, consultas puntuales. |
| `supabase/exclusiones.sql` | Tabla `whatsapp_exclusiones` (no elegibles). |
| `supabase/vista_reclamos_para_notificar.sql` | **Vista con las reglas** que lee n8n. |
| `n8n/*.json` | Los 3 workflows (sin credenciales). Si los modificás en n8n, exportalos y actualizá estos archivos para tener copia. |
