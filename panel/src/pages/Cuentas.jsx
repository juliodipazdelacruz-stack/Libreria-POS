import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fechaCorta, mensajeError, mesActual, quitarTildes, rangoMes, redondear, soles } from '../lib/format';
import { ordenarSalones } from '../lib/claveSalon';
import { Alerta, Boton, Cargando, ChipSaldo, Modal, Tabla, Th, Vacio, claseInput } from '../components/ui';

export default function Cuentas() {
  const [tipo, setTipo] = useState('salon'); // 'salon' | 'profesor'
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [soloDeuda, setSoloDeuda] = useState(false);
  const [detalle, setDetalle] = useState(null);

  const cargar = useCallback(async () => {
    setFilas(null);
    setError('');
    const vista = tipo === 'salon' ? 'v_cuenta_salon' : 'v_cuenta_profesor';
    const { data, error: err } = await supabase.from(vista).select('*');
    if (err) {
      setError(mensajeError(err));
      setFilas([]);
      return;
    }
    setFilas(data);
  }, [tipo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cuentas = useMemo(() => {
    if (!filas) return [];
    return filas.map((f) =>
      tipo === 'salon'
        ? {
            id: f.salon_id,
            titulo: `${f.grado} ${f.seccion}`,
            subtitulo: f.profesor || 'Sin profesor',
            activo: f.activo,
            consumos: f.consumos,
            pagos: f.pagos,
            saldo: f.saldo,
            orden: { grado: f.grado, seccion: f.seccion },
          }
        : {
            id: f.profesor_id,
            titulo: f.nombre,
            subtitulo: f.grado ? `Salón ${f.grado} ${f.seccion}` : 'Sin salón',
            activo: f.activo,
            consumos: f.consumos,
            pagos: f.pagos,
            saldo: f.saldo,
          }
    );
  }, [filas, tipo]);

  const visibles = useMemo(() => {
    const q = quitarTildes(busqueda).trim();
    let lista = cuentas.filter(
      (c) => (!q || quitarTildes(`${c.titulo} ${c.subtitulo}`).includes(q)) && (!soloDeuda || redondear(c.saldo) > 0)
    );
    // Primero lo que más se debe; a igual deuda, orden natural
    if (tipo === 'salon') {
      const orden = ordenarSalones(lista.map((c) => ({ ...c.orden, ref: c })));
      lista = orden.map((o) => o.ref);
    } else {
      lista = [...lista].sort((a, b) => a.titulo.localeCompare(b.titulo));
    }
    return [...lista].sort((a, b) => redondear(b.saldo) - redondear(a.saldo));
  }, [cuentas, busqueda, soloDeuda, tipo]);

  const conDeuda = cuentas.filter((c) => redondear(c.saldo) > 0);
  const porCobrar = redondear(conDeuda.reduce((acc, c) => acc + Number(c.saldo), 0));

  return (
    <div>
      <h1 className="font-titulo text-2xl font-bold text-tinta">Estados de cuenta</h1>
      {filas && !error && (
        <p className="mt-1 text-sm text-suave">
          {conDeuda.length === 0 ? (
            'No hay deudas pendientes.'
          ) : (
            <>
              Hay <span className="num rounded bg-resaltador px-1.5 py-0.5 font-semibold text-texto">{soles(porCobrar)}</span>{' '}
              por cobrar en {conDeuda.length} {conDeuda.length === 1 ? 'cuenta' : 'cuentas'}.
            </>
          )}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Tipo de cuenta" className="inline-flex rounded-md border border-regla bg-white p-0.5">
          {[
            ['salon', 'Salones'],
            ['profesor', 'Profesores'],
          ].map(([id, nombre]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tipo === id}
              onClick={() => setTipo(id)}
              className={`rounded px-3 py-1.5 text-sm font-medium ${tipo === id ? 'bg-tinta text-white' : 'text-suave hover:text-texto'}`}
            >
              {nombre}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder={tipo === 'salon' ? 'Buscar salón o profesor' : 'Buscar profesor o salón'}
          aria-label="Buscar"
          className={`${claseInput} max-w-xs`}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-texto">
          <input type="checkbox" checked={soloDeuda} onChange={(e) => setSoloDeuda(e.target.checked)} />
          Solo con deuda
        </label>
      </div>

      <div className="mt-4 space-y-4">
        <Alerta>{error}</Alerta>
        {filas === null ? (
          <Cargando />
        ) : visibles.length === 0 && !error ? (
          <Vacio titulo="No hay cuentas para mostrar">Cambia el filtro o registra salones y profesores.</Vacio>
        ) : (
          visibles.length > 0 && (
            <Tabla>
              <thead className="border-b border-regla bg-papel text-suave">
                <tr>
                  <Th>{tipo === 'salon' ? 'Salón' : 'Profesor'}</Th>
                  <Th className="text-right">Consumos</Th>
                  <Th className="text-right">Pagos</Th>
                  <Th className="text-right">Saldo</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-regla/70">
                {visibles.map((c) => (
                  <tr key={c.id} className="hover:bg-papel/60">
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setDetalle(c)} className="text-left">
                        <span className="block font-medium text-tinta underline-offset-2 hover:underline">
                          {c.titulo}
                          {!c.activo && <span className="ml-2 text-xs font-normal text-suave">(inactivo)</span>}
                        </span>
                        <span className="block text-xs text-suave">{c.subtitulo}</span>
                      </button>
                    </td>
                    <td className="num px-4 py-3 text-right text-suave">{soles(c.consumos)}</td>
                    <td className="num px-4 py-3 text-right text-suave">{soles(c.pagos)}</td>
                    <td className="px-4 py-3 text-right">
                      <ChipSaldo saldo={c.saldo} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )
        )}
      </div>

      {detalle && <Detalle cuenta={detalle} tipo={tipo} onCerrar={() => setDetalle(null)} />}
    </div>
  );
}

function Detalle({ cuenta, tipo, onCerrar }) {
  const [mes, setMes] = useState(mesActual());
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const campo = tipo === 'salon' ? 'salon_id' : 'profesor_id';

  useEffect(() => {
    if (!mes) return undefined;
    let vivo = true;
    (async () => {
      setDatos(null);
      setError('');
      const { desde, hasta } = rangoMes(mes);
      const [c, p] = await Promise.all([
        supabase
          .from('consumos')
          .select('id, fecha, cantidad, precio_unitario, total, anulado, origen, productos(nombre, variante)')
          .eq(campo, cuenta.id)
          .gte('fecha', desde)
          .lt('fecha', hasta)
          .order('fecha', { ascending: false }),
        supabase
          .from('pagos')
          .select('id, fecha, monto, metodo, observacion, anulado')
          .eq(campo, cuenta.id)
          .gte('fecha', desde)
          .lt('fecha', hasta)
          .order('fecha', { ascending: false }),
      ]);
      if (!vivo) return;
      if (c.error || p.error) {
        setError(mensajeError(c.error || p.error));
        return;
      }
      setDatos({ consumos: c.data, pagos: p.data });
    })();
    return () => {
      vivo = false;
    };
  }, [mes, campo, cuenta.id]);

  const totalConsumos = datos ? redondear(datos.consumos.filter((x) => !x.anulado).reduce((a, x) => a + Number(x.total), 0)) : 0;
  const totalPagos = datos ? redondear(datos.pagos.filter((x) => !x.anulado).reduce((a, x) => a + Number(x.monto), 0)) : 0;

  return (
    <Modal titulo={`${cuenta.titulo}`} onCerrar={onCerrar} ancho="max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-suave">{cuenta.subtitulo}</p>
          <p className="mt-2 text-sm text-suave">Saldo actual</p>
          <ChipSaldo saldo={cuenta.saldo} />
        </div>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Mes</span>
          <input type="month" className={claseInput} value={mes} onChange={(e) => setMes(e.target.value)} />
        </label>
      </div>

      <div className="mt-5 space-y-5">
        <Alerta>{error}</Alerta>
        {!datos && !error ? (
          <Cargando />
        ) : (
          datos && (
            <>
              <section>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="font-titulo text-base font-semibold text-tinta">Consumos del mes</h3>
                  <span className="num text-sm font-medium">{soles(totalConsumos)}</span>
                </div>
                {datos.consumos.length === 0 ? (
                  <p className="text-sm text-suave">Sin consumos en este mes.</p>
                ) : (
                  <Tabla>
                    <thead className="border-b border-regla bg-papel text-suave">
                      <tr>
                        <Th>Fecha</Th>
                        <Th>Producto</Th>
                        <Th className="text-right">Cantidad</Th>
                        <Th className="text-right">Total</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-regla/70">
                      {datos.consumos.map((x) => (
                        <tr key={x.id} className={x.anulado ? 'text-suave line-through' : ''}>
                          <td className="whitespace-nowrap px-4 py-2">{fechaCorta(x.fecha)}</td>
                          <td className="px-4 py-2">
                            {x.productos?.nombre}
                            {x.productos?.variante ? ` ${x.productos.variante}` : ''}
                            <span className="ml-2 text-xs text-suave no-underline">
                              {x.origen === 'telegram' ? 'por Telegram' : 'desde el panel'}
                            </span>
                          </td>
                          <td className="num px-4 py-2 text-right">
                            {x.cantidad} × {soles(x.precio_unitario)}
                          </td>
                          <td className="num px-4 py-2 text-right">{soles(x.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Tabla>
                )}
              </section>

              <section>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="font-titulo text-base font-semibold text-tinta">Pagos del mes</h3>
                  <span className="num text-sm font-medium">{soles(totalPagos)}</span>
                </div>
                {datos.pagos.length === 0 ? (
                  <p className="text-sm text-suave">Sin pagos en este mes.</p>
                ) : (
                  <Tabla>
                    <thead className="border-b border-regla bg-papel text-suave">
                      <tr>
                        <Th>Fecha</Th>
                        <Th>Método</Th>
                        <Th>Nota</Th>
                        <Th className="text-right">Monto</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-regla/70">
                      {datos.pagos.map((x) => (
                        <tr key={x.id} className={x.anulado ? 'text-suave line-through' : ''}>
                          <td className="whitespace-nowrap px-4 py-2">{fechaCorta(x.fecha)}</td>
                          <td className="px-4 py-2 capitalize">{x.metodo}</td>
                          <td className="px-4 py-2">{x.observacion}</td>
                          <td className="num px-4 py-2 text-right">{soles(x.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Tabla>
                )}
              </section>
            </>
          )
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <Boton variante="secundario" onClick={onCerrar}>
          Cerrar
        </Boton>
      </div>
    </Modal>
  );
}
