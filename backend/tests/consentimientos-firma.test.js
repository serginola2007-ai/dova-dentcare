// Consentimientos firmados en tablet (API): quién firma, huella del documento,
// inmutabilidad en la base, anulación con motivo y PDF con las firmas.
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const B = (process.env.DOVA_URL || 'http://localhost:4500') + '/api'; const res = [];
const P = (n, ok, d) => { res.push(!!ok); console.log(ok ? 'OK  ' : 'MAL ', n, ok ? '' : String(JSON.stringify(d)).slice(0, 300)); };
const req = async (m, url, body, tok, raw = false) => {
  const r = await fetch(B + url, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body === undefined || body === null ? undefined : JSON.stringify(body) });
  if (raw) return { s: r.status, ct: r.headers.get('content-type'), buf: Buffer.from(await r.arrayBuffer()) };
  return { s: r.status, j: await r.json().catch(() => null) };
};
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
// Firma de prueba: PNG 1x1 válido.
const FIRMA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

(async () => {
  await db.query("SET dova.borrando_paciente='on'; DELETE FROM pacientes WHERE apellido='Prueba' AND ci LIKE 'CF%'; RESET dova.borrando_paciente");
  await db.query("DELETE FROM login_intentos; UPDATE usuarios SET debe_cambiar_clave=false WHERE username IN ('admin','sinperm')");
  const A = (await req('POST', '/auth/login', { username: 'admin', password: 'admin' })).j.accessToken;
  const S = (await req('POST', '/auth/login', { username: 'sinperm', password: 'Clave1234!' })).j.accessToken;
  const suf = String(Date.now() % 1000000);
  const pid = (await q1("INSERT INTO pacientes (clinica_id, nombre, apellido, ci) VALUES (1,'Firma','Prueba',$1) RETURNING id", [`CF${suf}`])).id;
  const nuevo = async () => (await req('POST', '/clinico/consentimientos', { pacienteId: pid, procedimiento: 'Extracción', texto: 'Acepto la extracción de la pieza 38.' }, A)).j;
  const k1 = await nuevo();
  P('Crear consentimiento: queda pendiente de firma', k1 && k1.estado === 'pendiente', k1);
  P('Firmar sin permiso: 403', (await req('POST', `/clinico/consentimientos/${k1.id}/firmar`, { firmaPaciente: FIRMA, acepta: true }, S)).s === 403);
  P('Sin aceptar el texto: 400', (await req('POST', `/clinico/consentimientos/${k1.id}/firmar`, { firmaPaciente: FIRMA, acepta: false }, A)).s === 400);
  P('Firma que no es imagen: 400', (await req('POST', `/clinico/consentimientos/${k1.id}/firmar`, { firmaPaciente: 'data:text/html;base64,PHNjcmlwdD4=', acepta: true }, A)).s === 400);
  P('Firma con contenido inyectado: 400', (await req('POST', `/clinico/consentimientos/${k1.id}/firmar`, { firmaPaciente: `${FIRMA}"><script>`, acepta: true }, A)).s === 400);
  P('Responsable sin documento: 400', (await req('POST', `/clinico/consentimientos/${k1.id}/firmar`, { firmaPaciente: FIRMA, acepta: true, firmanteRelacion: 'responsable', firmanteNombre: 'Mamá' }, A)).s === 400);
  let r = await req('POST', `/clinico/consentimientos/${k1.id}/firmar`, { firmaPaciente: FIRMA, firmaOdontologo: FIRMA, acepta: true, firmanteRelacion: 'responsable', firmanteNombre: 'Marta Prueba', firmanteDocumento: '1234567' }, A);
  P('Firma el responsable: queda firmado con nombre, C.I., fecha y huella', r.s === 200 && r.j.estado === 'firmado' && r.j.firmante_nombre === 'Marta Prueba' && r.j.firmante_documento === '1234567' && /^[0-9a-f]{64}$/.test(r.j.hash_documento) && r.j.firmado_en, r.j);
  P('…registra quién del personal estuvo presente y el dispositivo', r.j.testigo_usuario_id && r.j.firma_dispositivo !== undefined);
  P('No se firma dos veces: 409', (await req('POST', `/clinico/consentimientos/${k1.id}/firmar`, { firmaPaciente: FIRMA, acepta: true }, A)).s === 409);
  r = await req('GET', `/clinico/consentimientos/paciente/${pid}`, null, A);
  const fila = r.j.find((x) => x.id === k1.id);
  P('La lista muestra "verificado" y no manda las imágenes de las firmas', fila.verificado === true && fila.tiene_firma === true && !('firma_paciente' in fila), fila);
  // Inmutabilidad en la base
  let error = null;
  try { await db.query("UPDATE consentimientos SET texto='Texto cambiado' WHERE id=$1", [k1.id]); } catch (e) { error = e.message; }
  P('Cambiar el texto de un firmado en la base: lo impide', /no se puede modificar/.test(error || ''), error);
  error = null;
  try { await db.query("UPDATE consentimientos SET estado='pendiente' WHERE id=$1", [k1.id]); } catch (e) { error = e.message; }
  P('Volverlo a "pendiente": lo impide', /no se puede modificar/.test(error || ''), error);
  error = null;
  try { await db.query('DELETE FROM consentimientos WHERE id=$1', [k1.id]); } catch (e) { error = e.message; }
  P('Borrar un firmado: lo impide', /no se puede borrar/.test(error || ''), error);
  // Huella: si alguien saltea el disparador (dueño de la base), DOVA lo detecta
  await db.query("BEGIN; ALTER TABLE consentimientos DISABLE TRIGGER consentimiento_inmutable; UPDATE consentimientos SET texto='Texto alterado' WHERE id=$1; ALTER TABLE consentimientos ENABLE TRIGGER consentimiento_inmutable; COMMIT;".replace('$1', String(k1.id)));
  r = await req('GET', `/clinico/consentimientos/paciente/${pid}`, null, A);
  P('Texto alterado por fuera de DOVA: la huella no coincide y se marca', r.j.find((x) => x.id === k1.id).verificado === false);
  // PDF
  const k2 = await nuevo();
  await req('POST', `/clinico/consentimientos/${k2.id}/firmar`, { firmaPaciente: FIRMA, acepta: true }, A);
  const pdf = await req('GET', `/comprobantes/consentimiento/${k2.id}`, undefined, A, true);
  P('PDF del firmado: se genera con las firmas', pdf.s === 200 && /pdf/.test(pdf.ct) && pdf.buf.length > 1500 && pdf.buf.includes(Buffer.from('/Image')), { s: pdf.s, len: pdf.buf.length });
  const k2f = await q1('SELECT firmante_nombre, firmante_relacion, firmante_documento FROM consentimientos WHERE id=$1', [k2.id]);
  P('Si firma el paciente, toma su nombre y C.I. de la ficha', k2f.firmante_nombre === 'Firma Prueba' && k2f.firmante_relacion === 'paciente' && k2f.firmante_documento === `CF${suf}`, k2f);
  // Anular
  P('Anular un firmado sin motivo: 400', (await req('POST', `/clinico/consentimientos/${k2.id}/anular`, {}, A)).s === 400);
  r = await req('POST', `/clinico/consentimientos/${k2.id}/anular`, { motivo: 'El paciente cambió de opinión' }, A);
  P('Anular con motivo: queda anulado con fecha y motivo', r.s === 200 && r.j.estado === 'anulado' && r.j.anulado_motivo && r.j.anulado_en, r.j);
  P('Un anulado no se puede firmar: 409', (await req('POST', `/clinico/consentimientos/${k2.id}/firmar`, { firmaPaciente: FIRMA, acepta: true }, A)).s === 409);
  error = null;
  try { await db.query("UPDATE consentimientos SET estado='firmado' WHERE id=$1", [k2.id]); } catch (e) { error = e.message; }
  P('Un anulado no vuelve atrás (base)', /no vuelve atrás|no se puede modificar/.test(error || ''), error);
  const pdf2 = await req('GET', `/comprobantes/consentimiento/${k2.id}`, undefined, A, true);
  P('El PDF del anulado se sigue generando', pdf2.s === 200 && pdf2.buf.length > 1500);
  const ajeno = await q1('SELECT id FROM consentimientos WHERE clinica_id<>1 LIMIT 1');
  if (ajeno) P('Consentimiento de otra clínica: 404', (await req('POST', `/clinico/consentimientos/${ajeno.id}/firmar`, { firmaPaciente: FIRMA, acepta: true }, A)).s === 404);
  P('Queda en el historial de cambios', !!(await q1("SELECT 1 x FROM auditoria WHERE accion='firmar_consentimiento' AND entidad_id=$1", [String(k1.id)])));
  await db.query("SET dova.borrando_paciente='on'; DELETE FROM pacientes WHERE id=" + Number(pid));
  await db.end();
  const ok = res.filter(Boolean).length; console.log(`\n${ok}/${res.length}`); process.exit(ok === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
