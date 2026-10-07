/* DOVA — Página web: lo que llega desde la web de la clínica (turnos,
   fichas de pacientes nuevos y consultas) y la configuración de la página. */
const DovaWeb = (() => {
  const X = DovaExt;
  const { esc, fmtFecha, fmtFechaHora, toast, puede, badge, cargando } = X;
  const TIPO = { turno: ['Turno', 'info'], registro: ['Ficha', 'ok'], consulta: ['Consulta', 'atencion'], codigo: ['Pide código', 'atencion'] };
  const ESTADO = { pendiente: ['Pendiente', 'atencion'], resuelta: ['Atendida', 'ok'], descartada: ['Descartada', 'critica'] };
  const DIAS = [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado'], [0, 'Domingo']];
  const SALUD = { alergias: 'Alergias', medicacion: 'Medicación', anticoagulantes: 'Anticoagulantes o aspirina', corazon: 'Corazón o presión', diabetes: 'Diabetes', enfermedades: 'Otras enfermedades', embarazo: 'Embarazo' };
  const urlWeb = () => `${location.origin}/web/`;

  let buscarAcceso = '';
  async function seccion(root, navegar, params) {
    root.innerHTML = `<h2 class="dova-view-title">Página web</h2>
      <p class="dova-nota">La página de la clínica está en <a href="${urlWeb()}" target="_blank" rel="noopener">${esc(urlWeb())}</a>. Los turnos que se reservan ahí entran directo a la Agenda.</p>
      <div data-subs></div>`;
    X.subPestanas(root.querySelector('[data-subs]'), [
      { id: 'solicitudes', texto: 'Lo que llegó', visible: puede('web.ver', 'web.configurar'), render: (c) => solicitudes(c, navegar, { estado: 'pendiente' }) },
      { id: 'pagos', texto: 'Pagos para revisar', visible: puede('web.ver'), render: (c) => pagosWeb(c, navegar, { estado: 'pendiente' }) },
      { id: 'accesos', texto: 'Cuentas de pacientes', visible: puede('web.ver'), render: (c) => accesos(c, navegar) },
      { id: 'config', texto: 'Configurar la página', visible: puede('web.configurar'), render: (c) => configuracion(c) },
    ], { inicial: ['pagos', 'accesos', 'config'].includes(params) ? params : undefined });
  }


  // ---------------- Cuentas de pacientes (código para entrar a la web) ----------------
  const telWa = (t) => { const n = String(t || '').replace(/\D/g, ''); if (n.length < 6) return null; return n.startsWith('0') ? `595${n.slice(1)}` : n; };
  async function accesos(c, navegar) {
    const buscar = buscarAcceso;
    c.innerHTML = `<p class="dova-nota">Los pacientes que ya tienen ficha entran a la página con un <strong>código de 6 números</strong> que les das desde acá (vale 48 horas). También sirve si se olvidaron la contraseña. Las personas nuevas crean su cuenta solas desde la página.</p>
      <div class="dova-fac-filtros-form"><div style="flex:1;min-width:240px;max-width:520px"><label>Buscar paciente (nombre, apellido o cédula)</label><input style="width:100%" data-buscar value="${esc(buscar)}" placeholder="Ej.: Benítez o 4567890" /></div>
        <div class="dova-fac-f-botones"><button type="button" class="dova-btn-primary" data-ir>Buscar</button></div></div>
      <div data-res></div>`;
    const inp = c.querySelector('[data-buscar]'); const out = c.querySelector('[data-res]');
    const buscarAhora = async () => {
      const b = inp.value.trim(); buscarAcceso = b;
      if (b.length < 2) { out.innerHTML = '<p class="dova-nota">Escribí al menos 2 letras o números.</p>'; return; }
      out.innerHTML = cargando;
      try {
        const r = await DOVA.get(`/web/accesos?buscar=${encodeURIComponent(b)}`);
        out.innerHTML = r.length ? `<div class="dova-web-lista">${r.map((x) => `<article class="dova-web-card">
            <header><strong>${esc(x.nombre)} ${esc(x.apellido)}</strong> <span class="dova-nota">C.I. ${esc(x.ci || 'sin cargar')}</span>
              ${x.cuenta_id ? (x.cuenta_activa ? badge('Tiene cuenta', 'ok') : badge('Cuenta desactivada', 'critica')) : badge('Sin cuenta', 'info')}
              ${x.web_verificado === false ? badge('Identidad sin verificar', 'atencion') : ''}</header>
            ${x.ultimo_ingreso ? `<p class="dova-nota">Último ingreso: ${esc(fmtFechaHora(x.ultimo_ingreso))}</p>` : ''}
            <div class="dova-web-acciones">
              <button class="dova-btn-primary" data-dar="${x.id}">${x.cuenta_id ? 'Código para nueva contraseña' : 'Dar código para entrar'}</button>
              ${x.web_verificado === false && puede('pacientes.edit') ? `<button class="dova-btn-secundario" data-verif="${x.id}" title="Cuando viste su cédula">Verificar identidad</button>` : ''}
              ${x.cuenta_id && x.cuenta_activa ? `<button class="dova-btn-secundario" data-desact="${x.id}">Desactivar cuenta</button>` : ''}
              <button class="dova-btn-secundario" data-pac="${x.id}">Ver ficha</button>
            </div></article>`).join('')}</div>` : '<p class="dova-nota">No se encontró ningún paciente.</p>';
      } catch (e) { out.innerHTML = `<p class="dova-nota">${esc(e.message)}</p>`; return; }
      out.querySelectorAll('[data-pac]').forEach((b) => b.addEventListener('click', () => navegar('paciente', b.dataset.pac)));
      out.querySelectorAll('[data-dar]').forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        try { mostrarCodigo(await DOVA.post(`/web/pacientes/${b.dataset.dar}/codigo`, {})); } catch (e) { toast(e.message, 'error'); }
        b.disabled = false;
      }));
      out.querySelectorAll('[data-verif]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirmarSimple('¿Viste la cédula de este paciente en la clínica?')) return;
        try { await DOVA.post(`/web/pacientes/${b.dataset.verif}/verificar`, {}); toast('Identidad verificada', 'ok'); buscarAhora(); } catch (e) { toast(e.message, 'error'); }
      }));
      out.querySelectorAll('[data-desact]').forEach((b) => b.addEventListener('click', async () => {
        try { await DOVA.post(`/web/pacientes/${b.dataset.desact}/desactivar-cuenta`, {}); toast('Cuenta desactivada. Para volver a entrar necesita un código nuevo.', 'ok'); buscarAhora(); } catch (e) { toast(e.message, 'error'); }
      }));
    };
    c.querySelector('[data-ir]').addEventListener('click', buscarAhora);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscarAhora(); } });
    if (buscar) buscarAhora(); else inp.focus();
    X.vivo(out, ['web_cuentas', 'pacientes'], () => (inp.value.trim().length >= 2 ? buscarAhora() : null));
  }
  // Confirmación sin ventanas del navegador: segundo clic dentro de 4 s.
  const pendientes = new Map();
  function confirmarSimple(msg) {
    const ahora = Date.now(); const t = pendientes.get(msg);
    if (t && ahora - t < 4000) { pendientes.delete(msg); return true; }
    pendientes.set(msg, ahora); toast(`${msg} Tocá de nuevo para confirmar.`, 'info'); return false;
  }
  function mostrarCodigo(r) {
    const enlace = `${urlWeb()}ingresar.html?modo=codigo`;
    const texto = `Hola ${r.nombre}. Tu código para ${r.tieneCuenta ? 'cambiar tu contraseña' : 'entrar a tu cuenta'} en la página de la clínica es ${r.codigo}. Entrá en ${enlace} con tu cédula (${r.ci}). Vale por 48 horas.`;
    const tel = telWa(r.telefono);
    const wa = `https://wa.me/${tel || ''}?text=${encodeURIComponent(texto)}`;
    X.modal(`Código para ${r.nombre} ${r.apellido}`, `
      <p class="dova-web-codigo" aria-label="Código">${esc(r.codigo.slice(0, 3))} ${esc(r.codigo.slice(3))}</p>
      <p class="dova-nota">Vale por 48 horas y se usa una sola vez. Si das otro, este deja de servir. El paciente entra en <strong>${esc(enlace)}</strong> con su cédula, el código y una contraseña nueva.</p>
      ${tel ? '' : '<p class="dova-nota">La ficha no tiene celular cargado: al abrir WhatsApp vas a tener que elegir el contacto.</p>'}
      <div class="dova-modal-actions"><button class="dova-btn-secundario" data-copiar>Copiar mensaje</button><a class="dova-btn-primary" href="${esc(wa)}" target="_blank" rel="noopener">Enviar por WhatsApp</a></div>`);
    document.querySelector('.dova-modal-box [data-copiar]').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(texto); toast('Mensaje copiado', 'ok'); } catch (_e) { toast('No se pudo copiar: anotá el código', 'error'); }
    });
  }

  // ---------------- Lo que llegó ----------------
  async function solicitudes(c, navegar, fl) {
    const q = new URLSearchParams(Object.entries(fl).filter(([, v]) => v));
    const r = await DOVA.get(`/web/solicitudes?${q}`);
    const filtro = (k, v, t) => `<button class="dova-ext-subtab ${fl[k] === v ? 'activo' : ''}" data-f="${k}" data-v="${v}">${t}</button>`;
    c.innerHTML = `
      <div class="dova-web-filtros">${filtro('estado', 'pendiente', `Pendientes (${r.pendientes})`)}${filtro('estado', '', 'Todas')}
        <span class="dova-web-sep"></span>${filtro('tipo', '', 'Todo')}${filtro('tipo', 'turno', 'Turnos')}${filtro('tipo', 'registro', 'Fichas')}${filtro('tipo', 'consulta', 'Consultas')}${filtro('tipo', 'codigo', 'Códigos')}</div>
      ${r.items.length ? `<div class="dova-web-lista">${r.items.map(tarjeta).join('')}</div>`
        : `<div class="dova-fac-vacio"><h3>${fl.estado === 'pendiente' ? 'No hay nada pendiente' : 'Todavía no llegó nada'}</h3>
           <p class="dova-nota">Cuando alguien reserve un turno, complete su ficha o mande una consulta desde la página, aparece acá y te llega un aviso.</p></div>`}`;
    const recargar = (cambio) => solicitudes(c, navegar, { ...fl, ...cambio });
    X.vivo(c, ['web_solicitudes', 'pacientes', 'web_cuentas'], () => recargar({}));
    c.querySelectorAll('[data-dar-sol]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        const r2 = await DOVA.post(`/web/pacientes/${b.dataset.darSol}/codigo`, {});
        if (b.dataset.tel) r2.telefono = b.dataset.tel; // el número que dejó al pedirlo
        mostrarCodigo(r2);
        await DOVA.patch(`/web/solicitudes/${b.dataset.sol}`, { estado: 'resuelta' }).catch(() => {});
      } catch (e) { toast(e.message, 'error'); b.disabled = false; }
    }));
    c.querySelectorAll('[data-buscar-acceso]').forEach((b) => b.addEventListener('click', () => { buscarAcceso = b.dataset.buscarAcceso; navegar('web', 'accesos'); }));
    c.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => recargar({ [b.dataset.f]: b.dataset.v })));
    c.querySelectorAll('[data-pac]').forEach((b) => b.addEventListener('click', () => navegar('paciente', b.dataset.pac)));
    c.querySelectorAll('[data-agenda]').forEach((b) => b.addEventListener('click', () => navegar('agenda')));
    c.querySelectorAll('[data-verificar]').forEach((b) => b.addEventListener('click', () => {
      X.modal('Verificar identidad', `<p>Confirmá que <strong>viste la cédula</strong> de esta persona (en la clínica) y que sus datos son correctos.</p>
        <p class="dova-nota">Recién después de verificarla puede ver sus pagos y comprobantes en la página web y pagar desde ahí. Así nadie ve datos de pagos a nombre de otro.</p>
        <div class="dova-modal-actions"><button class="dova-btn-secundario" data-cerrar-modal>Cancelar</button><button class="dova-btn-primary" data-si>Sí, la verifiqué</button></div>`);
      document.querySelector('.dova-modal-box [data-si]').addEventListener('click', async () => {
        try { await DOVA.post(`/web/pacientes/${b.dataset.verificar}/verificar`, {}); X.cerrarModal(); toast('Identidad verificada', 'ok'); recargar({}); } catch (e) { toast(e.message, 'error'); }
      });
    }));
    c.querySelectorAll('[data-estado]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try { await DOVA.patch(`/web/solicitudes/${b.dataset.id}`, { estado: b.dataset.estado }); toast(b.dataset.estado === 'resuelta' ? 'Marcada como atendida' : b.dataset.estado === 'descartada' ? 'Descartada' : 'Vuelve a pendientes', 'ok'); recargar({}); } catch (e) { toast(e.message, 'error'); b.disabled = false; }
    }));
    c.querySelectorAll('[data-aplicar]').forEach((b) => b.addEventListener('click', () => {
      const s = r.items.find((x) => String(x.id) === b.dataset.aplicar);
      const d = s.datos || {};
      const op = [['telefono', 'Teléfono', s.telefono], ['email', 'Email', s.email], ['direccion', 'Dirección', d.direccion], ['ciudad', 'Ciudad', d.ciudad], ['fechaNacimiento', 'Fecha de nacimiento', d.fechaNacimiento && fmtFecha(d.fechaNacimiento)], ['contactoEmergencia', 'Contacto de emergencia', d.contactoEmergencia]].filter(([, , v]) => v);
      X.modal('Pasar datos a la ficha', `<p class="dova-nota">${esc(s.nombre)} ya era paciente. Marcá los datos nuevos que querés guardar en su ficha (reemplazan a los actuales).</p>
        <form data-aplicar-form>${op.map(([k, t, v]) => `<label class="dova-ext-check"><input type="checkbox" name="${k}" checked/> <strong>${esc(t)}:</strong> ${esc(v)}</label>`).join('')}
        <div class="dova-modal-actions"><button type="button" class="dova-btn-secundario" data-cerrar-modal>Cancelar</button><button class="dova-btn-primary">Guardar en la ficha</button></div></form>`);
      document.querySelector('[data-aplicar-form]').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const campos = op.map(([k]) => k).filter((k) => ev.target[k].checked);
        try { await DOVA.post(`/web/solicitudes/${s.id}/aplicar`, { campos }); X.cerrarModal(); toast('Datos guardados en la ficha', 'ok'); recargar({}); } catch (e) { toast(e.message, 'error'); }
      });
    }));
  }

  // ---------------- Pagos informados desde la web ----------------
  const EST_PAGO = { pendiente: ['Para revisar', 'atencion'], aprobado: ['Aprobado', 'ok'], rechazado: ['Rechazado', 'critica'] };
  async function pagosWeb(c, navegar, fl) {
    X.vivo(c, ['web_pagos'], () => pagosWeb(c, navegar, fl));
    const r = await DOVA.get(`/web/pagos?${new URLSearchParams(Object.entries(fl).filter(([, v]) => v))}`);
    const f = (v, t) => `<button class="dova-ext-subtab ${fl.estado === v ? 'activo' : ''}" data-f="${v}">${t}</button>`;
    c.innerHTML = `<p class="dova-nota">Pagos que los pacientes hicieron por transferencia o QR desde su cuenta. <strong>Mirá el comprobante y fijate que la plata haya entrado al banco</strong> antes de aprobar: al aprobar se registra el cobro y entra a la caja.</p>
      <div class="dova-web-filtros">${f('pendiente', `Para revisar (${r.pendientes})`)}${f('', 'Todos')}</div>
      ${r.items.length ? `<div class="dova-web-lista">${r.items.map((x) => `<article class="dova-web-card ${x.estado !== 'pendiente' ? 'cerrada' : ''}">
          <header>${badge(EST_PAGO[x.estado][0], EST_PAGO[x.estado][1])} <strong>${esc(x.paciente)}</strong> <span class="dova-nota">C.I. ${esc(x.ci || '-')}</span><span class="dova-nota dova-web-cuando">${esc(fmtFechaHora(x.creado_en))}</span></header>
          <p><strong>${X.fmtGs(x.monto)}</strong> · ${x.metodo === 'qr' ? 'QR' : 'Transferencia'}${x.referencia ? ` · operación ${esc(x.referencia)}` : ''} · ${x.cuota_numero ? `cuota ${x.cuota_numero}` : x.presupuesto_id ? `a cuenta del presupuesto N.º ${x.presupuesto_id}` : 'pago a cuenta'}</p>
          ${x.nota ? `<p class="dova-nota">“${esc(x.nota)}”</p>` : ''}
          ${x.estado === 'rechazado' ? `<p class="dova-nota">Motivo: ${esc(x.motivo_rechazo)} · ${esc(x.revisado_por_nombre || '')}</p>` : ''}
          ${x.estado === 'aprobado' ? `<p class="dova-nota">Aprobado por ${esc(x.revisado_por_nombre || '-')}${x.factura_numero ? ` · factura ${esc(x.factura_numero)}` : ''}</p>` : ''}
          <div class="dova-web-acciones"><button class="dova-btn-secundario" data-ver-comp="${x.id}" data-mime="${esc(x.comprobante_mime)}">Ver comprobante</button>
            <button class="dova-btn-secundario" data-pac="${x.paciente_id}">Ver ficha</button>
            ${x.estado === 'pendiente' && puede('pagos.create') ? `<button class="dova-btn-primary" data-aprobar="${x.id}">Aprobar</button><button class="dova-btn-link dova-ext-peligro" data-rechazar="${x.id}">Rechazar</button>` : ''}</div>
        </article>`).join('')}</div>`
        : `<div class="dova-fac-vacio"><h3>${fl.estado === 'pendiente' ? 'No hay pagos para revisar' : 'Todavía no hay pagos desde la web'}</h3><p class="dova-nota">Cuando un paciente envíe un comprobante desde su cuenta, aparece acá y te llega un aviso.</p></div>`}`;
    const recargar = (cambio) => pagosWeb(c, navegar, { ...fl, ...cambio });
    c.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => recargar({ estado: b.dataset.f })));
    c.querySelectorAll('[data-pac]').forEach((b) => b.addEventListener('click', () => navegar('paciente', b.dataset.pac)));
    c.querySelectorAll('[data-ver-comp]').forEach((b) => b.addEventListener('click', async () => {
      const w = window.open('', '_blank');
      try { const res = await DOVA.request(`/web/pagos/${b.dataset.verComp}/comprobante`, { raw: true }); if (!res.ok) throw new Error('No se pudo abrir el comprobante'); const u = URL.createObjectURL(await res.blob()); if (w) w.location.href = u; setTimeout(() => URL.revokeObjectURL(u), 60000); }
      catch (e) { if (w) w.close(); toast(e.message, 'error'); }
    }));
    c.querySelectorAll('[data-aprobar]').forEach((b) => b.addEventListener('click', () => {
      const x = r.items.find((i) => String(i.id) === b.dataset.aprobar);
      X.modal('Aprobar pago', `<p>¿Confirmás que entraron <strong>${X.fmtGs(x.monto)}</strong> de ${esc(x.paciente)} al banco?</p>
        <p class="dova-nota">Se registra el cobro${x.cuota_numero ? ` de la cuota ${x.cuota_numero}` : ''}, entra a la caja (si está abierta) y le llega un email al paciente.</p>
        ${puede('facturacion.crear') ? '<label class="dova-ext-check"><input type="checkbox" data-facturar checked/> Generar la factura del cobro</label>' : ''}
        <div class="dova-modal-actions"><button class="dova-btn-secundario" data-cerrar-modal>Cancelar</button><button class="dova-btn-primary" data-si>Aprobar pago</button></div>`);
      const box = document.querySelector('.dova-modal-box');
      box.querySelector('[data-si]').addEventListener('click', async (ev) => {
        ev.target.disabled = true;
        try {
          const fz = box.querySelector('[data-facturar]');
          const rr = await DOVA.post(`/web/pagos/${x.id}/aprobar`, { facturar: !!(fz && fz.checked) });
          X.cerrarModal();
          toast(`Pago aprobado${rr.factura ? ` · factura ${rr.factura.numero}` : ''}${rr.cajaReflejada === false ? '. La caja está cerrada: se suma al abrirla.' : ''}`, 'ok');
          recargar({});
        } catch (e) { ev.target.disabled = false; toast(e.message, 'error'); }
      });
    }));
    c.querySelectorAll('[data-rechazar]').forEach((b) => b.addEventListener('click', () => X.modalForm('Rechazar pago', [
      { k: 'motivo', label: 'Motivo (el paciente lo va a ver)', tipo: 'textarea', req: true },
    ], {}, async (d) => { await DOVA.post(`/web/pagos/${b.dataset.rechazar}/rechazar`, d); toast('Pago rechazado: le avisamos al paciente', 'ok'); recargar({}); }, { textoBoton: 'Rechazar pago', extraHtml: '<p class="dova-nota">Por ejemplo: "No vemos la transferencia en el banco" o "El monto no coincide".</p>' })));
  }

  function tarjeta(s) {
    const d = s.datos || {};
    const salud = Object.entries(d.salud || {}).filter(([, v]) => v && v.r === 'si');
    const contacto = [s.telefono && `Tel. ${esc(s.telefono)}`, s.email && `${esc(s.email)}`, s.ci && `C.I. ${esc(s.ci)}`].filter(Boolean).join(' &nbsp; ');
    const wa = s.telefono ? `https://wa.me/${(() => { const n = s.telefono.replace(/\D/g, ''); return n.startsWith('0') ? `595${n.slice(1)}` : n; })()}` : null;
    let cuerpo = '';
    if (s.tipo === 'turno') {
      cuerpo = `<p><strong>${s.turno_fecha ? `${esc(fmtFecha(s.turno_fecha))} a las ${esc(s.turno_hora)}` : `${esc(d.fecha || '')} ${esc(d.hora || '')}`}</strong> · ${esc(d.tratamiento || 'Consulta general')} · ${esc(s.turno_odontologo || d.odontologo || '')}
        ${s.turno_estado === 'cancelado' ? badge('Cancelado por el paciente', 'critica') : ''}</p>
        ${s.mensaje ? `<p class="dova-nota">“${esc(s.mensaje)}”</p>` : ''}`;
    } else if (s.tipo === 'registro') {
      cuerpo = `${salud.length ? `<p><strong>Salud:</strong> ${salud.map(([k, v]) => `${esc(SALUD[k] || k)}${v.d ? ` (${esc(v.d)})` : ''}`).join(' · ')}</p>` : '<p class="dova-nota">No marcó problemas de salud.</p>'}
        ${d.direccion || d.ciudad ? `<p class="dova-nota">${esc([d.direccion, d.ciudad].filter(Boolean).join(', '))}</p>` : ''}
        ${d.comoNosConocio ? `<p class="dova-nota">Nos conoció por: ${esc(d.comoNosConocio)}</p>` : ''}
        ${s.mensaje ? `<p class="dova-nota">“${esc(s.mensaje)}”</p>` : ''}`;
    } else if (s.tipo === 'codigo') {
      cuerpo = `<p class="dova-web-msg">${esc(s.mensaje)}</p>`;
    } else cuerpo = `<p class="dova-web-msg">${esc(s.mensaje)}</p>`;
    return `<article class="dova-web-card ${s.estado !== 'pendiente' ? 'cerrada' : ''}">
      <header>${badge(TIPO[s.tipo][0], TIPO[s.tipo][1])} <strong>${esc(s.nombre)}</strong> ${s.paciente_nuevo ? badge('Paciente nuevo', 'ok') : s.paciente_id ? badge('Ya era paciente', 'info') : ''} ${s.paciente_id && s.web_verificado === false ? badge('Identidad sin verificar', 'atencion') : ''}
        <span class="dova-nota dova-web-cuando">${esc(fmtFechaHora(s.creado_en))}</span></header>
      ${cuerpo}
      <p class="dova-nota">${contacto}</p>
      <div class="dova-web-acciones">
        ${s.tipo === 'codigo' && s.estado === 'pendiente' && s.paciente_id ? `<button class="dova-btn-primary" data-dar-sol="${s.paciente_id}" data-sol="${s.id}" data-tel="${esc(s.telefono || '')}">Dar código</button>` : ''}
        ${s.tipo === 'codigo' && s.estado === 'pendiente' && !s.paciente_id ? `<button class="dova-btn-primary" data-buscar-acceso="${esc(s.ci || '')}">Buscar paciente</button>` : ''}
        ${s.paciente_id ? `<button class="dova-btn-secundario" data-pac="${s.paciente_id}">Ver ficha</button>` : ''}
        ${s.paciente_id && s.web_verificado === false && puede('pacientes.edit') ? `<button class="dova-btn-secundario" data-verificar="${s.paciente_id}" title="Hacelo cuando el paciente venga en persona y muestre su cédula">Verificar identidad</button>` : ''}
        ${s.turno_id ? '<button class="dova-btn-secundario" data-agenda>Ver agenda</button>' : ''}
        ${wa ? `<a class="dova-btn-secundario" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        ${s.tipo === 'registro' && !s.paciente_nuevo && s.paciente_id && s.estado === 'pendiente' && puede('pacientes.edit') ? `<button class="dova-btn-secundario" data-aplicar="${s.id}">Pasar datos a la ficha</button>` : ''}
        ${s.estado === 'pendiente' ? `<button class="dova-btn-primary" data-estado="resuelta" data-id="${s.id}">Marcar atendida</button><button class="dova-btn-link dova-ext-peligro" data-estado="descartada" data-id="${s.id}">Descartar</button>`
          : `<span class="dova-nota">${badge(ESTADO[s.estado][0], ESTADO[s.estado][1])} ${esc(s.resuelta_por_nombre || '')}</span><button class="dova-btn-link" data-estado="pendiente" data-id="${s.id}">Volver a pendiente</button>`}
      </div></article>`;
  }

  // ---------------- Configuración ----------------
  async function configuracion(c) {
    const [cfg, trats, odos] = await Promise.all([DOVA.get('/web/config'), DOVA.get('/tratamientos').catch(() => []), DOVA.get('/odontologos').catch(() => [])]);
    const tAct = trats.filter((t) => t.activo !== false); const oAct = odos.filter((o) => o.activo !== false);
    const marcado = (lista, id) => !lista || lista.includes(id);
    const horas = (d) => (cfg.horarios[d] || []);
    const filaDia = ([d, n]) => {
      const h = horas(d); const m = h[0] || []; const t = h[1] || [];
      return `<tr><td><label class="dova-ext-check" style="margin:0"><input type="checkbox" data-abre="${d}" ${h.length ? 'checked' : ''}/> ${n}</label></td>
        <td><input type="time" data-d="${d}" data-i="0" data-j="0" value="${m[0] || '08:00'}"/> a <input type="time" data-d="${d}" data-i="0" data-j="1" value="${m[1] || '12:00'}"/></td>
        <td><label class="dova-ext-check" style="margin:0"><input type="checkbox" data-tarde="${d}" ${t.length ? 'checked' : ''}/> y</label> <input type="time" data-d="${d}" data-i="1" data-j="0" value="${t[0] || '14:00'}"/> a <input type="time" data-d="${d}" data-i="1" data-j="1" value="${t[1] || '19:00'}"/></td></tr>`;
    };
    c.innerHTML = `
      <form data-cfg>
        <section class="dova-ext-caja"><h4>Reservas online</h4>
          <label class="dova-ext-check"><input type="checkbox" name="reservasActivas" ${cfg.reservas_activas ? 'checked' : ''}/> Permitir que los pacientes reserven turnos desde la página</label>
          <div class="dova-fac-filtros-form">
            <div><label>Cada cuántos minutos se ofrece un turno</label><select name="intervaloMinutos">${[15, 20, 30, 45, 60].map((v) => `<option ${cfg.intervalo_minutos === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
            <div><label>Días hacia adelante que se pueden reservar</label><input type="number" name="diasAdelante" min="1" max="180" value="${cfg.dias_adelante}"/></div>
            <div><label>Horas mínimas de anticipación</label><input type="number" name="anticipacionHoras" min="0" max="168" value="${cfg.anticipacion_horas}"/></div>
            <div><label>Cancelar online hasta (horas antes)</label><input type="number" name="cancelacionHoras" min="0" max="168" value="${cfg.cancelacion_horas}"/></div>
            <div><label>Turnos web por persona a la vez</label><input type="number" name="maxTurnosPorPersona" min="1" max="10" value="${cfg.max_turnos_por_persona}"/></div>
          </div>
          <p class="dova-nota">Los bloqueos de agenda (feriados, vacaciones) y los turnos ya dados se respetan solos: esos horarios no aparecen en la página.</p>
        </section>
        <section class="dova-ext-caja"><h4>Horario de atención</h4>
          <div class="dova-ext-tabla-wrap"><table class="dova-tabla dova-web-horario"><tbody>${DIAS.map(filaDia).join('')}</tbody></table></div>
          <p class="dova-nota">Marcá los días que atienden. "y" agrega un segundo horario (por ejemplo, a la tarde).</p>
        </section>
        <section class="dova-ext-caja"><h4>Qué se puede reservar</h4>
          <p class="dova-nota">Tratamientos que se ofrecen en la página (la duración del turno es la del tratamiento).</p>
          <div class="dova-web-checks">${tAct.map((t) => `<label class="dova-ext-check"><input type="checkbox" data-trat="${t.id}" ${marcado(cfg.tratamientos_web, t.id) ? 'checked' : ''}/> ${esc(t.nombre)}</label>`).join('')}</div>
          <label class="dova-ext-check"><input type="checkbox" name="mostrarPrecios" ${cfg.mostrar_precios ? 'checked' : ''}/> Mostrar el precio ("desde Gs. …")</label>
          <p class="dova-nota" style="margin-top:12px">Profesionales que atienden turnos online.</p>
          <div class="dova-web-checks">${oAct.map((o) => `<label class="dova-ext-check"><input type="checkbox" data-odo="${o.id}" ${marcado(cfg.odontologos_web, o.id) ? 'checked' : ''}/> ${esc(o.nombre)}</label>`).join('')}</div>
        </section>
        <section class="dova-ext-caja"><h4>Cuentas de pacientes</h4>
          <label class="dova-ext-check"><input type="checkbox" name="cuentasActivas" ${cfg.cuentas_activas ? 'checked' : ''}/> Los pacientes pueden crear su cuenta y entrar a "Mi cuenta"</label>
          <p class="dova-nota">Las personas nuevas crean su cuenta solas (ven y reservan turnos; pagos y comprobantes, cuando verificás su cédula). Los que ya tienen ficha entran con un código que les das en la pestaña "Cuentas de pacientes" (por WhatsApp). No hace falta configurar emails.</p>
        </section>
        <section class="dova-ext-caja"><h4>Pagos online (transferencia o QR)</h4>
          <label class="dova-ext-check"><input type="checkbox" name="pagosActivos" ${cfg.pagos_activos ? 'checked' : ''}/> Los pacientes pueden pagar desde su cuenta y mandar el comprobante</label>
          ${X.formHtml([
            { k: 'banco', label: 'Banco', max: 100 }, { k: 'titular', label: 'Titular de la cuenta', max: 150 }, { k: 'numeroCuenta', label: 'N.º de cuenta', max: 60 },
            { k: 'documentoTitular', label: 'RUC o C.I. del titular', max: 40 }, { k: 'aliasPago', label: 'Alias (ej. celular o RUC)', max: 100 },
            { k: 'instruccionesPago', label: 'Instrucciones para el paciente (opcional)', tipo: 'textarea' },
          ], { banco: cfg.banco, titular: cfg.titular, numeroCuenta: cfg.numero_cuenta, documentoTitular: cfg.documento_titular, aliasPago: cfg.alias_pago, instruccionesPago: cfg.instrucciones_pago })}
          <div class="dova-fac-logo">${cfg.qr_mime ? '<img data-qr alt="QR de pago" style="max-height:140px"/>' : '<span class="dova-nota">Sin QR cargado.</span>'}</div>
          <div><input type="file" accept="image/png,image/jpeg" data-qr-archivo aria-label="Imagen del QR"/> <button type="button" class="dova-btn-secundario" data-subir-qr>Subir QR</button></div>
          <p class="dova-nota">Cada pago queda "para revisar" en la pestaña <strong>Pagos para revisar</strong>: recién al aprobarlo se registra el cobro y entra a la caja.</p>
        </section>
        <section class="dova-ext-caja"><h4>Textos y contacto</h4>
          ${X.formHtml([
            { k: 'titulo', label: 'Nombre de la clínica en la página', max: 150 }, { k: 'eslogan', label: 'Frase de bienvenida', max: 250 },
            { k: 'presentacion', label: 'Presentación (aparece en Tratamientos)', tipo: 'textarea' },
            { k: 'direccion', label: 'Dirección', max: 300, ancho: 'completo' }, { k: 'telefono', label: 'Teléfono', max: 60 }, { k: 'whatsapp', label: 'WhatsApp', max: 60 },
            { k: 'email', label: 'Email', max: 150 }, { k: 'instagram', label: 'Instagram', max: 150 }, { k: 'facebook', label: 'Facebook', max: 150 },
            { k: 'mapaUrl', label: 'Mapa (enlace "Insertar mapa" de Google Maps)', ancho: 'completo', ayuda: 'En Google Maps: Compartir → Insertar un mapa → copiá solo lo que está entre comillas después de src=' },
          ], { titulo: cfg.titulo, eslogan: cfg.eslogan, presentacion: cfg.presentacion, direccion: cfg.direccion, telefono: cfg.telefono, whatsapp: cfg.whatsapp, email: cfg.email, instagram: cfg.instagram, facebook: cfg.facebook, mapaUrl: cfg.mapa_url })}
          <p class="dova-nota">El logo es el mismo de los comprobantes (Facturación → Configuración).</p>
        </section>
        <p class="dova-error-text" data-error style="display:none"></p>
        <div class="dova-fac-form-pie"><a class="dova-btn-secundario" href="${urlWeb()}" target="_blank" rel="noopener">Ver la página</a><button class="dova-btn-primary">Guardar cambios</button></div>
      </form>`;
    const f = c.querySelector('[data-cfg]');
    if (cfg.qr_mime) { try { const rq = await fetch('/api/web/publico/qr'); if (rq.ok) c.querySelector('[data-qr]').src = URL.createObjectURL(await rq.blob()); } catch (_e) { /* */ } }
    c.querySelector('[data-subir-qr]').addEventListener('click', async () => {
      const a = c.querySelector('[data-qr-archivo]').files[0];
      if (!a) { toast('Elegí la imagen del QR', 'error'); return; }
      const fd = new FormData(); fd.append('qr', a);
      try { await DOVA.postForm('/web/config/qr', fd); toast('QR guardado', 'ok'); configuracion(c); } catch (e) { toast(e.message, 'error'); }
    });
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = f.querySelector('[data-error]'); err.style.display = 'none';
      const horarios = {};
      for (const [d] of DIAS) {
        horarios[d] = [];
        if (!f.querySelector(`[data-abre="${d}"]`).checked) continue;
        const v = (i, j) => f.querySelector(`[data-d="${d}"][data-i="${i}"][data-j="${j}"]`).value;
        horarios[d].push([v(0, 0), v(0, 1)]);
        if (f.querySelector(`[data-tarde="${d}"]`).checked) horarios[d].push([v(1, 0), v(1, 1)]);
      }
      const trat = [...f.querySelectorAll('[data-trat]')]; const odo = [...f.querySelectorAll('[data-odo]')];
      const sel = (l, k) => (l.every((x) => x.checked) ? null : l.filter((x) => x.checked).map((x) => Number(x.dataset[k])));
      const textos = X.leerForm(f, ['titulo', 'eslogan', 'presentacion', 'direccion', 'telefono', 'whatsapp', 'email', 'instagram', 'facebook', 'mapaUrl', 'banco', 'titular', 'numeroCuenta', 'documentoTitular', 'aliasPago', 'instruccionesPago'].map((k) => ({ k })), true);
      const datos = {
        ...textos, horarios, reservasActivas: f.reservasActivas.checked, mostrarPrecios: f.mostrarPrecios.checked,
        cuentasActivas: f.cuentasActivas.checked, pagosActivos: f.pagosActivos.checked,
        intervaloMinutos: Number(f.intervaloMinutos.value), diasAdelante: Number(f.diasAdelante.value), anticipacionHoras: Number(f.anticipacionHoras.value),
        cancelacionHoras: Number(f.cancelacionHoras.value), maxTurnosPorPersona: Number(f.maxTurnosPorPersona.value),
        tratamientosWeb: sel(trat, 'trat'), odontologosWeb: sel(odo, 'odo'),
      };
      if (datos.odontologosWeb && !datos.odontologosWeb.length && datos.reservasActivas) { err.textContent = 'Elegí al menos un profesional para las reservas online.'; err.style.display = 'block'; return; }
      const btn = f.querySelector('button.dova-btn-primary'); btn.disabled = true;
      try { await DOVA.put('/web/config', datos); toast('Página web actualizada', 'ok'); } catch (e) { err.textContent = e.message; err.style.display = 'block'; } finally { btn.disabled = false; }
    });
  }

  return { seccion };
})();
window.DovaWeb = DovaWeb;
