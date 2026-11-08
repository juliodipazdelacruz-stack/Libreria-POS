// Remoto y local simulados en memoria, para probar el motor sin internet ni base de datos.
import { fusionarFila } from '../src/lib/sync/motor.js';

const BASE = Date.parse('2026-11-07T10:00:00.000Z');

export function crearRemotoMemoria() {
  const tablas = { consumos: new Map(), pagos: new Map() };
  let reloj = BASE;
  const estado = { caido: false, alInsertar: null, fallarEnInsertNumero: null };
  const contadores = { inserts: 0 };
  const revisar = () => {
    if (estado.caido) throw new Error('sin conexión');
  };
  const iso = (ms) => new Date(ms).toISOString();

  return {
    tablas,
    estado,
    contadores,
    reloj: () => reloj,
    async insertarSiNoExiste(tabla, filas) {
      revisar();
      contadores.inserts += 1;
      if (estado.fallarEnInsertNumero === contadores.inserts) throw new Error('falló la red a mitad de subida');
      estado.alInsertar?.(tabla, filas);
      for (const f of filas) {
        if (!tablas[tabla].has(f.id)) tablas[tabla].set(f.id, { ...f, actualizado_en: iso((reloj += 1)) });
      }
    },
    async anular(tabla, ids) {
      revisar();
      for (const id of ids) {
        const f = tablas[tabla].get(id);
        if (f && !f.anulado) tablas[tabla].set(id, { ...f, anulado: true, actualizado_en: iso((reloj += 1)) });
      }
    },
    async bajar(tabla, { desde, despuesId, limite }) {
      revisar();
      const d = desde == null ? null : Date.parse(desde);
      const pasa = (f) => {
        if (d == null) return true;
        const t = Date.parse(f.actualizado_en);
        if (despuesId == null) return t >= d;
        return t > d || (t === d && f.id > despuesId);
      };
      return [...tablas[tabla].values()]
        .filter(pasa)
        .sort((a, b) => Date.parse(a.actualizado_en) - Date.parse(b.actualizado_en) || (a.id < b.id ? -1 : 1))
        .slice(0, limite)
        .map((f) => ({ ...f }));
    },
    async bajarCatalogo() {
      revisar();
      return { productos: [{ id: 'p1', nombre: 'Copia' }], precios: [], salones: [], profesores: [] };
    },
    // Simula algo que escribe directo en Supabase (el bot de Telegram u otro dispositivo)
    escribirDirecto(tabla, fila, { enMs } = {}) {
      const t = enMs ?? (reloj += 1);
      tablas[tabla].set(fila.id, { anulado: false, ...fila, actualizado_en: iso(t) });
    },
  };
}

export function crearLocalMemoria() {
  const filas = { consumos: new Map(), pagos: new Map() };
  const sucios = { consumos: new Map(), pagos: new Map() }; // id -> versión
  const meta = { cursores: {}, ultimaSync: null, catalogo: null };
  const marcar = (tabla, id) => sucios[tabla].set(id, (sucios[tabla].get(id) ?? 0) + 1);

  return {
    filas,
    sucios,
    meta,
    // --- lo que usará la pantalla ---
    registrar(tabla, fila) {
      filas[tabla].set(fila.id, { anulado: false, actualizado_en: null, ...fila });
      marcar(tabla, fila.id);
    },
    anular(tabla, id) {
      const f = filas[tabla].get(id);
      if (!f) return;
      filas[tabla].set(id, { ...f, anulado: true });
      marcar(tabla, id);
    },
    // --- lo que usa el motor ---
    async pendientes(tabla) {
      return [...sucios[tabla]].map(([id, version]) => ({ id, version }));
    },
    async leerFilas(tabla, ids) {
      return ids.map((id) => filas[tabla].get(id)).filter(Boolean).map((f) => ({ ...f }));
    },
    async marcarSubidos(tabla, lote) {
      for (const { id, version } of lote) if (sucios[tabla].get(id) === version) sucios[tabla].delete(id);
    },
    async aplicarRemotas(tabla, remotas) {
      for (const r of remotas) filas[tabla].set(r.id, fusionarFila(filas[tabla].get(r.id), r));
    },
    async leerCursor(tabla) {
      return meta.cursores[tabla] ?? null;
    },
    async guardarCursor(tabla, valor) {
      meta.cursores[tabla] = valor;
    },
    async reemplazarCatalogo(c) {
      meta.catalogo = c;
    },
    async contarPendientes() {
      return sucios.consumos.size + sucios.pagos.size;
    },
    async guardarUltimaSync(iso) {
      meta.ultimaSync = iso;
    },
  };
}
