/* Periodontograma de 6 sitios.

   Convención (la del periodontograma de la Universidad de Berna / SEPA):
   - PS  = profundidad de sondaje (mm).
   - MG  = margen gingival respecto del límite amelocementario (mm):
           NEGATIVO cuando hay recesión (margen apical al LAC),
           positivo cuando el margen está coronal (agrandamiento).
   - NIC = nivel de inserción clínica = PS − MG  (con recesión 2 mm y PS 3 mm: NIC 5).
   Sitios por pieza: MV, V, DV (vestibular) y ML, L, DL (lingual/palatino).

   datos = { "16": { ausente, implante, movilidad (0-3), furca (0-3),
                     sitios: { MV: {ps, mg, sang, sup, placa}, … } }, … } */
const { ApiError } = require('../../middlewares/error.middleware');
const { PIEZAS_VALIDAS } = require('../../utils/recurso');

const SITIOS = ['MV', 'V', 'DV', 'ML', 'L', 'DL'];
const INTERPROXIMALES = ['MV', 'DV', 'ML', 'DL'];

function num(v, min, max, nombre) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new ApiError(400, `${nombre}: valor fuera de rango (${min} a ${max})`);
  return n;
}

// Valida y normaliza lo que manda el cliente: solo claves conocidas.
function normalizarDatos(datos) {
  if (!datos || typeof datos !== 'object') throw new ApiError(400, 'Datos del periodontograma inválidos');
  const salida = {};
  for (const [pieza, d] of Object.entries(datos)) {
    if (!PIEZAS_VALIDAS.has(pieza)) throw new ApiError(400, `Pieza inválida en el periodontograma: ${pieza}`);
    if (!d || typeof d !== 'object') continue;
    const p = {
      ausente: !!d.ausente,
      implante: !!d.implante,
      movilidad: num(d.movilidad, 0, 3, `Movilidad ${pieza}`),
      furca: num(d.furca, 0, 3, `Furca ${pieza}`),
      sitios: {},
    };
    for (const s of SITIOS) {
      const x = (d.sitios && d.sitios[s]) || {};
      p.sitios[s] = {
        ps: num(x.ps, 0, 20, `PS ${pieza}-${s}`),
        mg: num(x.mg, -15, 10, `MG ${pieza}-${s}`),
        sang: !!x.sang,
        sup: !!x.sup,
        placa: !!x.placa,
      };
    }
    salida[pieza] = p;
  }
  return salida;
}

function calcularIndices(datos, { fumador, diabetes, edad } = {}) {
  let sitios = 0; let sang = 0; let placa = 0; let sup = 0; let sumaPs = 0; let nPs = 0; let sumaNic = 0; let nNic = 0;
  let ps4a5 = 0; let ps6 = 0; let psMax = 0; let nicMax = 0; let recesiones = 0;
  let presentes = 0; let ausentes = 0; let conMovilidad = 0; let conFurca = 0;
  const piezasConNicInterprox = {}; // para estadio/extensión
  for (const [pieza, d] of Object.entries(datos)) {
    if (d.ausente) { ausentes++; continue; }
    presentes++;
    if (d.movilidad > 0) conMovilidad++;
    if (d.furca > 0) conFurca++;
    for (const s of SITIOS) {
      const x = d.sitios[s];
      sitios++;
      if (x.sang) sang++;
      if (x.placa) placa++;
      if (x.sup) sup++;
      if (x.ps !== null) {
        sumaPs += x.ps; nPs++;
        if (x.ps >= 6) ps6++; else if (x.ps >= 4) ps4a5++;
        psMax = Math.max(psMax, x.ps);
      }
      if (x.mg !== null && x.mg < 0) recesiones++;
      if (x.ps !== null) {
        const nic = x.ps - (x.mg || 0);
        sumaNic += nic; nNic++;
        nicMax = Math.max(nicMax, nic);
        if (INTERPROXIMALES.includes(s) && !d.implante) piezasConNicInterprox[pieza] = Math.max(piezasConNicInterprox[pieza] || 0, nic);
      }
    }
  }
  const pct = (a) => (sitios ? Math.round((a / sitios) * 1000) / 10 : 0);
  const nicInterproxMax = Math.max(0, ...Object.values(piezasConNicInterprox));
  const piezasAfectadas = Object.values(piezasConNicInterprox).filter((n) => n >= 1).length;

  // Sugerencia de clasificación AAP/EFP 2017 (simplificada: sin radiografía
  // no se puede medir pérdida ósea; es un punto de partida, el odontólogo decide).
  let sugerencia = null;
  const piezasNic2 = Object.values(piezasConNicInterprox).filter((n) => n >= 2).length;
  if (nicInterproxMax >= 1 && piezasNic2 >= 2) {
    let estadio = nicInterproxMax >= 5 ? 'III' : nicInterproxMax >= 3 ? 'II' : 'I';
    if (estadio === 'I' && psMax >= 5) estadio = 'II';
    if (estadio === 'II' && (psMax >= 6 || conFurca > 0)) estadio = 'III';
    if (estadio === 'III' && ausentes >= 5 && conMovilidad >= 2) estadio = 'IV';
    let grado = 'B';
    if (fumador || diabetes) grado = 'C';
    else if (edad && edad >= 60 && nicInterproxMax <= 3) grado = 'A';
    const extension = presentes && piezasAfectadas / presentes >= 0.3 ? 'generalizada' : 'localizada';
    sugerencia = { estadio, grado, extension, texto: `Periodontitis estadio ${estadio}, ${extension}, grado ${grado} (sugerido)` };
  } else if (pct(sang) >= 10) {
    sugerencia = { estadio: null, grado: null, extension: pct(sang) > 30 ? 'generalizada' : 'localizada', texto: `Gingivitis ${pct(sang) > 30 ? 'generalizada' : 'localizada'} (sangrado ${pct(sang)}%, sin pérdida de inserción interproximal significativa)` };
  } else if (sitios) {
    sugerencia = { estadio: null, grado: null, extension: null, texto: 'Salud periodontal (sangrado < 10%, sin pérdida de inserción)' };
  }

  return {
    piezasPresentes: presentes, piezasAusentes: ausentes, sitiosEvaluados: sitios,
    sangradoPct: pct(sang), placaPct: pct(placa), supuracionPct: pct(sup),
    psMedia: nPs ? Math.round((sumaPs / nPs) * 100) / 100 : null,
    nicMedio: nNic ? Math.round((sumaNic / nNic) * 100) / 100 : null,
    psMax, nicMax, nicInterproxMax,
    sitiosPs4a5: ps4a5, sitiosPs6oMas: ps6, sitiosConRecesion: recesiones,
    piezasConMovilidad: conMovilidad, piezasConFurca: conFurca,
    sugerencia,
  };
}

// Comparación entre dos exámenes (evolución del paciente).
function comparar(exA, exB) {
  const piezas = new Set([...Object.keys(exA.datos || {}), ...Object.keys(exB.datos || {})]);
  const porPieza = [];
  for (const pieza of [...piezas].sort()) {
    const a = exA.datos[pieza]; const b = exB.datos[pieza];
    if (!a || !b || a.ausente || b.ausente) continue;
    const sitios = {};
    let empeora = 0; let mejora = 0;
    for (const s of SITIOS) {
      const pa = a.sitios[s] || {}; const pb = b.sitios[s] || {};
      if (pa.ps == null || pb.ps == null) continue;
      const dPs = pb.ps - pa.ps;
      const dNic = (pb.ps - (pb.mg || 0)) - (pa.ps - (pa.mg || 0));
      sitios[s] = { dPs, dNic };
      if (dNic >= 2 || dPs >= 2) empeora++;
      if (dNic <= -2 || dPs <= -2) mejora++;
    }
    porPieza.push({ pieza, sitios, empeora, mejora });
  }
  const ia = exA.indices || {}; const ib = exB.indices || {};
  const d = (k) => (ia[k] != null && ib[k] != null ? Math.round((ib[k] - ia[k]) * 100) / 100 : null);
  return {
    desde: { id: exA.id, fecha: exA.fecha }, hasta: { id: exB.id, fecha: exB.fecha },
    indices: { sangradoPct: d('sangradoPct'), placaPct: d('placaPct'), psMedia: d('psMedia'), nicMedio: d('nicMedio'), sitiosPs4a5: d('sitiosPs4a5'), sitiosPs6oMas: d('sitiosPs6oMas') },
    piezasQueEmpeoran: porPieza.filter((p) => p.empeora > 0).map((p) => p.pieza),
    piezasQueMejoran: porPieza.filter((p) => p.mejora > 0).map((p) => p.pieza),
    porPieza,
  };
}

module.exports = { normalizarDatos, calcularIndices, comparar, SITIOS };
