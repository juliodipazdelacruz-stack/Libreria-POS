import { redondear } from './format';

/** Convierte las líneas del formulario en productos y cantidades válidos. */
export function validarLineas(lineas, productos) {
  const usadas = lineas.filter((l) => l.productoId);
  if (usadas.length === 0) return { error: 'Agrega al menos un producto.' };
  const items = [];
  for (const l of usadas) {
    const producto = productos.find((p) => p.id === l.productoId);
    if (!producto) return { error: 'Un producto ya no está disponible. Revisa las líneas.' };
    const texto = String(l.cantidad).trim();
    const cantidad = Number(texto);
    if (!/^\d+$/.test(texto) || cantidad < 1 || cantidad > 100000) {
      return { error: `La cantidad de “${producto.nombre}” debe ser un número entero mayor que 0.` };
    }
    items.push({ producto, cantidad });
  }
  return { items };
}

export const subtotal = (item) => redondear(item.cantidad * item.producto.precio);
export const totalItems = (items) => redondear(items.reduce((acc, i) => acc + subtotal(i), 0));

/** Una fila por producto; la cuenta destino es el salón o el profesor, nunca ambos. */
export function filasConsumo(items, tipo, cuentaId) {
  return items.map((i) => ({
    producto_id: i.producto.id,
    cantidad: i.cantidad,
    precio_unitario: i.producto.precio,
    total: subtotal(i),
    salon_id: tipo === 'salon' ? cuentaId : null,
    profesor_id: tipo === 'profesor' ? cuentaId : null,
    origen: 'web',
  }));
}

const MAX_CANTIDAD = 100000;
const aNumero = (t) => parseInt(t, 10) || 0;

/** Pulsar un producto de la lista: lo agrega con 1 unidad, o suma 1 si ya estaba. */
export function agregarLinea(lineas, productoId) {
  if (!lineas.some((l) => l.productoId === productoId)) return [...lineas, { productoId, cantidad: '1' }];
  return sumarCantidad(lineas, productoId, 1);
}

/** Botones − y +: la cantidad nunca baja de 1. */
export function sumarCantidad(lineas, productoId, delta) {
  return lineas.map((l) =>
    l.productoId === productoId
      ? { ...l, cantidad: String(Math.min(Math.max(aNumero(l.cantidad) + delta, 1), MAX_CANTIDAD)) }
      : l
  );
}

export const fijarCantidad = (lineas, productoId, cantidad) =>
  lineas.map((l) => (l.productoId === productoId ? { ...l, cantidad } : l));

export const quitarLinea = (lineas, productoId) => lineas.filter((l) => l.productoId !== productoId);
