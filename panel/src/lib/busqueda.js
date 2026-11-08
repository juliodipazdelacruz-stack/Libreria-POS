import { quitarTildes } from './format';

/**
 * Filtra grupos de opciones por texto. No distingue tildes ni mayúsculas, y todas las palabras
 * escritas deben aparecer: "maria 5to" encuentra "María Rojas (5to C)".
 * grupos: [{ titulo, opciones: [{ valor, etiqueta, detalle }] }]
 */
export function filtrarGrupos(grupos, consulta) {
  const palabras = quitarTildes(consulta).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return grupos.filter((g) => g.opciones.length > 0);
  return grupos
    .map((g) => ({
      ...g,
      opciones: g.opciones.filter((o) => {
        const texto = quitarTildes(`${o.etiqueta} ${o.detalle ?? ''}`);
        return palabras.every((p) => texto.includes(p));
      }),
    }))
    .filter((g) => g.opciones.length > 0);
}
