-- Lista de teléfonos que NUNCA reciben el aviso de WhatsApp (directores, empleados, números de prueba, etc.)
-- Ejecutar en Supabase > SQL Editor. Se puede correr más de una vez.

create table if not exists public.whatsapp_exclusiones (
  telefono text primary key,          -- normalizado, formato 549XXXXXXXXXX (igual que reclamos.telefono_normalizado)
  motivo text,
  creado_por text,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_exclusiones enable row level security;
drop policy if exists "usuarios autenticados" on public.whatsapp_exclusiones;
create policy "usuarios autenticados" on public.whatsapp_exclusiones
  for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.whatsapp_exclusiones;

-- El panel ya pone whatsapp_eligible = false en los reclamos de estos teléfonos.
-- Como doble seguro, agregar esta condición al WHERE de la vista reclamos_para_notificar
-- (así n8n nunca les manda aunque alguien cargue datos por otro lado):
--
--     and not exists (
--         select 1 from public.whatsapp_exclusiones e
--         where e.telefono = r.telefono_normalizado
--     )
