import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fechaDia, mensajeError, quitarTildes, redondear, soles } from '../lib/format';
import { Alerta, Boton, Campo, Cargando, Estado, Modal, Tabla, Th, Vacio, claseInput, useAviso } from '../components/ui';

const precioVigente = (p) => p.precios?.find((x) => x.activo);
const etiqueta = (p) => `${p.nombre}${p.variante ? ` ${p.variante}` : ''}`;

export default function Productos() {
  const [productos, setProductos] = useState(null);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState(null);
  const [aviso, mostrarAviso] = useAviso();

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('productos')
      .select('id, nombre, variante, aliases, activo, precios(id, precio, activo, fecha_desde)')
      .order('nombre')
      .order('variante');
    if (err) {
      setError(mensajeError(err));
      setProductos([]);
      return;
    }
    setError('');
    setProductos(data);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    if (!productos) return [];
    const q = quitarTildes(busqueda).trim();
    if (!q) return productos;
    return productos.filter((p) => quitarTildes(`${etiqueta(p)} ${(p.aliases ?? []).join(' ')}`).includes(q));
  }, [productos, busqueda]);

  async function alternarActivo(p) {
    const { error: err } = await supabase.from('productos').update({ activo: !p.activo }).eq('id', p.id);
    if (err) return setError(mensajeError(err));
    mostrarAviso(p.activo ? 'Producto desactivado. El bot ya no lo ofrecerá.' : 'Producto activado.');
    cargar();
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-titulo text-2xl font-bold text-tinta">Productos</h1>
          <p className="mt-1 text-sm text-suave">Los nombres alternativos ayudan al bot a entender cómo pides cada producto.</p>
        </div>
        <Boton onClick={() => setEditando({})}>Nuevo producto</Boton>
      </div>

      <div className="mt-5">
        <input
          type="search"
          placeholder="Buscar producto"
          aria-label="Buscar"
          className={`${claseInput} max-w-xs`}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div className="mt-4 space-y-4">
        <Alerta tipo="ok">{aviso}</Alerta>
        <Alerta>{error}</Alerta>
        {productos === null ? (
          <Cargando />
        ) : visibles.length === 0 ? (
          <Vacio titulo={busqueda ? 'Ningún producto coincide con la búsqueda' : 'Todavía no hay productos'}>
            {!busqueda && 'Usa “Nuevo producto” para registrar el primero con su precio.'}
          </Vacio>
        ) : (
          <Tabla>
            <thead className="border-b border-regla bg-papel text-suave">
              <tr>
                <Th>Producto</Th>
                <Th>Nombres alternativos</Th>
                <Th className="text-right">Precio</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-regla/70">
              {visibles.map((p) => {
                const v = precioVigente(p);
                return (
                  <tr key={p.id} className={p.activo ? '' : 'text-suave'}>
                    <td className="px-4 py-3 font-medium text-tinta">{etiqueta(p)}</td>
                    <td className="max-w-xs px-4 py-3 text-suave">
                      {(p.aliases ?? []).length ? p.aliases.join(', ') : '—'}
                    </td>
                    <td className="num px-4 py-3 text-right">
                      {v ? soles(v.precio) : <span className="rounded bg-resaltador px-1.5 py-0.5 text-xs font-medium text-texto">Sin precio</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Estado activo={p.activo} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Boton variante="texto" onClick={() => setEditando(p)}>
                          Editar
                        </Boton>
                        <Boton variante="texto" onClick={() => alternarActivo(p)}>
                          {p.activo ? 'Desactivar' : 'Activar'}
                        </Boton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
        )}
      </div>

      {editando && (
        <FormProducto
          producto={editando.id ? editando : null}
          onCerrar={() => setEditando(null)}
          onGuardado={(msg) => {
            setEditando(null);
            mostrarAviso(msg);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function FormProducto({ producto, onGuardado, onCerrar }) {
  const actual = producto ? precioVigente(producto) : null;
  const idRef = useRef(producto?.id ?? null); // evita crear el producto dos veces si falla el precio
  const [nombre, setNombre] = useState(producto?.nombre ?? '');
  const [variante, setVariante] = useState(producto?.variante ?? '');
  const [aliases, setAliases] = useState((producto?.aliases ?? []).join(', '));
  const [precio, setPrecio] = useState(actual ? String(actual.precio) : '');
  const [activo, setActivo] = useState(producto?.activo ?? true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const historial = [...(producto?.precios ?? [])].sort((a, b) => new Date(b.fecha_desde) - new Date(a.fecha_desde));

  async function guardar(e) {
    e.preventDefault();
    setError('');
    const n = nombre.trim();
    const precioNum = redondear(precio);
    if (!n) return setError('Escribe el nombre del producto.');
    if (precio === '' || !Number.isFinite(Number(precio)) || Number(precio) < 0) {
      return setError('Escribe un precio válido, por ejemplo 0.10.');
    }
    const lista = [...new Set(aliases.split(/[,\n]/).map((a) => a.trim().toLowerCase()).filter(Boolean))];
    const datos = { nombre: n, variante: variante.trim() || null, aliases: lista };

    setGuardando(true);
    try {
      if (idRef.current) {
        const r = await supabase.from('productos').update({ ...datos, activo }).eq('id', idRef.current);
        if (r.error) throw r.error;
      } else {
        const r = await supabase.from('productos').insert(datos).select('id').single();
        if (r.error) throw r.error;
        idRef.current = r.data.id;
      }

      // Si cambió el precio, el anterior queda en el historial y se crea el nuevo vigente
      if (!actual || Number(actual.precio) !== precioNum) {
        if (actual) {
          const d = await supabase.from('precios').update({ activo: false }).eq('producto_id', idRef.current).eq('activo', true);
          if (d.error) throw d.error;
        }
        const i = await supabase.from('precios').insert({ producto_id: idRef.current, precio: precioNum, activo: true });
        if (i.error) throw i.error;
      }
      onGuardado(producto ? 'Producto actualizado.' : 'Producto creado.');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal titulo={producto ? 'Editar producto' : 'Nuevo producto'} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Nombre">
            <input className={claseInput} value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
          </Campo>
          <Campo etiqueta="Variante" ayuda="Opcional. Ej. B/N, Color, A4.">
            <input className={claseInput} value={variante} onChange={(e) => setVariante(e.target.value)} />
          </Campo>
        </div>
        <Campo etiqueta="Precio (S/)" ayuda={producto ? 'Si lo cambias, el precio anterior queda en el historial.' : undefined}>
          <input
            className={`${claseInput} num`}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
          />
        </Campo>
        <Campo
          etiqueta="Nombres alternativos"
          ayuda="Sepáralos con comas. Ej. copias a color, copias color. Así el bot reconoce cómo lo pides."
        >
          <textarea className={claseInput} rows={2} value={aliases} onChange={(e) => setAliases(e.target.value)} />
        </Campo>
        {producto && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Producto activo
          </label>
        )}

        {historial.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-medium">Historial de precios</p>
            <ul className="divide-y divide-regla/70 rounded-md border border-regla text-sm">
              {historial.map((h) => (
                <li key={h.id} className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-suave">Desde {fechaDia(h.fecha_desde)}</span>
                  <span className="num">
                    {soles(h.precio)}
                    {h.activo && <span className="ml-2 rounded bg-aldia/10 px-1.5 text-xs font-medium text-aldia">vigente</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Alerta>{error}</Alerta>
        <div className="flex justify-end gap-2 pt-1">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar producto'}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
