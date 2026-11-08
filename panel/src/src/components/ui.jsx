import { useCallback, useEffect, useRef, useState } from 'react';
import { redondear, soles } from '../lib/format';

export const claseInput =
  'w-full rounded-md border border-regla bg-white px-3 py-2 text-sm text-texto placeholder:text-suave/70 ' +
  'focus:border-tinta focus:outline-none focus:ring-2 focus:ring-tinta/20 disabled:bg-papel disabled:text-suave';

export function Boton({ variante = 'primario', className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium ' +
    'transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const variantes = {
    primario: 'bg-tinta text-white hover:bg-tinta-oscuro',
    secundario: 'border border-regla bg-white text-texto hover:bg-papel',
    peligro: 'border border-deuda/30 bg-white text-deuda hover:bg-deuda/5',
    texto: 'text-tinta hover:bg-tinta/5',
  };
  return <button type="button" className={`${base} ${variantes[variante]} ${className}`} {...props} />;
}

export function Campo({ etiqueta, ayuda, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-texto">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-suave">{ayuda}</span>}
    </label>
  );
}

export function Modal({ titulo, onCerrar, children, ancho = 'max-w-lg' }) {
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && cerrar.current();
    document.addEventListener('keydown', f);
    return () => document.removeEventListener('keydown', f);
  }, []);
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-tinta-oscuro/50 p-4 sm:p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div role="dialog" aria-modal="true" aria-label={titulo} className={`w-full ${ancho} rounded-lg bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-regla px-5 py-4">
          <h2 className="font-titulo text-lg font-semibold text-tinta">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded p-1 text-suave hover:bg-papel hover:text-texto"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l10 10M14 4L4 14" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Alerta({ tipo = 'error', children }) {
  const estilos = {
    error: 'border-deuda/30 bg-deuda/5 text-deuda',
    aviso: 'border-resaltador bg-resaltador/25 text-texto',
    ok: 'border-aldia/30 bg-aldia/5 text-aldia',
  };
  if (!children) return null;
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-sm ${estilos[tipo]}`}>
      {children}
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }) {
  return <p className="py-10 text-center text-sm text-suave">{texto}</p>;
}

export function Vacio({ titulo, children }) {
  return (
    <div className="rounded-lg border border-dashed border-regla bg-white px-6 py-10 text-center">
      <p className="font-titulo text-base font-semibold text-tinta">{titulo}</p>
      {children && <div className="mt-2 text-sm text-suave">{children}</div>}
    </div>
  );
}

export function Estado({ activo }) {
  return activo ? (
    <span className="rounded-full bg-aldia/10 px-2 py-0.5 text-xs font-medium text-aldia">Activo</span>
  ) : (
    <span className="rounded-full bg-suave/10 px-2 py-0.5 text-xs font-medium text-suave">Inactivo</span>
  );
}

/** El marcador amarillo se usa solo para lo que se debe. */
export function ChipSaldo({ saldo }) {
  const v = redondear(saldo);
  if (v > 0) {
    return <span className="num whitespace-nowrap rounded bg-resaltador px-2 py-0.5 text-sm font-semibold text-texto">Debe {soles(v)}</span>;
  }
  if (v < 0) {
    return <span className="num whitespace-nowrap text-sm font-medium text-aldia">A favor {soles(-v)}</span>;
  }
  return <span className="whitespace-nowrap text-sm font-medium text-aldia">Al día</span>;
}

export function useAviso() {
  const [aviso, setAviso] = useState('');
  const temporizador = useRef();
  const mostrar = useCallback((texto) => {
    setAviso(texto);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setAviso(''), 4000);
  }, []);
  useEffect(() => () => clearTimeout(temporizador.current), []);
  return [aviso, mostrar];
}

export function Th({ children, className = '' }) {
  return <th className={`px-4 py-2.5 font-medium ${className}`}>{children}</th>;
}

export function Tabla({ children }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-regla bg-white">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}
