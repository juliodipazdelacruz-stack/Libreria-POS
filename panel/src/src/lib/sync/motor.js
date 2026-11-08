// Motor de sincronización offline-first.
//
// Idea: cada dispositivo guarda sus consumos y pagos en una base local y sigue trabajando sin
// internet. Cuando hay conexión, el motor SUBE lo pendiente a Supabase y BAJA lo nuevo (por
// ejemplo, lo registrado por el bot de Telegram u otros dispositivos).
//
// Por qué no hay conflictos: los movimientos nunca se editan. Solo se crean (con id propio, así
// subirlos dos veces no duplica) o se anulan (y una anulación nunca se revierte).
//
// El motor no sabe de IndexedDB ni de Supabase: recibe un "local" y un "remoto" con estas funciones.
//
// local:
//   pendientes(tabla)                  -> [{ id, version }]  movimientos aún no subidos
//   leerFilas(tabla, ids)              -> filas completas
//   marcarSubidos(tabla, lote)         -> quita de pendientes SOLO si la versión no cambió
//   aplicarRemotas(tabla, filas)       -> guarda lo bajado usando fusionarFila()
//   leerCursor(tabla) / guardarCursor(tabla, valor)
//   reemplazarCatalogo(catalogo)       -> productos, precios, salones, profesores
//   contarPendientes()                 -> número
//   guardarUltimaSync(isoString)
// remoto:
//   insertarSiNoExiste(tabla, filas)   -> INSERT ... ON CONFLICT DO NOTHING
//   anular(tabla, ids)                 -> marca anulado = true
//   bajar(tabla, { desde, despuesId, limite }) -> filas ordenadas por (actualizado_en, id)
//   bajarCatalogo()

export const TABLAS = ['consumos', 'pagos'];

/** Une la versión local y la remota de un movimiento. Una anulación nunca se pierde. */
export function fusionarFila(local, remota) {
  if (!local) return { ...remota };
  return { ...remota, anulado: Boolean(local.anulado || remota.anulado) };
}

// El servidor pone actualizado_en; no se envía desde el dispositivo.
const paraSubir = ({ actualizado_en, ...resto }) => resto;

const aMs = (iso) => Date.parse(iso);

export function crearMotor({
  local,
  remoto,
  tamanoLote = 200,
  tamanoPagina = 1000, // Supabase devuelve como máximo 1000 filas por consulta
  solapeMs = 2 * 60 * 1000, // se vuelve a mirar un poco atrás por si una transacción confirmó tarde
  ahora = () => Date.now(),
} = {}) {
  let enCurso = null;

  async function subir() {
    let subidos = 0;
    for (const tabla of TABLAS) {
      const pendientes = await local.pendientes(tabla);
      for (let i = 0; i < pendientes.length; i += tamanoLote) {
        const lote = pendientes.slice(i, i + tamanoLote);
        const filas = await local.leerFilas(tabla, lote.map((p) => p.id));
        if (filas.length > 0) {
          await remoto.insertarSiNoExiste(tabla, filas.map(paraSubir));
          const anuladas = filas.filter((f) => f.anulado).map((f) => f.id);
          if (anuladas.length > 0) await remoto.anular(tabla, anuladas);
        }
        // Si durante la subida el usuario anuló algo, su versión cambió y seguirá pendiente.
        await local.marcarSubidos(tabla, lote);
        subidos += lote.length;
      }
    }
    return subidos;
  }

  async function bajar() {
    let bajados = 0;
    for (const tabla of TABLAS) {
      const guardado = await local.leerCursor(tabla);
      let desde = guardado ? new Date(aMs(guardado) - solapeMs).toISOString() : null;
      let despuesId = null;
      let maximo = guardado;

      for (;;) {
        const filas = await remoto.bajar(tabla, { desde, despuesId, limite: tamanoPagina });
        if (filas.length === 0) break;
        await local.aplicarRemotas(tabla, filas);
        bajados += filas.length;

        const ultima = filas[filas.length - 1];
        desde = ultima.actualizado_en;
        despuesId = ultima.id;
        if (!maximo || aMs(ultima.actualizado_en) > aMs(maximo)) maximo = ultima.actualizado_en;
        if (filas.length < tamanoPagina) break;
      }
      if (maximo) await local.guardarCursor(tabla, maximo);
    }
    return bajados;
  }

  /** Sube y baja. Nunca lanza error: devuelve { ok, subidos, bajados, pendientes, error }. */
  function sincronizar() {
    if (enCurso) return enCurso; // una sola sincronización a la vez
    enCurso = (async () => {
      const resultado = { ok: true, subidos: 0, bajados: 0, pendientes: 0, error: null };
      try {
        resultado.subidos = await subir();
        resultado.bajados = await bajar();
        await local.reemplazarCatalogo(await remoto.bajarCatalogo());
        await local.guardarUltimaSync(new Date(ahora()).toISOString());
      } catch (e) {
        resultado.ok = false;
        resultado.error = e?.message ?? String(e);
      }
      try {
        resultado.pendientes = await local.contarPendientes();
      } catch {
        /* sin dato */
      }
      return resultado;
    })().finally(() => {
      enCurso = null;
    });
    return enCurso;
  }

  return { sincronizar };
}
