# DOVA — Seguimiento integral (migración 0020)

Funciones incorporadas después de relevar los sistemas odontológicos más completos del mercado: Open Dental, Dentrix, Dentally, Curve, Carestream (OrthoTrac/WinOMS), Dentalink, Doctocliq, Gesden, Clinic Cloud y Medesk, entre otros.

El foco está en el **seguimiento del paciente a largo plazo**: que ningún control, tratamiento o paciente quede olvidado. No se quitó ninguna función existente.

Cómo se probó:
- 125 pruebas de API sobre funciones, disparadores automáticos y permisos.
- 173 pruebas de interfaz sobre los 3 diseños, 4 roles, cada sección y sub-pestaña, escritorio y celular.
- 7 pruebas de receta y familia.
- La regresión completa de lo que ya existía, sin errores nuevos.

---

## 1. Salud del paciente (ficha › Salud)

**Datos clínicos**
- **Alergias estructuradas**: sustancia, tipo, reacción y severidad, incluida anafilaxia. No se puede cargar dos veces la misma alergia activa.
- **Medicación actual**: dosis, frecuencia, indicación, fechas y si está suspendida.
- **Condiciones sistémicas**: catálogo de 29 condiciones, entre ellas anticoagulado, bifosfonatos, prótesis valvular, embarazo, diabetes, radioterapia y alergia al látex. Cada una trae su recomendación clínica y un indicador de premedicación antibiótica.
- **Cuestionario de salud (anamnesis)**: 24 preguntas, firma del paciente en pantalla y vigencia configurable (12 meses por defecto). DOVA avisa cuando está vencido y precarga las respuestas anteriores.
- **Signos vitales**: presión, pulso, SpO₂, glucemia, temperatura, peso y talla. El IMC se calcula en el servidor.

**Alertas**
- **Alertas médicas automáticas**: un banner en la ficha y en el Modo Consulta, y también visibles para recepción. Se generan por:
  - alergias;
  - condiciones;
  - medicación que implica riesgo aunque no se haya cargado la condición (por ejemplo, warfarina se trata como anticoagulado);
  - presión o glucemia fuera de rango;
  - anamnesis vencida o sin firmar.
- **Avisos del equipo**: notas visibles para todos, como "muy ansioso" o "siempre llega tarde". Pueden aparecer como ventana emergente al abrir la ficha.

**Verificación de medicamentos**
Antes de recetar, se revisan cuatro cosas. La receta del Modo Consulta lo hace sola y pide confirmar ("Emitir igual") si hay advertencias.
- **Alergia**, incluida la reacción cruzada (penicilina → cefalosporinas; AINE ↔ AINE).
- **Interacción con la medicación actual**: 24 pares relevantes en odontología, como AINE + anticoagulante, metronidazol + warfarina, claritromicina + estatina u opioide + benzodiacepina.
- **Interacción con condiciones**: 21 reglas, como AINE en embarazo o insuficiencia renal, tetraciclinas en embarazo y vasoconstrictor en cardiópatas.
- **Interacción entre los fármacos de la misma receta.**

## 2. Motor de controles periódicos (recalls)

**Configuración**
- **10 tipos por defecto**: limpieza (6 m), mantenimiento periodontal (3 m), flúor, sellantes, ortodoncia (1 m), contención, implante, endodoncia, prótesis y radiografías de control.
- Los tipos se editan en **Configuración › Controles periódicos**.
- El intervalo también se puede ajustar por paciente.

**Disparadores: el recall se programa solo cuando**
- se marca atendido un turno cuyo tratamiento tiene un recall asociado (configurable por tratamiento);
- se finaliza un plan de tratamiento con recall;
- se confirma una periodontitis en el periodontograma (mantenimiento cada 3 meses, o 4 si es estadio I);
- se evalúa el riesgo de caries: el intervalo de control queda según el riesgo, y hay flúor extra si es alto;
- se aplica un sellante, flúor o una profilaxis;
- cambia la fase de ortodoncia (control mensual en la fase activa; recall de retenedores en la contención).

**Lista de trabajo de recepción**
- Muestra vencidos, próximos y "sin turno reservado", con filtros por tipo y odontólogo.
- Incluye un botón de WhatsApp con el mensaje armado. Los teléfonos de Paraguay se normalizan a +595.
- Se puede exportar a CSV.

**Registro de cada intento de contacto**
- Queda anotado el resultado: contestó, no contesta, mensaje dejado, rechaza, agendó…
- Si el paciente rechaza, el recall se pausa 90 días y vuelve a aparecer solo.
- Se puede pausar hasta una fecha, desactivar o reactivar.

**Indicador de cumplimiento**: porcentaje de pacientes al día con sus controles.

## 3. Periodoncia (ficha › Periodoncia)

- **Periodontograma de 6 sitios por pieza** (32 piezas). Registra:
  - por sitio: profundidad de sondaje (PS), margen gingival (MG), sangrado, placa y supuración;
  - por pieza: movilidad, furca, ausente e implante.
- **Carga rápida**: al escribir un dígito, el cursor pasa solo al siguiente sitio. Los valores altos se colorean en vivo.
- **Índices calculados en el servidor**: % de sangrado, % de placa, PS media, nivel de inserción clínica (NIC) medio y máximo, sitios con PS de 4–5 y ≥ 6 mm, movilidad y furcas.
- **Sugerencia de diagnóstico** según la clasificación AAP/EFP 2017 (estadio, grado, extensión). El odontólogo la confirma.
- **Comparación entre dos exámenes**: muestra qué piezas mejoran y cuáles empeoran.
- **Gráficos de evolución** del sangrado y de la PS media.
- **"Usar como base"**: clona el examen anterior para una reevaluación.
- **Impresión** del periodontograma.
- **PSR / examen periodontal básico** por sextante.

## 4. Especialidades (ficha › Especialidades)

**Implantes**
- Registro con fabricante, sistema, **lote y número de serie**, diámetro, longitud, torque, estabilidad (ISQ), tipo óseo, injerto, técnica, carga, pilar, restauración y estado.
- **Búsqueda por lote**, útil si el fabricante retira un lote.
- **Pasaporte de implantes** imprimible para el paciente.
- **Controles automáticos**: retiro de puntos, osteointegración, 6 meses y 1 año.

**Endodoncia**
- Diagnóstico pulpar y periapical con la terminología de la Asociación Americana de Endodoncistas (AAE).
- Pruebas: frío, calor, prueba eléctrica (EPT), percusión, palpación y otras.
- **Ficha por conducto**: longitud de trabajo, lima maestra, conicidad, obturación, cono y sellador.
- Al finalizar se programan **controles de curación a 6, 12 y 24 meses**.

**Ortodoncia**
- Diagnóstico: clase molar y canina, overjet/overbite, apiñamiento.
- Aparatología y alineadores (bandeja x de N), honorarios y cuotas.
- **Visitas**: arcos, elásticos, brackets despegados, higiene y colaboración, con promedios de colaboración.
- **Contención**: controles a 1, 3, 6 y 12 meses.

**Prevención**
- Sellantes, flúor, diamino fluoruro de plata, infiltración y otros, con el lote y la retención en los controles.
- **Riesgo de caries** tipo CAMBRA, calculado a partir de indicadores y factores de riesgo y de protección, con recomendaciones.

**Otros registros**
- **Evaluaciones**: ASA, Frankl, dolor (EVA), ansiedad (Corah), índice de placa (O'Leary), Mallampati, bruxismo y apertura bucal.
- **Biopsias**: toma → envío → resultado → informada, con controles si requieren seguimiento.
- **Anestesia**: anestésico, cartuchos, técnica y lote, con **calculadora de dosis máxima por peso**.
- **Piezas en observación**: lesiones a reevaluar con fecha.

## 5. Controles programados

Una sola lista con todos los controles futuros que nacen de tratamientos, con su resultado: sanado, en curación, periimplantitis, recidiva…

## 6. Seguimiento (menú › Seguimiento)

**Panel**
- Recalls vencidos y controles vencidos.
- Piezas para reevaluar y tratamientos sin turno.
- Turnos sin confirmar, pacientes para reactivar y cumpleaños.
- Biopsias pendientes, laboratorio atrasado y tareas.
- Puntuación de recomendación de los pacientes (NPS).

**Listas de trabajo**
- **Tratamientos sin turno**: planes en curso sin cita reservada (el "Treatment Finder" de Open Dental).
- **Presupuestos sin respuesta.**
- **Recordatorios de turnos** del día siguiente: WhatsApp → "Enviado" → "Confirmó" / "Pide reprogramar".
- **Reactivación**: pacientes que no vienen hace N meses.
- **Cumpleaños**, con saludo por WhatsApp.

**Registro y equipo**
- **Registro de comunicaciones** de cada paciente.
- **Tareas del equipo**: asignación, vencimiento y prioridad.
- **Encuestas de satisfacción**, con NPS por período.

**Datos de seguimiento del paciente**
- Cómo nos conoció, responsable o tutor, grupo sanguíneo y lista de precios.
- Consentimiento de WhatsApp y de recordatorios.
- **Grupo familiar**: agrupa a la familia para agendarla junta.

## 7. Operaciones (menú › Operaciones)

- **Sala de espera y flujo del paciente**: llegó → pasa al sillón → terminó. Mide la espera y la duración real, y marca el turno como atendido.
- **Confirmación de turnos.** Cada confirmación queda registrada.
- **Sillones o boxes**: impide reservar dos pacientes en el mismo sillón a la misma hora.
- **Bloqueos de agenda**:
  - tipos: feriados, vacaciones, almuerzo, capacitaciones…;
  - pueden aplicar a toda la clínica, a un odontólogo o a un sillón;
  - un turno dentro de un bloqueo se rechaza, salvo que se fuerce a propósito.
- **Laboratorio**:
  - directorio con tiempo de entrega;
  - ciclo completo del trabajo: solicitado → enviado → en proceso → recibido → controlado → instalado, o rehacer con motivo;
  - fecha estimada en días hábiles y alerta de atraso;
  - aviso al paciente por WhatsApp y orden imprimible.
- **Esterilización trazable**:
  - ciclos con temperatura, presión e indicadores (químico, biológico, Bowie-Dick);
  - un ciclo con un indicador fallido queda rechazado y no se pueden usar sus paquetes;
  - si algún paquete ya se usó, se crea una tarea urgente;
  - paquetes con vencimiento, uso registrado por paciente y cuarentena mientras se espera el indicador biológico.
- **Equipos y mantenimiento**: frecuencia, próximo mantenimiento calculado solo y garantías.
- **Fichaje del personal**: entrada, pausa y salida, con reporte de horas.
- **Alertas operativas**:
  - mantenimientos y garantías por vencer;
  - insumos por vencer o con stock bajo;
  - paquetes estériles por vencer.

## 8. Finanzas (menú › Finanzas y ficha › Cuenta)

- **Cuenta corriente del paciente** (debe / haber / saldo), con saldo a favor.
- **Antigüedad de deuda** por tramos de 0–30, 31–60, 61–90 y +90 días. Los pagos se imputan primero a las deudas más antiguas.
- **Reporte de cobranza** de toda la clínica, con CSV y recordatorio por WhatsApp.
- **Ajustes de cuenta**: descuento, bonificación, cortesía, incobrable, nota de crédito y recargo. Nunca se borran: se anulan, y quedan en la auditoría.
- **Seguros, prepagas, convenios e IPS**:
  - planes con cobertura general y por categoría de tratamiento, tope anual y copago;
  - coberturas del paciente y **autorizaciones previas**;
  - calculadora de "cuánto cubre y cuánto paga el paciente".
- **Listas de precios** por convenio o grupo de pacientes.
- **Comisiones de odontólogos**:
  - reglas generales o por tratamiento, con descuento opcional del costo de laboratorio;
  - cálculo por período con detalle;
  - liquidaciones: borrador → aprobada → pagada, sin permitir períodos superpuestos;
  - cada odontólogo ve solo la suya.
- **Metas mensuales** (producción, cobranza, pacientes nuevos, turnos, tasa de aceptación) con barra de avance.
- **Cierre contable**: después de la fecha de cierre no se pueden registrar ajustes ni anular pagos.

## 9. Indicadores (menú › Indicadores)

**Dinero y presupuestos**
- Producción, cobranza, cobranza sobre producción, cobro promedio por paciente y producción por hora de sillón.
- Tasa de aceptación de presupuestos, en cantidad y en guaraníes.

**Agenda**
- Inasistencia, cancelación (y cancelación tardía, con menos de 24 h de aviso) y confirmación.
- Turnos pasados sin cerrar.
- Espera promedio y duración real de la atención.
- Desglose por odontólogo.

**Pacientes**
- Pacientes nuevos y de dónde vienen.
- Activos e inactivos.
- Recalls al día y NPS.
- Tratamientos más realizados.

**Tendencias**: gráficos de los últimos 12 meses con detalle al pasar el mouse y tabla accesible.

## 10. Auditoría y datos

- **Visor de auditoría**: filtra por fecha, usuario, módulo, paciente y texto. Cada edición guarda el valor anterior y el nuevo.
- **Exportación del expediente completo** del paciente en JSON, para el derecho de acceso o el traslado a otro profesional. La exportación queda auditada.

## Correcciones hechas en el camino

- **Fechas un día antes**: en Paraguay las fechas se mostraban con un día menos por el huso horario. Se corrigió en el servidor y en el navegador.
- **Seed y permisos**: el seed borraba en cada deploy los permisos que el admin había personalizado. Ahora solo agrega lo nuevo, una sola vez.
- **Cuotas**: se calculaban con un posible corrimiento de mes. Ahora se suman meses de calendario (31/01 + 1 mes = 28/02).
- **Historial de turnos**: el valor anterior de un cambio quedaba vacío.
- **Errores de datos**: un ID inválido o un JSON mal formado devolvía un error 500. Ahora devuelve un 400 con un mensaje claro.
- **Montos**: se muestran sin decimales, porque el guaraní no usa centavos.

## Permisos nuevos (Usuarios › Roles y permisos)

**Salud y clínica**
- `salud.view` y `salud.edit`
- `periodoncia.edit` y `especialidades.edit`

**Seguimiento**
- `recalls.view` y `recalls.manage`
- `seguimiento.manage` y `tareas.manage`

**Operaciones**
- `agenda.config`
- `esterilizacion.manage` y `equipos.manage`
- `fichaje.use` y `fichaje.view_all`

**Finanzas**
- `aseguradoras.manage` y `listas_precios.manage`
- `cuenta_corriente.view` y `ajustes.manage`
- `comisiones.view`, `comisiones.manage` y `metas.manage`

**Reportes y datos**
- `kpis.view`
- `pacientes.export`

Se asignaron por defecto a odontólogo, recepción, asistente y helpdesk según su trabajo. El admin puede cambiarlos, y el seed ya no pisa esos cambios.

## Estructura técnica

**Backend**
- `backend/src/db/migrations/0020_seguimiento_integral.js`: 43 tablas nuevas y columnas extra. Es reversible.
- `backend/src/utils/recurso.js`: generador de recursos que resuelve en un solo lugar:
  - lista blanca y validación de cada campo;
  - alcance por clínica y verificación de referencias;
  - permisos;
  - auditoría con el valor anterior y el nuevo.
- Módulos nuevos en `backend/src/modules/`: `salud`, `recalls`, `periodoncia`, `especialidades`, `seguimiento`, `operaciones`, `finanzas-ext` y `kpis`.

**Frontend** (`frontend/shared/ext/`, compartido por los 3 diseños)
- `ext-core.js`: formularios, tablas y gráficos.
- `ext-ficha.js`: pestañas nuevas de la ficha.
- `ext-secciones.js`: secciones nuevas del menú.
- `ext.css`: estilos.
