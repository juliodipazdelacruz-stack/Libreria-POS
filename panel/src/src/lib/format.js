export const quitarTildes = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function redondear(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function soles(n) {
  return `S/ ${redondear(n).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fechaCorta(iso) {
  return new Date(iso).toLocaleString('es-PE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Lima',
  });
}

export function fechaDia(iso) {
  return new Date(iso).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Lima',
  });
}

export function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// "2026-11" -> { desde, hasta } para filtrar por mes
export function rangoMes(mes) {
  const [anio, m] = mes.split('-').map(Number);
  return {
    desde: new Date(anio, m - 1, 1).toISOString(),
    hasta: new Date(anio, m, 1).toISOString(),
  };
}

export function mensajeError(e) {
  if (!e) return '';
  if (e.code === '23505') return 'Ya existe un registro con esos datos.';
  if (e.code === '42501' || /row-level security/i.test(e.message || '')) {
    return 'No tienes permiso para esta acción. Revisa que tu usuario tenga rol admin.';
  }
  if (e.code === 'PGRST205' || e.code === '42P01') {
    return 'Falta crear las vistas en Supabase. Ejecuta panel_vistas.sql en el SQL Editor.';
  }
  return e.message || 'Ocurrió un error inesperado.';
}
