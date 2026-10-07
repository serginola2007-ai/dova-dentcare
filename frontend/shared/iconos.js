/* DOVA — íconos lineales (trazo simple, toman el color del texto).
   Reemplazan a los emojis: se ven iguales en todos los equipos y con un
   aspecto sobrio. Uso: DovaIcono('calendario') o DovaIcono('buscar', 20). */
(function () {
  const P = {
    calendario: '<rect x="3.5" y="5" width="17" height="15.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    buscar: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20.5 20.5"/>',
    persona: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
    pacientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-5.8 6.5-5.8s6.5 2.2 6.5 5.8"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.6c2.2.6 3.5 2.6 3.5 5.4"/>',
    efectivo: '<rect x="2.5" y="6" width="19" height="12"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v5M18 9.5v5"/>',
    tarjeta: '<rect x="2.5" y="5.5" width="19" height="13"/><path d="M2.5 10h19M6 15h4"/>',
    telefono: '<path d="M5 3.5h3.5l2 5-2.6 1.6a11 11 0 0 0 5 5l1.6-2.6 5 2v3.5a1.5 1.5 0 0 1-1.6 1.5A17 17 0 0 1 3.5 5.1 1.5 1.5 0 0 1 5 3.5z"/>',
    caja: '<path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/>',
    grafico: '<path d="M3.5 20.5h17M7 17v-5M12 17V7M17 17V10"/>',
    escudo: '<path d="M12 3 19.5 6v5.5c0 4.6-3.2 7.8-7.5 9-4.3-1.2-7.5-4.4-7.5-9V6z"/>',
    carpeta: '<path d="M3 6.5h6.5l2 2.2H21V19H3z"/>',
    diente: '<path d="M7.2 3.5C4.8 3.5 3.5 5.4 3.5 7.6c0 2.8 1.4 4.2 1.9 6.6.6 3 1 6.3 2.8 6.3 1.9 0 1.9-4.2 3.8-4.2s1.9 4.2 3.8 4.2c1.8 0 2.2-3.3 2.8-6.3.5-2.4 1.9-3.8 1.9-6.6 0-2.2-1.3-4.1-3.7-4.1-2 0-2.9 1-4.8 1s-2.8-1-4.8-1z"/>',
    medicamento: '<path d="M10.6 3.9a4.9 4.9 0 0 1 6.9 6.9l-6.7 6.7a4.9 4.9 0 0 1-6.9-6.9z"/><path d="M7.2 7.3l6.9 6.9"/>',
    comprobante: '<path d="M6 3h12v18l-3-1.8L12 21l-3-1.8L6 21z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
    documento: '<path d="M6 3h8.5L18.5 7v14H6z"/><path d="M14 3v4.5h4.5M9 12h6M9 15.5h6"/>',
    herramienta: '<path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3z"/><path d="M14.5 6.5 17 4"/>',
    llave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
    lista: '<rect x="5" y="4.5" width="14" height="16.5"/><path d="M9 3h6v3H9zM8.5 11h7M8.5 14.5h7M8.5 18h4"/>',
    camara: '<path d="M3.5 7.5h4l2-3h5l2 3h4V19h-17z"/><circle cx="12" cy="13" r="3.5"/>',
    estudio: '<rect x="4" y="3.5" width="16" height="17"/><path d="M8 8h8M8 11.5h8M8 15h8M12 8v7"/>',
    firma: '<path d="M4 20.5l4.2-1.1L19 8.6 15.4 5 4.6 15.8z"/><path d="M13.6 6.8l3.6 3.6M4 20.5h16"/>',
    curacion: '<rect x="3.5" y="3.5" width="17" height="17"/><path d="M12 8v8M8 12h8"/>',
    historial: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    evolucion: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
    flecha: '<path d="M5 12h14M14 7l5 5-5 5"/>',
    alerta: '<path d="M12 3.5 21 19.5H3z"/><path d="M12 10v4.5M12 17v.5"/>',
    ticket: '<path d="M3 7h18v3.2a1.8 1.8 0 0 0 0 3.6V17H3v-3.2a1.8 1.8 0 0 0 0-3.6z"/><path d="M14 7v10"/>',
    luna: '<path d="M19.5 14.6A8 8 0 1 1 9.4 4.5a6.4 6.4 0 0 0 10.1 10.1z"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    imprimir: '<path d="M7 9V3.5h10V9M5 9h14v7.5H5zM8 14h8v6.5H8z"/>',
  };
  window.DovaIcono = function (nombre, tam) {
    const d = P[nombre];
    if (!d) return '';
    const t = tam || 16;
    return `<svg class="dova-ico" width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">${d}</svg>`;
  };
}());
