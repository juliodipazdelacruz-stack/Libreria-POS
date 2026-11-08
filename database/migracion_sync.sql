-- Migración para la sincronización offline-first.
-- Ejecutar en: Supabase > SQL Editor. Es aditiva: no borra ni cambia datos existentes.

-- 1. Marca de última modificación y dispositivo de origen
alter table consumos add column if not exists actualizado_en timestamptz not null default now();
alter table consumos add column if not exists dispositivo text;
alter table pagos    add column if not exists actualizado_en timestamptz not null default now();
alter table pagos    add column if not exists dispositivo text;

-- 2. Al guardar: se sella la hora y una anulación nunca se puede revertir.
--    Así un dispositivo desactualizado no puede "des-anular" un movimiento.
create or replace function movimiento_antes_de_guardar() returns trigger
language plpgsql as $$
begin
  new.actualizado_en := clock_timestamp();
  if tg_op = 'UPDATE' and old.anulado then
    new.anulado := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_consumos_guardar on consumos;
create trigger trg_consumos_guardar before insert or update on consumos
  for each row execute function movimiento_antes_de_guardar();

drop trigger if exists trg_pagos_guardar on pagos;
create trigger trg_pagos_guardar before insert or update on pagos
  for each row execute function movimiento_antes_de_guardar();

-- 3. Índices para que cada dispositivo baje solo lo nuevo, de forma rápida
create index if not exists idx_consumos_actualizado on consumos (actualizado_en, id);
create index if not exists idx_pagos_actualizado    on pagos    (actualizado_en, id);

-- Comprobación: ambas consultas deben devolver filas con la columna actualizado_en
select id, actualizado_en from consumos order by actualizado_en desc limit 3;
select id, actualizado_en from pagos    order by actualizado_en desc limit 3;
