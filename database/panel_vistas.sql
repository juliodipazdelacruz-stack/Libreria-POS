-- Vistas para el panel web (estados de cuenta).
-- Ejecutar UNA VEZ en: Supabase > SQL Editor.
-- security_invoker: las vistas respetan las políticas RLS de quien consulta.

create or replace view v_cuenta_salon with (security_invoker = true) as
select
  s.id as salon_id,
  s.grado,
  s.seccion,
  s.activo,
  s.profesor_id,
  pr.nombre as profesor,
  coalesce(c.total, 0)::numeric(12,2) as consumos,
  coalesce(p.total, 0)::numeric(12,2) as pagos,
  (coalesce(c.total, 0) - coalesce(p.total, 0))::numeric(12,2) as saldo
from salones s
left join profesores pr on pr.id = s.profesor_id
left join (
  select salon_id, sum(total) as total from consumos
  where not anulado and salon_id is not null group by salon_id
) c on c.salon_id = s.id
left join (
  select salon_id, sum(monto) as total from pagos
  where not anulado and salon_id is not null group by salon_id
) p on p.salon_id = s.id;

create or replace view v_cuenta_profesor with (security_invoker = true) as
select
  t.id as profesor_id,
  t.nombre,
  t.activo,
  s.grado,
  s.seccion,
  coalesce(c.total, 0)::numeric(12,2) as consumos,
  coalesce(p.total, 0)::numeric(12,2) as pagos,
  (coalesce(c.total, 0) - coalesce(p.total, 0))::numeric(12,2) as saldo
from profesores t
left join salones s on s.profesor_id = t.id
left join (
  select profesor_id, sum(total) as total from consumos
  where not anulado and profesor_id is not null group by profesor_id
) c on c.profesor_id = t.id
left join (
  select profesor_id, sum(monto) as total from pagos
  where not anulado and profesor_id is not null group by profesor_id
) p on p.profesor_id = t.id;
