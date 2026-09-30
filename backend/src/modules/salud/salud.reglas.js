/* Reglas clínicas de apoyo (NO IA, NO reemplazan el criterio profesional).

   Tablas fijas y revisables, basadas en recomendaciones odontológicas
   habituales (manejo del paciente médicamente comprometido). Sirven para
   ALERTAR; nunca bloquean una acción. Cada alerta dice por qué salta, para
   que el odontólogo pueda evaluarla. */

const CONDICIONES = {
  diabetes: { nombre: 'Diabetes', nivel: 'atencion', mensaje: 'Controlar glucemia antes de procedimientos; mayor riesgo de infección y periodontitis. Preferir turnos por la mañana.' },
  hipertension: { nombre: 'Hipertensión arterial', nivel: 'atencion', mensaje: 'Tomar presión antes de atender; limitar vasoconstrictor (máx. 2 cartuchos con epinefrina 1:100.000 si no está controlada).' },
  cardiopatia: { nombre: 'Cardiopatía', nivel: 'atencion', mensaje: 'Evaluar estado cardiovascular, limitar vasoconstrictor y estrés; consultar al cardiólogo si es inestable.' },
  protesis_valvular: { nombre: 'Prótesis valvular cardíaca', nivel: 'critica', mensaje: 'Indicación de profilaxis antibiótica antes de procedimientos que manipulen encía o región periapical.' },
  endocarditis_previa: { nombre: 'Endocarditis infecciosa previa', nivel: 'critica', mensaje: 'Indicación de profilaxis antibiótica antes de procedimientos invasivos.' },
  cardiopatia_congenita: { nombre: 'Cardiopatía congénita', nivel: 'atencion', mensaje: 'Evaluar necesidad de profilaxis antibiótica según tipo de cardiopatía.' },
  anticoagulado: { nombre: 'Anticoagulado', nivel: 'critica', mensaje: 'Riesgo de sangrado: verificar INR/último control antes de cirugías; usar hemostáticos locales. No suspender la medicación sin indicación médica.' },
  antiagregado: { nombre: 'Antiagregado plaquetario', nivel: 'atencion', mensaje: 'Mayor sangrado postoperatorio; hemostasia local cuidadosa.' },
  discrasia_sanguinea: { nombre: 'Trastorno de coagulación', nivel: 'critica', mensaje: 'Riesgo hemorrágico: coordinar con hematología antes de procedimientos cruentos.' },
  bifosfonatos: { nombre: 'Tratamiento con bifosfonatos / antirresortivos', nivel: 'critica', mensaje: 'Riesgo de osteonecrosis de los maxilares (MRONJ): evitar extracciones y cirugías sin evaluación previa.' },
  radioterapia_cabeza_cuello: { nombre: 'Radioterapia de cabeza y cuello', nivel: 'critica', mensaje: 'Riesgo de osteorradionecrosis: evitar extracciones en zona irradiada sin protocolo.' },
  quimioterapia: { nombre: 'Quimioterapia en curso', nivel: 'critica', mensaje: 'Inmunosupresión: coordinar con oncología; controlar recuento antes de procedimientos invasivos.' },
  inmunosupresion: { nombre: 'Inmunosupresión', nivel: 'atencion', mensaje: 'Mayor riesgo de infección; evaluar cobertura antibiótica.' },
  embarazo: { nombre: 'Embarazo', nivel: 'critica', mensaje: 'Evitar radiografías no indispensables (usar delantal plomado); revisar seguridad de cada fármaco; el 2.º trimestre es el más seguro para tratamientos electivos.' },
  lactancia: { nombre: 'Lactancia', nivel: 'atencion', mensaje: 'Revisar compatibilidad de fármacos con la lactancia.' },
  asma: { nombre: 'Asma', nivel: 'atencion', mensaje: 'Tener el broncodilatador a mano; evitar AINE si el asma se agrava con aspirina.' },
  epilepsia: { nombre: 'Epilepsia', nivel: 'atencion', mensaje: 'Verificar adherencia a la medicación; tener protocolo de crisis.' },
  insuficiencia_renal: { nombre: 'Insuficiencia renal', nivel: 'atencion', mensaje: 'Ajustar dosis de fármacos de eliminación renal; evitar AINE.' },
  hepatopatia: { nombre: 'Enfermedad hepática', nivel: 'atencion', mensaje: 'Ajustar dosis de fármacos de metabolismo hepático (paracetamol, benzodiacepinas); riesgo de sangrado.' },
  ulcera_peptica: { nombre: 'Úlcera péptica / gastritis', nivel: 'atencion', mensaje: 'Evitar AINE o indicar protección gástrica.' },
  vih: { nombre: 'VIH', nivel: 'info', mensaje: 'Precauciones estándar; considerar estado inmunológico.' },
  hepatitis: { nombre: 'Hepatitis viral', nivel: 'info', mensaje: 'Precauciones estándar de bioseguridad; considerar función hepática.' },
  tiroides: { nombre: 'Trastorno tiroideo', nivel: 'info', mensaje: 'En hipertiroidismo no controlado, limitar vasoconstrictor.' },
  osteoporosis: { nombre: 'Osteoporosis', nivel: 'info', mensaje: 'Preguntar por tratamiento antirresortivo (bifosfonatos/denosumab).' },
  fumador: { nombre: 'Fumador', nivel: 'info', mensaje: 'Factor de riesgo periodontal y de fracaso de implantes; ofrecer consejo para dejar.' },
  alergia_latex: { nombre: 'Alergia al látex', nivel: 'critica', mensaje: 'Usar guantes y material libres de látex; turno a primera hora.' },
  sindrome_apnea: { nombre: 'Apnea del sueño', nivel: 'info', mensaje: 'Precaución con sedación; posible indicación de dispositivo de avance mandibular.' },
  trastorno_ansiedad: { nombre: 'Ansiedad / fobia dental', nivel: 'info', mensaje: 'Turnos cortos, explicar cada paso, evaluar sedación consciente.' },
  otra: { nombre: 'Otra condición', nivel: 'info', mensaje: '' },
};

// Familias de fármacos por palabras clave (sin tildes, minúsculas).
const FAMILIAS = {
  penicilinas: ['amoxicilina', 'ampicilina', 'penicilina', 'amoxidal', 'clavulanico', 'dicloxacilina', 'oxacilina'],
  cefalosporinas: ['cefalexina', 'cefadroxilo', 'cefuroxima', 'ceftriaxona', 'cefazolina', 'cefixima'],
  macrolidos: ['eritromicina', 'claritromicina', 'azitromicina'],
  tetraciclinas: ['tetraciclina', 'doxiciclina', 'minociclina'],
  quinolonas: ['ciprofloxacina', 'levofloxacina', 'moxifloxacina'],
  metronidazol: ['metronidazol', 'tinidazol'],
  clindamicina: ['clindamicina'],
  sulfas: ['sulfametoxazol', 'trimetoprima', 'cotrimoxazol'],
  aine: ['ibuprofeno', 'diclofenac', 'diclofenaco', 'ketorolac', 'ketorolaco', 'naproxeno', 'aspirina', 'acido acetilsalicilico', 'ketoprofeno', 'meloxicam', 'piroxicam', 'nimesulida', 'indometacina', 'dexketoprofeno', 'etoricoxib', 'celecoxib'],
  aspirina: ['aspirina', 'acido acetilsalicilico'],
  paracetamol: ['paracetamol', 'acetaminofen', 'acetaminofeno'],
  dipirona: ['dipirona', 'metamizol'],
  opioides: ['tramadol', 'codeina', 'morfina', 'oxicodona'],
  anticoagulantes: ['warfarina', 'acenocumarol', 'rivaroxaban', 'apixaban', 'dabigatran', 'edoxaban', 'heparina', 'enoxaparina'],
  antiagregantes: ['clopidogrel', 'prasugrel', 'ticagrelor', 'aspirina'],
  benzodiacepinas: ['diazepam', 'alprazolam', 'clonazepam', 'lorazepam', 'midazolam', 'bromazepam'],
  azoles: ['fluconazol', 'ketoconazol', 'itraconazol', 'miconazol'],
  corticoides: ['dexametasona', 'prednisona', 'betametasona', 'hidrocortisona', 'metilprednisolona'],
  epinefrina: ['epinefrina', 'adrenalina'],
  metotrexato: ['metotrexato'],
  litio: ['litio'],
  antihipertensivos_ieca_ara: ['enalapril', 'captopril', 'lisinopril', 'losartan', 'valsartan', 'telmisartan', 'ramipril'],
  diureticos: ['furosemida', 'hidroclorotiazida', 'espironolactona', 'clortalidona'],
  betabloqueantes_no_selectivos: ['propranolol', 'nadolol'],
  estatinas_cyp3a4: ['simvastatina', 'atorvastatina', 'lovastatina'],
  digoxina: ['digoxina'],
  teofilina: ['teofilina', 'aminofilina'],
  isrs: ['fluoxetina', 'sertralina', 'paroxetina', 'escitalopram', 'citalopram'],
  anticonceptivos: ['anticonceptivo', 'etinilestradiol', 'levonorgestrel', 'drospirenona'],
  bifosfonatos: ['alendronato', 'risedronato', 'ibandronato', 'zoledronico', 'denosumab'],
  hipoglucemiantes: ['metformina', 'glibenclamida', 'insulina', 'glimepirida'],
};

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function familiasDe(nombre) {
  const n = normalizar(nombre);
  return Object.entries(FAMILIAS).filter(([, palabras]) => palabras.some((p) => n.includes(p))).map(([f]) => f);
}

// Pares fármaco-fármaco relevantes en odontología.
const INTERACCIONES = [
  ['aine', 'anticoagulantes', 'critica', 'AINE + anticoagulante: aumenta mucho el riesgo de sangrado. Preferir paracetamol.'],
  ['aine', 'antiagregantes', 'atencion', 'AINE + antiagregante: mayor riesgo de sangrado digestivo.'],
  ['metronidazol', 'anticoagulantes', 'critica', 'Metronidazol potencia la warfarina/acenocumarol (sube el INR).'],
  ['macrolidos', 'anticoagulantes', 'atencion', 'Macrólidos pueden potenciar anticoagulantes orales.'],
  ['azoles', 'anticoagulantes', 'critica', 'Antimicóticos azólicos potencian anticoagulantes orales.'],
  ['aine', 'metotrexato', 'critica', 'AINE + metotrexato: riesgo de toxicidad por metotrexato.'],
  ['penicilinas', 'metotrexato', 'atencion', 'Penicilinas reducen la eliminación de metotrexato.'],
  ['aine', 'litio', 'critica', 'AINE aumentan los niveles de litio (toxicidad).'],
  ['aine', 'antihipertensivos_ieca_ara', 'atencion', 'AINE reducen el efecto antihipertensivo y afectan la función renal.'],
  ['aine', 'diureticos', 'atencion', 'AINE reducen el efecto de los diuréticos.'],
  ['aine', 'corticoides', 'atencion', 'AINE + corticoide: mayor riesgo de úlcera gastrointestinal.'],
  ['aine', 'isrs', 'atencion', 'AINE + ISRS: mayor riesgo de sangrado digestivo.'],
  ['macrolidos', 'estatinas_cyp3a4', 'critica', 'Claritromicina/eritromicina + estatina: riesgo de miopatía/rabdomiólisis.'],
  ['macrolidos', 'digoxina', 'atencion', 'Macrólidos aumentan los niveles de digoxina.'],
  ['macrolidos', 'teofilina', 'atencion', 'Eritromicina aumenta los niveles de teofilina.'],
  ['quinolonas', 'teofilina', 'atencion', 'Ciprofloxacina aumenta los niveles de teofilina.'],
  ['azoles', 'benzodiacepinas', 'atencion', 'Azoles aumentan el efecto sedante de benzodiacepinas.'],
  ['macrolidos', 'benzodiacepinas', 'atencion', 'Macrólidos aumentan el efecto de midazolam/alprazolam.'],
  ['opioides', 'benzodiacepinas', 'critica', 'Opioide + benzodiacepina: riesgo de depresión respiratoria.'],
  ['opioides', 'isrs', 'atencion', 'Tramadol + ISRS: riesgo de síndrome serotoninérgico.'],
  ['epinefrina', 'betabloqueantes_no_selectivos', 'atencion', 'Epinefrina + betabloqueante no selectivo: riesgo de crisis hipertensiva. Limitar vasoconstrictor.'],
  ['tetraciclinas', 'anticonceptivos', 'info', 'Antibióticos pueden reducir la eficacia del anticonceptivo: indicar método de respaldo.'],
  ['penicilinas', 'anticonceptivos', 'info', 'Antibióticos pueden reducir la eficacia del anticonceptivo: indicar método de respaldo.'],
  ['metronidazol', 'litio', 'atencion', 'Metronidazol puede aumentar los niveles de litio.'],
];

// Fármaco nuevo vs condición del paciente.
const FARMACO_CONDICION = [
  ['aine', 'anticoagulado', 'critica', 'AINE en paciente anticoagulado: riesgo de sangrado. Preferir paracetamol.'],
  ['aine', 'insuficiencia_renal', 'critica', 'AINE en insuficiencia renal: pueden empeorar la función renal.'],
  ['aine', 'ulcera_peptica', 'critica', 'AINE en úlcera péptica: riesgo de sangrado digestivo.'],
  ['aine', 'asma', 'atencion', 'AINE pueden desencadenar broncoespasmo en asmáticos sensibles a la aspirina.'],
  ['aine', 'hipertension', 'atencion', 'AINE pueden subir la presión arterial.'],
  ['aine', 'embarazo', 'critica', 'AINE contraindicados en el 3.er trimestre del embarazo.'],
  ['aine', 'cardiopatia', 'atencion', 'AINE aumentan el riesgo cardiovascular.'],
  ['tetraciclinas', 'embarazo', 'critica', 'Tetraciclinas contraindicadas en el embarazo (tinción dental y ósea fetal).'],
  ['tetraciclinas', 'lactancia', 'atencion', 'Tetraciclinas: evitar durante la lactancia.'],
  ['quinolonas', 'embarazo', 'critica', 'Quinolonas: evitar en el embarazo.'],
  ['metronidazol', 'embarazo', 'atencion', 'Metronidazol: evitar en el 1.er trimestre.'],
  ['azoles', 'embarazo', 'critica', 'Fluconazol/ketoconazol: evitar en el embarazo.'],
  ['opioides', 'embarazo', 'atencion', 'Opioides (codeína/tramadol): usar solo si es indispensable.'],
  ['opioides', 'lactancia', 'atencion', 'Codeína/tramadol: riesgo para el lactante.'],
  ['benzodiacepinas', 'embarazo', 'atencion', 'Benzodiacepinas: evitar en el embarazo.'],
  ['paracetamol', 'hepatopatia', 'atencion', 'Paracetamol en enfermedad hepática: reducir dosis máxima diaria.'],
  ['benzodiacepinas', 'hepatopatia', 'atencion', 'Benzodiacepinas en hepatopatía: efecto prolongado.'],
  ['epinefrina', 'cardiopatia', 'atencion', 'Vasoconstrictor en cardiópata: limitar la dosis.'],
  ['epinefrina', 'hipertension', 'atencion', 'Vasoconstrictor en hipertenso: limitar la dosis y aspirar antes de inyectar.'],
  ['epinefrina', 'tiroides', 'atencion', 'Vasoconstrictor en hipertiroidismo no controlado: evitar.'],
  ['corticoides', 'diabetes', 'atencion', 'Corticoides elevan la glucemia.'],
];

const ALERGIA_CRUZADA = [
  ['penicilinas', 'cefalosporinas', 'atencion', 'Alergia a penicilinas: posible reacción cruzada con cefalosporinas (evitar si fue reacción grave).'],
  ['aine', 'aine', 'critica', 'Alergia/intolerancia a un AINE: evitar otros AINE (reacción cruzada frecuente).'],
  ['aspirina', 'aine', 'critica', 'Alergia a la aspirina: evitar otros AINE.'],
];

module.exports = { CONDICIONES, FAMILIAS, INTERACCIONES, FARMACO_CONDICION, ALERGIA_CRUZADA, familiasDe, normalizar };
