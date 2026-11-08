import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { mensajeError, quitarTildes, soles } from '../lib/format';
import { ordenarSalones } from '../lib/claveSalon';
import {
  agregarLinea, filasConsumo, fijarCantidad, quitarLinea, subtotal, sumarCantidad, totalItems, validarLineas,
} from '../lib/consumos';
import { Alerta, Boton, Cargando, Vacio, claseInput, useAviso } from '../components/ui';

const etiquetaProducto = (p) => `${p.nombre}${p.variante ? ` ${p.variante}` : ''}`;

export default function Consumo() {
  const [datos, setDatos] = useState(null); // { productos, salones, profesores }
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [lineas, setLineas] = useState([]); // [{ productoId, cantidad }]
  const [cuenta, setCuenta] = useState(''); // 'salon:ID' | 'profesor:ID'
  const [guardando, setGuardando] = useState(false);
  const [aviso, mostrarAviso] = useAviso();
  const buscador = useRef(null);

  const cargar = useCallback(async () => {
    const [pr, sa, pf] = await Promise.all([
      supabase
        .from('productos')
        .select('id, nombre, variante, aliases, precios(precio, activo)')
        .eq('activo', true)
        .order('nombre'),
      supabase.from('salones').select('id, grado, seccion, profesor_id, profesores(nombre)').eq('activo', true),
      supabase.from('profesores').select('id, nombre').eq('activo', true).order('nombre'),
    ]);
    const fallo = pr.error || sa.error || pf.error;
    if (fallo) {
      setError(mensajeError(fallo));
      setDatos({ productos: [], salones: [], profesores: [] });
      return;
    }
    setError('');
    setDatos({
      productos: pr.data
        .map((p) => ({ ...p, precio: p.precios?.find((x) => x.activo)?.precio }))
        .filter((p) => p.precio !== undefined && p.precio !== null),
      salones: sa.data,
      profesores: pf.data,
    });
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const productos = useMemo(() => datos?.productos ?? [], [datos]);
  const salones = useMemo(() => ordenarSalones(datos?.salones ?? []), [datos]);

  const visibles = useMemo(() => {
    const q = quitarTildes(busqueda).trim();
    if (!q) return productos;
    return productos.filter((p) => quitarTildes(`${etiquetaProducto(p)} ${(p.aliases ?? []).join(' ')}`).includes(q));
  }, [productos, busqueda]);

  const validacion = useMemo(() => validarLineas(lineas, productos), [lineas, productos]);
  const total = validacion.items ? totalItems(validacion.items) : 0;
  const unidades = lineas.reduce((a, l) => a + (parseInt(l.cantidad, 10) || 0), 0);

  // Etiqueta legible de la cuenta elegida
  const etiquetaCuenta = useMemo(() => {
    if (!cuenta || !datos) return '';
    const [tipo, id] = cuenta.split(':');
    if (tipo === 'salon') {
      const s = datos.salones.find((x) => x.id === id);
      return s ? `el salón ${s.grado} ${s.seccion}` : '';
    }
    const p = datos.profesores.find((x) => x.id === id);
    return p ? `la cuenta personal de ${p.nombre}` : '';
  }, [cuenta, datos]);

  function agregar(id) {
    setError('');
    setLineas((ls) => agregarLinea(ls, id));
  }

  function alPresionarTecla(e) {
    // Enter agrega el primer resultado y deja el buscador listo para el siguiente
    if (e.key === 'Enter' && visibles.length > 0) {
      e.preventDefault();
      agregar(visibles[0].id);
      setBusqueda('');
    }
  }

  async function guardar() {
    setError('');
    if (!cuenta) return setError('Elige el salón o profesor al que se cargará el consumo.');
    if (validacion.error) return setError(validacion.error);

    const [tipo, id] = cuenta.split(':');
    setGuardando(true);
    const { error: err } = await supabase.from('consumos').insert(filasConsumo(validacion.items, tipo, id));
    setGuardando(false);
    if (err) return setError(mensajeError(err));

    mostrarAviso(`Registrado: ${soles(total)} en ${etiquetaCuenta}.`);
    setLineas([]);
    buscador.current?.focus();
    cargar(); // refresca precios por si cambiaron
  }

  return (
    <div>
      <h1 className="font-titulo text-2xl font-bold text-tinta">Registrar consumo</h1>
      <p className="mt-1 text-sm text-suave">Toca los productos para sumarlos y elige a quién se carga.</p>

      <div className="mt-5 space-y-4">
        <Alerta tipo="ok">{aviso}</Alerta>
        <Alerta>{error}</Alerta>
      </div>

      {datos === null ? (
        <Cargando />
      ) : productos.length === 0 ? (
        <div className="mt-4">
          <Vacio titulo="No hay productos con precio vigente">
            Registra productos con su precio en la sección Productos para poder anotar consumos.
          </Vacio>
        </div>
      ) : (
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
          {/* Izquierda: lista de productos con buscador */}
          <section aria-label="Productos" className="rounded-lg border border-regla bg-white">
            <div className="border-b border-regla p-4">
              <input
                ref={buscador}
                type="search"
                aria-label="Buscar producto"
                placeholder="Buscar producto (Enter agrega el primero)"
                className={claseInput}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={alPresionarTecla}
                autoFocus
              />
            </div>
            {visibles.length === 0 ? (
              <p className="p-6 text-center text-sm text-suave">Ningún producto coincide con “{busqueda}”.</p>
            ) : (
              <ul className="divide-y divide-regla/70 lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto">
                {visibles.map((p) => {
                  const enCarrito = lineas.find((l) => l.productoId === p.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => agregar(p.id)}
                        aria-label={`Agregar ${etiquetaProducto(p)}`}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-papel"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-texto">{p.nombre}</span>
                          {p.variante && <span className="block text-xs text-suave">{p.variante}</span>}
                        </span>
                        <span className="flex flex-shrink-0 items-center gap-3">
                          {enCarrito && (
                            <span className="num rounded-full bg-tinta px-2 py-0.5 text-xs font-semibold text-white">
                              × {enCarrito.cantidad}
                            </span>
                          )}
                          <span className="num text-sm text-suave">{soles(p.precio)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Derecha: lo que se está escogiendo + a quién se carga */}
          <aside aria-label="Consumo actual" className="rounded-lg border border-regla bg-white lg:sticky lg:top-6">
            <div className="border-b border-regla p-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-texto">Cargar a</span>
                <select className={claseInput} value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
                  <option value="">Elige un salón o profesor</option>
                  <optgroup label="Salones">
                    {salones.map((s) => (
                      <option key={s.id} value={`salon:${s.id}`}>
                        {s.grado} {s.seccion}
                        {s.profesores?.nombre ? ` — ${s.profesores.nombre}` : ''}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Profesores (cuenta personal)">
                    {datos.profesores.map((p) => {
                      const s = datos.salones.find((x) => x.profesor_id === p.id);
                      return (
                        <option key={p.id} value={`profesor:${p.id}`}>
                          {p.nombre}
                          {s ? ` (${s.grado} ${s.seccion})` : ''}
                        </option>
                      );
                    })}
                  </optgroup>
                </select>
              </label>
            </div>

            <div className="p-4">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="font-titulo text-base font-semibold text-tinta">Consumo actual</h2>
                {lineas.length > 0 && (
                  <button type="button" onClick={() => setLineas([])} className="text-xs text-suave hover:text-deuda">
                    Vaciar
                  </button>
                )}
              </div>

              {lineas.length === 0 ? (
                <p className="rounded-md border border-dashed border-regla px-3 py-6 text-center text-sm text-suave">
                  Toca un producto de la lista para agregarlo.
                </p>
              ) : (
                <ul className="divide-y divide-regla/70">
                  {lineas.map((l) => {
                    const p = productos.find((x) => x.id === l.productoId);
                    if (!p) return null;
                    const cant = /^\d+$/.test(String(l.cantidad).trim()) ? Number(l.cantidad) : null;
                    return (
                      <li key={l.productoId} className="py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{etiquetaProducto(p)}</p>
                            <p className="num text-xs text-suave">{soles(p.precio)} c/u</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setLineas((ls) => quitarLinea(ls, p.id))}
                            aria-label={`Quitar ${etiquetaProducto(p)}`}
                            className="rounded p-1 text-suave hover:bg-deuda/5 hover:text-deuda"
                          >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <path d="M4 4l8 8M12 4L4 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="inline-flex items-center rounded-md border border-regla">
                            <button
                              type="button"
                              onClick={() => setLineas((ls) => sumarCantidad(ls, p.id, -1))}
                              aria-label="Restar una unidad"
                              className="px-2.5 py-1 text-lg leading-none text-suave hover:bg-papel"
                            >
                              −
                            </button>
                            <input
                              aria-label={`Cantidad de ${etiquetaProducto(p)}`}
                              className="num w-14 border-x border-regla py-1 text-center text-sm focus:outline-none"
                              type="number"
                              min="1"
                              step="1"
                              inputMode="numeric"
                              value={l.cantidad}
                              onChange={(e) => setLineas((ls) => fijarCantidad(ls, p.id, e.target.value))}
                            />
                            <button
                              type="button"
                              onClick={() => setLineas((ls) => sumarCantidad(ls, p.id, 1))}
                              aria-label="Sumar una unidad"
                              className="px-2.5 py-1 text-lg leading-none text-suave hover:bg-papel"
                            >
                              +
                            </button>
                          </div>
                          <span className="num text-sm font-medium">
                            {cant ? soles(subtotal({ producto: p, cantidad: cant })) : '—'}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-regla p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-suave">
                  Total{unidades > 0 ? ` · ${unidades} ${unidades === 1 ? 'unidad' : 'unidades'}` : ''}
                </span>
                <span className="num font-titulo text-2xl font-bold text-tinta">{soles(total)}</span>
              </div>
              <Boton className="mt-3 w-full" onClick={guardar} disabled={guardando || lineas.length === 0}>
                {guardando ? 'Guardando…' : 'Guardar consumo'}
              </Boton>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
