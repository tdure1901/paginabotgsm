-- Tabla NUEVA para el chat de la sección Conversaciones.
-- Las tablas `reclamos` y `whatsapp_notificaciones` ya existen (las creó Lovable) y no se tocan.
-- Ejecutar en Supabase > SQL Editor.

create table if not exists public.whatsapp_mensajes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reclamo_id uuid not null references public.reclamos(id) on delete cascade,
  direccion text not null check (direccion in ('saliente', 'entrante')),
  origen text not null check (origen in ('bot', 'operador', 'vecino')),
  contenido text not null
);
-- Si reclamos.id no es uuid (por ejemplo bigint), cambiar el tipo de reclamo_id para que coincida.

create index if not exists whatsapp_mensajes_reclamo_idx on public.whatsapp_mensajes (reclamo_id, created_at);

alter table public.whatsapp_mensajes enable row level security;

-- Solo usuarios logueados (igual que el resto del panel)
create policy "usuarios autenticados leen" on public.whatsapp_mensajes
  for select to authenticated using (true);
create policy "usuarios autenticados escriben" on public.whatsapp_mensajes
  for insert to authenticated with check (true);
-- n8n debería usar la service_role key, que no pasa por RLS.

-- Actualización en tiempo real del panel
alter publication supabase_realtime add table public.whatsapp_mensajes;
alter publication supabase_realtime add table public.whatsapp_notificaciones;
alter publication supabase_realtime add table public.reclamos;
