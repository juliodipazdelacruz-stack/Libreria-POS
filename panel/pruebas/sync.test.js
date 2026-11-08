// Ejecutar con:  npm run test:sync
import assert from 'node:assert/strict';
import { crearMotor, fusionarFila } from '../src/lib/sync/motor.js';
import { crearLocalMemoria, crearRemotoMemoria } from './memoria.js';

const resultados = [];
async function prueba(nombre, fn) {
  try {
    await fn();
    resultados.push([true, nombre]);
  } catch (e) {
    resultados.push([false, nombre, e.message]);
  }
}

const consumo = (id, extra = {}) => ({
  id, producto_id: 'p1', cantidad: 10, precio_unitario: 0.1, total: 1, salon_id: 's1', profesor_id: null, origen: 'web', ...extra,
});
const dispositivo = (remoto, opciones = {}) => {
  const local = crearLocalMemoria();
  return { local, motor: crearMotor({ local, remoto, ...opciones }) };
};

await prueba('Sin internet: se puede registrar y nada se pierde', async () => {
  const remoto = crearRemotoMemoria();
  const { local, motor } = dispositivo(remoto);
  remoto.estado.caido = true;
  local.registrar('consumos', consumo('c1'));
  local.registrar('consumos', consumo('c2'));
  local.registrar('pagos', { id: 'g1', monto: 5, metodo: 'efectivo', salon_id: 's1', profesor_id: null });
  const r = await motor.sincronizar();
  assert.equal(r.ok, false);
  assert.equal(r.pendientes, 3);
  assert.equal(local.filas.consumos.size, 2);
});

await prueba('Al volver internet se sube todo y no quedan pendientes', async () => {
  const remoto = crearRemotoMemoria();
  const { local, motor } = dispositivo(remoto);
  local.registrar('consumos', consumo('c1'));
  local.registrar('pagos', { id: 'g1', monto: 5, metodo: 'efectivo', salon_id: 's1', profesor_id: null });
  const r = await motor.sincronizar();
  assert.equal(r.ok, true);
  assert.equal(r.pendientes, 0);
  assert.equal(remoto.tablas.consumos.size, 1);
  assert.equal(remoto.tablas.pagos.size, 1);
  assert.ok(local.meta.ultimaSync);
  assert.ok(local.meta.catalogo);
});

await prueba('Reintentar la subida no duplica registros', async () => {
  const remoto = crearRemotoMemoria();
  const { local, motor } = dispositivo(remoto);
  local.registrar('consumos', consumo('c1'));
  await motor.sincronizar();
  local.sucios.consumos.set('c1', 1); // como si el dispositivo se hubiera caído antes de anotar "subido"
  await motor.sincronizar();
  await motor.sincronizar();
  assert.equal(remoto.tablas.consumos.size, 1);
});

await prueba('Falla a mitad de la subida: lo subido queda, lo demás sigue pendiente y luego se completa', async () => {
  const remoto = crearRemotoMemoria();
  const { local, motor } = dispositivo(remoto, { tamanoLote: 2 });
  for (let i = 1; i <= 5; i++) local.registrar('consumos', consumo(`c${i}`));
  remoto.estado.fallarEnInsertNumero = 2; // el segundo lote falla
  const r1 = await motor.sincronizar();
  assert.equal(r1.ok, false);
  assert.equal(r1.pendientes, 3);
  assert.equal(remoto.tablas.consumos.size, 2);
  const r2 = await motor.sincronizar();
  assert.equal(r2.ok, true);
  assert.equal(r2.pendientes, 0);
  assert.equal(remoto.tablas.consumos.size, 5);
});

await prueba('Lo que entra por el bot aparece en el dispositivo, una sola vez', async () => {
  const remoto = crearRemotoMemoria();
  const { local, motor } = dispositivo(remoto);
  remoto.escribirDirecto('consumos', consumo('bot1', { origen: 'telegram' }));
  await motor.sincronizar();
  await motor.sincronizar();
  assert.equal(local.filas.consumos.size, 1);
  assert.equal(local.filas.consumos.get('bot1').origen, 'telegram');
  assert.equal(local.sucios.consumos.size, 0); // lo bajado no se vuelve a subir
});

await prueba('Dos dispositivos terminan con exactamente los mismos datos', async () => {
  const remoto = crearRemotoMemoria();
  const A = dispositivo(remoto);
  const B = dispositivo(remoto);
  A.local.registrar('consumos', consumo('a1'));
  B.local.registrar('consumos', consumo('b1', { salon_id: 's2' }));
  B.local.registrar('pagos', { id: 'bp1', monto: 3, metodo: 'efectivo', salon_id: 's2', profesor_id: null });
  await A.motor.sincronizar();
  await B.motor.sincronizar();
  await A.motor.sincronizar();
  const ids = (d, t) => [...d.local.filas[t].keys()].sort().join(',');
  assert.equal(ids(A, 'consumos'), 'a1,b1');
  assert.equal(ids(B, 'consumos'), 'a1,b1');
  assert.equal(ids(A, 'pagos'), 'bp1');
  assert.equal(ids(B, 'pagos'), 'bp1');
});

await prueba('Anular en un dispositivo se refleja en el otro', async () => {
  const remoto = crearRemotoMemoria();
  const A = dispositivo(remoto);
  const B = dispositivo(remoto);
  A.local.registrar('consumos', consumo('x1'));
  await A.motor.sincronizar();
  await B.motor.sincronizar();
  assert.equal(B.local.filas.consumos.get('x1').anulado, false);
  A.local.anular('consumos', 'x1');
  await A.motor.sincronizar();
  await B.motor.sincronizar();
  assert.equal(B.local.filas.consumos.get('x1').anulado, true);
});

await prueba('Registrar y anular sin internet: al sincronizar llega anulado', async () => {
  const remoto = crearRemotoMemoria();
  const { local, motor } = dispositivo(remoto);
  local.registrar('consumos', consumo('z1'));
  local.anular('consumos', 'z1');
  await motor.sincronizar();
  assert.equal(remoto.tablas.consumos.get('z1').anulado, true);
  assert.equal(local.sucios.consumos.size, 0);
});

await prueba('Una anulación nunca se revierte al mezclar versiones', async () => {
  const anulada = { id: 'm1', anulado: true };
  const vieja = { id: 'm1', anulado: false };
  assert.equal(fusionarFila(anulada, vieja).anulado, true);
  assert.equal(fusionarFila(vieja, anulada).anulado, true);
  assert.equal(fusionarFila(undefined, vieja).anulado, false);
});

await prueba('Si el usuario anula mientras se sube, esa anulación no se pierde', async () => {
  const remoto = crearRemotoMemoria();
  const { local, motor } = dispositivo(remoto);
  local.registrar('consumos', consumo('r1'));
  remoto.estado.alInsertar = () => {
    remoto.estado.alInsertar = null;
    local.anular('consumos', 'r1'); // el usuario anula justo durante la subida
  };
  const r1 = await motor.sincronizar();
  assert.equal(r1.pendientes, 1); // sigue pendiente porque cambió durante la subida
  await motor.sincronizar();
  assert.equal(remoto.tablas.consumos.get('r1').anulado, true);
  assert.equal(local.sucios.consumos.size, 0);
});

await prueba('Paginación: 10 filas con la misma hora se bajan completas y sin repetirse', async () => {
  const remoto = crearRemotoMemoria();
  const { local, motor } = dispositivo(remoto, { tamanoPagina: 3 });
  for (let i = 0; i < 10; i++) remoto.escribirDirecto('consumos', consumo(`id${String(i).padStart(2, '0')}`), { enMs: remoto.reloj() + 50 });
  const r = await motor.sincronizar();
  assert.equal(r.ok, true);
  assert.equal(r.bajados, 10);
  assert.equal(local.filas.consumos.size, 10);
});

await prueba('Más de una página de historial (2500 filas) se baja completo', async () => {
  const remoto = crearRemotoMemoria();
  const { local, motor } = dispositivo(remoto); // páginas de 1000, como Supabase
  for (let i = 0; i < 2500; i++) remoto.escribirDirecto('consumos', consumo(`h${i}`));
  await motor.sincronizar();
  assert.equal(local.filas.consumos.size, 2500);
});

await prueba('Una fila confirmada tarde por el servidor igual llega (ventana de solape)', async () => {
  const remoto = crearRemotoMemoria();
  const { local, motor } = dispositivo(remoto);
  remoto.escribirDirecto('consumos', consumo('n1'));
  await motor.sincronizar();
  // aparece una fila con hora anterior al cursor, 30 s antes (transacción que confirmó tarde)
  remoto.escribirDirecto('consumos', consumo('tarde1'), { enMs: remoto.reloj() - 30_000 });
  await motor.sincronizar();
  assert.ok(local.filas.consumos.has('tarde1'));
});

await prueba('Dos sincronizaciones a la vez se ejecutan como una sola', async () => {
  const remoto = crearRemotoMemoria();
  const { local, motor } = dispositivo(remoto);
  local.registrar('consumos', consumo('c1'));
  const [a, b] = await Promise.all([motor.sincronizar(), motor.sincronizar()]);
  assert.equal(remoto.contadores.inserts, 1);
  assert.equal(a, b);
});

await prueba('Con internet caído, lo ya guardado sigue disponible y el catálogo anterior se conserva', async () => {
  const remoto = crearRemotoMemoria();
  const { local, motor } = dispositivo(remoto);
  await motor.sincronizar();
  const catalogoAntes = local.meta.catalogo;
  remoto.estado.caido = true;
  const r = await motor.sincronizar();
  assert.equal(r.ok, false);
  assert.equal(local.meta.catalogo, catalogoAntes);
});

for (const [ok, nombre, detalle] of resultados) console.log(`${ok ? '✓' : '✗'} ${nombre}${ok ? '' : `\n    → ${detalle}`}`);
const fallos = resultados.filter(([ok]) => !ok).length;
console.log(`\n${resultados.length - fallos} de ${resultados.length} pruebas correctas`);
process.exit(fallos ? 1 : 0);
