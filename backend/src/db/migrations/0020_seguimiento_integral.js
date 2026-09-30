/* 0020 — Seguimiento clínico integral.

   Agrega a DOVA las funciones que tienen los sistemas odontológicos más
   completos del mercado (Open Dental, Dentrix, Dentally, Curve, OrthoTrac,
   WinOMS, Dentalink, Doctocliq, Gesden…) y que DOVA no tenía, con foco en el
   SEGUIMIENTO DEL PACIENTE A LARGO PLAZO:

   1. Salud estructurada: alergias, medicación, condiciones sistémicas,
      anamnesis firmada con vencimiento, signos vitales, alertas manuales.
   2. Motor de recalls (profilaxis, perio, flúor, controles…) con intervalos,
      disparo automático al atender un turno y registro de contactos.
   3. Periodontograma de 6 sitios por pieza con índices y comparación, PSR.
   4. Especialidades: implantes (con lote/serie), endodoncia (conductos,
      diagnóstico AAE), ortodoncia (caso + visitas + alineadores),
      preventivos (sellantes/flúor), riesgo de caries, biopsias, anestesia,
      evaluaciones (ASA, Frankl, EVA…), piezas en observación.
   5. Controles programados unificados (un solo lugar para TODO control
      futuro: endo 6/12 m, implantes, contención de ortodoncia, sellantes…).
   6. Comunicaciones (registro de cada contacto), encuestas de satisfacción,
      tareas del personal.
   7. Operaciones: sillones, bloqueos de agenda, flujo del paciente en el
      turno, esterilización (ciclos + paquetes trazables al paciente),
      equipos y mantenimiento, directorio de laboratorios y ciclo de vida
      del trabajo de laboratorio, fichaje del personal.
   8. Finanzas: aseguradoras/prepagas/convenios con planes y cobertura,
      autorizaciones, listas de precios, ajustes de cuenta corriente,
      comisiones de odontólogos, metas, fecha de bloqueo contable.

   Todas las tablas nuevas llevan clinica_id (arquitectura multi-clínica) y
   son acumulativas: la migración no toca ni borra datos existentes. */

exports.up = (pgm) => {
  pgm.sql(`
  -- =========================== PACIENTES (datos extra) ===========================
  ALTER TABLE pacientes
    ADD COLUMN IF NOT EXISTS fuente_referencia varchar(60),
    ADD COLUMN IF NOT EXISTS referido_por_paciente_id integer REFERENCES pacientes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS responsable_paciente_id integer REFERENCES pacientes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS responsable_nombre varchar(160),
    ADD COLUMN IF NOT EXISTS responsable_parentesco varchar(60),
    ADD COLUMN IF NOT EXISTS responsable_telefono varchar(40),
    ADD COLUMN IF NOT EXISTS responsable_ci varchar(30),
    ADD COLUMN IF NOT EXISTS grupo_familiar varchar(80),
    ADD COLUMN IF NOT EXISTS acepta_whatsapp boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS acepta_recordatorios boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS grupo_sanguineo varchar(5),
    ADD COLUMN IF NOT EXISTS lista_precio_id integer;

  ALTER TABLE clinicas
    ADD COLUMN IF NOT EXISTS fecha_bloqueo_contable date,
    ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

  -- ================================ SALUD ================================
  CREATE TABLE paciente_alergias (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    sustancia varchar(120) NOT NULL,
    tipo varchar(20) NOT NULL DEFAULT 'medicamento',
    reaccion varchar(200),
    severidad varchar(20) NOT NULL DEFAULT 'moderada',
    activa boolean NOT NULL DEFAULT true,
    notas text,
    creado_por integer REFERENCES usuarios ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX ON paciente_alergias (clinica_id, paciente_id);

  CREATE TABLE paciente_medicacion (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    medicamento varchar(150) NOT NULL,
    dosis varchar(80),
    frecuencia varchar(80),
    indicacion varchar(200),
    fecha_inicio date,
    fecha_fin date,
    activa boolean NOT NULL DEFAULT true,
    notas text,
    creado_por integer REFERENCES usuarios ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX ON paciente_medicacion (clinica_id, paciente_id);

  CREATE TABLE paciente_condiciones (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    condicion varchar(60) NOT NULL,
    detalle varchar(250),
    estado varchar(20) NOT NULL DEFAULT 'activa',
    fecha_diagnostico date,
    requiere_premedicacion boolean NOT NULL DEFAULT false,
    notas text,
    creado_por integer REFERENCES usuarios ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX ON paciente_condiciones (clinica_id, paciente_id);

  CREATE TABLE anamnesis (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    fecha date NOT NULL DEFAULT current_date,
    respuestas jsonb NOT NULL DEFAULT '{}'::jsonb,
    observaciones text,
    firmada boolean NOT NULL DEFAULT false,
    firma text,
    vigencia_meses integer NOT NULL DEFAULT 12,
    registrado_por integer REFERENCES usuarios ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX ON anamnesis (clinica_id, paciente_id, fecha DESC);

  CREATE TABLE signos_vitales (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    turno_id integer REFERENCES turnos ON DELETE SET NULL,
    fecha timestamptz NOT NULL DEFAULT now(),
    presion_sistolica integer,
    presion_diastolica integer,
    pulso integer,
    temperatura numeric(4,1),
    spo2 integer,
    frecuencia_respiratoria integer,
    glucemia integer,
    peso_kg numeric(5,1),
    talla_cm numeric(5,1),
    imc numeric(5,1),
    notas text,
    registrado_por integer REFERENCES usuarios ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX ON signos_vitales (clinica_id, paciente_id, fecha DESC);

  CREATE TABLE paciente_alertas (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    texto varchar(300) NOT NULL,
    nivel varchar(20) NOT NULL DEFAULT 'atencion',
    emergente boolean NOT NULL DEFAULT false,
    activa boolean NOT NULL DEFAULT true,
    creado_por integer REFERENCES usuarios ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX ON paciente_alertas (clinica_id, paciente_id);

  -- ================================ RECALLS ================================
  CREATE TABLE recall_tipos (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    codigo varchar(40) NOT NULL,
    nombre varchar(100) NOT NULL,
    intervalo_meses integer NOT NULL DEFAULT 6,
    descripcion text,
    color varchar(20),
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE (clinica_id, codigo)
  );

  ALTER TABLE tratamientos ADD COLUMN IF NOT EXISTS recall_tipo_id integer REFERENCES recall_tipos ON DELETE SET NULL;

  CREATE TABLE paciente_recalls (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    recall_tipo_id integer NOT NULL REFERENCES recall_tipos ON DELETE CASCADE,
    intervalo_meses integer,
    ultima_fecha date,
    proxima_fecha date NOT NULL,
    estado varchar(20) NOT NULL DEFAULT 'activo',
    pausado_hasta date,
    motivo_estado varchar(200),
    odontologo_id integer REFERENCES odontologos ON DELETE SET NULL,
    turno_id integer REFERENCES turnos ON DELETE SET NULL,
    intentos_contacto integer NOT NULL DEFAULT 0,
    ultimo_contacto_en timestamptz,
    ultimo_contacto_resultado varchar(30),
    notas text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE (paciente_id, recall_tipo_id)
  );
  CREATE INDEX ON paciente_recalls (clinica_id, estado, proxima_fecha);

  -- ============================ SEGUIMIENTO ============================
  CREATE TABLE comunicaciones (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    canal varchar(20) NOT NULL DEFAULT 'whatsapp',
    direccion varchar(10) NOT NULL DEFAULT 'saliente',
    motivo varchar(30) NOT NULL DEFAULT 'otro',
    resultado varchar(30),
    contenido text,
    referencia_tipo varchar(40),
    referencia_id integer,
    usuario_id integer REFERENCES usuarios ON DELETE SET NULL,
    fecha timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX ON comunicaciones (clinica_id, paciente_id, fecha DESC);

  CREATE TABLE piezas_observacion (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    pieza varchar(10) NOT NULL,
    superficie varchar(30),
    hallazgo varchar(120) NOT NULL,
    detalle text,
    fecha_deteccion date NOT NULL DEFAULT current_date,
    fecha_reevaluacion date,
    estado varchar(20) NOT NULL DEFAULT 'en_observacion',
    resultado text,
    odontologo_id integer REFERENCES odontologos ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX ON piezas_observacion (clinica_id, estado, fecha_reevaluacion);

  CREATE TABLE controles_programados (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    origen_tipo varchar(30) NOT NULL DEFAULT 'otro',
    origen_id integer,
    titulo varchar(150) NOT NULL,
    fecha_programada date NOT NULL,
    fecha_realizada date,
    estado varchar(20) NOT NULL DEFAULT 'pendiente',
    resultado varchar(30),
    datos jsonb NOT NULL DEFAULT '{}'::jsonb,
    notas text,
    odontologo_id integer REFERENCES odontologos ON DELETE SET NULL,
    turno_id integer REFERENCES turnos ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX ON controles_programados (clinica_id, estado, fecha_programada);
  CREATE INDEX ON controles_programados (origen_tipo, origen_id);

  CREATE TABLE encuestas_satisfaccion (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    turno_id integer REFERENCES turnos ON DELETE SET NULL,
    odontologo_id integer REFERENCES odontologos ON DELETE SET NULL,
    fecha date NOT NULL DEFAULT current_date,
    nps integer,
    atencion integer,
    puntualidad integer,
    limpieza integer,
    explicacion integer,
    comentario text,
    canal varchar(20),
    creado_en timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE tareas (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    titulo varchar(200) NOT NULL,
    descripcion text,
    paciente_id integer REFERENCES pacientes ON DELETE CASCADE,
    asignado_a integer REFERENCES usuarios ON DELETE SET NULL,
    creado_por integer REFERENCES usuarios ON DELETE SET NULL,
    vencimiento date,
    prioridad varchar(10) NOT NULL DEFAULT 'media',
    estado varchar(20) NOT NULL DEFAULT 'pendiente',
    completada_en timestamptz,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX ON tareas (clinica_id, estado, vencimiento);

  -- ============================ PERIODONCIA ============================
  CREATE TABLE perio_examenes (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    fecha date NOT NULL DEFAULT current_date,
    odontologo_id integer REFERENCES odontologos ON DELETE SET NULL,
    tipo varchar(20) NOT NULL DEFAULT 'completo',
    datos jsonb NOT NULL DEFAULT '{}'::jsonb,
    indices jsonb NOT NULL DEFAULT '{}'::jsonb,
    estadio varchar(5),
    grado varchar(2),
    extension varchar(20),
    diagnostico text,
    fumador boolean,
    diabetes boolean,
    notas text,
    creado_por integer REFERENCES usuarios ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX ON perio_examenes (clinica_id, paciente_id, fecha DESC);

  CREATE TABLE psr_registros (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    fecha date NOT NULL DEFAULT current_date,
    s1 varchar(3), s2 varchar(3), s3 varchar(3), s4 varchar(3), s5 varchar(3), s6 varchar(3),
    odontologo_id integer REFERENCES odontologos ON DELETE SET NULL,
    notas text,
    creado_en timestamptz NOT NULL DEFAULT now()
  );

  -- ============================ ESPECIALIDADES ============================
  CREATE TABLE implantes (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    pieza varchar(10) NOT NULL,
    fabricante varchar(100) NOT NULL,
    sistema varchar(100),
    modelo_ref varchar(80),
    lote varchar(80),
    numero_serie varchar(80),
    diametro_mm numeric(4,2),
    longitud_mm numeric(4,1),
    fecha_colocacion date,
    cirujano_id integer REFERENCES odontologos ON DELETE SET NULL,
    torque_insercion_ncm integer,
    isq_inicial integer,
    isq_segunda_fase integer,
    tipo_oseo varchar(4),
    injerto varchar(200),
    membrana varchar(120),
    tecnica varchar(20),
    carga varchar(20),
    fecha_segunda_fase date,
    pilar_tipo varchar(100),
    pilar_lote varchar(80),
    pilar_torque_ncm integer,
    restauracion_tipo varchar(20),
    fecha_carga date,
    laboratorio varchar(120),
    estado varchar(20) NOT NULL DEFAULT 'colocado',
    fecha_retiro date,
    motivo_retiro text,
    notas text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX ON implantes (clinica_id, lote);
  CREATE INDEX ON implantes (clinica_id, paciente_id);

  CREATE TABLE endodoncias (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    pieza varchar(10) NOT NULL,
    tipo varchar(20) NOT NULL DEFAULT 'tratamiento',
    fecha_inicio date NOT NULL DEFAULT current_date,
    fecha_fin date,
    odontologo_id integer REFERENCES odontologos ON DELETE SET NULL,
    diagnostico_pulpar varchar(50),
    diagnostico_periapical varchar(50),
    pruebas jsonb NOT NULL DEFAULT '{}'::jsonb,
    tecnica_instrumentacion varchar(120),
    sistema_limas varchar(120),
    irrigacion varchar(200),
    medicacion_intraconducto varchar(120),
    restauracion_provisoria varchar(120),
    complicaciones text,
    estado varchar(20) NOT NULL DEFAULT 'en_curso',
    notas text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX ON endodoncias (clinica_id, paciente_id);

  CREATE TABLE endo_conductos (
    id serial PRIMARY KEY,
    endodoncia_id integer NOT NULL REFERENCES endodoncias ON DELETE CASCADE,
    conducto varchar(10) NOT NULL,
    referencia varchar(40),
    longitud_tentativa_mm numeric(4,1),
    longitud_trabajo_mm numeric(4,1),
    localizador_apical varchar(40),
    lima_inicial varchar(20),
    lima_maestra varchar(20),
    conicidad varchar(10),
    tecnica_obturacion varchar(40),
    cono_principal varchar(40),
    sellador varchar(60),
    longitud_obturacion_mm numeric(4,1),
    notas text
  );

  CREATE TABLE orto_casos (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    odontologo_id integer REFERENCES odontologos ON DELETE SET NULL,
    clase_molar_derecha varchar(10),
    clase_molar_izquierda varchar(10),
    clase_canina_derecha varchar(10),
    clase_canina_izquierda varchar(10),
    overjet_mm numeric(4,1),
    overbite_mm numeric(4,1),
    mordida_cruzada varchar(60),
    apinamiento varchar(60),
    linea_media varchar(60),
    diagnostico text,
    objetivos text,
    tipo_aparatologia varchar(30) NOT NULL DEFAULT 'brackets_metalicos',
    marca varchar(80),
    total_alineadores integer,
    dias_por_alineador integer,
    fecha_instalacion date,
    fecha_retiro_estimada date,
    fecha_retiro_real date,
    honorario_total numeric(14,2),
    entrega_inicial numeric(14,2),
    cuota_mensual numeric(14,2),
    fase varchar(20) NOT NULL DEFAULT 'diagnostico',
    contencion_superior varchar(80),
    contencion_inferior varchar(80),
    notas text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE orto_visitas (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    caso_id integer NOT NULL REFERENCES orto_casos ON DELETE CASCADE,
    fecha date NOT NULL DEFAULT current_date,
    odontologo_id integer REFERENCES odontologos ON DELETE SET NULL,
    arco_superior varchar(60),
    arco_inferior varchar(60),
    elasticos varchar(80),
    alineador_actual integer,
    brackets_despegados integer NOT NULL DEFAULT 0,
    higiene integer,
    colaboracion integer,
    procedimiento text,
    proximo_paso text,
    notas text,
    turno_id integer REFERENCES turnos ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE preventivos (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    tipo varchar(30) NOT NULL,
    pieza varchar(10),
    producto varchar(120),
    lote varchar(60),
    fecha date NOT NULL DEFAULT current_date,
    odontologo_id integer REFERENCES odontologos ON DELETE SET NULL,
    estado_retencion varchar(20),
    fecha_revision date,
    notas text,
    creado_en timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE riesgo_caries (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    fecha date NOT NULL DEFAULT current_date,
    indicadores jsonb NOT NULL DEFAULT '{}'::jsonb,
    factores_riesgo jsonb NOT NULL DEFAULT '{}'::jsonb,
    factores_proteccion jsonb NOT NULL DEFAULT '{}'::jsonb,
    nivel varchar(10) NOT NULL,
    recall_sugerido_meses integer,
    recomendaciones text,
    odontologo_id integer REFERENCES odontologos ON DELETE SET NULL,
    notas text,
    creado_en timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE evaluaciones_clinicas (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    tipo varchar(20) NOT NULL,
    valor varchar(30) NOT NULL,
    detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
    fecha date NOT NULL DEFAULT current_date,
    turno_id integer REFERENCES turnos ON DELETE SET NULL,
    odontologo_id integer REFERENCES odontologos ON DELETE SET NULL,
    notas text,
    creado_en timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE biopsias (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    zona varchar(120) NOT NULL,
    tipo varchar(20) NOT NULL DEFAULT 'incisional',
    descripcion_lesion text,
    fecha_toma date NOT NULL DEFAULT current_date,
    laboratorio_patologia varchar(150),
    fecha_envio date,
    fecha_resultado date,
    diagnostico_histopatologico text,
    requiere_seguimiento boolean NOT NULL DEFAULT false,
    estado varchar(25) NOT NULL DEFAULT 'tomada',
    odontologo_id integer REFERENCES odontologos ON DELETE SET NULL,
    notas text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE anestesias (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    fecha date NOT NULL DEFAULT current_date,
    turno_id integer REFERENCES turnos ON DELETE SET NULL,
    anestesico varchar(60) NOT NULL,
    concentracion varchar(20),
    vasoconstrictor varchar(40),
    cartuchos numeric(4,1) NOT NULL DEFAULT 1,
    tecnica varchar(40),
    zona varchar(80),
    lote varchar(60),
    reaccion_adversa text,
    odontologo_id integer REFERENCES odontologos ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now()
  );

  -- ============================ OPERACIONES ============================
  CREATE TABLE sillones (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    nombre varchar(60) NOT NULL,
    ubicacion varchar(100),
    color varchar(20),
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now()
  );

  ALTER TABLE turnos
    ADD COLUMN IF NOT EXISTS sillon_id integer REFERENCES sillones ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS confirmacion varchar(25) NOT NULL DEFAULT 'sin_confirmar',
    ADD COLUMN IF NOT EXISTS confirmado_en timestamptz,
    ADD COLUMN IF NOT EXISTS llegada_en timestamptz,
    ADD COLUMN IF NOT EXISTS en_sillon_en timestamptz,
    ADD COLUMN IF NOT EXISTS finalizado_en timestamptz,
    ADD COLUMN IF NOT EXISTS primera_vez boolean NOT NULL DEFAULT false;

  CREATE TABLE agenda_bloqueos (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    odontologo_id integer REFERENCES odontologos ON DELETE CASCADE,
    sillon_id integer REFERENCES sillones ON DELETE CASCADE,
    fecha date NOT NULL,
    fecha_hasta date,
    hora_desde time,
    hora_hasta time,
    tipo varchar(20) NOT NULL DEFAULT 'otro',
    motivo varchar(200),
    creado_por integer REFERENCES usuarios ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE equipos (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    nombre varchar(120) NOT NULL,
    tipo varchar(40),
    marca varchar(80),
    modelo varchar(80),
    numero_serie varchar(80),
    ubicacion varchar(80),
    fecha_compra date,
    garantia_hasta date,
    frecuencia_mantenimiento_meses integer,
    proximo_mantenimiento date,
    estado varchar(25) NOT NULL DEFAULT 'operativo',
    notas text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE equipo_mantenimientos (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    equipo_id integer NOT NULL REFERENCES equipos ON DELETE CASCADE,
    fecha date NOT NULL DEFAULT current_date,
    tipo varchar(20) NOT NULL DEFAULT 'preventivo',
    realizado_por varchar(120),
    costo numeric(14,2),
    descripcion text,
    creado_en timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE esterilizacion_ciclos (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    numero varchar(40) NOT NULL,
    equipo_id integer REFERENCES equipos ON DELETE SET NULL,
    fecha timestamptz NOT NULL DEFAULT now(),
    metodo varchar(20) NOT NULL DEFAULT 'vapor',
    temperatura_c numeric(5,1),
    presion_bar numeric(4,2),
    duracion_min integer,
    indicador_quimico varchar(10) NOT NULL DEFAULT 'pasa',
    indicador_biologico varchar(10) NOT NULL DEFAULT 'na',
    bowie_dick varchar(10) NOT NULL DEFAULT 'na',
    estado varchar(15) NOT NULL DEFAULT 'liberado',
    operador_id integer REFERENCES usuarios ON DELETE SET NULL,
    notas text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE (clinica_id, numero)
  );

  CREATE TABLE esterilizacion_paquetes (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    ciclo_id integer NOT NULL REFERENCES esterilizacion_ciclos ON DELETE CASCADE,
    codigo varchar(40) NOT NULL,
    descripcion varchar(150),
    fecha_vencimiento date,
    estado varchar(15) NOT NULL DEFAULT 'disponible',
    paciente_id integer REFERENCES pacientes ON DELETE SET NULL,
    turno_id integer REFERENCES turnos ON DELETE SET NULL,
    usado_en timestamptz,
    usado_por integer REFERENCES usuarios ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE (clinica_id, codigo)
  );

  CREATE TABLE laboratorios (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    nombre varchar(150) NOT NULL,
    contacto varchar(120),
    telefono varchar(40),
    email varchar(150),
    direccion text,
    dias_entrega integer NOT NULL DEFAULT 7,
    servicios text,
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now()
  );

  ALTER TABLE laboratorio
    ADD COLUMN IF NOT EXISTS laboratorio_id integer REFERENCES laboratorios ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS material varchar(100),
    ADD COLUMN IF NOT EXISTS color_tono varchar(20),
    ADD COLUMN IF NOT EXISTS instrucciones text,
    ADD COLUMN IF NOT EXISTS precio_paciente numeric(14,2),
    ADD COLUMN IF NOT EXISTS factura_numero varchar(40),
    ADD COLUMN IF NOT EXISTS turno_instalacion_id integer REFERENCES turnos ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS fecha_controlado date,
    ADD COLUMN IF NOT EXISTS fecha_instalado date,
    ADD COLUMN IF NOT EXISTS motivo_rehacer text,
    ADD COLUMN IF NOT EXISTS actualizado_en timestamptz NOT NULL DEFAULT now();

  CREATE TABLE fichajes (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    usuario_id integer NOT NULL REFERENCES usuarios ON DELETE CASCADE,
    tipo varchar(15) NOT NULL,
    fecha timestamptz NOT NULL DEFAULT now(),
    nota varchar(200)
  );
  CREATE INDEX ON fichajes (clinica_id, usuario_id, fecha DESC);

  -- ============================== FINANZAS ==============================
  CREATE TABLE aseguradoras (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    nombre varchar(150) NOT NULL,
    tipo varchar(20) NOT NULL DEFAULT 'prepaga',
    ruc varchar(30),
    contacto varchar(120),
    telefono varchar(40),
    email varchar(150),
    notas text,
    activa boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE aseguradora_planes (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    aseguradora_id integer NOT NULL REFERENCES aseguradoras ON DELETE CASCADE,
    nombre varchar(120) NOT NULL,
    cobertura_general numeric(5,2) NOT NULL DEFAULT 0,
    cobertura jsonb NOT NULL DEFAULT '{}'::jsonb,
    tope_anual numeric(14,2),
    copago_fijo numeric(14,2),
    requiere_autorizacion boolean NOT NULL DEFAULT false,
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE paciente_coberturas (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    plan_id integer NOT NULL REFERENCES aseguradora_planes ON DELETE CASCADE,
    numero_afiliado varchar(60),
    titular varchar(150),
    parentesco varchar(40),
    vigencia_desde date,
    vigencia_hasta date,
    principal boolean NOT NULL DEFAULT true,
    activa boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE autorizaciones (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    cobertura_id integer REFERENCES paciente_coberturas ON DELETE SET NULL,
    presupuesto_id integer REFERENCES presupuestos ON DELETE SET NULL,
    numero varchar(60),
    descripcion varchar(250),
    fecha_solicitud date NOT NULL DEFAULT current_date,
    fecha_respuesta date,
    monto_solicitado numeric(14,2),
    monto_aprobado numeric(14,2),
    estado varchar(15) NOT NULL DEFAULT 'solicitada',
    notas text,
    creado_en timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE listas_precios (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    nombre varchar(120) NOT NULL,
    aseguradora_id integer REFERENCES aseguradoras ON DELETE SET NULL,
    activa boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE lista_precio_items (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    lista_id integer NOT NULL REFERENCES listas_precios ON DELETE CASCADE,
    tratamiento_id integer NOT NULL REFERENCES tratamientos ON DELETE CASCADE,
    precio numeric(14,2) NOT NULL,
    UNIQUE (lista_id, tratamiento_id)
  );

  ALTER TABLE pacientes ADD CONSTRAINT pacientes_lista_precio_fk FOREIGN KEY (lista_precio_id) REFERENCES listas_precios(id) ON DELETE SET NULL;

  CREATE TABLE ajustes_cuenta (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    paciente_id integer NOT NULL REFERENCES pacientes ON DELETE CASCADE,
    tipo varchar(20) NOT NULL,
    monto numeric(14,2) NOT NULL,
    motivo varchar(250) NOT NULL,
    fecha date NOT NULL DEFAULT current_date,
    usuario_id integer REFERENCES usuarios ON DELETE SET NULL,
    anulado boolean NOT NULL DEFAULT false,
    creado_en timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE comision_reglas (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    odontologo_id integer NOT NULL REFERENCES odontologos ON DELETE CASCADE,
    tratamiento_id integer REFERENCES tratamientos ON DELETE CASCADE,
    porcentaje numeric(5,2) NOT NULL,
    descontar_laboratorio boolean NOT NULL DEFAULT true,
    activa boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE comision_liquidaciones (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    odontologo_id integer NOT NULL REFERENCES odontologos ON DELETE CASCADE,
    desde date NOT NULL,
    hasta date NOT NULL,
    produccion numeric(14,2) NOT NULL DEFAULT 0,
    costo_laboratorio numeric(14,2) NOT NULL DEFAULT 0,
    comision numeric(14,2) NOT NULL DEFAULT 0,
    detalle jsonb NOT NULL DEFAULT '[]'::jsonb,
    estado varchar(15) NOT NULL DEFAULT 'borrador',
    creado_por integer REFERENCES usuarios ON DELETE SET NULL,
    pagada_en timestamptz,
    creado_en timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE metas (
    id serial PRIMARY KEY,
    clinica_id integer NOT NULL REFERENCES clinicas ON DELETE CASCADE,
    odontologo_id integer REFERENCES odontologos ON DELETE CASCADE,
    periodo varchar(7) NOT NULL,
    tipo varchar(30) NOT NULL,
    objetivo numeric(14,2) NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now()
  );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
  DROP TABLE IF EXISTS metas, comision_liquidaciones, comision_reglas, ajustes_cuenta, lista_precio_items;
  ALTER TABLE pacientes DROP CONSTRAINT IF EXISTS pacientes_lista_precio_fk;
  DROP TABLE IF EXISTS listas_precios, autorizaciones, paciente_coberturas, aseguradora_planes, aseguradoras,
    fichajes, esterilizacion_paquetes, esterilizacion_ciclos, equipo_mantenimientos, agenda_bloqueos,
    anestesias, biopsias, evaluaciones_clinicas, riesgo_caries, preventivos, orto_visitas, orto_casos,
    endo_conductos, endodoncias, implantes, psr_registros, perio_examenes, tareas, encuestas_satisfaccion,
    controles_programados, piezas_observacion, comunicaciones, paciente_recalls,
    paciente_alertas, signos_vitales, anamnesis, paciente_condiciones, paciente_medicacion, paciente_alergias;
  ALTER TABLE laboratorio DROP COLUMN IF EXISTS laboratorio_id, DROP COLUMN IF EXISTS material, DROP COLUMN IF EXISTS color_tono,
    DROP COLUMN IF EXISTS instrucciones, DROP COLUMN IF EXISTS precio_paciente, DROP COLUMN IF EXISTS factura_numero,
    DROP COLUMN IF EXISTS turno_instalacion_id, DROP COLUMN IF EXISTS fecha_controlado, DROP COLUMN IF EXISTS fecha_instalado,
    DROP COLUMN IF EXISTS motivo_rehacer, DROP COLUMN IF EXISTS actualizado_en;
  DROP TABLE IF EXISTS laboratorios, equipos;
  ALTER TABLE turnos DROP COLUMN IF EXISTS sillon_id, DROP COLUMN IF EXISTS confirmacion, DROP COLUMN IF EXISTS confirmado_en,
    DROP COLUMN IF EXISTS llegada_en, DROP COLUMN IF EXISTS en_sillon_en, DROP COLUMN IF EXISTS finalizado_en, DROP COLUMN IF EXISTS primera_vez;
  DROP TABLE IF EXISTS sillones;
  ALTER TABLE tratamientos DROP COLUMN IF EXISTS recall_tipo_id;
  DROP TABLE IF EXISTS recall_tipos;
  ALTER TABLE clinicas DROP COLUMN IF EXISTS fecha_bloqueo_contable, DROP COLUMN IF EXISTS config;
  ALTER TABLE pacientes DROP COLUMN IF EXISTS fuente_referencia, DROP COLUMN IF EXISTS referido_por_paciente_id,
    DROP COLUMN IF EXISTS responsable_paciente_id, DROP COLUMN IF EXISTS responsable_nombre, DROP COLUMN IF EXISTS responsable_parentesco,
    DROP COLUMN IF EXISTS responsable_telefono, DROP COLUMN IF EXISTS responsable_ci, DROP COLUMN IF EXISTS grupo_familiar,
    DROP COLUMN IF EXISTS acepta_whatsapp, DROP COLUMN IF EXISTS acepta_recordatorios, DROP COLUMN IF EXISTS grupo_sanguineo,
    DROP COLUMN IF EXISTS lista_precio_id;
  `);
};
