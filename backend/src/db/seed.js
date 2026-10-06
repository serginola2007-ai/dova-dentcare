/* Seed inicial de DOVA.
   Crea:
   - La clínica DentCareRC (primera clínica configurada dentro de DOVA).
   - Los roles de sistema (admin, odontologo, recepcion, asistente, helpdesk).
   - El catálogo de permisos y su asignación por defecto a cada rol.
   - El usuario admin (protegido, con contraseña inicial aleatoria o ADMIN_PASSWORD; no puede quedar sin permisos ni ser
     eliminado si es el último admin activo — ver auth.service.js).

   Es idempotente: puede correrse varias veces sin duplicar datos. */
require('dotenv').config();
// El seed escribe permisos y roles: usa el usuario de migraciones si está configurado.
if (process.env.MIGRATION_DATABASE_URL) process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { PERMISOS, PERMISOS_POR_ROL } = require('../config/permisos');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Clínica DentCareRC
    const clinicaRes = await client.query(
      `INSERT INTO clinicas (nombre, slug, color_primario, color_secundario, direccion, telefono, whatsapp, email, horario_atencion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (slug) DO UPDATE SET nombre = EXCLUDED.nombre
       RETURNING id`,
      ['DentCareRC', 'dentcarerc', '#C1673F', '#A5522F', '', '', '', '', 'Lunes a viernes 8:00 - 18:00']
    );
    const clinicaId = clinicaRes.rows[0].id;

    // 2) Permisos (catálogo global, no depende de clínica)
    // Se anota qué códigos ya existían ANTES de este seed: los que aparecen
    // recién ahora (funciones nuevas de una versión nueva) son los únicos que
    // se agregan a roles ya existentes, para no pisar la personalización
    // que el admin haya hecho en "Roles y permisos".
    await client.query('CREATE TABLE IF NOT EXISTS seed_historial (clave varchar(120) PRIMARY KEY, aplicado_en timestamptz NOT NULL DEFAULT now())');
    const existentesRes = await client.query('SELECT codigo FROM permisos');
    const codigosPrevios = new Set(existentesRes.rows.map((r) => r.codigo));
    for (const p of PERMISOS) {
      await client.query(
        `INSERT INTO permisos (codigo, modulo, descripcion) VALUES ($1,$2,$3)
         ON CONFLICT (codigo) DO UPDATE SET modulo = EXCLUDED.modulo, descripcion = EXCLUDED.descripcion`,
        [p.codigo, p.modulo, p.descripcion]
      );
    }
    const permisosRes = await client.query('SELECT id, codigo FROM permisos');
    const permisoIdPorCodigo = Object.fromEntries(permisosRes.rows.map(r => [r.codigo, r.id]));

    // 3) Roles de sistema + asignación de permisos por defecto
    const rolesDefinidos = [
      { codigo: 'admin', nombre: 'Administrador' },
      { codigo: 'odontologo', nombre: 'Odontólogo' },
      { codigo: 'recepcion', nombre: 'Recepción' },
      { codigo: 'asistente', nombre: 'Asistente' },
      { codigo: 'helpdesk', nombre: 'Soporte técnico' },
    ];
    const rolIdPorCodigo = {};
    for (const r of rolesDefinidos) {
      const res = await client.query(
        `INSERT INTO roles (clinica_id, codigo, nombre, es_sistema) VALUES ($1,$2,$3,true)
         ON CONFLICT (clinica_id, codigo) DO UPDATE SET nombre = EXCLUDED.nombre
         RETURNING id, (xmax = 0) AS recien_creado`,
        [clinicaId, r.codigo, r.nombre]
      );
      rolIdPorCodigo[r.codigo] = res.rows[0].id;
      const rolRecienCreado = res.rows[0].recien_creado;

      // Nunca se borran asignaciones: el seed corre en cada deploy y no debe
      // deshacer cambios hechos por el admin. Cada par (rol, permiso) por
      // defecto se otorga UNA sola vez en la vida de la instalación y queda
      // anotado en seed_historial: si después el admin lo quita, no vuelve.
      // El admin siempre recibe todo.
      const porDefecto = PERMISOS_POR_ROL[r.codigo] === '*'
        ? PERMISOS.map(p => p.codigo)
        : (PERMISOS_POR_ROL[r.codigo] || []);
      void rolRecienCreado; void codigosPrevios;

      for (const codigo of [...new Set(porDefecto)]) {
        const permisoId = permisoIdPorCodigo[codigo];
        if (!permisoId) continue;
        const clave = `rol:${res.rows[0].id}:${codigo}`;
        const yaOtorgado = await client.query('SELECT 1 FROM seed_historial WHERE clave=$1', [clave]);
        if (yaOtorgado.rowCount && PERMISOS_POR_ROL[r.codigo] !== '*') continue;
        await client.query(
          'INSERT INTO rol_permisos (rol_id, permiso_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [res.rows[0].id, permisoId]
        );
        await client.query('INSERT INTO seed_historial (clave) VALUES ($1) ON CONFLICT DO NOTHING', [clave]);
      }
    }

    // 3b) Tipos de recall por defecto (controles periódicos). El intervalo
    // es editable por la clínica y por paciente; acá solo se crean si faltan.
    const RECALLS = [
      ['profilaxis', 'Control y limpieza', 6, 'Control general + profilaxis', '#2E7D32'],
      ['perio_mantenimiento', 'Mantenimiento periodontal', 3, 'Pacientes con periodontitis tratada', '#C62828'],
      ['fluor', 'Aplicación de flúor', 6, 'Niños y pacientes con riesgo de caries alto', '#1565C0'],
      ['sellantes', 'Revisión de sellantes', 12, 'Control de retención de sellantes', '#00838F'],
      ['control_ortodoncia', 'Control de ortodoncia', 1, 'Activación / control mensual', '#6A1B9A'],
      ['contencion_ortodoncia', 'Control de contención', 6, 'Retenedores post-ortodoncia', '#8E24AA'],
      ['control_implante', 'Control de implante', 12, 'Mantenimiento periimplantario', '#EF6C00'],
      ['control_endodoncia', 'Control de endodoncia', 6, 'Control clínico-radiográfico de conducto', '#AD1457'],
      ['control_protesis', 'Control de prótesis', 12, 'Revisión de prótesis fija/removible', '#5D4037'],
      ['radiografia_control', 'Radiografías de control', 24, 'Serie de control / bitewings', '#455A64'],
    ];
    for (const [codigo, nombre, meses, desc, color] of RECALLS) {
      await client.query(
        `INSERT INTO recall_tipos (clinica_id, codigo, nombre, intervalo_meses, descripcion, color)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (clinica_id, codigo) DO NOTHING`,
        [clinicaId, codigo, nombre, meses, desc, color]
      );
    }

    // 4) Usuario admin (protegido). Nunca queda con la contraseña "admin":
    //  - Instalación nueva: ADMIN_PASSWORD si está definida; si no, una
    //    aleatoria que se muestra UNA vez en el registro del deploy.
    //  - Instalación existente en producción que todavía tenga "admin": se
    //    reemplaza igual (ADMIN_PASSWORD o aleatoria) y se cierran sus sesiones.
    //    Si la contraseña ya se cambió, NO se toca.
    //  - En los dos casos hay que cambiarla en el primer ingreso.
    const prod = process.env.NODE_ENV === 'production';
    const generar = () => `Dova-${require('crypto').randomBytes(9).toString('base64url')}`;
    const adm = await client.query('SELECT id, password_hash FROM usuarios WHERE clinica_id=$1 AND username=$2', [clinicaId, 'admin']);
    if (!adm.rowCount) {
      const clave = process.env.ADMIN_PASSWORD || generar();
      await client.query(
        `INSERT INTO usuarios (clinica_id, rol_id, nombre, username, password_hash, activo, es_admin_protegido, debe_cambiar_clave)
         VALUES ($1,$2,'Administrador','admin',$3,true,true,true)`,
        [clinicaId, rolIdPorCodigo.admin, await bcrypt.hash(clave, 12)]
      );
      if (!process.env.ADMIN_PASSWORD) console.log(`[seed] Contraseña inicial del usuario "admin": ${clave}  (se pide cambiarla en el primer ingreso)`);
    } else if (await bcrypt.compare('admin', adm.rows[0].password_hash)) {
      if (prod) {
        const clave = process.env.ADMIN_PASSWORD || generar();
        await client.query('UPDATE usuarios SET password_hash=$2, debe_cambiar_clave=true, token_version=token_version+1 WHERE id=$1', [adm.rows[0].id, await bcrypt.hash(clave, 12)]);
        await client.query("UPDATE refresh_tokens SET revocado=true, revocado_en=now(), motivo='clave_por_defecto' WHERE usuario_id=$1 AND NOT revocado", [adm.rows[0].id]);
        console.log(process.env.ADMIN_PASSWORD
          ? '[seed] El usuario "admin" tenía la contraseña por defecto: se reemplazó por ADMIN_PASSWORD (se pide cambiarla al ingresar).'
          : `[seed] El usuario "admin" tenía la contraseña por defecto "admin". Nueva contraseña temporal: ${clave}  (se pide cambiarla al ingresar)`);
      } else {
        // Desarrollo local: se conserva para no romper las pruebas, pero la API no deja operar hasta cambiarla.
        await client.query('UPDATE usuarios SET debe_cambiar_clave=true WHERE id=$1', [adm.rows[0].id]);
      }
    }

    await client.query('COMMIT');
    console.log('Seed completado: clínica DentCareRC, roles, permisos y usuario admin listos.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en seed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
