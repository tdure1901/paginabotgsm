-- Esquema para el panel de reclamos + bot de n8n
-- Ejecutar en Supabase > SQL Editor

create extension if not exists "pgcrypto";

create table if not exists lotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nombre_archivo text not null,
  cantidad int not null default 0
);

create table if not exists reclamos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lote_id uuid references lotes(id) on delete set null,
  numero_reclamo text not null,
  nombre text not null,
  telefono text not null,
  direccion text default '',
  barrio text default '',
  tipo text default '',
  descripcion text default '',
  fecha_reclamo date,
  estado_envio text not null default 'pendiente' check (estado_envio in ('pendiente','enviado','error')),
  respuesta text not null default 'sin_respuesta' check (respuesta in ('sin_respuesta','positiva','negativa')),
  enviado_at timestamptz,
  respondido_at timestamptz
);
create index if not exists reclamos_lote_idx on reclamos(lote_id);
create index if not exists reclamos_telefono_idx on reclamos(telefono);

create table if not exists mensajes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reclamo_id uuid not null references reclamos(id) on delete cascade,
  direccion text not null check (direccion in ('saliente','entrante')),
  origen text not null check (origen in ('bot','operador','vecino')),
  contenido text not null,
  leido boolean not null default false
);
create index if not exists mensajes_reclamo_idx on mensajes(reclamo_id, created_at);

-- Tiempo real para que el panel se actualice solo
alter publication supabase_realtime add table reclamos;
alter publication supabase_realtime add table mensajes;

-- RLS: ajustar según tu autenticación. Esto permite acceso con la anon key (solo para uso interno).
alter table lotes enable row level security;
alter table reclamos enable row level security;
alter table mensajes enable row level security;
create policy "acceso panel" on lotes for all using (true) with check (true);
create policy "acceso panel" on reclamos for all using (true) with check (true);
create policy "acceso panel" on mensajes for all using (true) with check (true);
