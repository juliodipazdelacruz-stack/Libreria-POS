// Funciones de normalización y búsqueda (sin dependencias, fáciles de probar)

// Quita tildes y pasa a minúsculas: "Quinto" -> "quinto", "Muñoz" -> "munoz"
const norm = (s) =>
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

/**
 * Convierte cualquier forma de escribir un salón a una clave única.
 * "5 C", "5to c", "quinto C", "5° C", "cinco C" -> "5C"
 * Devuelve null si no logra identificar grado y sección.
 */
function claveSalon(texto) {
    let s = norm(texto).replace(/[°º.\-_,"']/g, ' ');
    s = s.replace(/\b[a-z]+\b/g, (w) => String(ORDINALES[w] ?? CARDINALES[w] ?? w));
    s = s.replace(/\s+/g, ' ').trim();
    const m = s.match(/(\d{1,2})\s*(?:ro|do|to|er|vo|mo|no|avo)?\s*(?:grado\s*|ano\s*)?(?:seccion\s*)?([a-z])\b/);
    return m ? `${parseInt(m[1], 10)}${m[2].toUpperCase()}` : null;
}

// Palabras que no ayudan a distinguir productos o personas
const STOP_PRODUCTO = new Set(['a', 'de', 'en', 'el', 'la', 'los', 'las', 'un', 'una', 'para', 'con', 'y']);
const STOP_PROFESOR = new Set([
    'profesor', 'profesora', 'prof', 'profe', 'miss', 'sr', 'sra', 'senor', 'senora',
    'el', 'la', 'de', 'del', 'a', 'al',
]);

// Unifica sinónimos habituales antes de comparar productos
const unificarSinonimos = (s) =>
    norm(s)
        .replace(/blanco\s*(?:y|e|\/|-)?\s*negro/g, ' bn ')
        .replace(/\bb\s*[\/\-]\s*n\b/g, ' bn ')
        .replace(/\bbyn\b/g, ' bn ')
        .replace(/fotocopia/g, 'copia');

const tokens = (s, stop) =>
    unificarSinonimos(s)
        .split(/[^a-z0-9]+/)
        .filter((t) => t && !stop.has(t))
        .map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t)); // copias -> copia

function puntuar(consulta, candidato) {
    const q = new Set(tokens(consulta, STOP_PRODUCTO));
    const c = new Set(tokens(candidato, STOP_PRODUCTO));
    if (!q.size || !c.size) return 0;
    const inter = [...q].filter((t) => c.has(t)).length;
    const contencion = inter / q.size;
    const jaccard = inter / (q.size + c.size - inter);
    return 0.6 * contencion + 0.4 * jaccard;
}

/**
 * productos: [{ id, nombre, variante, aliases, precio }]
 * Devuelve los que superan el umbral, de mayor a menor puntaje.
 */
function rankearProductos(consulta, productos) {
    return productos
        .map((p) => {
            const etiqueta = `${p.nombre} ${p.variante ?? ''}`.trim();
            const candidatos = [etiqueta, p.nombre, ...(p.aliases ?? [])];
            const score = Math.max(...candidatos.map((c) => puntuar(consulta, c)));
            return { producto: p, score };
        })
        .filter((r) => r.score >= 0.5)
        .sort((a, b) => b.score - a.score);
}

/** Profesores cuyo nombre contiene todas las palabras dichas. "profesora Rojas" -> Rojas */
function buscarProfesores(consulta, profesores) {
    const t = tokens(consulta, STOP_PROFESOR);
    if (!t.length) return [];
    return profesores.filter((p) => {
        const n = norm(p.nombre);
        return t.every((x) => n.includes(x));
    });
}

module.exports = { norm, claveSalon, rankearProductos, buscarProfesores };
