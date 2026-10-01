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
