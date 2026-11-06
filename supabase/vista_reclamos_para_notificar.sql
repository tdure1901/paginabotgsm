-- Vista que lee n8n (workflow Bot Reclamos) para saber a quién mandarle el aviso.
-- Mismas columnas y orden que la original, así se puede reemplazar sin romper nada.
-- Requiere haber ejecutado antes supabase/exclusiones.sql.

create or replace view public.reclamos_para_notificar as
select
  r.id, r.numero_reclamo, r.fecha_ingreso, r.estado, r.situacion, r.motivo, r.submotivo,
  r.localidad, r.calle, r.numero_domicilio, r.texto_reclamo, r.solicitante,
  r.telefono_original, r.telefono_normalizado, r.telefono_valido, r.texto_respuesta,
  r.fecha_respuesta, r.fecha_verificacion, r.forma_verificacion, r.observaciones_verificacion,
  r.contacto_verificacion, r.conformidad_verificacion, r.estado_verificacion,
  r.resultado_verificacion, r.whatsapp_eligible, r.created_at, r.updated_at
from public.reclamos r
where r.estado = 'Cerrado'
  and r.situacion = 'Resp.Positiva'
  and r.telefono_valido = true
  and r.whatsapp_eligible = true
  -- Solo estos motivos (sin importar mayúsculas)
  and upper(trim(r.motivo)) in ('ALUMBRADO PUBLICO', 'ARBOL', 'LIMPIEZA Y RECOLECCION DOMICILIARIA')
  -- Nunca a números de la lista de no elegibles
  and not exists (
    select 1 from public.whatsapp_exclusiones e
    where e.telefono = r.telefono_normalizado
  )
  -- Nunca si ya tiene una notificación que no sea pendiente/error (enviado, respondido, enviando…)
  and not exists (
    select 1 from public.whatsapp_notificaciones wn
    where wn.reclamo_id = r.id
      and coalesce(wn.estado, '') not in ('pendiente', 'error')
  )
  -- Máximo 3 intentos fallidos (ej. números sin WhatsApp)
  and (
    select count(*) from public.whatsapp_notificaciones wn
    where wn.reclamo_id = r.id and wn.estado = 'error'
  ) < 3;
