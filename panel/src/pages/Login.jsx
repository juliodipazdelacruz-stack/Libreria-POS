import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Alerta, Boton, Campo, claseInput } from '../components/ui';

export default function Login() {
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [entrando, setEntrando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setError('');
    setEntrando(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave });
    setEntrando(false);
    if (err) {
      setError(
        /invalid login credentials/i.test(err.message)
          ? 'Correo o contraseña incorrectos.'
          : 'No se pudo iniciar sesión. Revisa tu conexión e inténtalo de nuevo.'
      );
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-papel p-6">
      <div className="w-full max-w-sm">
        <h1 className="font-titulo text-3xl font-bold text-tinta">Panel de la librería</h1>
        <p className="mt-1 text-sm text-suave">Inicia sesión para ver las cuentas de salones y profesores.</p>
        <form onSubmit={entrar} className="mt-6 space-y-4 rounded-lg border border-regla bg-white p-5">
          <Campo etiqueta="Correo">
            <input
              type="email"
              required
              autoComplete="email"
              className={claseInput}
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Contraseña">
            <input
              type="password"
              required
              autoComplete="current-password"
              className={claseInput}
              value={clave}
              onChange={(e) => setClave(e.target.value)}
            />
          </Campo>
          <Alerta>{error}</Alerta>
          <Boton type="submit" className="w-full" disabled={entrando}>
            {entrando ? 'Entrando…' : 'Iniciar sesión'}
          </Boton>
        </form>
      </div>
    </div>
  );
}
