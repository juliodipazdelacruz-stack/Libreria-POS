import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fechaCorta, mensajeError, mesActual, quitarTildes, rangoMes, redondear, soles } from '../lib/format';
import { ordenarSalones } from '../lib/claveSalon';
import {
  Alerta, Boton, Campo, Cargando, ChipSaldo, Modal, Tabla, Th, Vacio, claseInput, useAviso,
} from '../components/ui';

export default function Cuentas() {
  const [tipo, setTipo] = useState('salon'); // 'salon' | 'profesor'
  // Los datos se guardan junto al tipo al que pertenecen, para no mezclar salones con profesores
  const [carga, setCarga] = useState({ tipo: null, filas: null });
  const [recarga, setRecarga] = useState(0);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [soloDeuda, setSoloDeuda] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [pagoDe, setPagoDe] = useState(null);
  const [aviso, mostrarAviso] = useAviso();

  useEffect(() => {
    let vivo = true;
    setError('');
    (async () => {
      const vista = tipo === 'salon' ? 'v_cuenta_salon' : 'v_cuenta_profesor';
      const { data, error: err } = await supabase.from(vista).select('*');
      if (!vivo) return; // respuesta de una pestaña que ya cambió
      if (err) {
        setError(mensajeError(err));
        setCarga({ tipo, filas: [] });
        return;
      }
      setCarga({ tipo, filas: data });
    })();
    return () => {
      vivo = false;
    };
  }, [tipo, recarga]);

  // Mientras llegan los datos de la pestaña elegida no se muestra nada de la anterior
  const filas = carga.tipo === tipo ? carga.filas : null;

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
      lista = ordenarSalones(lista.map((c) => ({ ...c.orden, ref: c }))).map((o) => o.ref);
    } else {
      lista = [...lista].sort((a, b) => String(a.titulo ?? '').localeCompare(String(b.titulo ?? '')));
    }
    return [...lista].sort((a, b) => redondear(b.saldo) - redondear(a.saldo));
  }, [cuentas, busqueda, soloDeuda, tipo]);

  const conDeuda = cuentas.filter((c) => redondear(c.saldo) > 0);
  const porCobrar = redondear(conDeuda.reduce((acc, c) => acc + Number(c.saldo), 0));

  // Los modales siempre muestran el saldo más reciente de la cuenta
  const fresca = (c) => (c ? cuentas.find((x) => x.id === c.id) ?? c : null);
  const detalleActual = fresca(detalle);
  const pagoActual = fresca(pagoDe);

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
        <Alerta tipo="ok">{aviso}</Alerta>
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
                  <Th className="text-right">Acciones</Th>
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
                    <td className="px-4 py-3 text-right">
                      <Boton variante="secundario" onClick={() => setPagoDe(c)}>
                        Registrar pago
                      </Boton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )
        )}
      </div>

      {detalleActual && (
        <Detalle
          cuenta={detalleActual}
          tipo={tipo}
          onCerrar={() => setDetalle(null)}
          onPago={() => setPagoDe(detalleActual)}
          onCambio={() => setRecarga((n) => n + 1)}
        />
      )}

      {pagoActual && (
        <FormPago
          cuenta={pagoActual}
          tipo={tipo}
          onCerrar={() => setPagoDe(null)}
          onGuardado={(msg) => {
            setPagoDe(null);
            mostrarAviso(msg);
            setRecarga((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

function FormPago({ cuenta, tipo, onCerrar, onGuardado }) {
  const saldo = redondear(cuenta.saldo);
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState('efectivo');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const valor = Number(monto);
  const excede = monto !== '' && valor > 0 && valor > Math.max(saldo, 0);

  async function guardar(e) {
    e.preventDefault();
    setError('');
    if (monto === '' || !Number.isFinite(valor) || valor <= 0) return setError('Escribe un monto mayor que 0.');

    setGuardando(true);
    const { error: err } = await supabase.from('pagos').insert({
      monto: redondear(valor),
      metodo,
      observacion: nota.trim() || null,
      salon_id: tipo === 'salon' ? cuenta.id : null,
      profesor_id: tipo === 'profesor' ? cuenta.id : null,
    });
    setGuardando(false);
    if (err) return setError(mensajeError(err));
    onGuardado(`Pago de ${soles(valor)} registrado en ${cuenta.titulo}.`);
  }

  return (
    <Modal titulo={`Registrar pago · ${cuenta.titulo}`} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="space-y-4">
        <div className="flex items-center justify-between rounded-md bg-papel px-3 py-2 text-sm">
          <span className="text-suave">Saldo actual</span>
          <ChipSaldo saldo={cuenta.saldo} />
        </div>

        <Campo etiqueta="Monto (S/)">
          <div className="flex gap-2">
            <input
              className={`${claseInput} num`}
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              autoFocus
            />
            {saldo > 0 && (
              <Boton variante="secundario" onClick={() => setMonto(String(saldo))} className="whitespace-nowrap">
                Pagar todo
              </Boton>
            )}
          </div>
        </Campo>

        <Campo etiqueta="Método de pago">
          <select className={claseInput} value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="otro">Otro</option>
          </select>
        </Campo>

        <Campo etiqueta="Nota" ayuda="Opcional. Ej. quién entregó el dinero.">
          <input className={claseInput} value={nota} onChange={(e) => setNota(e.target.value)} />
        </Campo>

        {excede && (
          <Alerta tipo="aviso">
            {saldo > 0
              ? `El pago supera la deuda en ${soles(valor - saldo)}. Esa diferencia quedará como saldo a favor.`
              : 'Esta cuenta no tiene deuda; el pago quedará como saldo a favor.'}
          </Alerta>
        )}
        <Alerta>{error}</Alerta>

        <div className="flex justify-end gap-2 pt-1">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar pago'}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}

function Detalle({ cuenta, tipo, onCerrar, onPago, onCambio }) {
  const [mes, setMes] = useState(mesActual());
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
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
  }, [mes, campo, cuenta.id, version]);

  // Anular no borra: el registro queda marcado y deja de contar en el saldo
  async function anular(tabla, id, pregunta) {
    if (!window.confirm(pregunta)) return;
    const { error: err } = await supabase.from(tabla).update({ anulado: true }).eq('id', id);
    if (err) return setError(mensajeError(err));
    setVersion((v) => v + 1);
    onCambio();
  }

  const totalConsumos = datos ? redondear(datos.consumos.filter((x) => !x.anulado).reduce((a, x) => a + Number(x.total), 0)) : 0;
  const totalPagos = datos ? redondear(datos.pagos.filter((x) => !x.anulado).reduce((a, x) => a + Number(x.monto), 0)) : 0;

  return (
    <Modal titulo={cuenta.titulo} onCerrar={onCerrar} ancho="max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-suave">{cuenta.subtitulo}</p>
          <p className="mt-2 text-sm text-suave">Saldo actual</p>
          <ChipSaldo saldo={cuenta.saldo} />
        </div>
        <div className="flex items-end gap-3">
          <Boton variante="secundario" onClick={onPago}>
            Registrar pago
          </Boton>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Mes</span>
            <input type="month" className={claseInput} value={mes} onChange={(e) => setMes(e.target.value)} />
          </label>
        </div>
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
                        <Th className="text-right">
                          <span className="sr-only">Acciones</span>
                        </Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-regla/70">
                      {datos.consumos.map((x) => (
                        <tr key={x.id} className={x.anulado ? 'text-suave' : ''}>
                          <td className={`whitespace-nowrap px-4 py-2 ${x.anulado ? 'line-through' : ''}`}>{fechaCorta(x.fecha)}</td>
                          <td className="px-4 py-2">
                            <span className={x.anulado ? 'line-through' : ''}>
                              {x.productos?.nombre}
                              {x.productos?.variante ? ` ${x.productos.variante}` : ''}
                            </span>
                            <span className="ml-2 text-xs text-suave">
                              {x.anulado ? 'anulado' : x.origen === 'telegram' ? 'por Telegram' : 'desde el panel'}
                            </span>
                          </td>
                          <td className={`num px-4 py-2 text-right ${x.anulado ? 'line-through' : ''}`}>
                            {x.cantidad} × {soles(x.precio_unitario)}
                          </td>
                          <td className={`num px-4 py-2 text-right ${x.anulado ? 'line-through' : ''}`}>{soles(x.total)}</td>
                          <td className="px-4 py-2 text-right">
                            {!x.anulado && (
                              <Boton
                                variante="texto"
                                onClick={() =>
                                  anular('consumos', x.id, `¿Anular este consumo de ${soles(x.total)}? Dejará de contar en el saldo.`)
                                }
                              >
                                Anular
                              </Boton>
                            )}
                          </td>
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
                        <Th className="text-right">
                          <span className="sr-only">Acciones</span>
                        </Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-regla/70">
                      {datos.pagos.map((x) => (
                        <tr key={x.id} className={x.anulado ? 'text-suave' : ''}>
                          <td className={`whitespace-nowrap px-4 py-2 ${x.anulado ? 'line-through' : ''}`}>{fechaCorta(x.fecha)}</td>
                          <td className="px-4 py-2 capitalize">
                            <span className={x.anulado ? 'line-through' : ''}>{x.metodo}</span>
                            {x.anulado && <span className="ml-2 text-xs normal-case text-suave">anulado</span>}
                          </td>
                          <td className="px-4 py-2">{x.observacion}</td>
                          <td className={`num px-4 py-2 text-right ${x.anulado ? 'line-through' : ''}`}>{soles(x.monto)}</td>
                          <td className="px-4 py-2 text-right">
                            {!x.anulado && (
                              <Boton
                                variante="texto"
                                onClick={() =>
                                  anular('pagos', x.id, `¿Anular este pago de ${soles(x.monto)}? La deuda volverá a subir.`)
                                }
                              >
                                Anular
                              </Boton>
                            )}
                          </td>
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
