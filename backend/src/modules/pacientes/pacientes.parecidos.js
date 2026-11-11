/* Pacientes parecidos: al dar de alta, avisa si ya hay alguien con el mismo
   nombre y apellido (sin acentos ni mayúsculas), la misma C.I. o el mismo
   teléfono. Solo avisa: el alta la decide quien la carga.
   GET /pacientes/parecidos?nombre=&apellido=&ci=&telefono= */
const express = require('express');
const { query } = require('../../config/db');
const { requirePermiso } = require('../../middlewares/rbac.middleware');

const router = express.Router();
const ACENTOS = "'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun'";
const texto = (v) => (typeof v === 'string' ? v : '').slice(0, 120);
const norm = (v) => texto(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const digitos = (v) => texto(v).replace(/\D/g, '');

router.get('/parecidos', requirePermiso('pacientes.view', 'pacientes.create'), async (req, res, next) => {
  try {
    const nombre = norm(req.query.nombre); const apellido = norm(req.query.apellido);
    const ci = digitos(req.query.ci);
    const tel = digitos(req.query.telefono).replace(/^(595|0)/, '');
    const conds = []; const params = [req.clinicaId];
    if (nombre.length >= 2 && apellido.length >= 2) {
      params.push(nombre, apellido);
      conds.push(`(translate(lower(trim(nombre)), ${ACENTOS}) = $${params.length - 1} AND translate(lower(trim(COALESCE(apellido,''))), ${ACENTOS}) = $${params.length})`);
    }
    if (ci.length >= 5) { params.push(ci); conds.push(`regexp_replace(COALESCE(ci,''), '\\D', '', 'g') = $${params.length}`); }
    if (tel.length >= 6) {
      params.push(`%${tel}`);
      conds.push(`(regexp_replace(COALESCE(telefono,''), '\\D', '', 'g') LIKE $${params.length} OR regexp_replace(COALESCE(whatsapp,''), '\\D', '', 'g') LIKE $${params.length})`);
    }
    if (!conds.length) { res.json([]); return; }
    const r = await query(
      `SELECT id, nombre, apellido, ci, telefono, activo FROM pacientes
        WHERE clinica_id=$1 AND (${conds.join(' OR ')}) ORDER BY activo DESC, id DESC LIMIT 5`, params);
    res.json(r.rows);
  } catch (e) { next(e); }
});

module.exports = router;
