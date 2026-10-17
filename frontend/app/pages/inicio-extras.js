/* DOVA — lo que se suma a pantallas existentes:
   - Inicio: puesta en marcha y filas de seguimiento en "Para atender" (extenderDashboard).
   - Configuración: Mi WhatsApp, datos de la clínica, mensajes automáticos, guías, Mi plan, resumen (extenderConfiguracion).
   - Modo consulta: accesos de seguimiento (extenderConsulta). */
const DovaInicioExtras = (() => {
  const X = DovaExt;
  const { esc, puede } = X;

  // ======================= EXTENSIONES DE VISTAS EXISTENTES =======================
  // Panel: resumen de seguimiento para quien lo puede ver.
  async function extenderDashboard(elMain, nav) {
    await puestaEnMarcha(elMain, nav);
    // El odontólogo ve su propio día; los números de toda la clínica son para recepción y administración.
    if ((DOVA.usuarioActual() || {}).odontologoId) return;
    if (!puede('seguimiento.view', 'recalls.view')) return;
    const lista = elMain.querySelector('[data-para-atender] .dova-atender-lista');
    if (!lista) return;
    let p; try { p = await DOVA.get('/seguimiento/panel'); } catch (_e) { return; }
    const fila = (n, label, sub, nivel) => (n ? `<li><button type="button" class="dova-atender-fila" data-ir-ruta="seguimiento" data-ir-sub-ruta="${sub}"${nivel ? ` data-nivel="${nivel}"` : ''}><span class="dova-atender-txt">${esc(label)}</span><span class="dova-atender-n">${Number(n).toLocaleString('es-PY')}</span></button></li>` : '');
    lista.insertAdjacentHTML('afterbegin', [
      fila(p.turnosSinConfirmar, 'Turnos sin confirmar', 'recordatorios', 'urgente'),
      fila(p.recallsVencidos, 'Controles periódicos atrasados', 'recalls', 'aviso'),
      fila(p.controlesVencidos + p.controlesSemana, 'Controles después de un tratamiento', 'controles', 'aviso'),
      fila(p.tratamientosSinTurno, 'Tratamientos sin turno', 'sinturno', 'aviso'),
      fila(p.cumpleanosHoy, 'Cumpleaños hoy', 'cumpleanos'),
    ].join(''));
  }

  // Mi WhatsApp: cada odontólogo registra su celular para los recordatorios de sus pacientes.
  async function tarjetaMiWhatsapp(elMain) {
    const yo = DOVA.usuarioActual() || {};
    if (!yo.odontologoId || !puede('recordatorios.propios', 'agenda.config')) return;
    let m; try { m = await DOVA.get('/recordatorios/mi-whatsapp'); } catch (_e) { return; }
    const cont = document.createElement('section');
    cont.className = 'dova-mi-whatsapp';
    const pintar = () => {
      const estado = m.whatsapp_envia ? 'Los recordatorios automáticos de tus pacientes salen de tu número.'
        : (m.whatsapp_numero ? 'Con este número podés mandar los recordatorios desde tu celular ("Mandar por mi WhatsApp"). Para que los automáticos salgan de tu número, pedile a la administración que lo conecte a WhatsApp Business.' : 'Todavía no registraste tu número: los recordatorios salen del número de la clínica.');
      cont.innerHTML = `<h2 class="dova-view-title" style="margin-top:32px">Mi WhatsApp para recordatorios</h2>
        <p class="dova-nota">${esc(estado)}</p>
        <form class="dova-ext-filtros" data-mi-wa><div><label for="mi-wa-numero">Mi celular</label><input id="mi-wa-numero" type="tel" name="numero" maxlength="30" placeholder="0981 123 456" value="${esc(m.whatsapp_numero || '')}"/></div><button class="dova-btn-primario">Guardar</button></form>`;
      cont.querySelector('[data-mi-wa]').addEventListener('submit', async (e) => {
        e.preventDefault();
        try { m = { ...m, ...(await DOVA.put('/recordatorios/mi-whatsapp', { numero: e.target.numero.value.trim() || null })) }; X.toast('Número guardado', 'ok'); pintar(); } catch (ex) { X.toast(ex.message, 'error'); }
      });
    };
    pintar();
    elMain.appendChild(cont);
  }

  // Datos de la clínica (nombre, contacto, horario): los usan los comprobantes, los mensajes y la página web.
  async function tarjetaDatosClinica(elMain) {
    if (!puede('clinica.config.manage')) return;
    let c; try { c = await DOVA.get('/clinica'); } catch (_e) { return; }
    const campos = [['nombre', 'Nombre de la clínica', 'text', 150, true], ['direccion', 'Dirección', 'text', 300], ['telefono', 'Teléfono', 'tel', 40], ['whatsapp', 'WhatsApp', 'tel', 40],
      ['email', 'Email', 'email', 150], ['horario_atencion', 'Horario de atención', 'text', 300], ['ruc', 'RUC', 'text', 40], ['sitio_web', 'Sitio web', 'text', 300], ['instagram', 'Instagram', 'text', 150], ['facebook', 'Facebook', 'text', 150]];
    const cont = document.createElement('section');
    cont.id = 'cfg-clinica'; cont.className = 'dova-cfg-clinica';
    cont.innerHTML = `<h2 class="dova-view-title" style="margin-top:32px">Datos de la clínica</h2>
      <p class="dova-nota">Se usan en los comprobantes, en los mensajes a los pacientes y en la página web.</p>
      <form data-cfg-clinica class="dova-cfg-clinica-form">
        ${campos.map(([k, t, tipo, max, req]) => `<div><label for="cc-${k}">${t}</label><input id="cc-${k}" name="${k}" type="${tipo}" maxlength="${max}" ${req ? 'required' : ''} value="${esc(c[k] || '')}"/></div>`).join('')}
        <label class="dova-check dova-cfg-clinica-web"><input type="checkbox" name="actualizarWeb" checked/> Usar también estos datos de contacto en la página web</label>
        <div class="dova-cfg-clinica-acc"><button class="dova-btn-primary">Guardar datos de la clínica</button></div>
      </form>
      <p class="dova-nota"><button type="button" class="dova-btn-link" data-mostrar-puesta>Mostrar en Inicio la lista de puesta en marcha</button></p>`;
    cont.querySelector('[data-mostrar-puesta]').addEventListener('click', async () => {
      try { await DOVA.put('/clinica/puesta-en-marcha', { oculta: false }); X.toast('Listo: aparece en Inicio mientras falte algo por configurar', 'ok'); } catch (ex) { X.toast(ex.message, 'error'); }
    });
    cont.querySelector('[data-cfg-clinica]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target; const d = {};
      campos.forEach(([k]) => { d[k] = f[k].value.trim() || null; });
      d.actualizarWeb = f.actualizarWeb.checked;
      const b = f.querySelector('button'); b.disabled = true;
      try { await DOVA.put('/clinica', d); X.toast('Datos de la clínica guardados', 'ok'); } catch (ex) { X.toast(ex.message, 'error'); } finally { b.disabled = false; }
    });
    elMain.appendChild(cont);
  }

  // Inicio: lo que falta configurar para empezar a usar DOVA (solo quien configura la clínica).
  async function puestaEnMarcha(elMain, nav) {
    if (!puede('clinica.config.manage')) return;
    let e; try { e = await DOVA.get('/clinica/puesta-en-marcha'); } catch (_e) { return; }
    if (e.completa || e.oculta) return;
    const cont = document.createElement('section');
    cont.className = 'dova-puesta';
    cont.innerHTML = `<div class="dova-puesta-cab"><h3 class="dova-section-title">Puesta en marcha: ${e.listos} de ${e.total} listos</h3>
        <span><button type="button" class="dova-btn-link" data-ver-puesta aria-expanded="false">Ver todo</button> · <button type="button" class="dova-btn-link" data-ocultar-puesta>Ocultar</button></span></div>
      <div class="dova-puesta-barra" role="progressbar" aria-valuemin="0" aria-valuemax="${e.total}" aria-valuenow="${e.listos}"><span style="width:${Math.round((e.listos / e.total) * 100)}%"></span></div>
      <ul class="dova-puesta-lista">${e.items.map((i) => `<li class="${i.ok ? 'ok' : ''}"${i.ok ? ' hidden' : ''}>
        <span class="dova-puesta-estado">${i.ok ? 'Listo' : (i.opcional ? 'Opcional' : 'Falta')}</span>
        <span class="dova-puesta-texto"><strong>${esc(i.titulo)}</strong> <span class="dova-nota">${esc(i.detalle)}</span></span>
        ${i.ok ? '' : `<button type="button" class="dova-btn-secundario" data-puesta-ir="${esc(i.id)}">Ir</button>`}</li>`).join('')}</ul>`;
    cont.querySelector('[data-ver-puesta]').addEventListener('click', (ev) => {
      const ver = ev.currentTarget.getAttribute('aria-expanded') !== 'true';
      cont.querySelectorAll('.dova-puesta-lista li.ok').forEach((li) => { li.hidden = !ver; });
      ev.currentTarget.setAttribute('aria-expanded', String(ver));
      ev.currentTarget.textContent = ver ? 'Ver solo lo que falta' : 'Ver todo';
    });
    cont.querySelectorAll('[data-puesta-ir]').forEach((b) => b.addEventListener('click', async () => {
      const i = e.items.find((x) => x.id === b.dataset.puestaIr);
      if (i.sub) window.DovaSubPendiente = i.sub;
      try { await nav(i.ruta); } finally { window.DovaSubPendiente = null; }
      if (i.ancla) {
        if (window.DovaVentanas && DovaApp.escritorio && DovaApp.escritorio()) DovaVentanas.desplazarA(i.ruta, i.ancla);
        else setTimeout(() => { const a = document.getElementById(i.ancla); if (a) a.scrollIntoView({ behavior: 'smooth' }); }, 900);
      }
    }));
    cont.querySelector('[data-ocultar-puesta]').addEventListener('click', async () => {
      try { await DOVA.put('/clinica/puesta-en-marcha', { oculta: true }); cont.remove(); X.toast('Listo. La podés volver a ver en Configuración → Datos de la clínica.', 'ok'); } catch (ex) { X.toast(ex.message, 'error'); }
    });
    const ancla = elMain.querySelector('.dova-inicio-sub') || elMain.querySelector('.dova-view-title');
    if (ancla) ancla.after(cont); else elMain.prepend(cont);
  }

  // Configuración: Mi WhatsApp, datos de la clínica, tipos de recall y qué tratamiento dispara cada uno.
  // Mensajes automáticos: turno liberado, controles periódicos, encuesta e indicaciones después del tratamiento.
  async function tarjetaMensajes(elMain) {
    if (!puede('clinica.config.manage')) return;
    let m; try { m = await DOVA.get('/mensajes/config'); } catch (_e) { return; }
    const cont = document.createElement('section');
    cont.id = 'cfg-mensajes'; cont.className = 'dova-cfg-mensajes';
    const op = (k, t, d, ej) => `<div class="dova-msg-op"><label class="dova-check"><input type="checkbox" name="${k}" ${m[k] ? 'checked' : ''} ${m.whatsappConectado ? '' : 'disabled'}/> <strong>${t}</strong></label>
      <p class="dova-nota">${d}</p><details><summary>Ver el mensaje</summary><p class="dova-rec-ejemplo">${esc(ej)}</p></details></div>`;
    cont.innerHTML = `<h2 class="dova-view-title" style="margin-top:32px">Mensajes automáticos</h2>
      <p class="dova-nota">${m.whatsappConectado ? 'Salen solos por WhatsApp Business.' : 'Para que salgan solos hace falta conectar WhatsApp Business (docs/WHATSAPP.md). Mientras tanto, los turnos liberados y los controles se mandan a mano con un toque.'} Nunca a quien no acepta WhatsApp ni de noche.</p>
      <form data-cfg-mensajes>
        ${op('listaEspera', 'Ofrecer los turnos liberados a la lista de espera', 'Cuando alguien cancela, el horario se ofrece a los primeros de la lista de espera. El primero que lo toma desde su enlace queda agendado y confirmado.', m.ejemplos.oferta)}
        ${op('controles', 'Avisar los controles periódicos', 'Una semana antes del control (y un recordatorio 3 semanas después si no reservó), con un enlace para elegir día y hora sin cargar datos.', m.ejemplos.control)}
        ${op('encuesta', 'Encuesta después de la atención', 'Al día siguiente: "del 0 al 10, ¿nos recomendarías?". Con 9 o 10 se le pide una reseña en Google; con 6 o menos te avisa para llamarlo. Una vez cada 60 días como máximo.', m.ejemplos.encuesta)}
        ${op('indicaciones', 'Indicaciones después del tratamiento', `Al marcar el turno como atendido, el paciente recibe los cuidados para después (con un enlace para leerlos completos). Se cargan en Tratamientos → editar → "Indicaciones para después"${m.tratamientosConIndicaciones ? ` (hoy ${m.tratamientosConIndicaciones} tratamiento(s) las tienen).` : '. Todavía ningún tratamiento las tiene.'}`, m.ejemplos.indicaciones)}
        <div class="dova-ext-filtros"><div><label for="msg-hora">Hora de envío (controles y encuestas)</label><select id="msg-hora" name="hora">${Array.from({ length: 13 }, (_, i) => i + 8).map((h) => `<option value="${h}" ${m.hora === h ? 'selected' : ''}>${h}:00</option>`).join('')}</select></div>
          <div style="flex:1;min-width:240px"><label for="msg-resena">Enlace para dejar una reseña en Google</label><input id="msg-resena" name="resenaUrl" type="url" maxlength="500" placeholder="https://g.page/r/…/review" value="${esc(m.resenaUrl || '')}"/></div></div>
        <p class="dova-nota">El enlace de reseña está en tu Perfil de Empresa de Google → "Pedir reseñas".</p>
        <button class="dova-btn-primary">Guardar</button>
      </form>`;
    cont.querySelector('[data-cfg-mensajes]').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      try {
        m = await DOVA.put('/mensajes/config', { listaEspera: f.listaEspera.checked, controles: f.controles.checked, encuesta: f.encuesta.checked, indicaciones: f.indicaciones.checked, hora: Number(f.hora.value), resenaUrl: f.resenaUrl.value.trim() || null });
        X.toast('Mensajes automáticos guardados', 'ok');
      } catch (ex) { X.toast(ex.message, 'error'); }
    });
    elMain.appendChild(cont);
  }

  // Guías rápidas (PDF de una página por rol); la del propio rol, primero.
  function tarjetaGuias(elMain) {
    const rol = (DOVA.usuarioActual() || {}).rol || '';
    const guias = [['recepcion', 'Recepción', 'Agenda, pacientes, cobros, caja y mensajes'], ['odontologo', 'Odontólogo', 'Consulta, ficha, presupuesto desde el odontograma y radiografías'], ['administracion', 'Administración', 'Puesta en marcha, usuarios, precios, mensajes y control']];
    const mia = rol === 'admin' ? 'administracion' : rol === 'odontologo' ? 'odontologo' : 'recepcion';
    guias.sort((a, b) => (a[0] === mia ? -1 : b[0] === mia ? 1 : 0));
    const cont = document.createElement('section');
    cont.className = 'dova-guias'; cont.id = 'cfg-guias';
    cont.innerHTML = `<h2 class="dova-view-title" style="margin-top:32px">Guías rápidas</h2>
      <p class="dova-nota">Una página por puesto, para imprimir o tener en el celular.</p>
      <ul class="dova-guias-lista">${guias.map(([k, t, d]) => `<li><a class="dova-btn-link" href="/docs/guias/guia-${k}.pdf" target="_blank" rel="noopener" download>Guía de ${esc(t)} (PDF)</a> <span class="dova-nota">${esc(d)}${k === mia ? ' · la tuya' : ''}</span></li>`).join('')}</ul>`;
    elMain.appendChild(cont);
  }

  async function extenderConfiguracion(elMain) {
    tarjetaGuias(elMain);
    await tarjetaMiWhatsapp(elMain);
    await tarjetaDatosClinica(elMain);
    await tarjetaMensajes(elMain);
    if (window.DovaAvisos) await DovaAvisos.tarjetaResumen(elMain);
    if (window.DovaPlataforma) await DovaPlataforma.tarjetaMiPlan(elMain);
    if (!puede('recalls.manage', 'clinica.config.manage', 'tratamientos.manage')) return;
    const cont = document.createElement('div');
    cont.innerHTML = '<h2 class="dova-view-title" style="margin-top:32px">Controles periódicos</h2><div data-tipos></div><div data-trat></div>';
    elMain.appendChild(cont);
    if (puede('recalls.manage', 'clinica.config.manage')) {
      await X.tablaCrud({
        root: cont.querySelector('[data-tipos]'), titulo: 'Tipos de control', endpoint: '/recalls/tipos', query: 'incluirInactivos=true', puedeCrear: true, puedeEditar: true,
        descripcion: 'Cada tipo define cada cuánto tiene que volver el paciente. El intervalo se puede cambiar por paciente.',
        columnas: [{ t: 'Nombre', v: (r) => `<strong>${esc(r.nombre)}</strong>` }, { t: 'Cada', v: (r) => `${r.intervalo_meses} meses` }, { t: 'Descripción', v: (r) => esc(r.descripcion || '-') }, { t: 'Activo', v: (r) => (r.activo ? 'Sí' : 'No') }],
        campos: [{ k: 'codigo', label: 'Código interno', req: true, soloCrear: true, ayuda: 'Sin espacios, ej. control_blanqueamiento' }, { k: 'nombre', label: 'Nombre', req: true }, { k: 'intervaloMeses', label: 'Intervalo (meses)', tipo: 'numero', req: true, min: 1, max: 60 }, { k: 'descripcion', label: 'Descripción', tipo: 'textarea' }, { k: 'activo', label: 'Activo', tipo: 'bool', soloEditar: true }],
      });
    }
    if (puede('tratamientos.manage')) {
      const [trats, tipos] = await Promise.all([DOVA.get('/tratamientos'), DOVA.get('/recalls/tipos')]);
      const t = cont.querySelector('[data-trat]');
      t.innerHTML = `<h3 class="dova-section-title">¿Qué tratamiento programa cada control?</h3><p class="dova-nota">Cuando un turno con este tratamiento se marca como atendido (o se finaliza el plan), DOVA agenda solo el próximo control.</p>
        <table class="dova-tabla"><thead><tr><th>Tratamiento</th><th>Control que programa</th></tr></thead><tbody>
        ${trats.map((x) => `<tr><td>${esc(x.nombre)}</td><td><select data-trat-recall="${x.id}" style="margin:0"><option value="">— ninguno —</option>${tipos.filter((y) => y.activo).map((y) => `<option value="${y.id}" ${x.recall_tipo_id === y.id ? 'selected' : ''}>${esc(y.nombre)} (${y.intervalo_meses} m)</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>`;
      t.querySelectorAll('[data-trat-recall]').forEach((s) => s.addEventListener('change', async () => {
        try { await DOVA.put(`/tratamientos/${s.dataset.tratRecall}`, { recallTipoId: s.value ? Number(s.value) : null }); X.toast('Guardado', 'ok'); } catch (e) { X.toast(e.message, 'error'); }
      }));
    }
  }

  // Modo consulta: alertas médicas arriba de todo.
  function extenderConsulta(elMain, pacienteId) {
    const cont = document.createElement('div');
    const h = elMain.querySelector('.dova-consulta-header') || elMain.firstElementChild;
    if (h) h.insertAdjacentElement('afterend', cont); else elMain.prepend(cont);
    X.bannerAlertas(Number(pacienteId), cont);
  }

  return { extenderDashboard, extenderConfiguracion, extenderConsulta };
})();
window.DovaInicioExtras = DovaInicioExtras;
