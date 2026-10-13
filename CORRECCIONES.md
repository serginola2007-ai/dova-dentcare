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

## Fase 1 — clínica integral (migración 0030) — ver también la auditoría
- Fotos y estudios: el archivo se guarda en la base (antes iba al disco de Render, que se borra en cada actualización, y no había forma de verlos). Tipo validado por contenido (JPG/PNG/WEBP/PDF/DICOM), descarga solo con permiso, vínculo a consulta/pieza/tratamiento del mismo paciente, reclasificar y eliminar auditados.
- Historia clínica: borradores editables (`PUT /historia-clinica/:id`), firmadas inmutables (409 → enmienda), piezas FDI validadas, contexto de consulta en un pedido.
- Modo Consulta nuevo (`frontend/shared/ext/ext-clinica.js`): ligado al turno (pasa a "en consulta"), datos clínicos del paciente a la vista, consulta con autoguardado en la base, "Finalizar consulta" (firma + odontograma de las piezas + turno atendido) y accesos rápidos reales (incluye presupuesto, pago y próxima cita).
- Ficha 360°: pestañas Fotos y estudios (galería, visor, antes/después), Recetas y Notas internas; resumen con última consulta, próxima cita, alergias y notas importantes.
- Auditoría con IP y resultado: login, login fallido, bloqueo, logout, cambio de clave y accesos denegados (403).
- Odontólogo: permiso `agenda.create` para dar la próxima cita.

## Fase 2 — tratamientos, recetas, Mi día y agenda (migración 0031)
- Etapas de tratamiento con estado (pendiente / en progreso / completado / cancelado), fecha de inicio y de realización, profesional, piezas, observaciones, materiales (descuentan stock), fotos y estudios propios. Protocolos listos (endodoncia, restauración, implante, prótesis fija, exodoncia). El tratamiento pasa a "en proceso" con la primera etapa iniciada; las canceladas no cuentan en el progreso. Plan en PDF.
- Recetas: varios medicamentos con concentración, presentación, dosis, frecuencia, duración, vía e indicaciones; verificación de alergias y medicación antes de emitir; PDF para imprimir con firma y matrícula; anulación con motivo (nunca se borran); vínculo a la consulta. En la consulta, la receta trae la medicación indicada.
- Mi día: agenda propia del odontólogo (hoy en hora de Paraguay) con duración, sillón y estado (en espera / en consulta / finalizado) y botón Iniciar / Continuar / Ver consulta; pendientes nuevos: recetas pendientes y presupuestos sin aceptar. Corregido: "Iniciar consulta" desde Mi día no abría el turno.
- Agenda: botón "Llegó (en espera)" en el turno de hoy y marca "en espera" / "en consulta" en el calendario.

## Fase 3 — presupuestos, cobros, caja y facturación (migraciones 0032 y 0033)
- Cobros: anular requiere el permiso nuevo `pagos.anular` (el admin lo tiene; se puede dar a otro rol desde Usuarios → Roles) y un motivo; el cobro guarda motivo, quién y cuándo. Si el cobro había entrado a la caja abierta, se registra la devolución en la caja (antes el arqueo esperaba un dinero que ya no estaba).
- Caja: botón "Devolución" (egreso marcado como devolución) y concepto obligatorio en los movimientos.
- Presupuestos: cambios de estado validados en el servidor (ej.: un aceptado no vuelve a borrador; uno con cobros no se cancela), vencimiento automático por vigencia (queda en la auditoría) y "Crear plan de tratamiento" desde un presupuesto aceptado (un plan por ítem, con precio y pieza, sin duplicar).
- Facturación: columnas listas para la facturación electrónica SIFEN (CDC, estado y respuesta del envío, XML; modo de emisión, ambiente e ID de CSC en la configuración). Hoy no se envía nada a la SET: es la base para conectar el servicio de firma y envío.

## Fase 4 — inventario por lotes, laboratorio, consentimientos y documentos (migración 0034)
- Inventario: cada entrada guarda lote y vencimiento; las salidas descuentan primero del lote que vence antes (o del lote elegido). El stock es la suma de los lotes. Nueva subpestaña "Por vencer" (30/60/90/180 días) con "Dar de baja", ventana "Lotes" por insumo, "Editar" insumo (queda auditado antes/después) y motivo obligatorio en pérdida, vencimiento y ajuste. La compra acepta lote y vencimiento por ítem y valida que los insumos sean de la clínica.
- Laboratorio: botón "Archivos" en cada trabajo (ficha y Clínica → Laboratorio) para subir fotos de color, PDF y modelos STL (hasta 30 MB, validados por contenido). Solo quien subió el archivo o un administrador puede quitarlo; todo queda en la auditoría.
- Consentimientos: no se pueden borrar (solo anular, con permiso), no se firman dos veces y la firma debe ser una imagen válida.
- Documentos PDF nuevos: historia clínica completa, consulta individual y estado de cuenta. Pestaña "Documentos" en la ficha con todos los PDF reales del paciente (consultas, consentimientos, planes, presupuestos, recetas y recibos) para ver, imprimir o descargar. "Imprimir consulta" en una consulta finalizada. Exportar la historia clínica queda auditado.

## Fase 5 — seguimiento, portal del paciente, reportes y auditoría (migraciones 0035 y 0036)
- Seguimiento: nueva pestaña "Para contactar" (la primera de Seguimiento). Detecta en el momento tratamientos sin terminar o atrasados, controles pendientes, pacientes que no volvieron (6 a 24 meses), presupuestos sin aceptar, saldos pendientes y citas perdidas. Cada caso se gestiona con resultado, canal, nota, próximo contacto, responsable y estado (pendiente, en gestión, resuelto o descartado con motivo), y tiene su historial. También se pueden crear seguimientos a mano. Incluye WhatsApp con mensaje armado y descarga en Excel. Todo queda auditado.
- Portal del paciente: nueva sección "Mi tratamiento" con los próximos controles, los tratamientos y sus etapas, presupuestos, recetas y estudios, todos descargables en PDF o imagen. En "Mis datos" el paciente actualiza su contacto y sus antecedentes (alergias, medicación, enfermedades, grupo sanguíneo y contacto de emergencia); recepción recibe un aviso y queda auditado el antes y el después. La información clínica solo se ve con la identidad confirmada.
- Estudios: casilla "Visible para el paciente" en la ficha. Ningún estudio se comparte por defecto.
- Reportes: nuevo centro de reportes con 18 reportes reales:
  - Clínicos: tratamientos realizados y pendientes, procedimientos más realizados, diagnósticos, pacientes nuevos y recurrentes, y producción por odontólogo.
  - Financieros: resumen con ticket promedio, cobros, facturación, saldos pendientes, cuotas vencidas, métodos de pago, e ingresos por odontólogo y por tratamiento.
  - Agenda: asistencia, ausencias, cancelaciones, ocupación y horas utilizadas y disponibles.
  - Filtros por fecha, odontólogo, tratamiento, estado, método de pago y usuario.
  - Exportación a PDF, Excel y CSV con el permiso nuevo `reportes.export` (el administrador lo tiene). Cada exportación queda auditada.
- Auditoría: filtros por acción y resultado (correcto, denegado o fallido), columna de IP, detalle con tabla de antes y después, y descarga en CSV (también auditada).

## Fase 6 — Ctrl+K, celular, rendimiento y seguridad (migración 0037)
- Centro de comandos: Ctrl+K (⌘K en Mac) o el botón 🔍 del encabezado, que en el celular queda como ícono.
  - Busca secciones, acciones rápidas y datos reales (pacientes, turnos, presupuestos, cobros, facturas, tickets y usuarios).
  - Acciones rápidas: nuevo turno, nuevo paciente, Mi día, caja, pacientes para contactar, insumos por vencer, reporte de cobros e historial de cambios.
  - Al elegir un paciente ofrece: abrir ficha, iniciar consulta, darle un turno, registrar un cobro y ver documentos.
  - Todo filtrado por permisos (lo que el usuario no puede usar no aparece) y validado otra vez en el servidor. Se maneja con flechas, Enter y Esc.
- Celular: las pestañas de la ficha y las subpestañas van en una sola fila que se desliza, en lugar de ocupar varias filas.
- Rendimiento: 15 índices nuevos para las consultas por paciente. La bandeja de seguimiento pasó de 0,8 s a 0,08 s y los saldos de 0,28 s a 0,03 s; todas las pantallas cargan en menos de medio segundo.
- Seguridad: prueba nueva de la matriz de permisos con 4 roles. Cubre endpoints sensibles, falta de token, token adulterado, parámetros con inyección (nunca dan error 500) y que los accesos denegados queden auditados.

## Cierre integral (migración 0038)
- Prueba de punta a punta del recorrido completo del punto 35. Cubre: paciente → turno → llegada → sillón → consulta con diagnóstico y piezas → tratamiento con protocolo de etapas → evolución → materiales (descuenta stock) → foto vinculada → receta → odontograma → firma → turno atendido → expediente de la pieza → presupuesto → aceptado → plan → pago → saldo → factura → próxima cita → seguimiento → 7 PDF reales. Resultado: 38/38.
- Seguimiento:
  - Corregido: varios casos creados a mano se pisaban entre sí y solo se veía el último.
  - Corregido: los casos con contacto agendado para hoy podían quedar fuera de la lista.
  - La bandeja ahora tiene paginación (100 por página) y la descarga en Excel incluye todos los casos.
- Derivaciones:
  - El adjunto se guarda en la base y se valida por contenido. Antes quedaba en el disco del servidor, que en Render se borra, y no había forma de descargarlo.
  - Nuevo PDF "Informe de derivación" con el motivo, las alertas y las últimas consultas, que aparece en Documentos de la ficha.
  - El listado ya no expone la ruta interna del servidor y se valida que el profesional sea de la clínica.
- Ayuda técnica: los adjuntos también se guardan en la base. Los viejos se siguen leyendo del disco si existen.
- Ctrl+K: se agregaron las acciones para un paciente "Nueva receta", "Nuevo presupuesto" y "Abrir odontograma", y la búsqueda de tratamientos del catálogo.
- Tablet: 16 pantallas sin desbordes en los 3 diseños, en vertical y en horizontal.

## Auditoría de seguridad y endurecimiento (migración 0039)
Informe completo en `SEGURIDAD.md`, con cada hallazgo, la solución y la prueba que lo verifica. Pruebas reproducibles en `backend/tests/seguridad/`.
- Crítica: la contraseña inicial obligatoria ahora la exige la API, no solo la pantalla.
- Altas:
  - Anti-escalada de privilegios en usuarios y roles.
  - Cierre inmediato de sesiones al cambiar la contraseña, dar de baja o cambiar el rol, y al cerrar sesión.
  - Rotación de refresh tokens con detección de robo.
  - Política de scripts estricta, sin scripts en línea.
  - Datos de salud ocultos para quien no tiene permisos clínicos.
- Medias y bajas:
  - Errores sin detalles internos.
  - Archivos validados por contenido.
  - CORS solo para el propio sitio.
  - Registros sin búsquedas ni tokens.
  - Contraseñas más fuertes.
  - Límites de pedidos.
  - Auditoría inmutable en la base.
  - Dependencias sin vulnerabilidades.
  - Algoritmo JWT fijo.
  - Cabeceras completas.

## Auditoría de seguridad 2 (migraciones 0040 y 0041)
Informe completo en `SECURITY-AUDIT.md` (hallazgo, severidad, archivo, causa, impacto, solución, prueba y estado) y pruebas en `SECURITY-TESTS.md`.
- Crítica: el seed nunca deja `admin`/`admin`. En producción la reemplaza por `ADMIN_PASSWORD` o por una aleatoria que se muestra una vez en el registro del deploy; si ya se cambió, no la toca.
- Altas:
  - Sesión en cookies `HttpOnly` `SameSite=Strict` con anti-CSRF. El token de acceso vive solo en memoria. Las sesiones viejas se migran solas.
  - "Cerrar sesión en todos los dispositivos" y "Cerrar todas sus sesiones" desde la ficha de un usuario.
  - Cobro aplicado a una cuota: tiene que ser del mismo paciente y cubrirla.
  - Profesional y proveedor de otra clínica rechazados al vincular.
  - Usuario de base `dova_app` de mínimo privilegio (script listo; se activa con `APP_DATABASE_URL`).
- Medias y bajas:
  - Validación única de importes.
  - Vencimiento de la sesión por inactividad (7 días) y absoluto (30 días).
  - Avisos en tiempo real solo para la clínica correspondiente, con topes de conexiones y corte al cerrar sesión.
  - Límites de pedidos configurables, con almacén compartido opcional en Postgres.
  - Registro web con respuesta genérica (anti-enumeración).
  - Rutas de archivos viejos encerradas en la carpeta de subidas.
  - `nodemon` reemplazado por `node --watch`: `npm audit` da 0.
  - `npm run lint` (ESLint) y `npm run build` (verificación de sintaxis).

## Menú con segundo nivel (pestañas de cada herramienta)
- Dentro de Movimientos y Reportes, las herramientas con pestañas muestran una flecha (›): Agenda, Caja, Facturación, Seguimiento, Página web, Clínica, Inventario, Tratamientos y Finanzas.
- Al pasar el cursor por una herramienta se abre al costado un panel con sus opciones (por ejemplo, Clínica → Sala de espera, Asistencia del personal, Laboratorio, Esterilización, Equipos…). Al elegir una se entra directo en esa pestaña.
- El clic sobre la herramienta despliega el panel en vez de entrar. Las secciones sin pestañas (Inicio, Pacientes, Estadísticas…) siguen entrando directo.
- Se puede llegar al panel en diagonal sin que se cierre. Si no entra a la derecha, se abre a la izquierda.
- Teclado: → entra al panel, ← vuelve, Esc cierra.
- En el celular, dentro del menú ☰, funciona como acordeón: tocar la herramienta despliega sus opciones debajo.
- Cada opción respeta los permisos de la persona. Una prueba (ui-submenu) verifica, para administración, recepción y odontólogo, que el menú ofrezca exactamente las pestañas que dibuja cada sección y que abra la elegida.
- Archivos: `shared/app.js` (definición `subs` en el menú), `shared/ext/ext-core.js` (pestaña inicial pedida desde el menú), `shared/base.css` y `tecnico/skin.css`.

## Estilo más sobrio y técnico
- Esquinas casi rectas (2px) en todo el sistema; los círculos quedan solo para puntos y avatares.
- Indicadores en una franja dividida por líneas finas, en lugar de una tarjeta redondeada por número. La alerta se marca con el número en rojo, sin recuadro rojo.
- Sin sombras decorativas: solo menús, modales y avisos flotantes tienen una sombra corta.
- Tablas sin caja alrededor, solo líneas entre filas. Pestañas subrayadas en lugar de "píldoras".
- Alertas médicas con una marca lateral en lugar de un recuadro de color. Login sin recuadro doble.
- Gráfico de Facturación: textos a escala normal (antes se veían gigantes) y barras rectas.
- Todo en `shared/sobrio.css`, que se carga después del diseño elegido. Valores de radio unificados en `base.css`, `ext.css` y los 3 `skin.css`.

## Sin emojis en la interfaz
- Se quitaron todos los emojis de las pantallas del personal, del portal y del mensaje de cumpleaños.
- Donde el emoji era el ícono de un botón (acciones de la consulta, buscador Ctrl+K, línea de tiempo clínica, accesos del inicio, botón claro/oscuro), ahora hay íconos lineales monocromos (`shared/iconos.js`). Toman el color del texto y se ven iguales en todos los equipos.
- Donde acompañaba a un texto ("Imprimir", "Instalar app", avisos, estados vacíos), se dejó solo el texto. La asistencia del personal usa un punto de color para el estado.
- Se mantienen los signos tipográficos: flechas, ✓, ✕ y ☰.
- En el celular, los montos largos de las franjas de indicadores pueden partirse y ya no desbordan la pantalla.

## Vincular usuarios a odontólogos desde Usuarios
- Administración → Usuarios tiene la columna "Odontólogo" y el botón "Vincular odontólogo" o "Cambiar odontólogo" en cada fila. Se puede elegir uno o dejarlo "Sin vincular".
- "Nuevo usuario" permite vincular el odontólogo en el alta (es opcional).
- Un odontólogo se vincula a un solo usuario activo; los ya tomados aparecen deshabilitados con el nombre de quién los tiene. El servidor lo valida (409), igual que que sea de la misma clínica, y también al reactivar a un usuario dado de baja.
- El cambio rige al instante: el servidor toma el vínculo de la base en cada pedido, no del token, y la renovación de sesión actualiza "Mi día" sin volver a entrar. No se cierra la sesión de nadie.
- Queda en el historial de cambios (antes y después). Requiere el permiso `usuarios.manage`.
- El listado de usuarios muestra hasta 200 (antes 20). El tamaño de página queda acotado.

## Eliminar usuarios (migración 0042) e Inicio fuera de Movimientos
- Administración → Usuarios tiene el botón "Eliminar" en cada fila, con una confirmación que explica qué pasa. No aparece para uno mismo ni para el administrador protegido.
- Si el usuario nunca usó DOVA (creado por error), se borra por completo.
- Si ya registró algo (turnos, cobros, consultas, auditoría), queda eliminado:
  - no puede entrar y se cortan sus sesiones al instante;
  - sale de la lista;
  - se liberan su nombre de usuario y su odontólogo;
  - su nombre se mantiene en el historial de lo que hizo.

  Borrarlo dejaría registros clínicos y de caja sin autor.
- Protecciones en el servidor: permiso `usuarios.manage`, solo un admin elimina a otro admin, la clínica nunca queda sin administradores activos, cada clínica solo ve sus usuarios. Queda en el historial de cambios.
- La revisión de "¿tiene actividad?" usa `pg_catalog`, así funciona también con el usuario de base restringido `dova_app`. Si igual algo impide el borrado, se hace la baja.
- "Inicio" quedó como botón propio en la barra, a la izquierda de Movimientos, en los 3 diseños y en el menú del celular.

## Al abrir DOVA siempre se pide la contraseña
- La sesión vale solo en la pestaña donde se inició. Recargar la página o cambiar de diseño no la cierra (es la misma pestaña).
- Una pestaña o ventana nueva, el navegador recién abierto o la app instalada piden usuario y contraseña.
- La cookie de sesión `dova_rt` pasó a ser de navegador, sin `Max-Age`: se borra al cerrarlo. El servidor sigue controlando la inactividad (7 días) y el máximo absoluto (30 días).
- Las sesiones guardadas por versiones anteriores también piden ingresar una vez.
- Menú: pasar rápido el cursor de una herramienta a otra ya no cierra el panel recién abierto (un solo temporizador compartido).

## Estados vacíos, de carga y hover; botones y campos compactos
- Botones más chicos (30px de alto, 13px) y campos de texto/listas a la misma altura, para un aire más técnico. En pantallas táctiles quedan en 36px para que se puedan tocar bien.
- Carga:
  - mientras se espera al servidor, una barra fina arriba de todo;
  - el botón que se tocó muestra un indicador girando y no se puede volver a tocar hasta que termina (evita guardar dos veces);
  - los "Cargando…" muestran barras grises de relleno.
- Vacíos: las listas sin datos muestran un ícono y un mensaje sobrio ("Sin proveedores.", "Todavía no hay nada cargado.") con una pista de qué botón usar para cargar el primero.
- Hover en botones, pestañas, campos, filas de tablas con acciones, resultados del buscador, indicadores y tarjetas. Foco visible al navegar con teclado.
- Si el sistema pide menos movimiento, las animaciones se desactivan.

## Seguridad, 3.ª ronda: intrusión desde afuera, sesiones abiertas y bloqueo de pantalla (migraciones 0043 y 0044)
- **Sin verificación en dos pasos:** se probó y se retiró por decisión de la clínica. Se entra con usuario y contraseña.
- **Prueba de intrusión desde afuera:** un atacante sin usuario ni contraseña intentó:
  - bajar archivos del servidor;
  - leer la API;
  - falsificar sesiones;
  - inyectar SQL;
  - adivinar contraseñas;
  - averiguar qué usuarios existen.

  No entró en ningún caso. Aparecieron dos fallas, ya corregidas:
  - el ingreso aceptaba usuario y contraseña mandados como listas;
  - un carácter nulo en el usuario hacía fallar al servidor (error 500).

  Ninguna dejaba entrar sin la contraseña correcta.
- **Bloqueo de pantalla por inactividad:**
  - a los 15 minutos sin usar DOVA (en ninguna pestaña) aparece un candado que pide la contraseña;
  - lo que estabas haciendo queda abajo;
  - recargar la página no lo saltea;
  - 5 contraseñas mal cierran la sesión.
- **Sesiones abiertas** (Configuración → Seguridad):
  - lista de dónde está abierta la cuenta (navegador, IP, última actividad);
  - "Cerrar" en cada una, que corta esa sesión al instante.
- **Política de la clínica** (admin, Configuración → Seguridad): minutos hasta el bloqueo (5 a 120, o nunca).
- **Avisos de seguridad en la campanita** para los administradores:
  - cuenta bloqueada por contraseñas mal;
  - sesión robada y reutilizada;
  - desbloqueo fallido.
- Detalle técnico y pruebas en `SECURITY-AUDIT.md` (sección 0) y `SECURITY-TESTS.md`.

## QA completa (octubre 2026): errores encontrados y corregidos
Se probó todo DOVA como un QA:
- cada ruta de la API (unos 4.400 pedidos) con datos vacíos, tipos incorrectos, IDs inexistentes, textos enormes y parámetros absurdos;
- todas las pantallas y pestañas, con los 4 roles, en los 3 diseños, en escritorio, tablet y celular;
- los formularios mandados vacíos;
- modo claro y oscuro;
- la página web y el portal del paciente;
- más toda la regresión.

**Errores corregidos:**
- **Importes con punto de miles:** escribir "150.000" en un precio o monto se guardaba como **150 Gs.** (el navegador tomaba el punto como decimal). Ahora el punto y la coma de miles se ignoran al tipear o pegar en los campos en guaraníes. Los campos con decimales (mm, kg, °C) siguen igual.
- **Barra de arriba en tablet (769 a 1199 px):** el menú se apretaba en una columna y quedaba tapado por la campanita y el buscador, en los 3 diseños. Ahora va en su propia fila.
- **Moderno con el equipo en modo oscuro:** la pantalla quedaba mezclada (fondo claro con colores del modo oscuro) y con poco contraste. Ahora sigue al sistema.
- **"Hoy" después de las 21 h:**
  - la agenda del día, los próximos turnos y la fecha del procedimiento usaban el día UTC y mostraban **mañana**;
  - pasaba lo mismo con la fecha de recepción de un trabajo de laboratorio.

  Ahora usan el día de Paraguay.
- **Edad del paciente:** cumplía años un día antes (la fecha de nacimiento se leía en UTC).
- **Errores 500** con datos mal formados en:
  - alta y edición de odontólogos;
  - alta de roles;
  - recetas;
  - completar un control periódico con una fecha inválida.

  Ahora responden con un mensaje claro.
- **Textos guardados como "[object Object]":** notas del paciente, motivos de anulación, facturas, tipos de control y otros campos que aceptaban un objeto en vez de texto. Ahora se rechaza.
- **Presupuesto con total "NaN":** nunca se guarda un total inválido, la pantalla muestra "-" en vez de "Gs. NaN" y la migración 0045 recalcula los que hubiera.
- **Tablas anchas en tablet** (por ejemplo, Finanzas → Comisiones) empujaban la pantalla. Ahora toda tabla se desplaza dentro de su propia caja.
- **Celdas del periodontograma agrandadas** por el cambio de campos compactos de la tanda anterior (la regla tenía demasiada prioridad). Corregido sin perder el tamaño compacto.
- **Pestañas en el celular:** un leve desvanecido a la derecha avisa que hay más pestañas para deslizar.
- **Contraste:**
  - el número rojo de la campanita casi no se leía en modo oscuro;
  - la opción activa del menú del diseño técnico tenía poco contraste.
- Verificación: API sin ningún error 500 en 2.664 pedidos de prueba; pantallas, seguridad y regresión completa en verde.

## Recordatorios de turnos por WhatsApp (migración 0046)
- **Seguimiento → Recordatorios de turnos** se rehízo:
  - cada mensaje trae un **enlace privado** con el que el paciente **confirma o cancela su turno con un toque**;
  - la agenda y la lista se actualizan solas.
- **Funciona ya, sin configurar nada:** "Mandar por mi WhatsApp" abre el WhatsApp de la recepción con el mensaje y el enlace escritos; solo hay que tocar Enviar.
- **Automático con WhatsApp Business** (API oficial de Meta), cuando se conecte:
  - manda solo, a la hora elegida, el día anterior o con 2 o 3 días de anticipación;
  - marca enviado, entregado, leído y respondido;
  - si el paciente contesta "SÍ", confirma el turno;
  - si contesta "NO" o "reprogramar", avisa a la recepción en la campanita.
- **Protecciones:**
  - un solo recordatorio por turno, aunque haya dos procesos a la vez;
  - no se manda a turnos confirmados, a pacientes que no aceptan mensajes ni a quien no tiene celular válido;
  - nunca de noche;
  - si falla, avisa y deja "Reintentar";
  - los avisos de Meta se verifican con su firma;
  - del enlace solo se guarda su huella.
- Pasos para conectar WhatsApp Business: `docs/WHATSAPP.md`. Un flujo de GitHub (`.github/workflows/recordatorios.yml`) despierta al servidor gratuito de Render para que se manden aunque nadie use DOVA.
- **También en esta tanda:** "Configuración de la clínica" aceptaba listas u objetos como nombre o email y los guardaba mal (se vio como `{"x"}` en la marca). Ahora solo acepta texto, valida email y colores, y el nombre es obligatorio.
- Pruebas: `tests/recordatorios.test.js` (45/45, con un WhatsApp falso que imita a Meta) y `tests/ui-recordatorios.js` (21/21: los 3 diseños, celular y la página del paciente).

## Consentimientos firmados en tablet (migración 0047)

- **Firmar en tablet:** desde la ficha → Documentación → Consentimientos → "Firmar en tablet".
  - Pantalla completa que tapa el resto de DOVA.
  - Muestra el texto, quién firma (paciente o responsable con nombre y C.I.), la casilla "Leí y acepto" y el recuadro para firmar con el dedo.
  - Opcional: firma del profesional.
  - Al terminar: "¡Gracias! Devolvé la tablet".
- **Validez:**
  - se guarda fecha y hora, quién del personal estuvo presente, el dispositivo y una huella (SHA-256) del documento firmado;
  - la base **impide** modificar o borrar un consentimiento firmado;
  - si alguien lo altera por fuera de DOVA, la huella no coincide y la lista lo marca.
- Anular uno firmado pide motivo y queda registrado. El PDF lleva las firmas, el firmante, la fecha, la huella y, si corresponde, "ANULADO".
- Pruebas: `tests/consentimientos-firma.test.js` (22/22) y `tests/ui-consentimiento-tablet.js` (8/8).

## Datos de la clínica (migración 0048)

- Dirección, teléfono, WhatsApp y horario de DentCareRC cargados desde su ficha de Google: Nro 49, Pampa Grande, Luque; 0986 451 065; lunes a sábado de 8 a 12 y de 14 a 19.
- Solo completa campos vacíos: si ya se cargó algo a mano en Configuración, no lo pisa.

## WhatsApp de cada odontólogo (migración 0049)

- Cada doctor registra su celular en **Configuración → Mi WhatsApp para recordatorios**.
- En **Seguimiento → Recordatorios** el doctor ve solo los turnos de sus pacientes. Con "Mandar por mi WhatsApp" el mensaje sale de su celular.
- **Automáticos desde el número del doctor:** quien configura carga el "Phone number ID" de Meta en *WhatsApp de cada odontólogo* y marca "Enviar desde su número". Pasos en `docs/WHATSAPP.md`.
- La lista muestra de qué número sale (o salió) cada recordatorio.
- **Protecciones:**
  - un doctor no ve ni manda recordatorios de turnos ajenos (permiso nuevo `recordatorios.propios`);
  - si cambia su número, deja de enviarse desde el viejo hasta que se conecte el nuevo;
  - el aviso de "registró su WhatsApp" llega solo a quien puede conectarlo.
- Pruebas: `tests/recordatorios.test.js` (64/64) y `tests/ui-recordatorios.js` (29/29, incluye el doctor en celular).

## Copias de seguridad automáticas

- `.github/workflows/copias.yml`: copia diaria completa de la base.
  - Verificada antes de guardarse.
  - **Cifrada con AES-256**.
  - Se guardan 30 días.
- `scripts/restaurar-copia.sh` comprueba la huella, pide la clave y restaura.
- Activación y restauración paso a paso: `docs/COPIAS.md`. Necesita dos secretos en GitHub: `DOVA_BACKUP_DATABASE_URL` y `DOVA_BACKUP_CLAVE`.
- Probado acá: copia → cifrado → restauración en una base vacía y sobre una con datos, con los mismos totales. Con la clave equivocada o el archivo alterado, no restaura.

## Diseño "Mecánico", solo para administradores (migración 0050)

- Cuarto diseño, estilo sistema de escritorio clásico:
  - barra de menú en mayúsculas;
  - tira de íconos a la izquierda con accesos a las secciones que el usuario puede ver;
  - área de trabajo bordó, cada pantalla como una "ventana" con barra de título;
  - recuadro **Parámetros activos**: usuario, perfil, clínica, estado de la caja, fecha y reloj;
  - **Ventanas abiertas recientemente** (con el nombre del paciente en las fichas): un toque y se vuelve a abrir;
  - barra de estado abajo y letra Tahoma chica.
- Se elige en Configuración → Apariencia. **Solo lo ve y lo puede elegir un admin**:
  - el servidor rechaza a cualquier otro rol (403);
  - si alguien lo tenía y deja de ser admin, entra con el diseño normal;
  - si un no-admin abre `/mecanico/`, lo manda a su diseño.
- En tablet se oculta la columna de parámetros; en el celular, también la tira de íconos (queda el menú ☰).
- Pruebas: `tests/ui-mecanico.js` (26/26: API, escritorio, tablet, celular, recepción). Regresión de los otros diseños: menú, submenú, tablet, PWA, responsive y vínculos en verde.

## Importar pacientes desde Excel o CSV

- **Pacientes → "Importar desde Excel"** sirve para empezar con los pacientes que la clínica ya tiene en otra planilla o sistema.
- **Paso 1, revisar (no guarda nada).** DOVA muestra:
  - qué columna reconoció como qué dato: entiende los títulos más comunes, como "Nombres", "Cédula", "Celular", "Correo", "F. Nac." o "Nombre completo";
  - cuántos pacientes son nuevos y cuántos ya están;
  - las filas con errores, con su número de fila de Excel (falta el apellido, fecha imposible, email inválido, C.I. repetida en la planilla);
  - una muestra de cómo se van a cargar.
- **Paso 2, importar.** Todo en una sola operación: si algo falla, no queda nada a medias.
  - Si la C.I. ya existe, por defecto no se toca.
  - Opción "completar solo los datos que le faltan": nunca pisa lo ya cargado y pide permiso de editar pacientes.
- Acepta:
  - Excel .xlsx con fechas de Excel, día/mes/año y años de 2 cifras;
  - CSV de Excel en Windows (punto y coma y acentos) o UTF-8.
  - C.I. con puntos: se guarda sin puntos.
  - "Apellido, Nombre" o "Nombre Apellido" en una sola columna.
- **Límites:** hasta 5 MB y 5000 pacientes por archivo; una importación por clínica a la vez.
  - El formato .xls viejo se rechaza explicando cómo guardarlo como .xlsx.
- Planilla modelo descargable. Queda en el historial de cambios quién importó, el archivo y los totales.
- Pruebas: `tests/importar-pacientes.test.js` (37/37) y `tests/ui-importar-pacientes.js` (16/16, escritorio y celular). Barrido de seguridad: 538 rutas, 0 anomalías.

## Puesta en marcha y Datos de la clínica

- **Configuración → Datos de la clínica** (antes no había pantalla para esto):
  - nombre, dirección, teléfono, WhatsApp, email, horario, RUC, web y redes;
  - casilla para usar los mismos datos de contacto en la página web;
  - cada cambio queda en el historial con el antes y el después.
- **Inicio → Puesta en marcha** (solo quien configura la clínica): la lista de lo que falta para empezar, calculada con los datos reales:
  - datos de la clínica;
  - odontólogos;
  - tratamientos con precio;
  - sillones;
  - usuarios del personal (avisa qué odontólogos no tienen usuario);
  - datos para facturar;
  - pacientes;
  - WhatsApp (opcional).
- Cada paso tiene "Ir", que lleva directo a la pantalla donde se carga.
- La lista desaparece sola al completar los pasos, o con "Ocultar" (se vuelve a mostrar desde Datos de la clínica).
- Pruebas: `tests/puesta-en-marcha.test.js` (24/24: API, escritorio y celular). Regresión: menú 75/75, responsive 78/78, tablet, mecánico 26/26. Seguridad: 540 rutas sin anomalías, permisos 65/65, multiclínica 23/23.

## Diseño Mecánico: colores de la clínica y para todos

- Mismo diseño (menú en mayúsculas, íconos a la izquierda, ventanas con barra de título, Parámetros activos, Ventanas recientes, barra de estado), ahora con los colores de DentCareRC:
  - área de trabajo terracota;
  - barras y biseles en crema;
  - títulos en terracota profundo;
  - verde salvia para lo que está bien.
- **Lo puede elegir cualquier usuario**, en el login o en Configuración → Apariencia. Cada uno ve en la tira de íconos solo las secciones que tiene permitidas.
- Los 4 diseños se muestran en una grilla de 2 × 2 (4 en fila en Configuración en pantallas anchas).
- Pruebas: `tests/ui-mecanico.js` 27/27 (admin y recepción; escritorio, tablet y celular). Regresión: menú 75/75, responsive 78/78, primer ingreso, PWA.

## Avisos de cobro por WhatsApp (migración 0051)

- **Finanzas → Avisos de cobro** (permiso nuevo `cobranza.manage`, ya asignado a recepción) muestra:
  - las cuotas que vencen pronto y las vencidas, con los días de atraso;
  - los presupuestos enviados sin respuesta;
  - qué toca avisar hoy y los avisos ya mandados (enviado, entregado, leído, respondió, falló).
- **Cada aviso lleva un enlace privado a "Mi pago"** (vale 30 días, sin cuenta). El paciente ve:
  - lo que debe y los datos para pagar;
  - la opción de mandar el comprobante, que llega a *Pagos para revisar*;
  - en un presupuesto, "Quiero empezar" o "Tengo una consulta", que avisan a la recepción.
- **Automático** (con WhatsApp Business), a la hora elegida:
  - aviso antes del vencimiento;
  - después del vencimiento, repetir cada N días hasta un máximo;
  - presupuestos: a los N días de enviados y una semana después.
- **Sin WhatsApp Business:** "Mandar por mi WhatsApp" abre el mensaje ya armado.
- **Protecciones:**
  - nunca dos veces la misma etapa (lo impide la base) ni dos avisos a mano el mismo día;
  - nunca a quien no acepta WhatsApp, nunca de noche;
  - no se avisa de una cuota cuyo comprobante está en revisión;
  - las respuestas del paciente a un aviso de cobro no se confunden con la confirmación de un turno.
- Pasos para las plantillas de Meta: `docs/WHATSAPP.md`.

## Reserva online con horarios reales de cada profesional

- **Tratamientos → Odontólogos → Horario:** días y horas en que atiende cada uno. Sin horario propio, usa el de la clínica.
- **La página web ofrece un horario solo si se cumplen tres condiciones:**
  - el profesional atiende ese día y a esa hora;
  - está libre;
  - **queda un sillón libre**, contando los turnos de todos los profesionales y los sillones bloqueados (mantenimiento).
- Al reservar, todo se vuelve a controlar con el candado tomado: dos reservas a la vez no toman el último sillón.
- Se aceleró el cálculo: la disponibilidad del mes pasó de 2,7 s a 0,06 s con 63 profesionales.
- Pruebas:
  - nuevas: `tests/cobranza.test.js` 42/42, `tests/ui-cobranza.js` 21/21, `tests/reserva-horarios.test.js` 16/16;
  - regresión: recordatorios 64/64 y 29/29, web 51/51 y 60/60, portal 64/64;
  - seguridad: 549 rutas sin anomalías, permisos 65/65, intrusión 20/20.

## Mensajes automáticos, presupuesto desde el odontograma, visor de radiografías y guías (migración 0052)

- **Turno liberado:**
  - al cancelarse un turno (en la agenda, en la web o en el portal), el horario se ofrece por WhatsApp a la lista de espera;
  - el primero que toca "Quiero este turno" en su enlace queda agendado y confirmado; dos a la vez no pueden tomar el mismo horario;
  - en Agenda → Lista de espera aparecen los **Turnos liberados**, a quién se ofrecieron, y la opción de ofrecerlos a mano.
- **Controles periódicos:**
  - el aviso lleva un enlace para reservar sin cargar datos: el paciente solo elige día y hora, con los horarios libres reales;
  - el turno queda vinculado al control;
  - a mano: Seguimiento → Controles periódicos → "Mandar enlace para reservar".
- **Encuesta después de la atención:**
  - al día siguiente, "del 0 al 10";
  - con 9 o 10 se ofrece la reseña de Google; con 6 o menos llega un aviso a la clínica para llamarlo;
  - los resultados se suman a la satisfacción (NPS) que ya existía.
- **Presupuesto desde el odontograma:**
  - se tocan las piezas o "Marcar las piezas con hallazgos";
  - DOVA sugiere el tratamiento según el hallazgo y arma el presupuesto con los precios del catálogo, editable antes de guardar.
- **Visor de radiografías** (pantalla completa):
  - zoom (rueda, dos dedos o botones) y mover arrastrando;
  - brillo, contraste, negativo y rotación;
  - medir, y calibrar con una medida conocida para ver milímetros;
  - comparar dos estudios lado a lado con los ajustes sincronizados.
- **Guías rápidas** de una página (Recepción, Odontólogo, Administración) en PDF: Configuración → Guías rápidas. Se generan con `docs/generar-guias.py`.
- **Configuración → Mensajes automáticos:** qué sale solo, la hora y el enlace de reseña de Google. Plantillas de Meta: `docs/WHATSAPP.md`.
- **Pruebas:**
  - nuevas: `tests/mensajes.test.js` 35/35 y `tests/ui-mensajes.js` 33/33 (incluye odontograma y visor, escritorio y celular);
  - regresión: cobranza, recordatorios, reservas, web, portal, menú, submenús, responsive, tablet y mecánico, todo en verde;
  - seguridad: 559 rutas sin anomalías, permisos 65/65, intrusión 20/20.

## Tanda: Mi día del odontólogo (13/10/2026)

- **Inicio del odontólogo → Agenda de hoy / mañana** (mañana sirve para preparar el día la tarde anterior). Cada turno muestra "Tener en cuenta":
  - alertas médicas importantes (alergias graves, premedicación, anticoagulantes, presión alta, anamnesis vencida…);
  - primera vez y cumpleaños (con la edad);
  - trabajo de laboratorio que no llegó (o que ya llegó);
  - pagos atrasados: el odontólogo ve solo el aviso, los montos los ve quien tiene permiso de pagos;
  - presupuestos sin aceptar y consentimientos sin firmar.
- "Ver más": última visita, próximo paso indicado en esa consulta, tratamiento en curso con sesiones y detalle de salud.
- Franja arriba con los totales del día y lista de **trabajos de laboratorio por llegar** (atrasados marcados).
- API `GET /api/pendientes/mi-dia?fecha=` (`pendientes.midia.js`): el odontólogo ve solo lo suyo aunque pida otro; admin puede elegir odontólogo. Recepción no tiene acceso (403).
- **Pruebas:** nuevas `tests/mi-dia.test.js` 29/29 y `tests/ui-mi-dia.js` 72/72 (4 diseños, tablet y celular); regresión ui-menu 75, ui-fase6 78, ui-tablet 12; seguridad: 560 rutas sin anomalías, permisos 65/65.
