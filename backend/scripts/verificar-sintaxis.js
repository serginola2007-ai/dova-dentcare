/* "Build" del backend: no hay compilación, así que se verifica la sintaxis de
   todos los archivos .js (node --check) para que un error no llegue a Render. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const archivos = [];
(function recorrer(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', 'uploads', '.git'].includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) recorrer(p); else if (e.name.endsWith('.js')) archivos.push(p);
  }
}(raiz));
let malos = 0;
for (const f of archivos) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { malos++; console.error(`ERROR ${path.relative(raiz, f)}\n${e.stderr}`); }
}
console.log(`${archivos.length} archivos revisados, ${malos} con errores de sintaxis`);
process.exit(malos ? 1 : 0);
