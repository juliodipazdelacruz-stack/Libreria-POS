import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { mensajeError, quitarTildes } from '../lib/format';
import { claveSalon, ordenarSalones } from '../lib/claveSalon';
import { Alerta, Boton, Campo, Cargando, Estado, Modal, Tabla, Th, Vacio, claseInput, useAviso } from '../components/ui';

export default function Salones() {
  const [salones, setSalones] = useState(null);
  const [profesores, setProfesores] = useState([]);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState(null); // null = cerrado, {} = nuevo, objeto = editar
  const [aviso, mostrarAviso] = useAviso();

  const cargar = useCallback(async () => {
    const [s, p] = await Promise.all([
      supabase.from('salones').select('id, grado, seccion, activo, profesor_id, profesores(nombre)'),
      supabase.from('profesores').select('id, nombre, activo').order('nombre'),
    ]);
    if (s.error || p.error) {
      setError(mensajeError(s.error || p.error));
      setSalones([]);
      return;
    }
    setError('');
    setSalones(ordenarSalones(s.data));
    setProfesores(p.data);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    if (!salones) return [];
    const q = quitarTildes(busqueda).trim();
    if (!q) return salones;
    return salones.filter((s) => quitarTildes(`${s.grado} ${s.seccion} ${s.profesores?.nombre ?? ''}`).includes(q));
  }, [salones, busqueda]);

  async function alternarActivo(s) {
    const { error: err } = await supabase.from('salones').update({ activo: !s.activo }).eq('id', s.id);
    if (err) return setError(mensajeError(err));
    mostrarAviso(s.activo ? 'Salón desactivado.' : 'Salón activado.');
    cargar();
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-titulo text-2xl font-bold text-tinta">Salones</h1>
          <p className="mt-1 text-sm text-suave">Cada salón tiene un profesor asignado y su propia cuenta.</p>
        </div>
        <Boton onClick={() => setEditando({})}>Nuevo salón</Boton>
      </div>

      <div className="mt-5">
        <input
          type="search"
          placeholder="Buscar salón o profesor"
          aria-label="Buscar"
          className={`${claseInput} max-w-xs`}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div className="mt-4 space-y-4">
        <Alerta tipo="ok">{aviso}</Alerta>
        <Alerta>{error}</Alerta>
        {salones === null ? (
          <Cargando />
        ) : visibles.length === 0 ? (
          <Vacio titulo={busqueda ? 'Ningún salón coincide con la búsqueda' : 'Todavía no hay salones'}>
            {!busqueda && 'Usa “Nuevo salón” para registrar el primero.'}
          </Vacio>
        ) : (
          <Tabla>
            <thead className="border-b border-regla bg-papel text-suave">
              <tr>
                <Th>Salón</Th>
                <Th>Profesor</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-regla/70">
              {visibles.map((s) => (
                <tr key={s.id} className={s.activo ? '' : 'text-suave'}>
                  <td className="px-4 py-3 font-medium text-tinta">
                    {s.grado} {s.seccion}
                  </td>
                  <td className="px-4 py-3">{s.profesores?.nombre ?? <span className="text-suave">Sin profesor</span>}</td>
                  <td className="px-4 py-3">
                    <Estado activo={s.activo} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Boton variante="texto" onClick={() => setEditando(s)}>
                        Editar
                      </Boton>
                      <Boton variante="texto" onClick={() => alternarActivo(s)}>
                        {s.activo ? 'Desactivar' : 'Activar'}
                      </Boton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </div>

      {editando && (
        <FormSalon
          salon={editando.id ? editando : null}
          salones={salones ?? []}
          profesores={profesores}
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

function FormSalon({ salon, salones, profesores, onGuardado, onCerrar }) {
  const [grado, setGrado] = useState(salon?.grado ?? '');
  const [seccion, setSeccion] = useState(salon?.seccion ?? '');
  const [profesorId, setProfesorId] = useState(salon?.profesor_id ?? '');
  const [activo, setActivo] = useState(salon?.activo ?? true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Profesores activos que aún no tienen salón, más el profesor actual de este salón
  const opciones = profesores.filter((p) => {
    const ocupado = salones.some((s) => s.profesor_id === p.id && s.id !== salon?.id);
    return (p.activo && !ocupado) || p.id === salon?.profesor_id;
  });

  const clave = claveSalon(`${grado} ${seccion}`);
  const sinReconocer = grado.trim() && seccion.trim() && !clave;

  async function guardar(e) {
    e.preventDefault();
    setError('');
    const g = grado.trim();
    const sec = seccion.trim().toUpperCase();
    if (!g || !sec) return setError('Escribe el grado y la sección.');

    const nuevaClave = claveSalon(`${g} ${sec}`) ?? `${g} ${sec}`.toLowerCase();
    const repetido = salones.some(
      (s) => s.id !== salon?.id && (claveSalon(`${s.grado} ${s.seccion}`) ?? `${s.grado} ${s.seccion}`.toLowerCase()) === nuevaClave
    );
    if (repetido) return setError('Ya existe un salón con ese grado y sección.');

    const datos = { grado: g, seccion: sec, profesor_id: profesorId || null };
    setGuardando(true);
    const r = salon
      ? await supabase.from('salones').update({ ...datos, activo }).eq('id', salon.id)
      : await supabase.from('salones').insert(datos);
    setGuardando(false);
    if (r.error) {
      return setError(
        r.error.code === '23505' ? 'Ese profesor ya está asignado a otro salón, o el salón ya existe.' : mensajeError(r.error)
      );
    }
    onGuardado(salon ? 'Salón actualizado.' : 'Salón creado.');
  }

  return (
    <Modal titulo={salon ? 'Editar salón' : 'Nuevo salón'} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Grado" ayuda="Por ejemplo 5to o Quinto.">
            <input className={claseInput} value={grado} onChange={(e) => setGrado(e.target.value)} autoFocus />
          </Campo>
          <Campo etiqueta="Sección" ayuda="Por ejemplo C.">
            <input className={claseInput} value={seccion} maxLength={10} onChange={(e) => setSeccion(e.target.value)} />
          </Campo>
        </div>
        {sinReconocer && (
          <Alerta tipo="aviso">
            El bot no podrá reconocer este salón al dictarlo. Usa un grado con número o nombre, como 5to o Quinto.
          </Alerta>
        )}
        <Campo etiqueta="Profesor asignado" ayuda="Solo aparecen profesores activos que todavía no tienen salón.">
          <select className={claseInput} value={profesorId} onChange={(e) => setProfesorId(e.target.value)}>
            <option value="">Sin profesor</option>
            {opciones.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.activo ? '' : ' (inactivo)'}
              </option>
            ))}
          </select>
        </Campo>
        {salon && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Salón activo
          </label>
        )}
        <Alerta>{error}</Alerta>
        <div className="flex justify-end gap-2 pt-1">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar salón'}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
