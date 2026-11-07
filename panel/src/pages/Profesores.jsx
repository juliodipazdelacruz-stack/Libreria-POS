import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { mensajeError, quitarTildes } from '../lib/format';
import { ordenarSalones } from '../lib/claveSalon';
import { Alerta, Boton, Campo, Cargando, Estado, Modal, Tabla, Th, Vacio, claseInput, useAviso } from '../components/ui';

// La clave foránea vive en salones.profesor_id: asignar un salón es actualizar esa tabla.
async function asignarSalon(profesorId, salonId) {
  let liberar = supabase.from('salones').update({ profesor_id: null }).eq('profesor_id', profesorId);
  if (salonId) liberar = liberar.neq('id', salonId);
  const a = await liberar;
  if (a.error) throw a.error;
  if (salonId) {
    const b = await supabase.from('salones').update({ profesor_id: profesorId }).eq('id', salonId);
    if (b.error) throw b.error;
  }
}

export default function Profesores() {
  const [profesores, setProfesores] = useState(null);
  const [salones, setSalones] = useState([]);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState(null);
  const [aviso, mostrarAviso] = useAviso();

  const cargar = useCallback(async () => {
    const [p, s] = await Promise.all([
      supabase.from('profesores').select('id, nombre, telefono, activo').order('nombre'),
      supabase.from('salones').select('id, grado, seccion, profesor_id'),
    ]);
    if (p.error || s.error) {
      setError(mensajeError(p.error || s.error));
      setProfesores([]);
      return;
    }
    setError('');
    setProfesores(p.data);
    setSalones(ordenarSalones(s.data));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const salonDe = useCallback((id) => salones.find((s) => s.profesor_id === id), [salones]);

  const visibles = useMemo(() => {
    if (!profesores) return [];
    const q = quitarTildes(busqueda).trim();
    if (!q) return profesores;
    return profesores.filter((p) => {
      const s = salonDe(p.id);
      return quitarTildes(`${p.nombre} ${p.telefono ?? ''} ${s ? `${s.grado} ${s.seccion}` : ''}`).includes(q);
    });
  }, [profesores, busqueda, salonDe]);

  async function alternarActivo(p) {
    const salon = salonDe(p.id);
    if (p.activo && salon) {
      const ok = window.confirm(
        `${p.nombre} quedará sin salón (${salon.grado} ${salon.seccion}). Su cuenta personal y su historial se conservan. ¿Desactivar?`
      );
      if (!ok) return;
    }
    try {
      if (p.activo && salon) await asignarSalon(p.id, null);
      const { error: err } = await supabase.from('profesores').update({ activo: !p.activo }).eq('id', p.id);
      if (err) throw err;
      mostrarAviso(p.activo ? 'Profesor desactivado.' : 'Profesor activado.');
    } catch (err) {
      setError(mensajeError(err));
    }
    cargar();
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-titulo text-2xl font-bold text-tinta">Profesores</h1>
          <p className="mt-1 text-sm text-suave">Cada profesor tiene una cuenta personal y un único salón asignado.</p>
        </div>
        <Boton onClick={() => setEditando({})}>Nuevo profesor</Boton>
      </div>

      <div className="mt-5">
        <input
          type="search"
          placeholder="Buscar por nombre, teléfono o salón"
          aria-label="Buscar"
          className={`${claseInput} max-w-xs`}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div className="mt-4 space-y-4">
        <Alerta tipo="ok">{aviso}</Alerta>
        <Alerta>{error}</Alerta>
        {profesores === null ? (
          <Cargando />
        ) : visibles.length === 0 ? (
          <Vacio titulo={busqueda ? 'Ningún profesor coincide con la búsqueda' : 'Todavía no hay profesores'}>
            {!busqueda && 'Usa “Nuevo profesor” para registrar el primero.'}
          </Vacio>
        ) : (
          <Tabla>
            <thead className="border-b border-regla bg-papel text-suave">
              <tr>
                <Th>Nombre</Th>
                <Th>Teléfono</Th>
                <Th>Salón</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-regla/70">
              {visibles.map((p) => {
                const s = salonDe(p.id);
                return (
                  <tr key={p.id} className={p.activo ? '' : 'text-suave'}>
                    <td className="px-4 py-3 font-medium text-tinta">{p.nombre}</td>
                    <td className="num px-4 py-3">{p.telefono || <span className="text-suave">—</span>}</td>
                    <td className="px-4 py-3">{s ? `${s.grado} ${s.seccion}` : <span className="text-suave">Sin salón</span>}</td>
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
        <FormProfesor
          profesor={editando.id ? editando : null}
          salonActual={editando.id ? salonDe(editando.id) : null}
          salones={salones}
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

function FormProfesor({ profesor, salonActual, salones, onGuardado, onCerrar }) {
  const [nombre, setNombre] = useState(profesor?.nombre ?? '');
  const [telefono, setTelefono] = useState(profesor?.telefono ?? '');
  const [salonId, setSalonId] = useState(salonActual?.id ?? '');
  const [activo, setActivo] = useState(profesor?.activo ?? true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Salones sin profesor, más el salón actual de este profesor
  const opciones = salones.filter((s) => !s.profesor_id || s.id === salonActual?.id);

  async function guardar(e) {
    e.preventDefault();
    setError('');
    const n = nombre.trim();
    if (!n) return setError('Escribe el nombre del profesor.');
    const datos = { nombre: n, telefono: telefono.trim() || null };

    setGuardando(true);
    try {
      let id = profesor?.id;
      if (id) {
        const r = await supabase.from('profesores').update({ ...datos, activo }).eq('id', id);
        if (r.error) throw r.error;
      } else {
        const r = await supabase.from('profesores').insert(datos).select('id').single();
        if (r.error) throw r.error;
        id = r.data.id;
      }
      // Un profesor inactivo no mantiene salón
      await asignarSalon(id, activo && salonId ? salonId : null);
      onGuardado(profesor ? 'Profesor actualizado.' : 'Profesor creado.');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal titulo={profesor ? 'Editar profesor' : 'Nuevo profesor'} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="space-y-4">
        <Campo etiqueta="Nombre completo">
          <input className={claseInput} value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </Campo>
        <Campo etiqueta="Teléfono" ayuda="Opcional.">
          <input className={claseInput} value={telefono} maxLength={20} inputMode="tel" onChange={(e) => setTelefono(e.target.value)} />
        </Campo>
        <Campo etiqueta="Salón asignado" ayuda="Solo aparecen salones que todavía no tienen profesor.">
          <select className={claseInput} value={salonId} disabled={!activo} onChange={(e) => setSalonId(e.target.value)}>
            <option value="">Sin salón</option>
            {opciones.map((s) => (
              <option key={s.id} value={s.id}>
                {s.grado} {s.seccion}
              </option>
            ))}
          </select>
        </Campo>
        {profesor && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Profesor activo
          </label>
        )}
        <Alerta>{error}</Alerta>
        <div className="flex justify-end gap-2 pt-1">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar profesor'}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
