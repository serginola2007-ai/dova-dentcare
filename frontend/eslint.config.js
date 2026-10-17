/* Revisión automática del front (npm run lint:front desde backend/): marca variables sin definir y sobrantes.
   La lista de abajo son los objetos globales de DOVA (un archivo por objeto, ver frontend/README.md). */
const globals = require('../backend/node_modules/globals');
const nuestros = ['DOVA','Vistas','DovaExt','DovaApp','DovaPantallas','DovaVentanas','DovaAyudantes','DovaTurnos','DovaSeccionBase','DovaIcono','DovaVivo','DovaPWA','DovaSeguridad','DovaBloqueo','DovaComandos','DovaRapido','DovaVisor','DovaImportar','DovaMiDia','DovaBuscadorGlobal','DovaIngreso','DovaConfiguracion','DovaInicio','DovaPacientes','DovaFichaPaciente','DovaPanelesConsulta','DovaAyudaTecnica','DovaUsuarios','DovaFicha','DovaClinica','DovaFichaOperativa','DovaAgenda','DovaCaja','DovaInventario','DovaCatalogo','DovaFacturacion','DovaWeb','DovaInformes','DovaPresupuestos','DovaPlataforma','DovaOrtodoncia','DovaAvisos','DovaSeguimiento','DovaOperaciones','DovaFinanzas','DovaEstadisticas','DovaReportes','DovaInicioExtras','DovaCompartido'];
module.exports = [{
  files: ['**/*.js'],
  languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...globals.browser, ...Object.fromEntries(nuestros.map((n) => [n, 'writable'])) } },
  rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }], 'no-redeclare': ['error', { builtinGlobals: false }] },
}];
