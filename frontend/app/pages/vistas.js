/* DOVA — Vistas: nombre de compatibilidad que junta las pantallas base y los ayudantes.
   Código nuevo: usar directamente DovaAyudantes, DovaIngreso, DovaInicio, DovaPacientes, etc.
   Este archivo además registra esas pantallas en DovaPantallas (ver core/pantallas.js). */
const Vistas = Object.assign({},
  DovaAyudantes, DovaIngreso, DovaConfiguracion, DovaInicio, DovaPacientes, DovaFichaPaciente,
  DovaPanelesConsulta, DovaAyudaTecnica, DovaUsuarios, DovaBuscadorGlobal,
  { renderContextoClinicoTurno: (ctx) => DovaTurnos.contextoClinicoHtml(ctx) });
window.Vistas = Vistas;

// ---- Pantallas que dibuja este archivo (ver core/pantallas.js) ----
DovaPantallas.registrar('pacientes', {
  dibujar: async (contenedor, { navegar }) => {
    contenedor.innerHTML = await Vistas.vistaPacientes();
    Vistas.initPacientes((idPaciente) => navegar('paciente', idPaciente));
  },
});
// Ficha del paciente: la base de este archivo + las pestañas que suman ficha.js, operativo.js y clinica.js.
// Las pestañas extra se agregan ANTES de iniciar la ficha, así el manejador de pestañas también las controla.
DovaPantallas.registrar('paciente', {
  permiso: 'pacientes.view',
  dibujar: async (contenedor, { navegar, params: idPaciente }) => {
    contenedor.innerHTML = await Vistas.vistaFichaPaciente(idPaciente);
    const conAviso = (agregar) => { try { agregar(); } catch (error) { console.error('[DOVA] pestaña extra de la ficha', error); } };
    conAviso(() => DovaFicha.extender(idPaciente));
    conAviso(() => DovaFichaOperativa.extenderFicha(idPaciente, navegar));
    conAviso(() => DovaClinica.extenderFicha(idPaciente));
    Vistas.initFichaPaciente(idPaciente, () => navegar('pacientes'), (id) => navegar('consulta', id));
  },
});
DovaPantallas.registrar('helpdesk', {
  dibujar: async (contenedor) => { contenedor.innerHTML = await Vistas.vistaHelpdesk(); Vistas.initHelpdesk(); },
});
DovaPantallas.registrar('usuarios', {
  dibujar: async (contenedor, { navegar }) => { contenedor.innerHTML = await Vistas.vistaUsuariosAdmin(); Vistas.initUsuariosAdmin(() => navegar('usuarios')); },
});
DovaPantallas.registrar('configuracion', {
  dibujar: async (contenedor) => {
    contenedor.innerHTML = await Vistas.vistaConfiguracion();
    Vistas.initConfiguracion();
    try { DovaInicioExtras.extenderConfiguracion(contenedor); } catch (error) { console.error('[DOVA] configuración', error); }
  },
});

