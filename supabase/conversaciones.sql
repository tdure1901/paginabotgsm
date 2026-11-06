-- Vista con UNA fila por conversación (reclamo con actividad de WhatsApp), con su último mensaje.
-- La usa la sección Conversaciones del panel para traer solo los 100 chats más recientes
-- en lugar de descargar todos los mensajes.
-- Requiere chat.sql. Ejecutar en Supabase > SQL Editor. Se puede correr más de una vez.

create or replace view public.conversaciones
with (security_invoker = true)  -- respeta los permisos (RLS) de quien consulta
as
with eventos as (
  -- Mensajes guardados por n8n
  select reclamo_id, created_at as fecha, contenido, direccion, origen
  from public.whatsapp_mensajes
  union all
  -- Avisos anteriores a whatsapp_mensajes
  select reclamo_id, coalesce(notificado_at, created_at), 'Notificación de WhatsApp enviada.', 'saliente', 'bot'
  from public.whatsapp_notificaciones
  union all
  -- Respuestas anteriores a whatsapp_mensajes
  select reclamo_id, coalesce(respondido_at, updated_at, created_at), respuesta_usuario, 'entrante', 'vecino'
  from public.whatsapp_notificaciones
  where respuesta_usuario is not null and trim(respuesta_usuario) <> ''
),
ultimo as (
  select distinct on (reclamo_id) reclamo_id, fecha, contenido, direccion, origen
  from eventos
  order by reclamo_id, fecha desc, (direccion = 'entrante') desc
),
entrada as (
  select reclamo_id, max(fecha) as ultima_entrada
  from eventos where direccion = 'entrante'
  group by reclamo_id
)
select
  r.id as reclamo_id,
  r.numero_reclamo,
  r.solicitante,
  r.telefono_normalizado,
  r.motivo,
  r.submotivo,
  u.fecha as ultima_fecha,
  u.contenido as ultimo_contenido,
  u.direccion as ultima_direccion,
  u.origen as ultimo_origen,
  e.ultima_entrada,
  n.estado as notif_estado,
  n.respuesta_usuario as notif_respuesta,
  -- Misma clasificación que el panel (src/lib/format.ts → categoria)
  case
    when n.reclamo_id is null then null
    when lower(trim(n.respuesta_usuario)) in ('si', 'sí', '1') then 'si'
    when lower(trim(n.respuesta_usuario)) in ('no', '2') then 'no'
    when n.estado ilike '%error%' then 'error'
    when n.estado ilike '%sin%' then 'sin_respuesta'
    when n.estado ~* 'respondi(do|o)[_ ]?(si|sí)$' then 'si'
    when n.estado ~* 'respondi(do|o)[_ ]?no$' then 'no'
    when n.estado ilike 'respondi%' then 'respondido_otro'
    when n.estado ilike 'envia%' then 'pendiente'
    else 'otro'
  end as categoria
from ultimo u
join public.reclamos r on r.id = u.reclamo_id
left join entrada e on e.reclamo_id = u.reclamo_id
left join lateral (
  select wn.reclamo_id, wn.estado, wn.respuesta_usuario
  from public.whatsapp_notificaciones wn
  where wn.reclamo_id = r.id
  order by wn.created_at desc
  limit 1
) n on true;

grant select on public.conversaciones to authenticated;

-- Índices para que las consultas por fecha y por reclamo sean rápidas
create index if not exists whatsapp_notificaciones_reclamo_idx on public.whatsapp_notificaciones (reclamo_id, created_at);
create index if not exists whatsapp_notificaciones_created_idx on public.whatsapp_notificaciones (created_at);
create index if not exists reclamos_fecha_ingreso_idx on public.reclamos (fecha_ingreso);

notify pgrst, 'reload schema';
