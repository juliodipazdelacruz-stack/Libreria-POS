import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { filtrarGrupos } from '../lib/busqueda';
import { claseInput } from './ui';

/**
 * Campo con búsqueda para elegir una opción entre muchas (reemplaza a la lista desplegable).
 * Escribe para filtrar; ↑ ↓ para moverte; Enter para elegir; Esc para cerrar.
 * grupos: [{ titulo, opciones: [{ valor, etiqueta, detalle, texto }] }]
 */
export default function Combobox({ etiqueta, grupos, valor, onCambio, placeholder = 'Buscar…', vacio = 'Sin resultados' }) {
  const id = useId();
  const contenedor = useRef(null);
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [escribiendo, setEscribiendo] = useState(false);
  const [activo, setActivo] = useState(0);

  const elegida = useMemo(
    () => grupos.flatMap((g) => g.opciones).find((o) => o.valor === valor),
    [grupos, valor]
  );
  const filtrados = useMemo(() => filtrarGrupos(grupos, escribiendo ? consulta : ''), [grupos, consulta, escribiendo]);
  const planas = useMemo(() => filtrados.flatMap((g) => g.opciones), [filtrados]);
  const indice = Math.max(0, Math.min(activo, planas.length - 1));

  function cerrar() {
    setAbierto(false);
    setEscribiendo(false);
    setConsulta('');
  }

  function elegir(opcion) {
    onCambio(opcion.valor);
    cerrar();
  }

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => {
      if (contenedor.current && !contenedor.current.contains(e.target)) cerrar();
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  // Mantener visible la opción marcada al moverse con el teclado
  useEffect(() => {
    if (abierto) document.getElementById(`${id}-op-${indice}`)?.scrollIntoView({ block: 'nearest' });
  }, [abierto, indice, id]);

  function alTeclear(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!abierto) setAbierto(true);
      else setActivo(Math.min(indice + 1, planas.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo(Math.max(indice - 1, 0));
    } else if (e.key === 'Enter') {
      if (abierto && planas[indice]) {
        e.preventDefault();
        elegir(planas[indice]);
      }
    } else if (e.key === 'Escape' && abierto) {
      e.preventDefault();
      cerrar();
    }
  }

  const textoCampo = escribiendo ? consulta : elegida ? elegida.texto ?? elegida.etiqueta : '';
  let n = 0;

  return (
    <div ref={contenedor} className="relative">
      <label htmlFor={`${id}-campo`} className="mb-1 block text-sm font-medium text-texto">
        {etiqueta}
      </label>
      <div className="relative">
        <input
          id={`${id}-campo`}
          role="combobox"
          aria-expanded={abierto}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          aria-activedescendant={abierto && planas[indice] ? `${id}-op-${indice}` : undefined}
          autoComplete="off"
          className={`${claseInput} pr-16`}
          placeholder={placeholder}
          value={textoCampo}
          onFocus={(e) => {
            setAbierto(true);
            e.target.select(); // lo que escribas reemplaza la selección actual
          }}
          onClick={() => setAbierto(true)}
          onChange={(e) => {
            setConsulta(e.target.value);
            setEscribiendo(true);
            setAbierto(true);
            setActivo(0);
          }}
          onKeyDown={alTeclear}
        />
        {valor && !escribiendo && (
          <button
            type="button"
            aria-label="Quitar selección"
            onClick={() => {
              onCambio('');
              cerrar();
            }}
            className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-1 text-suave hover:bg-papel hover:text-texto"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 3l8 8M11 3L3 11" />
            </svg>
          </button>
        )}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-suave"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 4l4 4 4-4" />
        </svg>
      </div>

      {abierto && (
        <div
          id={`${id}-lista`}
          role="listbox"
          aria-label={etiqueta}
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-regla bg-white py-1 shadow-lg"
        >
          {planas.length === 0 ? (
            <p className="px-3 py-2 text-sm text-suave">{vacio}</p>
          ) : (
            filtrados.map((g) => (
              <div key={g.titulo} role="group" aria-label={g.titulo}>
                <p aria-hidden="true" className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-suave">
                  {g.titulo}
                </p>
                {g.opciones.map((o) => {
                  const i = n++;
                  const marcada = i === indice;
                  return (
                    <div
                      key={o.valor}
                      id={`${id}-op-${i}`}
                      role="option"
                      aria-selected={o.valor === valor}
                      onMouseDown={(e) => {
                        e.preventDefault(); // el campo no pierde el foco antes de elegir
                        elegir(o);
                      }}
                      onMouseEnter={() => setActivo(i)}
                      className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                        marcada ? 'bg-tinta text-white' : 'text-texto'
                      }`}
                    >
                      <span className="font-medium">{o.etiqueta}</span>
                      {o.detalle && <span className={marcada ? 'text-white/80' : 'text-suave'}>{o.detalle}</span>}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
