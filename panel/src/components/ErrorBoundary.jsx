import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Error en la pantalla:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="rounded-lg border border-deuda/30 bg-white p-6">
        <h2 className="font-titulo text-lg font-semibold text-deuda">Algo salió mal en esta pantalla</h2>
        <p className="mt-2 text-sm text-suave">
          Puedes volver a intentarlo. Si el problema se repite, copia este mensaje y compártelo para corregirlo:
        </p>
        <pre className="mt-3 overflow-x-auto rounded bg-papel p-3 text-xs text-texto">{String(this.state.error?.message || this.state.error)}</pre>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-4 rounded-md bg-tinta px-3.5 py-2 text-sm font-medium text-white hover:bg-tinta-oscuro"
        >
          Reintentar
        </button>
      </div>
    );
  }
}
