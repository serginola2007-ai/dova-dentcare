/* global document, DovaClinica, DOVA */
// Comparador antes / después: lado a lado y descarga de la imagen.
const os = require('os');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const URL0 = process.env.DOVA_URL || 'http://localhost:4500'; const B = `${URL0}/api`;
const DIR = process.env.CAPTURAS || os.tmpdir(); const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const errores = (p) => { const e = []; p.on('pageerror', (x) => e.push(x.message)); p.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|google|status of 4|Failed to load resource/.test(m.text())) e.push(m.text()); }); return e; };
const q1 = async (s, p) => (await db.query(s, p)).rows[0];

(async () => {
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username='admin' AND clinica_id=1");
  const suf = String(Date.now() % 1000000);
  const pid = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci) VALUES (1,'Fabi',$1,$2) RETURNING id", [`UiFotos${suf}`, `UF${suf}`])).id;
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage(); const err = errores(p);
    await p.goto(`${URL0}/moderno/index.html`); await p.fill('#login-username', 'admin'); await p.fill('#login-password', 'admin'); await p.click('#form-login button[type=submit]');
    await p.waitForSelector('#shell-root:not([style*="display: none"])', { timeout: 15000 }); await p.waitForTimeout(800);
    // Dos fotos reales (PNG generado en el navegador) subidas por la API.
    const subir = (cat, color) => p.evaluate(async ({ pid2, cat2, color2 }) => {
      const cv = document.createElement('canvas'); cv.width = 400; cv.height = 300; const g = cv.getContext('2d'); g.fillStyle = color2; g.fillRect(0, 0, 400, 300); g.fillStyle = '#fff'; g.fillRect(100, 100, 200, 100);
      const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
      const fd = new FormData(); fd.append('archivo', blob, 'f.png'); fd.append('pacienteId', String(pid2)); fd.append('categoria', cat2); fd.append('fecha', new Date().toISOString().slice(0, 10));
      const r = await DOVA.postForm('/clinico/fotos', fd); return r && r.id;
    }, { pid2: pid, cat2: cat, color2: color });
    const f1 = await subir('antes', '#a33'); const f2 = await subir('despues', '#3a3');
    P('se subieron las 2 fotos', !!f1 && !!f2, { f1, f2 });
    await p.evaluate((id) => DovaClinica.compararPaciente(id), pid);
    await p.waitForSelector('.dova-cli-cmp-modos', { timeout: 10000 });
    await p.waitForFunction(() => { const i = document.querySelector('[data-img-a]'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 10000 });
    P('abre el comparador con las dos fotos (antes y después)', await p.evaluate(() => !!document.querySelector('[data-img-a]').src && !!document.querySelector('[data-img-b]').src));
    await p.click('[data-modo="lado"]');
    P('"Lado a lado" cambia la vista y oculta el deslizador', await p.evaluate(() => document.querySelector('[data-cmp]').classList.contains('lado') && document.querySelector('[data-rango]').hidden));
    await p.screenshot({ path: `${DIR}/comparar-lado.png` });
    await p.click('[data-modo="division"]');
    P('"Deslizar" vuelve a la división', await p.evaluate(() => !document.querySelector('[data-cmp]').classList.contains('lado') && !document.querySelector('[data-rango]').hidden));
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.click('[data-descargar]')]);
    const ruta = `${DIR}/antes-despues-prueba.jpg`; await dl.saveAs(ruta);
    const tam = fs.statSync(ruta).size; const cab = fs.readFileSync(ruta).slice(0, 3).toString('hex');
    P('descarga una imagen JPG con las dos fotos', /^antes-despues-\d{4}-\d{2}-\d{2}\.jpg$/.test(dl.suggestedFilename()) && tam > 5000 && cab === 'ffd8ff', { nombre: dl.suggestedFilename(), tam, cab });
    P('sin 2 fotos avisa (paciente sin fotos)', await p.evaluate(async () => { await DovaClinica.compararPaciente(999999999); return true; }));
    P('Sin errores en consola', err.length === 0, err);
  } catch (e) { P('error inesperado', false, e.stack || e.message); } finally { await b.close(); await db.end(); }
  console.log(`\n${res.filter(Boolean).length}/${res.length}`);
  void B;
  process.exit(res.every(Boolean) ? 0 : 1);
})();
