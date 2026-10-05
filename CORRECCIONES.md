# Correcciones tras la simulación de 1 año

La simulación de un año de uso intensivo (ver informe PDF) encontró 12 errores. **Los 12 están corregidos** en esta versión. Abajo, qué cambió en cada uno y cómo se comprobó.

Al desplegar, Render corre solo las migraciones nuevas (`0021`, `0022`) y el seed: no hay que hacer nada a mano.

---

## 1. Operación diaria desde la pantalla (error 1 — crítico)

Antes el backend ya permitía todo, pero la interfaz no tenía los formularios. Ahora (`frontend/shared/ext/ext-operativo.js`, en los 3 diseños):

| Dónde | Qué se puede hacer |
|---|---|
| **Agenda** | Ver cualquier día o 7 días, filtrar por odontólogo, **dar turno** (buscador de pacientes, tratamiento con duración sugerida, sillón), **reprogramar**, **confirmar**, **atendido**, **no asistió**, **cancelar**, ver el contexto clínico. Si el horario está bloqueado, pregunta si se reserva igual (urgencias). |
| **Agenda → Lista de espera** | Agregar pacientes con prioridad y preferencias, marcar contactado, **"Dar turno"** (reserva y marca asignado). |
| **Caja** (menú nuevo) | Abrir con el efectivo inicial, ingresos/egresos, ver efectivo esperado y otros medios por separado, **cerrar con el conteo** (muestra en vivo si cuadra, sobra o falta), historial de cierres. |
| **Ficha → Administrativo** | **Cobros**: registrar (aplicando a una cuota o no), recibo PDF, anular. **Presupuestos**: crear con varios ítems y total en vivo, enviar / aceptar / rechazar, PDF, **financiar en cuotas**. **Planes de pago**: cuotas con estado y **cobrar cuota**. |
| **Ficha → Agenda** | Próximos turnos e historial del paciente; dar turno con el paciente ya elegido; reprogramar y cancelar. |
| **Ficha → Documentación** | **Consentimientos**: crear desde plantilla, **firmar en pantalla** (dedo o mouse; paciente y profesional), PDF, anular. |
| **Inventario** | Buscar, **nuevo insumo**, **movimientos** (entrada, salida, pérdida, vencimiento, ajuste), historial, **registrar compra** (suma stock), proveedores. |
| **Tratamientos** (menú nuevo, admin) | **Tratamientos y precios** (con duración y control periódico) y **odontólogos**. |

Además: abrir un modal en una sección sin contenedor propio (Operaciones, Seguimiento…) **borraba toda la página**; corregido.

## 2. Operaciones simultáneas (errores 2, 3 y 5 — crítico/alto)

Antes, "verificar y después guardar" eran dos pasos separados: si dos personas hacían lo mismo al mismo tiempo, las dos pasaban. Ahora esas operaciones corren en una transacción con candado (`conCandado` en `backend/src/config/db.js`): el segundo pedido espera al primero y ve lo que guardó; si algo falla, se deshace todo.

| Operación | Ahora |
|---|---|
| Dos reservas del mismo horario / odontólogo (o al reprogramar) | Entra una; las demás reciben el aviso |
| Mismo sillón dos veces | Aviso |
| "Pasa al sillón" con un sillón en uso | Aviso con el turno y paciente que lo ocupa |
| Paquete estéril usado en dos pacientes | El segundo recibe aviso |
| Doble "entrada" de fichaje, liquidación de comisiones o alergia duplicada | Se registra una |
| Dos salidas de stock que superan lo disponible | La segunda recibe aviso; el stock nunca queda negativo |
| Alta simultánea del mismo paciente (misma cédula) | Se registra uno |
| Cobro que llega justo mientras se abre la caja | Entra una sola vez (además, índice único en la base) |

## 3. Permisos por defecto (error 4 — alto)

**Recepción** y **Odontólogo** ahora pueden presupuestar (`presupuestos.manage`) y financiar (`planes_pago.manage`); recepción además ve el catálogo de tratamientos (`tratamientos.view`) para dar turnos y presupuestar. Se otorgan solos en el próximo deploy, una sola vez (si el administrador después se los quita, no vuelven).

## 4. Caja (errores 6 y 7 — alto/medio)

- El **efectivo esperado** al cerrar es: inicial + cobros en efectivo − egresos en efectivo. Tarjeta, transferencia y QR se muestran aparte ("otros medios"): ya no impiden cuadrar.
- Cobro con la caja cerrada: la pantalla lo avisa, la caja cerrada lista esos cobros, y **al abrir la caja se suman automáticamente** (quedan marcados "cobrado antes de abrir la caja").

## 5. Recalls (errores 5 y 8 del informe — medio)

- Un plan que termina con su **última sesión** ahora agenda el recall (antes solo al "completar" a mano, que la pantalla nunca usaba).
- Se respeta el **intervalo propio del paciente** al volver a dispararse (ej. flúor cada 4 meses). La migración `0022` corrige las fechas que habían quedado mal, sin tocar las ajustadas a mano.

## 6. Esterilización (error 12 — medio)

Los paquetes con fecha vencida pasan solos a **"vencido"** (no se pueden usar); la alerta "por vencer" cuenta solo los que vencen en 0–3 días y aparte avisa cuántos hay vencidos para reprocesar.

## 7. Seguridad (error 11 — medio)

- **Freno a la fuerza bruta**: 5 intentos fallidos de un usuario (o 30 desde una misma IP) bloquean el ingreso 15 minutos; avisa cuántos intentos quedan.
- **admin/admin**: mientras la contraseña del admin siga siendo "admin", DOVA **obliga a cambiarla** al ingresar. En una instalación nueva se puede definir `ADMIN_PASSWORD` en las variables de entorno.
- **Cambiar mi contraseña** en Configuración → Seguridad (cualquier usuario).
- Un usuario **desactivado pierde el acceso al instante**, y los cambios de permisos se aplican sin volver a iniciar sesión.

## 8. Validaciones (error 10 — bajo)

Se rechazan: turnos de menos de 5 o más de 480 minutos, hora o fecha inválida; piezas fuera de la numeración FDI (11–48, 51–85); fecha de nacimiento futura o anterior a 1900; movimientos de stock de cantidad 0 (salvo "ajuste").

---

## Cómo se probó

| Prueba | Resultado |
|---|---|
| Carreras: 10 repeticiones de cada operación simultánea | 0 duplicados |
| Correcciones de caja, recalls, esterilización, seguridad y validaciones (API) | 20/20 |
| Recorrido en el navegador de todas las pantallas nuevas (recepción, odontólogo y admin, los 3 diseños, celular) | 34/34 |
| Recorrido de todas las secciones con un año de datos (5 roles × 3 diseños) | 173/173 |
| Pruebas previas de la API | 125/125 |
| Errores del servidor (500) en todas las corridas | 0 |

Los datos que ya quedaron mal **antes** de esta versión (turnos superpuestos, cierres de caja viejos, stock negativo de pruebas) no se tocan: son historia. Desde esta versión no se pueden volver a generar.

---

## Listo para Render

- Un solo servicio sirve la API y las pantallas (misma dirección, sin Netlify ni CORS que configurar).
- `render.yaml` con planes pagos mínimos, región Virginia, base sin acceso desde internet y disco persistente para fotos/estudios/adjuntos (`UPLOADS_DIR`).
- Migraciones y seed en `preDeployCommand` (antes de cada puesta en marcha).
- La base trabaja en hora de Paraguay (`DOVA_TZ`): "hoy" es el día local también después de las 21 h.
- Cabeceras de seguridad (CSP) ajustadas a las pantallas de DOVA; `.gitignore` para no subir `node_modules`, `.env` ni archivos de pacientes.
- Probado sirviendo todo desde el mismo servidor: 34/34 pantallas nuevas y 173/173 secciones con un año de datos.

---

## Nombres simples en pantalla

Para que cualquier persona de la clínica entienda el sistema sin haber participado en su desarrollo, se reemplazaron términos técnicos o en inglés:

| Antes | Ahora |
|---|---|
| Panel | Inicio |
| Operaciones | Clínica |
| Indicadores / KPIs | Estadísticas |
| Auditoría | Historial de cambios |
| Catálogo | Tratamientos |
| Soporte / Helpdesk / tickets | Ayuda técnica / pedidos de ayuda |
| Recall | Control periódico |
| Controles (post-tratamiento) | Controles después de un tratamiento |
| Reactivación | Pacientes que no volvieron |
| Comunicaciones | Llamadas y mensajes |
| Fichaje | Asistencia del personal |
| NPS | Satisfacción de pacientes |
| Producción | Trabajos realizados (Gs.) |
| Liquidar comisión | Registrar pago de comisión |
| Antigüedad de deuda | Quién debe y desde cuándo |
| Cierre contable | Cerrar meses |
| Ficha: Administrativo / Cuenta / Documentación / Seguimiento | Pagos y presupuestos / Estado de cuenta / Consentimientos / Controles y contactos |
| Debe / Haber | Cargos / Pagos |
| Exportar CSV | Descargar lista (Excel) |
| Rol "Helpdesk" | Soporte técnico |

También se corrigieron palabras que aparecían sin tilde (No asistio, Odontologos, Esterilizacion…). Los términos clínicos que usa el odontólogo (periodontograma, endodoncia, BOP…) se mantienen.

## Facturación (migración 0023)

Módulo nuevo en el menú **Facturación** y en la ficha del paciente (pestaña *Pagos y presupuestos* → *Facturas*).

- **Qué emite:** un *comprobante interno* (no fiscal). Lo dice en pantalla, en el PDF y en Configuración. El timbrado se guarda para una futura integración con la SET, pero no se imprime.
- **Pago, factura y caja son cosas distintas:**
  - Un **cobro** mueve la caja una sola vez.
  - La **factura** documenta uno o varios cobros. Vincular un cobro no vuelve a sumar plata a la caja.
  - "Cobrar ahora" registra un único cobro.
- **Número:** lo asigna el servidor, con bloqueo para que nunca se repita (probado con 12 emisiones simultáneas). El formato es 001-001-0000001 y se configura en Configuración.
- **Totales:** el servidor calcula subtotal, descuentos, exentas, gravadas e IVA 5/10 incluido. Ignora cualquier total que mande el navegador.
- **Estados:** *Pagada* (cobrado ≥ total), *Pendiente* o *Anulada*.
  - **Anular:** pide motivo y guarda usuario y fecha. Nunca se borra. Libera los cobros para refacturarlos y no toca la caja.
  - **Notas de crédito internas:** reducen el saldo.
- **Generar factura:**
  - Desde un **cobro**, en la ficha: si ya tiene factura, muestra "Factura generada N.º".
  - Desde un **presupuesto** aceptado: muestra pagado, pendiente, facturado y sus facturas.
  - Desde un **paciente**: hereda los datos, el tratamiento, el método de pago y el odontólogo.
- **PDF:** Ver, Descargar e Imprimir, con logo, datos de la clínica, el monto en letras, la marca "ANULADA" y el número de página.
- **Permisos** (servidor y pantalla), que se pueden asignar a roles personalizados:
  - facturacion.ver
  - facturacion.ver_propias (el odontólogo ve solo sus pacientes)
  - facturacion.crear
  - facturacion.editar (solo los datos del cliente)
  - facturacion.anular
  - facturacion.descargar
  - facturacion.imprimir
  - facturacion.configurar
  - facturacion.ver_reportes
- **Reportes:**
  - Períodos: Hoy, Ayer, Últimos 7 días, Este mes, Mes anterior, Este año y Personalizado.
  - Agrupado por día, mes, odontólogo, tratamiento, paciente, método o estado.
  - Exporta a CSV/Excel y PDF.
- **Métodos de pago configurables:** los usan también Cobros y Caja.
- **Búsqueda global** encuentra facturas por número, paciente, C.I. o RUC.
- **En el celular:** tarjetas en vez de tabla, filtros plegables y el formulario de conceptos en tarjetas.
- **Pruebas:**
  - 63 de API (`fact-api.js`): numeración concurrente, caja sin duplicar, permisos, PDF y reportes.
  - 56 de pantalla (`ui-facturacion.js`): admin en la compu, recepción en el celular, odontólogo y asistente.

## Factura al registrar cualquier ingreso + impresión directa (migración 0024)

- **Registrar cobro** (en la ficha, también al cobrar cuotas): trae las casillas **"Generar factura"** e **"Imprimir al terminar"**, y los campos opcionales RUC y razón social, que se guardan en la ficha. Se cobra y se factura en un solo paso.
- **Caja → + Ingreso:** lo mismo para ingresos sin paciente (por ejemplo, una venta de mostrador). El cliente queda como "Consumidor final" o con el nombre y RUC que se carguen.
- **Caja del día:** cada ingreso muestra su factura con un botón **Imprimir**, o **Generar factura** si todavía no tiene.
- **Ficha → Cobros:** "Generar factura" ahora la emite en un paso (heredando el cobro) y la imprime. Cada cobro facturado tiene su botón **Imprimir**.
- **Nueva factura:** casilla "Imprimir al emitir".
- **Imprimir directo:**
  - En la compu se abre el cuadro de impresión sin salir de la pantalla.
  - En el celular aparece un botón "Imprimir", porque el navegador exige un toque para abrir el PDF.
  - Para imprimir sin el cuadro de diálogo, abrir Chrome de recepción con `--kiosk-printing`.
- **Configuración → Facturación → "Al registrar un cobro o ingreso":**
  - Generar factura por defecto (sí/no).
  - Imprimir automáticamente (sí/no).
  - Formato: **hoja A4** o **ticket de 80 mm** para impresora térmica.
- **Nunca duplica:** un cobro o ingreso con factura vigente devuelve la misma factura. Facturar no mueve la caja. Si se anula, el ingreso queda libre para volver a facturarse.
- **Corrección de seguridad (CSP):** permite el PDF en un marco oculto. Antes, "Imprimir" quedaba bloqueado por la política de seguridad del sitio.
- **Pruebas:**
  - API: 21 de ingresos y 63 de facturación.
  - Pantalla: 68 de facturación, más operativo, calendario, PWA y la simulación de un año, todo OK.

## Menú agrupado (más simple)

Arriba ahora se ven solo tres botones. Cada uno despliega sus opciones, y solo aparecen las que el usuario tiene permitidas. No se eliminó ninguna sección.

| Grupo | Opciones |
|---|---|
| **Movimientos** | Inicio · Agenda · Caja · Facturación · Seguimiento · Clínica |
| **Reportes** | Pacientes · Inventario · Tratamientos · Estadísticas · Finanzas · Reportes generales |
| **Administración** | Configuración · Usuarios · Historial de cambios · Ayuda técnica |

- **En la compu:** al tocar un grupo se abre el desplegable. Se cierra al elegir una opción, al tocar afuera o con Esc. El grupo donde estás queda resaltado.
- **En el celular:** dentro del menú ☰, cada grupo se abre como acordeón.
- **Tocar "DOVA"** (arriba a la izquierda) lleva al Inicio.
- **Los grupos sin opciones permitidas no se muestran.**

## Página web de la clínica conectada a DOVA (migración 0025)

La página pública está en **/web/** (por ejemplo, https://dova.onrender.com/web/). Si se define `WEB_EN_INICIO=true`, la dirección principal también abre la página.

**Qué puede hacer el paciente (sin crear cuenta):**
- **Ver horarios libres en vivo** en la portada y tocar uno para reservarlo.
- **Reservar un turno en 4 pasos:** qué necesita → con quién (o "cualquier profesional") → día y hora → sus datos.
- **Usar el enlace privado "Mi turno":** ver, confirmar asistencia o cancelar. Cancelar solo se puede hasta X horas antes. El enlace queda guardado en "Mis turnos" del mismo celular.
- **Completar su ficha antes de la primera visita:** datos y un cuestionario corto de salud.
- **Mandar una consulta.**
- Ver tratamientos, equipo (con el color de la agenda), horarios, contacto y mapa.

**En DOVA:**
- **Movimientos → Página web → "Lo que llegó":** turnos, fichas y consultas, con aviso en las notificaciones. Cada uno se marca como atendido o se descarta.
- **Si alguien ya era paciente,** sus datos nunca se pisan. Recepción elige cuáles pasar a la ficha con "Pasar datos a la ficha".
- **"Configurar la página"** (solo admin):
  - Activar o pausar las reservas.
  - Horario de atención por día (con mañana y tarde).
  - Cada cuántos minutos, cuántos días hacia adelante, anticipación mínima, hasta cuándo se puede cancelar y tope de turnos por persona.
  - Qué tratamientos y profesionales se ofrecen, y si se muestran los precios.
  - Textos, contacto y mapa de Google.
- **En la agenda,** los turnos reservados por la web llevan la marca "web".
- **Permisos:**
  - `web.ver`: recepción y admin.
  - `web.configurar`: admin.

**Seguridad:**
- **Datos de pacientes:** la web solo muestra horarios libres y los datos que la propia persona cargó.
- **Reservas:**
  - Se respetan los turnos ya dados, los bloqueos de agenda y los días cerrados.
  - Se usa el mismo candado que la agenda: probado con 8 reservas simultáneas del mismo horario, entra 1.
- **Enlace privado:** el código es aleatorio y en la base solo se guarda su huella.
- **Freno anti-abuso:** límite de intentos por conexión, campo trampa para robots y tope de turnos web por persona.

**Pruebas:** `web-api.js` 51/51 y `ui-web.js` 45/45 (celular y compu, recepción y admin).

### Página web en varias páginas

La web ya no está toda en una sola página. Cada sección tiene la suya, con el mismo menú arriba (en el celular, con el botón "Menú") y el mismo pie:

| Página | Qué tiene |
|---|---|
| `index.html` (Inicio) | Lema, horarios libres en vivo, horario de hoy y accesos a las demás páginas |
| `reservar.html` | Reserva en 4 pasos. Puede llegar ya elegido el tratamiento (`?t=`), el profesional (`?o=`) o el día y la hora (`?f=&h=`) |
| `tratamientos.html` | Lista por categoría, con "Reservar" en cada tratamiento |
| `equipo.html` | Profesionales, con "Reservar con…" |
| `primera-visita.html` | Ficha y cuestionario de salud |
| `contacto.html` | Horarios, datos, mapa y formulario de consulta |
| `mi-turno.html` | "Mis turnos" y el turno del enlace privado (`#t=`) |

- **Enlaces viejos:** los del tipo `/web/#turno=…` redirigen solos a `mi-turno.html`.
- **Cómo se generan:** las páginas salen de un mismo molde, así el encabezado y el pie son idénticos en todas.
- **Pruebas:** `ui-web.js` 60/60.

## Cuenta del paciente y pagos online (migración 0026)

**En la página web:**
- **"Ingresar" / "Mi cuenta"** (en el menú). El paciente entra con su **cédula o email** y su **contraseña**.
  - **Crear la cuenta / Olvidé la contraseña:** escribe su cédula y recibe un **código de 6 números al email que la clínica tiene en su ficha** (no a uno que escriba él). Con el código elige su contraseña.
  - **Protecciones:**
    - Si la cédula no existe, el mensaje es el mismo, así no se puede averiguar quién es paciente.
    - El código vence en 15 minutos y admite 5 intentos.
    - Se manda un máximo de 3 códigos por hora.
    - La cuenta se bloquea 15 minutos después de 5 contraseñas incorrectas.
    - Cambiar la contraseña cierra las demás sesiones.
  - **Pacientes que se registraron solos desde la web:** no pueden crear la cuenta hasta que recepción **verifique su identidad** (botón "Verificar identidad" en Página web → Lo que llegó). Así nadie abre una cuenta con una cédula ajena.
- **Mi cuenta:**
  - **Turnos:** próximos (confirmar y cancelar) y anteriores. Reservar con sesión no pide datos.
  - **Pagos:**
    - Cuotas y saldos pendientes. Los presupuestos financiados se pagan por cuota.
    - Para pagar ve los **datos del banco y el QR**, paga por transferencia o QR y **sube el comprobante** (foto o PDF, hasta 5 MB; se revisa el contenido real del archivo).
    - Ve si su pago está en revisión, confirmado o rechazado (con el motivo).
  - **Comprobantes:** descarga de recibos y facturas en PDF.
  - **Mis datos** y cambio de contraseña.

**En DOVA (Movimientos → Página web):**
- **"Pagos para revisar":** ver el comprobante, y **Aprobar** o **Rechazar** con motivo.
  - Al aprobar se registra el cobro (y la cuota queda pagada), entra **una sola vez** a la caja y, si se marca, se genera la factura.
  - El paciente recibe un email en los dos casos.
  - Informar un pago **no** toca la caja: recién cuenta cuando recepción lo aprueba.
- **Configurar la página:**
  - Activar las cuentas y los pagos online.
  - Datos del banco (banco, titular, cuenta, RUC, alias, instrucciones) e imagen del QR.
  - Ver si el email está configurado y mandar un email de prueba.
- **Permisos:**
  - Revisar pagos: `web.ver` + `pagos.create`.
  - Verificar identidad: `pacientes.edit`.
  - Banco, QR y email: `web.configurar`.

**Seguridad:**
- La sesión del paciente usa una clave distinta a la de DOVA: **un paciente no puede entrar al sistema de la clínica** (probado).
- Cada pedido filtra por su paciente: no puede ver ni tocar turnos, cuotas, recibos ni facturas de otro (probado).

**Falta configurar en Render:** las variables SMTP del email (ver README).

**Pruebas:** `portal-api.js` 57/57 y `ui-portal.js` 52/52 (celular y compu).

### Correcciones encontradas en la regresión
- **App instalada sin internet:** si no podía cargar su configuración, apuntaba a una dirección de desarrollo. Ahora usa la del mismo sitio, y la configuración queda guardada en el celular.
- **Pestañas internas (subpestañas) de DOVA:** si se cambiaba de pestaña mientras otra seguía cargando (por ejemplo Finanzas → Comisiones), aparecía un error. Ahora el resultado viejo se descarta solo. Vale para todas las secciones.

## Fotos de la clínica en la página web
- Inicio: sección "Antes y después" con comparador deslizable (mouse, dedo o flechas del teclado).
- Tratamientos: bloque destacado "Tratamientos regenerativos con Bio C" (flyer + foto en el sillón), con texto neutro.
- Fotos optimizadas en `frontend/web/img/` (sin datos EXIF/ubicación).
- Service worker pasa a `dova-v13`.
- Tratamientos: el destacado pasa a "Programa Vitamina C IV" con el afiche nuevo (`img/vitamina-c-iv.jpg`, en los colores de la marca). El afiche verde de Bio C queda guardado en `img/bio-c.jpg` por si se quiere volver a usar. Service worker `dova-v14`.

## "No puedo crear cuenta" (migración 0027): cuentas sin email
- Causa: la cuenta dependía de un código por email y el plan gratis de Render bloquea el SMTP. Además, solo podían crear cuenta los pacientes ya cargados con email.
- Ahora no hace falta email ni ningún servicio externo:
  - **Personas nuevas**: "Crear mi cuenta" (nombre, apellido, cédula, celular, email opcional y contraseña) crea la ficha y la cuenta al instante. La ficha queda "sin verificar": ven y reservan turnos; pagos, comprobantes y pagar online se habilitan cuando recepción toca "Verificar identidad" (al ver la cédula). Cada cuenta nueva aparece en "Lo que llegó" y avisa a recepción.
  - **Pacientes con ficha** (o quien se olvidó la contraseña): entran con un **código de 6 números** que genera recepción en DOVA → Página web → "Cuentas de pacientes" (vale 48 horas, 5 intentos, se usa una vez). El botón "Enviar por WhatsApp" abre WhatsApp con el mensaje y el enlace listos. Desde ahí también se puede verificar la identidad o desactivar una cuenta.
  - Una cédula que ya tiene ficha no se puede registrar desde la web (evita que alguien tome la ficha de otro): la página ofrece pedir el código por WhatsApp.
- El email queda opcional (solo avisos de pagos aprobados/rechazados): Brevo por API web (`BREVO_API_KEY`, `MAIL_REMITENTE`) o SMTP en planes pagos.

## Eliminar pacientes (admin)
- Pacientes: botón "Eliminar" en cada fila y "Eliminar paciente" en la ficha, solo para quien tiene el permiso `pacientes.delete` (el admin).
- La confirmación avisa qué pasa (turnos que se cancelan, cuotas sin pagar, cuenta web que se cierra) y pide escribir ELIMINAR.
- Es una baja: deja de aparecer en Pacientes, buscadores y agenda; se cancelan sus turnos próximos y se cierra su cuenta web. La historia clínica, pagos y facturas se conservan (obligación legal y la caja depende de ellos).
- "Ver eliminados" lista los dados de baja con "Restaurar". Si se intenta crear otro paciente con la misma cédula, avisa que hay uno eliminado para restaurar.
- De paso: el buscador de la pantalla Pacientes no hacía nada; ahora filtra mientras se escribe.

## Tiempo real (migraciones 0028 y 0029)
- **Cómo funciona**: la base avisa por LISTEN/NOTIFY (canal `dova_cambios`, con triggers en turnos, pacientes, odontólogos, lista de espera, web_*, notificaciones, pagos, caja, facturas, presupuestos, planes y cuotas, tickets). El servidor mantiene una conexión escuchando y lo reenvía al instante (Server-Sent Events en `GET /api/eventos`, con el token en el encabezado) a las pantallas abiertas de esa clínica. El aviso solo dice qué tabla cambió, nunca datos: cada pantalla vuelve a pedir lo suyo con sus permisos. Los avisos personales (notificaciones) van solo a su destinatario.
- **Campanita** arriba a la derecha (los 3 diseños, compu y celular): número de avisos sin leer, cartel al llegar uno nuevo, "(N)" en el título de la pestaña, lista con "Marcar todo como leído"; tocar un aviso lleva a donde corresponde (p. ej. un pago va directo a "Pagos para revisar"). Punto verde = en vivo; gris titilando = reconectando.
- **Pantallas que se actualizan solas**: Inicio, Agenda, Lista de espera, Caja del día, Pacientes, turnos y presupuestos de la ficha, Facturación (resumen y listado) y Página web (Lo que llegó, Pagos para revisar, Cuentas de pacientes). Si hay una ventana abierta o el usuario está escribiendo, espera a que termine para no borrar nada.
- Si se corta internet o el servidor se reinicia, se reconecta solo y se pone al día. La conexión se renueva sola cuando vence el token.
- **"Pedir mi código"** en la página (Mi cuenta → Tengo un código, y cuando alguien intenta registrarse con una cédula que ya es paciente): deja cédula y celular; el pedido aparece al instante en "Lo que llegó" con el botón "Dar código" (que abre WhatsApp al número que dejó y marca el pedido como atendido).
- De paso: el botón de tema en el celular quedaba solo arriba; ahora avisos, tema y salir van juntos a la derecha.
