import { useEffect, useState } from 'react';
import { supabase, configurado } from './lib/supabase';
import { Boton, Cargando } from './components/ui';
import Login from './pages/Login';
import Cuentas from './pages/Cuentas';
import Consumo from './pages/Consumo';
import Salones from './pages/Salones';
import Profesores from './pages/Profesores';
import Productos from './pages/Productos';
import ErrorBoundary from './components/ErrorBoundary';

const PAGINAS = [
  { id: 'cuentas', nombre: 'Estados de cuenta', Componente: Cuentas },
  { id: 'consumo', nombre: 'Registrar consumo', Componente: Consumo },
  { id: 'salones', nombre: 'Salones', Componente: Salones },
  { id: 'profesores', nombre: 'Profesores', Componente: Profesores },
  { id: 'productos', nombre: 'Productos', Componente: Productos },
];

function Centrado({ children }) {
  return <div className="flex min-h-screen items-center justify-center bg-papel p-6">{children}</div>;
}

export default function App() {
  const [sesion, setSesion] = useState(undefined); // undefined = cargando, null = sin sesión
  const [rol, setRol] = useState(undefined);
  const [pagina, setPagina] = useState('cuentas');

  useEffect(() => {
    if (!configurado) return undefined;
    supabase.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSesion(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // El rol se consulta aparte: no se hacen consultas dentro del callback de autenticación
  const usuarioId = sesion?.user?.id;
  useEffect(() => {
    if (!usuarioId) {
      setRol(undefined);
      return undefined;
    }
    let vivo = true;
    supabase
      .from('usuarios_acceso')
      .select('rol')
      .eq('auth_user_id', usuarioId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (vivo) setRol(error ? 'error' : data?.rol ?? 'ninguno');
      });
    return () => {
      vivo = false;
    };
  }, [usuarioId]);

  const salir = () => supabase.auth.signOut();

  if (!configurado) {
    return (
      <Centrado>
        <div className="max-w-md rounded-lg border border-regla bg-white p-6">
          <h1 className="font-titulo text-xl font-bold text-tinta">Falta configurar Supabase</h1>
          <p className="mt-2 text-sm text-suave">
            Copia el archivo <code className="rounded bg-papel px-1">.env.example</code> como{' '}
            <code className="rounded bg-papel px-1">.env</code>, completa la URL y la clave anon de tu proyecto y
            reinicia con <code className="rounded bg-papel px-1">npm run dev</code>.
          </p>
        </div>
      </Centrado>
    );
  }

  if (sesion === undefined || (sesion && rol === undefined)) {
    return (
      <Centrado>
        <Cargando />
      </Centrado>
    );
  }

  if (!sesion) return <Login />;

  if (rol !== 'admin') {
    return (
      <Centrado>
        <div className="max-w-md rounded-lg border border-regla bg-white p-6">
          <h1 className="font-titulo text-xl font-bold text-tinta">Esta cuenta no tiene acceso al panel</h1>
          <p className="mt-2 text-sm text-suave">
            {rol === 'error'
              ? 'No se pudo comprobar tu rol. Revisa tu conexión y las políticas de la tabla usuarios_acceso.'
              : 'Tu usuario existe, pero no está registrado como administrador en usuarios_acceso.'}
          </p>
          <Boton className="mt-4" onClick={salir}>
            Cerrar sesión
          </Boton>
        </div>
      </Centrado>
    );
  }

  const actual = PAGINAS.find((p) => p.id === pagina) ?? PAGINAS[0];
  const Pagina = actual.Componente;

  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-tinta text-white md:sticky md:top-0 md:h-screen md:w-60 md:flex-shrink-0 md:flex md:flex-col">
        <div className="flex items-center justify-between px-5 py-4 md:block md:py-6">
          <p className="font-titulo text-lg font-bold leading-tight">Librería escolar</p>
          <button
            type="button"
            onClick={salir}
            className="text-sm text-white/70 hover:text-white md:hidden"
          >
            Cerrar sesión
          </button>
        </div>
        <nav aria-label="Secciones" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible md:pb-0">
          {PAGINAS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPagina(p.id)}
              aria-current={p.id === actual.id ? 'page' : undefined}
              className={`whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                p.id === actual.id ? 'bg-white text-tinta' : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              {p.nombre}
            </button>
          ))}
        </nav>
        <div className="hidden border-t border-white/15 px-5 py-4 md:block">
          <p className="truncate text-xs text-white/70">{sesion.user.email}</p>
          <button type="button" onClick={salir} className="mt-1 text-sm font-medium text-white hover:underline">
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-5xl">
          <ErrorBoundary key={actual.id}>
            <Pagina />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
