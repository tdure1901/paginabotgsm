-- Tabla NUEVA para el chat de la sección Conversaciones + una vista de ayuda para n8n.
-- Las tablas `reclamos` y `whatsapp_notificaciones` ya existen (las creó Lovable) y no se tocan.
-- Ejecutar en Supabase > SQL Editor. Se puede correr más de una vez.

create table if not exists public.whatsapp_mensajes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reclamo_id uuid not null references public.reclamos(id) on delete cascade,
  direccion text not null check (direccion in ('saliente', 'entrante')),
  origen text not null check (origen in ('bot', 'operador', 'vecino')),
  contenido text not null
);
-- Si reclamos.id no es uuid (por ejemplo bigint), cambiar el tipo de reclamo_id para que coincida.

alter table public.whatsapp_mensajes add column if not exists tipo text;            -- 'texto' | 'plantilla' | 'boton' | 'imagen' | ...
alter table public.whatsapp_mensajes add column if not exists enviado_por text;     -- email del operador que lo mandó
alter table public.whatsapp_mensajes add column if not exists wa_message_id text;   -- id de Meta (evita duplicados si Meta reintenta el webhook)
create unique index if not exists whatsapp_mensajes_wa_id_uq on public.whatsapp_mensajes (wa_message_id) where wa_message_id is not null;
create index if not exists whatsapp_mensajes_reclamo_idx on public.whatsapp_mensajes (reclamo_id, created_at);

alter table public.whatsapp_mensajes enable row level security;
drop policy if exists "usuarios autenticados leen" on public.whatsapp_mensajes;
create policy "usuarios autenticados leen" on public.whatsapp_mensajes for select to authenticated using (true);
-- Solo n8n escribe (con la service_role key, que no pasa por RLS). El panel no inserta directamente.

-- Para el workflow de respuestas: la ÚLTIMA notificación enviada a cada teléfono.
-- (El nodo "Buscar notificación" actual no garantiza traer la más reciente.)
create or replace view public.ultima_notificacion_por_telefono as
select distinct on (telefono_destino) *
from public.whatsapp_notificaciones
where telefono_destino is not null
order by telefono_destino, coalesce(notificado_at, created_at) desc;

-- Actualización en tiempo real del panel (ignorar el error si alguna ya estaba agregada)
alter publication supabase_realtime add table public.whatsapp_mensajes;
alter publication supabase_realtime add table public.whatsapp_notificaciones;
alter publication supabase_realtime add table public.reclamos;

-- Que la API de Supabase vea las columnas nuevas (evita "Could not find the 'x' column ... in the schema cache")
notify pgrst, 'reload schema';
