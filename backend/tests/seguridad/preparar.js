// Prepara usuarios y una segunda clínica para la auditoría (idempotente).
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const hash = bcrypt.hashSync('Clave1234!', 10);
  const q = async (s, p) => (await db.query(s, p)).rows;
  let rol = (await q("SELECT id FROM roles WHERE clinica_id=1 AND codigo='sin_permisos'"))[0];
  if (!rol) rol = (await q("INSERT INTO roles (clinica_id, codigo, nombre, es_sistema) VALUES (1,'sin_permisos','Sin permisos (auditoría)',false) RETURNING id"))[0];
  await q('DELETE FROM rol_permisos WHERE rol_id=$1', [rol.id]);
  await q(`INSERT INTO usuarios (clinica_id, rol_id, nombre, username, password_hash, activo) VALUES (1,$1,'Sin Permisos','sinperm',$2,true)
           ON CONFLICT (clinica_id, username) DO UPDATE SET rol_id=EXCLUDED.rol_id, password_hash=EXCLUDED.password_hash, activo=true, debe_cambiar_clave=false`, [rol.id, hash]);
  // Segunda clínica
  let c2 = (await q("SELECT id FROM clinicas WHERE slug='clinica-b'"))[0];
  if (!c2) c2 = (await q("INSERT INTO clinicas (nombre, slug) VALUES ('Clínica B (auditoría)','clinica-b') RETURNING id"))[0];
  let r2 = (await q("SELECT id FROM roles WHERE clinica_id=$1 AND codigo='admin'", [c2.id]))[0];
  if (!r2) r2 = (await q("INSERT INTO roles (clinica_id, codigo, nombre, es_sistema) VALUES ($1,'admin','Administrador',true) RETURNING id", [c2.id]))[0];
  await q('INSERT INTO rol_permisos (rol_id, permiso_id) SELECT $1, id FROM permisos ON CONFLICT DO NOTHING', [r2.id]);
  await q(`INSERT INTO usuarios (clinica_id, rol_id, nombre, username, password_hash, activo) VALUES ($1,$2,'Admin B','adminb',$3,true)
           ON CONFLICT (clinica_id, username) DO UPDATE SET clinica_id=EXCLUDED.clinica_id, rol_id=EXCLUDED.rol_id, password_hash=EXCLUDED.password_hash, activo=true, debe_cambiar_clave=false`, [c2.id, r2.id, hash]);
  let pb = (await q("SELECT id FROM pacientes WHERE clinica_id=$1 AND ci='B-0001'", [c2.id]))[0];
  if (!pb) pb = (await q("INSERT INTO pacientes (clinica_id, nombre, apellido, ci, telefono) VALUES ($1,'Paciente','DeClinicaB','B-0001','0981 999 000') RETURNING id", [c2.id]))[0];
  await q("DELETE FROM login_intentos");
  console.log(JSON.stringify({ rolSinPermisos: rol.id, clinicaB: c2.id, pacienteB: pb.id }));
  await db.end();
})().catch((e) => { console.error(e); process.exit(1); });
