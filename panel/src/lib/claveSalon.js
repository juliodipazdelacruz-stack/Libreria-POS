const quitar = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const ORDINALES = {
  primero: 1, primer: 1, segundo: 2, tercero: 3, tercer: 3, cuarto: 4,
  quinto: 5, sexto: 6, septimo: 7, octavo: 8, noveno: 9, decimo: 10,
};
const CARDINALES = {
  uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10,
};

/** "5 C", "5to c", "quinto C" -> "5C". Devuelve null si no reconoce grado y sección. */
export function claveSalon(texto) {
  let s = quitar(texto).replace(/[°º.\-_,"']/g, ' ');
  s = s.replace(/\b[a-z]+\b/g, (w) => String(ORDINALES[w] ?? CARDINALES[w] ?? w));
  s = s.replace(/\s+/g, ' ').trim();
  const m = s.match(/(\d{1,2})\s*(?:ro|do|to|er|vo|mo|no|avo)?\s*(?:grado\s*|ano\s*)?(?:seccion\s*)?([a-z])\b/);
  return m ? `${parseInt(m[1], 10)}${m[2].toUpperCase()}` : null;
}

/** Ordena por grado y sección; lo que no se reconoce va al final. */
export function ordenarSalones(lista) {
  const clave = (s) => {
    const k = claveSalon(`${s.grado} ${s.seccion}`);
    return k
      ? { n: parseInt(k, 10), l: k.replace(/^\d+/, '') }
      : { n: 999, l: `${s.grado}${s.seccion}` };
  };
  return [...lista].sort((a, b) => {
    const x = clave(a);
    const y = clave(b);
    return x.n - y.n || x.l.localeCompare(y.l);
  });
}
