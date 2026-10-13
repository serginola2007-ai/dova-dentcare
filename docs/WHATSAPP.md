# Recordatorios de turnos por WhatsApp

DOVA recuerda cada turno por WhatsApp. El mensaje trae un **enlace privado**: el paciente toca, ve su turno y lo **confirma o cancela** con un botón. La agenda se actualiza sola.

Hay dos formas de mandarlos. Se puede empezar con la primera ya mismo y pasar a la segunda cuando esté listo WhatsApp Business.

## 1. Desde el WhatsApp de la recepción (funciona ya, sin configurar nada)

En **Seguimiento → Recordatorios de turnos**:
1. Elegí el día; por defecto, mañana.
2. Tocá **Mandar por mi WhatsApp** en cada turno. Se abre WhatsApp con el mensaje y el enlace ya escritos: solo hay que tocar Enviar.

DOVA anota que se mandó. Cuando el paciente confirma o cancela con el enlace, aparece en la lista y en la agenda.

## 2. Automático con WhatsApp Business (API oficial de Meta)

DOVA los manda solo, a la hora elegida, el día anterior (o 2 o 3 días antes). Registra **entregado** y **leído**. Si el paciente contesta "SÍ" por WhatsApp, el turno queda confirmado. Si contesta "NO" o "reprogramar", avisa a la recepción en la campanita.

### Lo que hay que tener
- Una cuenta de **Meta Business** (business.facebook.com) a nombre de la clínica.
- Un **número de celular solo para la API**. No puede ser uno que ya se use en la app de WhatsApp: conviene un chip nuevo.
- Medio de pago en Meta. Los mensajes de recordatorio son de categoría "utilidad" y tienen un costo bajo por mensaje (ver precios de Meta para Paraguay).

### Pasos (una sola vez)
1. En **developers.facebook.com** → *Crear app* → tipo **Empresa** → agregar el producto **WhatsApp**.
2. En *WhatsApp → Configuración de la API*, agregar y verificar el número de la clínica. Anotar el **Phone number ID**.
3. En *Configuración del negocio → Usuarios del sistema*:
   1. Crear un usuario del sistema con rol administrador.
   2. Asignarle la app y la cuenta de WhatsApp.
   3. **Generar token** con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`, sin vencimiento.
4. En *WhatsApp → Plantillas de mensajes*, crear una plantilla:
   - Nombre: `recordatorio_turno`
   - Categoría: **Utilidad**
   - Idioma: **Español** (`es`)
   - Cuerpo:
     ```
     Hola {{1}}, te recordamos tu turno en {{2}} el {{3}} a las {{4}}. Confirmá o cancelá tu turno acá: {{5}}
     ```
   - Ejemplos para la revisión: `Ana`, `DentCareRC`, `martes 14 de octubre`, `09:30`, `https://dova.onrender.com/web/mi-turno.html#t=ejemplo`

   Esperar la aprobación (suele tardar minutos u horas).
5. En **Render → servicio dova → Environment**, agregar:

   | Variable | Valor |
   |---|---|
   | `WHATSAPP_TOKEN` | el token del paso 3 |
   | `WHATSAPP_PHONE_NUMBER_ID` | el id del paso 2 |
   | `WHATSAPP_PLANTILLA` | `recordatorio_turno` |
   | `WHATSAPP_IDIOMA` | `es` |
   | `WHATSAPP_APP_SECRET` | *Configuración de la app → Básica → Clave secreta de la app* |
   | `WHATSAPP_VERIFY_TOKEN` | un texto largo inventado (se usa en el paso 6) |
   | `CRON_SECRET` | otro texto largo inventado (32+ caracteres; se usa en el paso 7) |
   | `PUBLIC_URL` | `https://dova.onrender.com` (o el dominio propio de la clínica) |

6. **Webhook** (para entregado, leído y respuestas): en la app de Meta → *WhatsApp → Configuración → Webhook*:
   - URL de devolución de llamada: `https://dova.onrender.com/api/whatsapp/webhook`
   - Token de verificación: el mismo `WHATSAPP_VERIFY_TOKEN`
   - Tocar *Verificar y guardar*, y suscribirse al campo **messages**.
7. **Que se mande aunque nadie use DOVA.** El plan gratuito de Render duerme el servidor tras 15 minutos sin uso. Un aviso programado de GitHub lo despierta cada 15 minutos entre las 9 y las 21 h:
   1. En GitHub → repositorio `dova-dentcare` → *Settings → Secrets and variables → Actions*, crear el secreto `DOVA_CRON_SECRET` con el **mismo valor** que `CRON_SECRET`.
   2. Listo: el flujo `.github/workflows/recordatorios.yml` se encarga del resto.

   Con el plan pago de Render, el servidor no se duerme y DOVA revisa solo cada 10 minutos (igual conviene dejar el aviso como respaldo).
8. En DOVA → **Seguimiento → Recordatorios de turnos → Configurar envío automático**:
   1. Tildar "Mandar los recordatorios solo".
   2. Elegir la hora y la anticipación.
   3. Guardar.

   Arriba tiene que decir **WhatsApp Business: conectado**.

### Cómo se comporta
- Cada turno recibe **un solo recordatorio**, aunque el servidor se reinicie o haya dos procesos a la vez.
- No se manda:
  - a turnos ya confirmados;
  - a pacientes que no aceptan recordatorios (ficha → datos de contacto);
  - si no tienen un celular válido.
- Nunca se manda de noche: si el servidor estuvo dormido, después de las 21 h espera al día siguiente.
- Si un envío falla, la recepción recibe un aviso. En la lista aparece **No se pudo enviar** con el motivo y el botón **Reintentar**; también se puede mandar a mano.
- El enlace del mensaje vale hasta el día siguiente al turno. Solo se guarda su huella: con la base de datos no se pueden reconstruir los enlaces.
- La firma de cada aviso de Meta se verifica con `WHATSAPP_APP_SECRET`. Un aviso sin firma válida se rechaza.

## Recordatorios desde el número de cada odontólogo

Cada doctor puede registrar su celular en **Configuración → Mi WhatsApp para recordatorios**. Con eso:

- **Sin conectar nada más:** en Seguimiento → Recordatorios el doctor ve solo los turnos de sus pacientes y, con "Mandar por mi WhatsApp", el mensaje (ya armado, con el enlace para confirmar) sale de su celular.
- **Para que los automáticos salgan de su número:**
  1. En Meta (WhatsApp Manager de la misma cuenta de la clínica) → *Agregar número de teléfono* → cargar el número del doctor y verificarlo con el código SMS.
     - Si ese número ya usa la app WhatsApp Business, Meta ofrece conectarlo en modo "coexistencia" (sigue usando la app en el celular).
     - Si usa WhatsApp común, hay que pasarlo a WhatsApp Business primero.
  2. Copiar el **Phone number ID** que muestra Meta para ese número.
  3. En DOVA, quien tenga permiso de configuración: Seguimiento → Recordatorios → *WhatsApp de cada odontólogo* → pegar el ID, marcar **Enviar desde su número** y Guardar.
  4. La plantilla `recordatorio_turno` es de la cuenta, así que sirve para todos los números. No hace falta otro token.

Reglas:
- Si el doctor cambia su número, DOVA deja de enviar desde el número viejo (vuelve al de la clínica) hasta que se cargue el ID nuevo.
- Cada envío guarda de qué número salió (columna "Sale de").
- Un doctor solo puede mandar recordatorios de sus propios turnos (permiso `recordatorios.propios`); recepción y administración, de todos.

## Avisos de cobro (cuotas y presupuestos)

En **Finanzas → Avisos de cobro** se ven las cuotas que vencen pronto, las vencidas y los presupuestos enviados que siguen sin respuesta.

- **Sin WhatsApp Business:** "Mandar por mi WhatsApp" abre el mensaje ya armado, con el enlace privado del paciente.
- **Con WhatsApp Business:** salen solos a la hora elegida, con el mismo disparo programado de los recordatorios. Hacen falta dos plantillas más, de categoría **Utilidad** e idioma **Español**:
  - `aviso_pago`:
    ```
    Hola {{1}}, te escribimos de {{2}}. Te recordamos que {{3}}. Si ya pagaste, no tengas en cuenta este mensaje. Podés ver los datos para pagar y mandarnos el comprobante acá: {{4}}
    ```
    Ejemplos para la revisión: `Ana`, `DentCareRC`, `la cuota 2 de 6 por Gs. 350.000 vence el 15/10/2026`, `https://dova.onrender.com/web/mi-pago.html#t=ejemplo`
  - `seguimiento_presupuesto`:
    ```
    Hola {{1}}, te escribimos de {{2}}. Te contamos que {{3}}. Acá lo podés revisar y avisarnos si querés empezar o si tenés alguna consulta: {{4}}
    ```
    Ejemplos para la revisión: `Ana`, `DentCareRC`, `el presupuesto de tu tratamiento por Gs. 2.500.000 está esperando tu respuesta`, `https://dova.onrender.com/web/mi-pago.html#t=ejemplo`
  - Si en Meta se usan otros nombres, cargarlos en Render como `WHATSAPP_PLANTILLA_PAGO` y `WHATSAPP_PLANTILLA_PRESUPUESTO`.
- **El enlace (página "Mi pago")** vale 30 días y muestra:
  - lo que el paciente tiene pendiente;
  - los datos para pagar;
  - si los pagos online están activos (Página web → Configurar la página), la opción de mandar el comprobante, que llega a *Pagos para revisar*;
  - en un presupuesto, los botones "Quiero empezar" o "Tengo una consulta", que avisan a la recepción en la campanita.
- **Reglas:**
  - nunca a quien no acepta WhatsApp, nunca después de las 20 h;
  - no se le avisa de una cuota cuyo comprobante está en revisión;
  - una cuota vencida recibe como máximo N avisos (configurable), separados por los días que se elijan;
  - un presupuesto recibe 2 avisos como máximo;
  - si el paciente responde el mensaje, la respuesta queda en el aviso y llega a la campanita: un "sí" a un aviso de cobro no confirma ningún turno.

## Mensajes automáticos: turno liberado, controles y encuesta

Se activan en **Configuración → Mensajes automáticos**, que también tiene el enlace para reseñas de Google. Sin WhatsApp Business, los turnos liberados y los controles se mandan a mano con un toque (Agenda → Lista de espera y Seguimiento → Controles periódicos).

Las tres plantillas son de categoría **Utilidad** e idioma **Español**, con `{{1}}` nombre, `{{2}}` clínica, `{{3}}` detalle y `{{4}}` enlace:

- `turno_liberado`:
  ```
  Hola {{1}}, te escribimos de {{2}}. Te contamos que {{3}}. Si lo querés, tomalo acá (es para el primero que lo confirme): {{4}}
  ```
  Ejemplos: `Ana`, `DentCareRC`, `se liberó un turno el martes 14 de octubre a las 10:00 con Dra. Pérez`, `https://dova.onrender.com/web/tomar-turno.html#t=ejemplo`
- `control_periodico`:
  ```
  Hola {{1}}, te escribimos de {{2}}. Te avisamos que {{3}}. Elegí el día y la hora que te queden mejor acá: {{4}}
  ```
  Ejemplos: `Ana`, `DentCareRC`, `ya te toca tu limpieza y control`, `https://dova.onrender.com/web/reservar.html#c=ejemplo`
- `encuesta_atencion`:
  ```
  Hola {{1}}, gracias por atenderte en {{2}}: {{3}}. Del 0 al 10, ¿qué tan probable es que nos recomiendes? Respondé acá: {{4}}
  ```
  Ejemplos: `Ana`, `DentCareRC`, `queremos saber cómo te atendimos`, `https://dova.onrender.com/web/encuesta.html#t=ejemplo`

Si en Meta usan otros nombres, cargarlos en Render como `WHATSAPP_PLANTILLA_LISTA_ESPERA`, `WHATSAPP_PLANTILLA_CONTROL` y `WHATSAPP_PLANTILLA_ENCUESTA`.

**Reglas:**
- **Turno liberado:**
  - se ofrece hasta a 5 personas de la lista de espera, por prioridad y antigüedad;
  - el primero que lo toma queda agendado y confirmado, y a los demás les aparece "otra persona ya lo tomó";
  - no se ofrecen turnos a menos de 2 horas ni a más de 21 días.
- **Controles:**
  - el aviso sale una semana antes del control, solo si el paciente no tiene un turno próximo;
  - si no reserva, recibe un segundo aviso 3 semanas después;
  - cada día salen como máximo 200, empezando por los más recientes.
- **Encuesta:**
  - sale al día siguiente de la atención, como máximo una cada 60 días por paciente;
  - con 9 o 10 se le ofrece dejar una reseña en Google;
  - con 6 o menos, la clínica recibe el aviso para llamarlo.
