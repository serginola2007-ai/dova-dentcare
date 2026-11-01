/* DOVA — odontograma dibujado (objeto global DovaOdontograma).

   Cada pieza es un dibujo en línea de su forma real, vista de frente (corona y raíces), con el
   esquema de 5 caras debajo de la corona. Sin colores: los estados se marcan con trazos.

   Qué hace:
     - Dos vistas con animación: "como en la boca" (arcadas) y "en fila".
     - Dentición permanente (11-48), temporal (51-85) o mixta; automática por edad o elegida.
     - Tocar una pieza abre su editor: estado de toda la pieza, endodoncia y las 5 caras.
     - Historial: ver el odontograma de una fecha anterior y qué cambió desde entonces.
     - Imprimir (o guardar como PDF) con el dibujo y la lista de hallazgos.

   Uso (ficha del paciente):
     contenedor.innerHTML = DovaOdontograma.html(datos, { pacienteId, puedeEditar, paciente });
     DovaOdontograma.activar(contenedor);
   datos = respuesta de GET /odontograma/paciente/:id/datos (o la lista de filas, como antes).
   Cada pieza es un <button class="dova-pieza pieza-<estado>" data-ver-pieza="16">, así el
   expediente y el presupuesto desde el odontograma siguen funcionando igual. */
const DovaOdontograma = (() => {
  const { esc, toast, fmtFecha } = DovaAyudantes;

  // ---------- Piezas (numeración FDI) ----------
  const ARRIBA = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'];
  const ABAJO = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'];
  const TEMP_ARRIBA = ['55', '54', '53', '52', '51', '61', '62', '63', '64', '65'];
  const TEMP_ABAJO = ['85', '84', '83', '82', '81', '71', '72', '73', '74', '75'];
  const TODAS = [...ARRIBA, ...ABAJO, ...TEMP_ARRIBA, ...TEMP_ABAJO];
  // Filas de cada dentición, de arriba hacia abajo (en la mixta, las temporales van por dentro).
  const FILAS_DE = {
    permanente: [ARRIBA, ABAJO],
    temporal: [TEMP_ARRIBA, TEMP_ABAJO],
    mixta: [ARRIBA, TEMP_ARRIBA, TEMP_ABAJO, ABAJO],
  };
  const NOMBRE_DENTICION = { permanente: 'Permanente', temporal: 'Temporal (de leche)', mixta: 'Mixta' };

  const NOMBRE_ESTADO = {
    sano: 'Sano', caries: 'Caries', restauracion: 'Restauración', corona: 'Corona', endodoncia: 'Endodoncia',
    extraccion_indicada: 'Extracción indicada', ausente: 'Ausente', implante: 'Implante', protesis: 'Prótesis',
    fractura: 'Fractura', sellante: 'Sellante', tratamiento_realizado: 'Tratamiento realizado', otro: 'Otro',
  };
  const NOMBRE_CARA = {
    general: 'Toda la pieza', raiz: 'Raíz', vestibular: 'Vestibular', lingual_palatina: 'Lingual / palatina',
    mesial: 'Mesial', distal: 'Distal', oclusal_incisal: 'Oclusal / incisal',
  };
  const CARAS = ['vestibular', 'mesial', 'oclusal_incisal', 'distal', 'lingual_palatina'];
  // Lo que se marca en toda la pieza y lo que se marca en una cara (el servidor valida lo mismo).
  const ESTADOS_PIEZA = ['sano', 'corona', 'protesis', 'implante', 'ausente', 'extraccion_indicada', 'tratamiento_realizado', 'otro'];
  const ESTADOS_CARA = ['sano', 'caries', 'restauracion', 'sellante', 'fractura'];
  // Si una pieza tiene varios registros, la clase principal es la del hallazgo más importante.
  const PRIORIDAD = ['extraccion_indicada', 'caries', 'fractura', 'ausente', 'implante', 'endodoncia', 'corona',
    'protesis', 'restauracion', 'sellante', 'tratamiento_realizado', 'otro', 'sano'];

  /* ---------- Formas de cada pieza ----------
     Dibujadas como pieza de arriba del lado derecho del paciente: raíces hacia arriba, corona
     hacia abajo (borde incisal en y≈78), cuello en y≈44, lado mesial a la derecha. Debajo de la
     corona (y 83-97) va el esquema de las 5 caras. Las de abajo se dan vuelta; las del lado
     izquierdo se espejan. vb: [x, ancho] del recorte del dibujo (cada pieza ocupa lo que mide). */
  const FORMAS = {
    // ---- Superiores
    sup1: { // incisivo central
      vb: [6, 28], cx: 20,
      raices: ['M11.5 45C12 30 15 14 19 6Q20.5 3.5 22 6C25.5 14 28 30 28.5 45Z'],
      corona: 'M11 44C8 52 7 64 8 74Q8 78 12 78L30 78Q32 78 32 75C33 64 31 52 29 44Q20 39.5 11 44Z',
      detalles: ['M16 50Q15.5 62 16.5 75', 'M24 50Q24.5 62 23.5 75', 'M12 44Q20 41 28.5 44'],
      conductos: ['M20 46L20 9'],
    },
    sup2: { // incisivo lateral
      vb: [9, 22], cx: 20,
      raices: ['M13.5 45C13.5 32 15 18 18 9Q19.5 6 21 8.5C24.5 18 26.5 32 26.5 45Z'],
      corona: 'M13 44C10.5 52 10 63 11 72Q12 77.5 16 77.5L25 77.5Q29 77 29.5 72C30.5 62 29.5 52 27 44Q20 40 13 44Z',
      detalles: ['M20 50Q19.5 62 20 74'],
      conductos: ['M20 46Q19.8 28 19.6 11'],
    },
    sup3: { // canino
      vb: [7, 26], cx: 20.5,
      raices: ['M11.5 45C12 28 15 10 19 2.5Q20.5 0.5 22 2.5C26 10 28.5 28 28.5 45Z'],
      corona: 'M11 44C8.5 52 8.5 62 11 69L21.5 79L29.5 68C31.5 60 31 51 29 44Q20 38.5 11 44Z',
      detalles: ['M20.5 49Q21 64 21.5 77'],
      conductos: ['M20.5 46L20.5 5'],
    },
    sup4: { // primer premolar (dos raíces)
      vb: [6, 28], cx: 20,
      raices: ['M11 45C11 36 12 26 13 18C13.5 13 14.5 9 16 8Q17.5 8.5 17.8 12C18.3 16 19 19 20 21C21 19 21.7 16 22.2 12Q22.5 8.5 24 8C25.5 9 26.5 13 27 18C28 26 29 36 29 45Z'],
      corona: 'M10.5 44C8 51 7.5 60 10 67L20 77L30 66.5C32.5 59 32 51 29.5 44Q20 40 10.5 44Z',
      detalles: ['M20 49Q20 62 20 75'],
      conductos: ['M18 46Q16.5 28 16 11', 'M22 46Q23.5 28 24 11'],
    },
    sup5: { // segundo premolar
      vb: [7, 26], cx: 20,
      raices: ['M11.5 45C12 32 14 18 18 9Q20 6.5 22 9C26 18 28 32 28.5 45Z'],
      corona: 'M11 44C8.5 51 8 60 10.5 67Q15 76 20 76.5Q25 76 29.5 67C32 60 31.5 51 29 44Q20 40 11 44Z',
      detalles: ['M20 49Q20 62 20 74'],
      conductos: ['M20 46L20 11'],
    },
    sup6: { // primer molar (tres raíces: dos vestibulares y la palatina detrás)
      vb: [1, 38], cx: 20,
      raices: [
        'M15 45C15 32 17 18 20 6Q21 3.5 22 6C24 18 26 32 26 45Z',
        'M5.5 45C5 36 5.5 28 7 20C8 14 9.5 10 11 9.5Q13 10 13.5 14C14 20 15.5 26 18 31Q20 33 22 31C24.5 26 26 20 26.5 14Q27 10 29 9.5C30.5 10 32 14 33 20C34.5 28 35 36 34.5 45Z',
      ],
      corona: 'M5 44C2.5 51 2.5 60 4.5 67Q7 75 12 76Q17 76.5 20 71Q23 76.5 28 76Q33 75 35.5 67C37.5 60 37.5 51 35 44Q20 40.5 5 44Z',
      detalles: ['M20 71Q20.5 64 20 57', 'M9 70Q12 72.5 15 72', 'M25 72Q28 72.5 31 70'],
      conductos: ['M12 46Q10 28 10.8 12', 'M28 46Q30 28 29.2 12', 'M20.5 46L20.8 8'],
    },
    sup7: { // segundo molar
      vb: [3, 34], cx: 20,
      raices: [
        'M16 45C16 32 18 20 20.5 9Q21.5 7 22.5 9C24 20 25.5 32 25.5 45Z',
        'M7.5 45C7 36 8 28 10 21C11 16 12.5 13 14 13Q15.5 13.5 16 17C16.5 22 18 27 20 30Q21 31 22 30C24 27 25 22 25.5 17Q26 13.5 27.5 13C29 13 30.5 16 31 21C32.5 28 33 36 32.5 45Z',
      ],
      corona: 'M7 44C4.5 51 4.5 60 6.5 67Q9 74.5 13.5 75.5Q18 76 20.5 71Q23 76 27 75.5Q31.5 74.5 33.5 67C35.5 60 35.5 51 33 44Q20 40.5 7 44Z',
      detalles: ['M20.5 71Q21 64 20.5 58'],
      conductos: ['M13.5 46Q12.5 30 13.8 15', 'M27 46Q28 30 26.8 15'],
    },
    sup8: { // tercer molar (raíces fusionadas)
      vb: [5, 30], cx: 20,
      raices: ['M9.5 45C9.5 35 11 26 14 19C16 15 18 14 20 14.5C23 15 26 19 28 25C30 32 31 38 30.5 45Z'],
      corona: 'M9 44C7 51 7 59 9 65.5Q11.5 72.5 15.5 73Q18.5 73.5 20.5 69.5Q22.5 73.5 25.5 73Q29 72 31 65.5C33 59 33 51 31 44Q20 41 9 44Z',
      detalles: ['M20 44Q19 30 19.5 18', 'M20.5 69.5Q21 63 20.5 58'],
      conductos: ['M20 46Q19.5 30 19.8 18'],
    },
    // ---- Inferiores
    inf1: { // incisivo central (angosto)
      vb: [10, 20], cx: 20,
      raices: ['M14 45C14 32 16 18 19 9Q20 7 21 9C24 18 26 32 26 45Z'],
      corona: 'M13.5 44C12.5 52 12.5 64 13 77.5L27 77.5C27.5 64 27.5 52 26.5 44Q20 40.5 13.5 44Z',
      detalles: ['M20 50Q20 63 20 75'],
      conductos: ['M20 46L20 12'],
    },
    inf2: { // incisivo lateral
      vb: [9, 22], cx: 20,
      raices: ['M13 45C13 31 15.5 17 19 7.5Q20 5.5 21 7.5C24.5 17 27 31 27 45Z'],
      corona: 'M12.5 44C11.5 52 11.5 64 12.5 77.5L27 77.5Q28.5 76 28.5 73C28.5 63 28.5 52 27.5 44Q20 40.5 12.5 44Z',
      detalles: ['M20 50Q20 63 20 75'],
      conductos: ['M20 46L20 10'],
    },
    inf3: { // canino
      vb: [8, 24], cx: 20.5,
      raices: ['M12.5 45C13 28 16 12 19.5 4Q20.5 2.5 21.5 4C25 12 27.5 28 27.5 45Z'],
      corona: 'M12 44C10 52 10 61 12 69L21 78.5L28.5 68.5C30 60 30 52 28 44Q20 39.5 12 44Z',
      detalles: ['M20.5 49Q20.8 64 21 77'],
      conductos: ['M20.5 46L20.5 6'],
    },
    inf4: { // primer premolar (cúspide vestibular marcada)
      vb: [7, 26], cx: 20,
      raices: ['M12 45C12.5 31 15 17 19 8Q20 6 21 8C25 17 27.5 31 28 45Z'],
      corona: 'M11 44C8.5 51 8.5 60 11 67L20.5 77.5L29.5 67C31.5 60 31.5 51 29 44Q20 40 11 44Z',
      detalles: ['M20.5 49Q20.5 63 20.5 75'],
      conductos: ['M20 46L20 11'],
    },
    inf5: { // segundo premolar
      vb: [7, 26], cx: 20,
      raices: ['M12 45C12.5 31 15 17 19 8Q20 6 21 8C25 17 27.5 31 28 45Z'],
      corona: 'M11 44C8.5 51 8 60 10.5 67Q15 76 20 76.5Q25 76 29.5 67C32 60 31.5 51 29 44Q20 40 11 44Z',
      detalles: ['M20 49Q20 62 20 74'],
      conductos: ['M20 46L20 11'],
    },
    inf6: { // primer molar (tres cúspides vestibulares, dos raíces separadas)
      vb: [1, 38], cx: 20,
      raices: ['M5.5 45C5 35 5.5 25 7.5 15Q9 9.5 12 9.5Q14.5 10 15 15C15.5 23 17 29 20 32C23 29 24.5 23 25 15Q25.5 10 28 9.5Q31 9.5 32.5 15C34.5 25 35 35 34.5 45Z'],
      corona: 'M4.5 44C2.5 51 2.5 60 4.5 67Q6.5 75 11 75.5Q14.5 76 16 71.5Q18 76.5 22.5 76Q25.5 75.5 26.5 72Q29 76 32 74.5Q35 72 35.5 66C37 59 37 51 35 44Q20 40.5 4.5 44Z',
      detalles: ['M16 71.5Q16.5 65 16 59', 'M26.5 72Q27 67 26.5 63'],
      conductos: ['M10.5 46Q9.5 28 10.8 13', 'M29.5 46Q30.5 28 29.2 13'],
    },
    inf7: { // segundo molar
      vb: [3, 34], cx: 20,
      raices: ['M7 45C6.5 35 7.5 25 9.5 16Q11 11.5 13.5 11.5Q16 12 16.5 17C17 24 18 29 20 31.5C22 29 23 24 23.5 17Q24 12 26.5 11.5Q29 11.5 30.5 16C32.5 25 33.5 35 33 45Z'],
      corona: 'M7 44C4.5 51 4.5 60 6.5 67Q9 74.5 13.5 75.5Q18 76 20.5 71Q23 76 27 75.5Q31.5 74.5 33.5 67C35.5 60 35.5 51 33 44Q20 40.5 7 44Z',
      detalles: ['M20.5 71Q21 64 20.5 58'],
      conductos: ['M12.5 46Q11.5 30 12.8 15', 'M27.5 46Q28.5 30 27.2 15'],
    },
    inf8: { // tercer molar
      vb: [5, 30], cx: 20,
      raices: ['M9.5 45C9.5 35 11.5 27 14.5 21C16.5 17 18.5 16.5 20 17C22 17 25 19 27 24C29.5 31 30.5 38 30.5 45Z'],
      corona: 'M9 44C7 51 7 59 9 65.5Q11.5 72.5 15.5 73Q18.5 73.5 20.5 69.5Q22.5 73.5 25.5 73Q29 72 31 65.5C33 59 33 51 31 44Q20 41 9 44Z',
      detalles: ['M20 44Q19.5 32 20 21', 'M20.5 69.5Q21 63 20.5 58'],
      conductos: ['M20 46Q19.8 32 20 21'],
    },
  };

  const ALTO = 98; // alto del dibujo: pieza (0-80) + esquema de caras (83-97)
  const esTemporal = (p) => Number(p[0]) >= 5;
  const esArriba = (p) => ['1', '2', '5', '6'].includes(p[0]);
  const esIzquierdo = (p) => ['2', '3', '6', '7'].includes(p[0]); // lado izquierdo del paciente: se espeja
  // Temporales: incisivos y canino como los permanentes; el primer molar temporal como un segundo
  // molar y el segundo molar temporal como un primer molar (son los parecidos), más chicos.
  const tipo = (p) => (esTemporal(p) ? { 1: '1', 2: '2', 3: '3', 4: '7', 5: '6' }[p[1]] : p[1]);
  const formaDe = (p) => FORMAS[(esArriba(p) ? 'sup' : 'inf') + tipo(p)];
  const tamano = (p) => (esTemporal(p) ? 0.74 : 1);
  function viewBox(p) {
    const [x, w] = formaDe(p).vb;
    return esIzquierdo(p) ? [40 - x - w, w] : [x, w];
  }
  const TIPO_NOMBRE = { 1: 'incisivo central', 2: 'incisivo lateral', 3: 'canino', 4: 'primer premolar', 5: 'segundo premolar', 6: 'primer molar', 7: 'segundo molar', 8: 'tercer molar' };
  const TIPO_NOMBRE_TEMP = { 1: 'incisivo central', 2: 'incisivo lateral', 3: 'canino', 4: 'primer molar', 5: 'segundo molar' };
  const LADO = { 1: 'superior derecho', 2: 'superior izquierdo', 3: 'inferior izquierdo', 4: 'inferior derecho' };
  const nombrePieza = (p) => (esTemporal(p)
    ? `${TIPO_NOMBRE_TEMP[p[1]]} ${LADO[Number(p[0]) - 4]} (de leche)`
    : `${TIPO_NOMBRE[p[1]]} ${LADO[p[0]]}`);

  /* ---------- Datos: filas del servidor → estado de cada pieza ----------
     Cada fila es pieza + superficie + estado. 'general' = toda la pieza, 'raiz' = endodoncia,
     y las 5 caras. 'sano' no se dibuja. */
  const vacio = () => ({ general: null, raiz: null, caras: {}, notas: {} });
  function agrupar(filas) {
    const m = new Map();
    (filas || []).forEach((f) => {
      if (!m.has(f.pieza)) m.set(f.pieza, vacio());
      const d = m.get(f.pieza); const sup = f.superficie || 'general';
      if (f.observacion) d.notas[sup] = f.observacion;
      if (f.estado === 'sano') return;
      if (sup === 'general') d.general = f.estado; else if (sup === 'raiz') d.raiz = f.estado; else d.caras[sup] = f.estado;
    });
    return m;
  }
  const todosLosEstados = (d) => new Set(d ? [d.general, d.raiz, ...Object.values(d.caras)].filter(Boolean) : []);
  const estadosDeLaPieza = (d) => new Set(d ? [d.general, d.raiz].filter(Boolean) : []);
  function describir(d) {
    if (!d) return [];
    const r = [];
    if (d.general) r.push(NOMBRE_ESTADO[d.general] || d.general);
    if (d.raiz) r.push(NOMBRE_ESTADO[d.raiz]);
    CARAS.forEach((c) => { if (d.caras[c]) r.push(`${NOMBRE_ESTADO[d.caras[c]]} (${NOMBRE_CARA[c].toLowerCase()})`); });
    return r;
  }

  /* ---------- Marcas de toda la pieza (en el mismo marco que la forma) ---------- */
  function marcas(estados, f, idPatron) {
    const cx = f.cx; const [x0, w] = f.vb; const x1 = x0 + w;
    const m = [];
    if (estados.has('corona')) m.push(`<path class="odo-marca-relleno" d="${f.corona}" fill="url(#${idPatron}-rayado)"/>`);
    if (estados.has('protesis')) m.push(`<path class="odo-marca-relleno" d="${f.corona}" fill="url(#${idPatron}-cuadros)"/>`);
    if (estados.has('restauracion')) m.push(`<ellipse class="odo-marca-relleno" cx="${cx}" cy="63" rx="${Math.min(6, w / 4)}" ry="4.5" fill="url(#${idPatron}-rayado)"/>`);
    if (estados.has('sellante')) m.push(`<path class="odo-marca-relleno" d="M${cx - 5} 70.5h10v3.5h-10Z" fill="url(#${idPatron}-rayado)"/>`);
    if (estados.has('caries')) m.push(`<path class="odo-marca-llena" d="M${cx - 3.5} 60.5q2.2-3.4 5.4-1.4q2.6 1.8.6 5.2q-2.4 2.8-5.2.8q-2.4-1.8-.8-4.6Z"/>`);
    if (estados.has('endodoncia')) m.push(...f.conductos.map((d) => `<path class="odo-conducto" d="${d}"/>`));
    if (estados.has('implante')) {
      m.push(`<path class="odo-marca" d="M${cx - 4} 45L${cx - 3.5} 12Q${cx} 7 ${cx + 3.5} 12L${cx + 4} 45Z"/>`);
      for (let y = 16; y <= 41; y += 5) m.push(`<path class="odo-marca" d="M${cx - 4.2} ${y}L${cx + 4.2} ${y - 2}"/>`);
    }
    if (estados.has('fractura')) {
      const pasos = []; let x = x0 + 2; let arriba = true;
      while (x < x1 - 2) { pasos.push(`${x} ${arriba ? 56 : 61}`); x += 3.6; arriba = !arriba; }
      m.push(`<path class="odo-marca-fuerte" d="M${pasos.join('L')}"/>`);
    }
    if (estados.has('tratamiento_realizado')) m.push(`<path class="odo-marca-fuerte" d="M${cx - 4.5} 63l3.2 3.6l6.5-7.5"/>`);
    if (estados.has('otro')) m.push(`<path class="odo-marca-fuerte" d="M${cx} 58v8M${cx - 3.5} 60l7 4M${cx + 3.5} 60l-7 4"/>`);
    if (estados.has('extraccion_indicada')) m.push(`<path class="odo-marca-x" d="M${x0 + 2} 6L${x1 - 2} 77M${x1 - 2} 6L${x0 + 2} 77"/>`);
    return m.join('');
  }

  /* ---------- Esquema de las 5 caras ----------
     Cuadrado con un cuadrado adentro: arriba vestibular (del lado de la corona, hacia afuera de
     la boca en las piezas de arriba), abajo lingual/palatina, mesial a la derecha (hacia el
     centro), distal a la izquierda y oclusal/incisal en el medio. Como el dibujo se da vuelta y
     se espeja, en cada pieza quedan en su lugar. */
  function poligonosCaras(cx, y0, lado, adentro) {
    const o = { x0: cx - lado / 2, x1: cx + lado / 2, y0, y1: y0 + lado };
    const m = (lado - adentro) / 2;
    const i = { x0: o.x0 + m, x1: o.x1 - m, y0: o.y0 + m, y1: o.y1 - m };
    return {
      vestibular: `M${o.x0} ${o.y0}L${o.x1} ${o.y0}L${i.x1} ${i.y0}L${i.x0} ${i.y0}Z`,
      lingual_palatina: `M${o.x0} ${o.y1}L${o.x1} ${o.y1}L${i.x1} ${i.y1}L${i.x0} ${i.y1}Z`,
      mesial: `M${o.x1} ${o.y0}L${o.x1} ${o.y1}L${i.x1} ${i.y1}L${i.x1} ${i.y0}Z`,
      distal: `M${o.x0} ${o.y0}L${o.x0} ${o.y1}L${i.x0} ${i.y1}L${i.x0} ${i.y0}Z`,
      oclusal_incisal: `M${i.x0} ${i.y0}H${i.x1}V${i.y1}H${i.x0}Z`,
    };
  }
  // Relleno de una cara según su estado (sin colores: lleno, rayado, puntos o cuadros).
  function rellenoCara(estado, idPatron) {
    if (estado === 'caries') return 'class="odo-cara odo-cara-llena"';
    if (estado === 'restauracion') return `class="odo-cara" fill="url(#${idPatron}-rayado)"`;
    if (estado === 'sellante') return `class="odo-cara" fill="url(#${idPatron}-puntos)"`;
    if (estado === 'fractura') return `class="odo-cara" fill="url(#${idPatron}-cuadros)"`;
    return 'class="odo-cara odo-cara-vacia"';
  }
  function carasSvg(f, caras, idPatron) {
    const pol = poligonosCaras(f.cx, 83, 14, 6);
    return CARAS.map((c) => `<path ${rellenoCara(caras[c], idPatron)} d="${pol[c]}"/>`).join('');
  }

  // SVG de una pieza (sin el número). d: estado agrupado de la pieza (o undefined).
  function dibujo(pieza, d, idPatron) {
    const f = formaDe(pieza);
    const [vx, vw] = viewBox(pieza);
    const sx = esIzquierdo(pieza) ? -1 : 1; const sy = esArriba(pieza) ? 1 : -1;
    const transformacion = `matrix(${sx} 0 0 ${sy} ${sx < 0 ? 40 : 0} ${sy < 0 ? ALTO : 0})`;
    const estados = estadosDeLaPieza(d);
    const ausente = estados.has('ausente');
    return `<svg class="odo-dibujo" viewBox="${vx} 0 ${vw} ${ALTO}" aria-hidden="true" focusable="false">
      <g transform="${transformacion}" class="${ausente ? 'odo-ausente' : ''}">
        ${estados.has('implante') ? '' : f.raices.map((r) => `<path class="odo-raiz" d="${r}"/>`).join('')}
        <path class="odo-corona" d="${f.corona}"/>
        ${f.detalles.map((r) => `<path class="odo-detalle" d="${r}"/>`).join('')}
        ${marcas(estados, f, idPatron)}
        ${carasSvg(f, d ? d.caras : {}, idPatron)}
      </g></svg>`;
  }

  // Patrones de rayado, cuadriculado y puntos: una vez por odontograma.
  const patrones = (id) => `<svg class="odo-defs" aria-hidden="true" focusable="false" width="0" height="0"><defs>
    <pattern id="${id}-rayado" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V3" class="odo-patron"/></pattern>
    <pattern id="${id}-cuadros" width="3.4" height="3.4" patternUnits="userSpaceOnUse"><path d="M0 0H3.4M0 0V3.4" class="odo-patron"/></pattern>
    <pattern id="${id}-puntos" width="2.4" height="2.4" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r="0.5" class="odo-patron-punto"/></pattern>
  </defs></svg>`;

  // Leyenda: marcas de toda la pieza (sobre un premolar) y de las caras.
  function leyenda(idPatron) {
    const piezaCon = (estado) => { const d = vacio(); if (estado === 'endodoncia') d.raiz = estado; else d.general = estado; return d; };
    const lista = ['corona', 'protesis', 'endodoncia', 'implante', 'extraccion_indicada', 'ausente', 'tratamiento_realizado', 'otro'];
    const cara = (estado) => `<svg class="odo-leyenda-cara" viewBox="0 0 14 14" aria-hidden="true"><path ${rellenoCara(estado, idPatron)} d="M1 1H13V13H1Z"/></svg>`;
    return `<div class="odo-leyenda">
      <ul><li class="odo-leyenda-titulo">Toda la pieza:</li>${lista.map((e) => `<li>${dibujo('15', piezaCon(e), idPatron)}<span>${esc(NOMBRE_ESTADO[e])}</span></li>`).join('')}</ul>
      <ul><li class="odo-leyenda-titulo">Caras:</li>${['caries', 'restauracion', 'sellante', 'fractura'].map((e) => `<li>${cara(e)}<span>${esc(NOMBRE_ESTADO[e])}</span></li>`).join('')}</ul>
    </div>`;
  }

  // Botón de una pieza (dibujo + número).
  function claseEstado(d) { const t = todosLosEstados(d); return PRIORIDAD.find((e) => t.has(e)) || 'sano'; }
  function tituloPieza(p, d) { const r = describir(d); return `Pieza ${p}${r.length ? ' — ' + r.join(', ') : ''}`; }
  function botonPieza(p, d, id) {
    return `<button type="button" class="dova-pieza pieza-${claseEstado(d)} ${esArriba(p) ? 'odo-arriba' : 'odo-abajo'}${esTemporal(p) ? ' odo-temporal' : ''}" data-ver-pieza="${p}"
      title="${esc(tituloPieza(p, d))}">${dibujo(p, d, id)}<span class="odo-numero">${p}</span></button>`;
  }

  /* ---------- html(): arma el odontograma (se activa después con activar()) ---------- */
  const configuraciones = new Map(); // id → datos para activar()
  let contador = 0;
  function html(entrada, opciones = {}) {
    const id = `odo${++contador}`;
    const datos = Array.isArray(entrada) || !entrada ? { piezas: entrada || [] } : entrada;
    const filas = datos.piezas || [];
    const denticion = FILAS_DE[datos.denticion] ? datos.denticion : 'permanente';
    configuraciones.set(id, {
      filas, denticion, denticionElegida: datos.denticionElegida || null, denticionAutomatica: datos.denticionAutomatica || denticion,
      pacienteId: opciones.pacienteId || null, puedeEditar: !!(opciones.puedeEditar && opciones.pacienteId), paciente: opciones.paciente || '',
    });
    const agrupado = agrupar(filas);
    const btnDent = (d) => `<button type="button" class="odo-segmento" data-odo-denticion="${d}" aria-pressed="${d === denticion}">${d === 'temporal' ? 'Temporal' : NOMBRE_DENTICION[d]}</button>`;
    return `<div class="dova-odonto" data-odonto="${id}" data-denticion="${denticion}">
      <div class="odo-barra">
        <div class="odo-grupo" role="group" aria-label="Dentición">${['permanente', 'temporal', 'mixta'].map(btnDent).join('')}</div>
        <span class="odo-vista-texto" data-odo-texto>Vista: como en la boca</span>
        <div class="odo-acciones">
          ${opciones.pacienteId ? `<label class="odo-fecha">Fecha <select data-odo-fecha aria-label="Ver el odontograma de una fecha anterior"><option value="">Hoy</option></select></label>` : ''}
          <button type="button" class="dova-btn-secundario" data-odo-imprimir>Imprimir</button>
          <button type="button" class="dova-btn-secundario" data-odo-cambiar aria-pressed="false">Cambiar de vista</button>
        </div>
      </div>
      <div class="odo-pasado" data-odo-pasado hidden></div>
      ${patrones(id)}
      <div class="dova-odontograma-grid odo-lienzo">${TODAS.map((p) => botonPieza(p, agrupado.get(p), id)).join('')}</div>
      <div class="odo-editor" data-odo-editor hidden></div>
      ${leyenda(id)}
    </div>`;
  }

  /* ---------- Ubicación de las piezas en cada vista ----------
     Todo se calcula en píxeles a partir del ancho del lienzo. Cambiar de vista o de dentición
     solo cambia left/top/giro de cada pieza: la animación la hace el CSS (transition). */
  const SEP = 1.5; // separación entre piezas, en unidades del dibujo
  const anchoFila = (lista) => lista.reduce((t, p) => t + viewBox(p)[1] * tamano(p), 0) + SEP * (lista.length - 1) + 6;

  function posicionesFilas(ancho, denticion) {
    const filas = FILAS_DE[denticion] || FILAS_DE.permanente;
    // La escala sale de la fila permanente: así los dientes de leche se ven más chicos.
    const escala = (ancho * 0.97) / anchoFila(ARRIBA);
    const numero = 16; let y = 4; const pos = {};
    filas.forEach((lista, k) => {
      const arriba = esArriba(lista[0]);
      if (!arriba && k > 0 && esArriba(filas[k - 1][0])) y += 12; // entre arriba y abajo
      const h = ALTO * escala * tamano(lista[0]);
      if (arriba) y += numero;
      const cy = y + h / 2;
      let x = (ancho - anchoFila(lista) * escala) / 2;
      lista.forEach((p, i) => {
        if (i === lista.length / 2) x += 6 * escala; // línea media
        const w = viewBox(p)[1] * escala * tamano(p);
        pos[p] = { x: x + w / 2, y: cy, giro: 0, w, h };
        x += w + SEP * escala;
      });
      y += h + (arriba ? 6 : numero + 6);
    });
    return { pos, alto: y + 4 };
  }

  function posicionesBoca(ancho, denticion) {
    // Cada arcada es media elipse; las piezas se reparten según su ancho y miran al centro.
    const escala = Math.min(ancho / 560, 1.15);
    const a = Math.min(ancho * 0.30, 215); const b = a * 0.92; // forma de herradura
    const h = ALTO * escala; const ht = h * 0.74; const numero = 16;
    const barrido = Math.PI / 12; const t0 = Math.PI + barrido; const t1 = -barrido; // de 195° a -15°
    // Arcadas de cada maxilar (la primera es la de afuera). En la mixta, la temporal va por dentro.
    const adentro = (h + ht) / 2 + 14;
    const arcos = {
      permanente: { arriba: [[ARRIBA, a, b]], abajo: [[ABAJO, a, b]] },
      temporal: { arriba: [[TEMP_ARRIBA, a * 0.8, b * 0.8]], abajo: [[TEMP_ABAJO, a * 0.8, b * 0.8]] },
      mixta: { arriba: [[ARRIBA, a, b], [TEMP_ARRIBA, a - adentro, b - adentro]], abajo: [[ABAJO, a, b], [TEMP_ABAJO, a - adentro, b - adentro]] },
    }[denticion] || null;
    const bFuera = arcos.arriba[0][2];
    const hFuera = h * tamano(arcos.arriba[0][0][0]);
    const cyArriba = numero + hFuera / 2 + bFuera + 6;
    const cyAbajo = cyArriba + 2 * bFuera * Math.sin(barrido) + hFuera * 0.4 + 16;
    const pos = {};
    const arco = (lista, ae, be, cy, signo) => {
      // Largo de arco acumulado para repartir por ancho de cada pieza.
      const N = 400; const puntos = []; let largo = 0;
      for (let i = 0; i <= N; i++) {
        const t = t0 + (t1 - t0) * (i / N);
        const q = { t, x: ancho / 2 + ae * Math.cos(t), y: cy - signo * be * Math.sin(t) };
        if (i) largo += Math.hypot(q.x - puntos[i - 1].x, q.y - puntos[i - 1].y);
        q.l = largo; puntos.push(q);
      }
      const anchos = lista.map((p) => (viewBox(p)[1] + SEP) * tamano(p));
      const total = anchos.reduce((s, w) => s + w, 0);
      const achicar = Math.min(1, largo / (total * escala)); // si no entran (celular), más chicas
      let acum = 0;
      lista.forEach((p, i) => {
        const objetivo = ((acum + anchos[i] / 2) / total) * largo; acum += anchos[i];
        const q = puntos.find((r) => r.l >= objetivo) || puntos[N];
        // Normal hacia adentro de la elipse; la corona apunta hacia ahí.
        const nx = -Math.cos(q.t) / ae; const ny = signo * Math.sin(q.t) / be;
        const angulo = Math.atan2(ny, nx) * 180 / Math.PI;
        const giro = signo > 0 ? angulo - 90 : angulo + 90; // arriba: corona hacia abajo; abajo: hacia arriba
        pos[p] = { x: q.x, y: q.y, giro, w: viewBox(p)[1] * escala * tamano(p) * achicar, h: h * tamano(p) * achicar };
      });
    };
    arcos.arriba.forEach(([lista, ae, be]) => arco(lista, ae, be, cyArriba, 1));
    arcos.abajo.forEach(([lista, ae, be]) => arco(lista, ae, be, cyAbajo, -1));
    return { pos, alto: cyAbajo + bFuera + hFuera / 2 + numero + 10 };
  }

  const leerVista = () => { try { return localStorage.getItem('dova-odonto-vista') === 'filas' ? 'filas' : 'boca'; } catch (_e) { return 'boca'; } };
  const guardarVista = (v) => { try { localStorage.setItem('dova-odonto-vista', v); } catch (_e) { /* sin almacenamiento */ } };
  const diaLocal = (fecha) => new Date(fecha).toLocaleDateString('sv-SE'); // AAAA-MM-DD en la hora de la compu

  /* ---------- Editor de una pieza ---------- */
  function editorHtml(inst, p) {
    const d = inst.datos.get(p) || vacio();
    const soloVer = !inst.puedeEditar || !!inst.fecha;
    // En el editor, el esquema grande se ve como en la ficha de papel: vestibular hacia afuera de
    // la boca (arriba en las de arriba, abajo en las de abajo) y mesial hacia la línea media.
    const pol = poligonosCaras(30, 6, 48, 18);
    const sy = esArriba(p) ? 1 : -1; const sx = esIzquierdo(p) ? -1 : 1;
    const t = `matrix(${sx} 0 0 ${sy} ${sx < 0 ? 60 : 0} ${sy < 0 ? 60 : 0})`;
    const letra = { vestibular: [30, esArriba(p) ? 4 : 59], lingual_palatina: [30, esArriba(p) ? 59 : 4], mesial: [esIzquierdo(p) ? 2.5 : 57.5, 31.5], distal: [esIzquierdo(p) ? 57.5 : 2.5, 31.5] };
    const corto = { vestibular: 'V', lingual_palatina: esArriba(p) ? 'P' : 'L', mesial: 'M', distal: 'D' };
    const chip = (grupo, estado, activo, apagado = soloVer) => `<button type="button" class="odo-chip" data-odo-${grupo}="${estado}" aria-pressed="${activo}" ${apagado ? 'disabled' : ''}>${esc(NOMBRE_ESTADO[estado])}</button>`;
    const general = d.general || 'sano';
    const extra = ESTADOS_PIEZA.includes(general) ? '' : chip('pieza', general, true); // estado viejo cargado como "toda la pieza"
    const nota = Object.entries(d.notas).map(([s, n]) => `<li><strong>${esc(NOMBRE_CARA[s] || s)}:</strong> ${esc(n)}</li>`).join('');
    return `<div class="odo-editor-cab">
        <div><strong>Pieza ${p}</strong> <span class="odo-editor-nombre">${esc(nombrePieza(p))}</span></div>
        <button type="button" class="dova-btn-link" data-odo-cerrar>Cerrar</button>
      </div>
      ${soloVer ? `<p class="dova-nota">${inst.fecha ? 'Estás viendo una fecha anterior: volvé a "Hoy" para hacer cambios.' : 'Solo podés ver: no tenés permiso para modificar el odontograma.'}</p>` : ''}
      <div class="odo-editor-cuerpo">
        <div class="odo-editor-bloque">
          <p class="odo-editor-titulo">Caras <span class="dova-nota">(tocá una cara y elegí qué tiene)</span></p>
          <svg class="odo-caras-grande" viewBox="0 0 60 60" role="group" aria-label="Caras de la pieza ${p}">
            <g transform="${t}">${CARAS.map((c) => `<path ${rellenoCara(d.caras[c], inst.id)} d="${pol[c]}" data-odo-cara="${c}" tabindex="0" role="button" aria-label="${esc(NOMBRE_CARA[c])}${d.caras[c] ? ': ' + esc(NOMBRE_ESTADO[d.caras[c]]) : ''}" aria-pressed="${inst.cara === c}"/>`).join('')}</g>
            ${Object.entries(letra).map(([c, [x, y]]) => `<text x="${x}" y="${y}" class="odo-caras-letra">${corto[c]}</text>`).join('')}
          </svg>
          <p class="dova-nota" data-odo-cara-texto>${inst.cara ? `Cara elegida: <strong>${esc(NOMBRE_CARA[inst.cara])}</strong>` : 'Ninguna cara elegida'}</p>
          <div class="odo-chips">${ESTADOS_CARA.map((e) => chip('estado-cara', e, !!inst.cara && (d.caras[inst.cara] || 'sano') === e, soloVer || !inst.cara)).join('')}</div>
        </div>
        <div class="odo-editor-bloque">
          <p class="odo-editor-titulo">Toda la pieza</p>
          <div class="odo-chips">${ESTADOS_PIEZA.map((e) => chip('pieza', e, general === e)).join('')}${extra}</div>
          <p class="odo-editor-titulo">Conducto</p>
          <label class="odo-check"><input type="checkbox" data-odo-endo ${d.raiz === 'endodoncia' || general === 'endodoncia' ? 'checked' : ''} ${soloVer ? 'disabled' : ''}> Endodoncia</label>
          ${soloVer ? '' : '<label class="odo-nota-campo">Nota para el próximo cambio (opcional)<input type="text" data-odo-nota maxlength="500" placeholder="Ej.: caries profunda, controlar en 3 meses"></label>'}
          ${nota ? `<ul class="odo-notas">${nota}</ul>` : ''}
        </div>
      </div>`;
  }

  /* ---------- Impresión ---------- */
  const CSS_IMPRESION = `.odo-raiz,.odo-corona{fill:#fff;stroke:#222;stroke-width:.9;stroke-linejoin:round}
    .odo-detalle{fill:none;stroke:#222;stroke-width:.5;stroke-opacity:.45}.odo-patron{stroke:#222;stroke-width:.55}.odo-patron-punto{fill:#222}
    .odo-marca,.odo-marca-relleno{stroke:#222;stroke-width:.8}.odo-marca{fill:none}.odo-marca-llena{fill:#222}
    .odo-marca-fuerte{fill:none;stroke:#222;stroke-width:1.5;stroke-linecap:round}.odo-marca-x{fill:none;stroke:#222;stroke-width:2}
    .odo-conducto{fill:none;stroke:#222;stroke-width:1.8}.odo-ausente{opacity:.3}.odo-cara{stroke:#222;stroke-width:.5}
    .odo-cara-vacia{fill:#fff}.odo-cara-llena{fill:#222}.odo-numero{font:11px system-ui,sans-serif;fill:#555}
    .cab{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid #999;padding-bottom:8px;margin-bottom:12px}
    .cab h1{margin:0 0 4px}.cab p{margin:0}`;
  function imprimir(inst) {
    const ancho = 900;
    const { pos, alto } = posicionesFilas(ancho, inst.denticion);
    const datos = inst.fecha ? inst.datosPasado : inst.datos;
    const piezas = Object.entries(pos).map(([p, q]) => {
      const svg = dibujo(p, datos.get(p), inst.id).replace('<svg class="odo-dibujo"', `<svg class="odo-dibujo" x="${(q.x - q.w / 2).toFixed(1)}" y="${(q.y - q.h / 2).toFixed(1)}" width="${q.w.toFixed(1)}" height="${q.h.toFixed(1)}"`);
      const yNum = esArriba(p) ? q.y - q.h / 2 - 4 : q.y + q.h / 2 + 12;
      return `${svg}<text class="odo-numero" x="${q.x.toFixed(1)}" y="${yNum.toFixed(1)}" text-anchor="middle">${p}</text>`;
    }).join('');
    const filas = [];
    TODAS.filter((p) => pos[p]).forEach((p) => {
      const d = datos.get(p); if (!d) return;
      if (d.general) filas.push([p, 'Toda la pieza', d.general, d.notas.general]);
      if (d.raiz) filas.push([p, 'Raíz', d.raiz, d.notas.raiz]);
      CARAS.forEach((c) => { if (d.caras[c]) filas.push([p, NOMBRE_CARA[c], d.caras[c], d.notas[c]]); });
    });
    const cuerpo = `<style>${CSS_IMPRESION}</style>
      <div class="cab"><div><h1>Odontograma</h1><p>${esc(inst.paciente)}</p></div>
        <div style="text-align:right"><p>${inst.fecha ? `Estado al ${esc(fmtFecha(inst.fecha))}` : `Fecha: ${esc(fmtFecha(new Date().toLocaleDateString('sv-SE')))}`}</p><p class="nota">Dentición: ${esc(NOMBRE_DENTICION[inst.denticion])}</p></div></div>
      ${patrones(inst.id)}
      <svg width="${ancho}" height="${Math.round(alto)}" viewBox="0 0 ${ancho} ${Math.round(alto)}" style="max-width:100%;height:auto">${piezas}</svg>
      <h2 style="font-size:15px;margin:18px 0 6px">Hallazgos</h2>
      ${filas.length ? `<table><thead><tr><th>Pieza</th><th>Dónde</th><th>Estado</th><th>Nota</th></tr></thead><tbody>
        ${filas.map(([p, donde, e, n]) => `<tr><td>${p}</td><td>${esc(donde)}</td><td>${esc(NOMBRE_ESTADO[e] || e)}</td><td>${esc(n || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="nota">Sin hallazgos registrados.</p>'}`;
    if (window.DovaExt && DovaExt.imprimir) DovaExt.imprimir(`Odontograma — ${inst.paciente || 'paciente'}`, cuerpo);
  }

  /* ---------- activar(): ubica las piezas y conecta los botones ---------- */
  function activar(raiz) {
    (raiz.querySelectorAll ? raiz.querySelectorAll('.dova-odonto') : []).forEach((odo) => {
      if (odo.dataset.activo) return; odo.dataset.activo = '1';
      const conf = configuraciones.get(odo.dataset.odonto) || { filas: [], denticion: 'permanente' };
      configuraciones.delete(odo.dataset.odonto);
      const inst = {
        ...conf, id: odo.dataset.odonto, el: odo, datos: agrupar(conf.filas),
        historial: null, fecha: '', datosPasado: null, pieza: null, cara: null,
      };
      const lienzo = odo.querySelector('.odo-lienzo');
      const boton = odo.querySelector('[data-odo-cambiar]');
      const texto = odo.querySelector('[data-odo-texto]');
      const editor = odo.querySelector('[data-odo-editor]');
      const selFecha = odo.querySelector('[data-odo-fecha]');
      const avisoPasado = odo.querySelector('[data-odo-pasado]');
      let vista = leerVista(); let ultimoAncho = 0;

      const ubicar = (animar) => {
        const ancho = lienzo.clientWidth; if (!ancho) return;
        ultimoAncho = ancho;
        const { pos, alto } = vista === 'boca' ? posicionesBoca(ancho, inst.denticion) : posicionesFilas(ancho, inst.denticion);
        lienzo.classList.toggle('odo-sin-animacion', !animar);
        // Si el lienzo se achica, espera a que las piezas lleguen para no taparlas con lo de abajo.
        const altoActual = parseFloat(lienzo.style.height) || 0;
        lienzo.style.transitionDelay = animar && alto < altoActual ? '420ms' : '0ms';
        lienzo.style.height = `${Math.round(alto)}px`;
        lienzo.querySelectorAll('[data-ver-pieza]').forEach((btn) => {
          const p = btn.dataset.verPieza; const q = pos[p];
          btn.classList.toggle('odo-fuera', !q);
          btn.tabIndex = q ? 0 : -1;
          btn.setAttribute('aria-hidden', q ? 'false' : 'true');
          if (!q) { // fuera de esta dentición: se achica hacia el centro y desaparece
            if (!btn.style.left) { btn.style.left = `${ancho / 2}px`; btn.style.top = `${alto / 2}px`; }
            return;
          }
          const lista = FILAS_DE.mixta.find((l) => l.includes(p));
          const i = lista.indexOf(p);
          const desdeElMedio = Math.abs(i - (lista.length - 1) / 2) - 0.5; // 0 en los centrales
          btn.style.left = `${q.x}px`; btn.style.top = `${q.y}px`;
          btn.style.width = `${q.w}px`; btn.style.height = `${q.h}px`;
          btn.style.setProperty('--giro', `${q.giro}deg`);
          btn.style.setProperty('--demora', `${Math.round(desdeElMedio * 28)}ms`);
        });
        odo.dataset.vista = vista;
        odo.dataset.denticion = inst.denticion;
        texto.textContent = vista === 'boca' ? 'Vista: como en la boca' : 'Vista: piezas en fila';
        boton.setAttribute('aria-pressed', vista === 'filas' ? 'true' : 'false');
        odo.querySelectorAll('[data-odo-denticion]').forEach((b) => {
          b.setAttribute('aria-pressed', b.dataset.odoDenticion === inst.denticion ? 'true' : 'false');
          b.title = !inst.denticionElegida && b.dataset.odoDenticion === inst.denticionAutomatica ? 'Elegida automáticamente por la edad' : '';
        });
        if (!animar) requestAnimationFrame(() => requestAnimationFrame(() => lienzo.classList.remove('odo-sin-animacion')));
      };

      // Vuelve a dibujar una pieza (o todas) con los datos que se están mostrando.
      const redibujar = (piezas = TODAS) => {
        const datos = inst.fecha ? inst.datosPasado : inst.datos;
        piezas.forEach((p) => {
          const btn = lienzo.querySelector(`[data-ver-pieza="${p}"]`); if (!btn) return;
          const d = datos.get(p);
          btn.innerHTML = `${dibujo(p, d, inst.id)}<span class="odo-numero">${p}</span>`;
          [...btn.classList].filter((c) => /^pieza-/.test(c)).forEach((c) => btn.classList.remove(c));
          btn.classList.add(`pieza-${claseEstado(d)}`);
          btn.title = tituloPieza(p, d);
        });
      };

      const abrirEditor = (p) => {
        if (inst.pieza !== p) inst.cara = null;
        inst.pieza = p;
        lienzo.querySelectorAll('.odo-activa').forEach((b) => b.classList.remove('odo-activa'));
        const btn = lienzo.querySelector(`[data-ver-pieza="${p}"]`); if (btn) btn.classList.add('odo-activa');
        editor.hidden = false;
        editor.innerHTML = editorHtml(inst, p);
      };
      const cerrarEditor = () => { editor.hidden = true; editor.innerHTML = ''; inst.pieza = null; inst.cara = null; lienzo.querySelectorAll('.odo-activa').forEach((b) => b.classList.remove('odo-activa')); };

      const guardar = async (superficie, estado) => {
        const p = inst.pieza; if (!p || !inst.puedeEditar || inst.fecha) return;
        const nota = (editor.querySelector('[data-odo-nota]') || {}).value;
        editor.classList.add('odo-guardando');
        try {
          const fila = await DOVA.put(`/odontograma/paciente/${inst.pacienteId}`, { pieza: p, superficie, estado, observacion: nota && nota.trim() ? nota.trim() : undefined });
          const i = inst.filas.findIndex((f) => f.pieza === p && (f.superficie || 'general') === superficie);
          const nueva = { ...(fila || {}), pieza: p, superficie, estado, observacion: fila ? fila.observacion : null };
          if (i >= 0) inst.filas[i] = nueva; else inst.filas.push(nueva);
          inst.datos = agrupar(inst.filas);
          redibujar([p]);
          abrirEditor(p);
          inst.historial = null; cargarFechas();
          toast(`Pieza ${p}: ${NOMBRE_ESTADO[estado]}${superficie === 'general' ? '' : ` (${NOMBRE_CARA[superficie].toLowerCase()})`}`, 'ok');
        } catch (e) {
          toast(e.message || 'No se pudo guardar', 'error');
        } finally { editor.classList.remove('odo-guardando'); }
      };

      editor.addEventListener('click', (e) => {
        const t = e.target;
        if (t.closest('[data-odo-cerrar]')) { cerrarEditor(); return; }
        const cara = t.closest('[data-odo-cara]');
        if (cara) { inst.cara = cara.dataset.odoCara; abrirEditor(inst.pieza); const otra = editor.querySelector(`[data-odo-cara="${inst.cara}"]`); if (otra) otra.focus(); return; }
        const ec = t.closest('[data-odo-estado-cara]');
        if (ec && inst.cara) { guardar(inst.cara, ec.dataset.odoEstadoCara); return; }
        const ep = t.closest('[data-odo-pieza]');
        if (ep) guardar('general', ep.dataset.odoPieza);
      });
      editor.addEventListener('keydown', (e) => {
        const cara = e.target.closest && e.target.closest('[data-odo-cara]');
        if (cara && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); cara.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
      });
      editor.addEventListener('change', (e) => {
        if (!e.target.matches('[data-odo-endo]')) return;
        const d = inst.datos.get(inst.pieza) || vacio();
        if (e.target.checked) guardar('raiz', 'endodoncia');
        else if (d.general === 'endodoncia') guardar('general', 'sano'); // cargada antes como "toda la pieza"
        else guardar('raiz', 'sano');
      });

      // Tocar una pieza abre su editor (en modo presupuesto, ese modo atrapa el clic antes).
      lienzo.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ver-pieza]'); if (!b || b.classList.contains('odo-fuera')) return;
        abrirEditor(b.dataset.verPieza);
      });

      boton.addEventListener('click', () => { vista = vista === 'boca' ? 'filas' : 'boca'; guardarVista(vista); ubicar(true); });

      // Dentición: si puede editar, se guarda para el paciente; si no, solo cambia lo que ve.
      odo.querySelectorAll('[data-odo-denticion]').forEach((b) => b.addEventListener('click', async () => {
        const nueva = b.dataset.odoDenticion; if (nueva === inst.denticion) return;
        inst.denticion = nueva; ubicar(true);
        if (inst.pieza && !(FILAS_DE[nueva].some((l) => l.includes(inst.pieza)))) cerrarEditor();
        if (!inst.puedeEditar) return;
        try {
          const r = await DOVA.put(`/odontograma/paciente/${inst.pacienteId}/denticion`, { denticion: nueva === inst.denticionAutomatica ? '' : nueva });
          inst.denticionElegida = r.denticionElegida; ubicar(false);
        } catch (e) { toast(e.message || 'No se pudo guardar la dentición', 'error'); }
      }));

      // Historial: fechas con cambios; elegir una muestra cómo estaba y qué cambió hasta hoy.
      const cargarFechas = async () => {
        if (!selFecha || !inst.pacienteId) return;
        try { inst.historial = await DOVA.get(`/odontograma/paciente/${inst.pacienteId}/historial`); } catch (_e) { inst.historial = []; }
        const hoy = new Date().toLocaleDateString('sv-SE');
        const dias = [...new Set(inst.historial.map((h) => diaLocal(h.fecha)))].filter((d) => d < hoy).sort().reverse();
        selFecha.innerHTML = `<option value="">Hoy</option>${dias.map((d) => `<option value="${d}" ${d === inst.fecha ? 'selected' : ''}>${esc(fmtFecha(d))}</option>`).join('')}`;
        selFecha.disabled = !dias.length;
        selFecha.title = dias.length ? '' : 'Todavía no hay cambios de días anteriores';
      };
      const verFecha = (dia) => {
        inst.fecha = dia;
        lienzo.querySelectorAll('.odo-cambio').forEach((b) => b.classList.remove('odo-cambio'));
        if (!dia) {
          inst.datosPasado = null; odo.classList.remove('odo-viendo-pasado'); avisoPasado.hidden = true; avisoPasado.innerHTML = '';
          redibujar(); if (inst.pieza) abrirEditor(inst.pieza); return;
        }
        // Estado de ese día: el último cambio de cada pieza+cara hasta ese día inclusive.
        const foto = new Map();
        (inst.historial || []).forEach((h) => { if (diaLocal(h.fecha) <= dia) foto.set(`${h.pieza}|${h.superficie}`, h); });
        const filasPasado = [...foto.values()];
        inst.datosPasado = agrupar(filasPasado);
        redibujar(); odo.classList.add('odo-viendo-pasado');
        // Qué cambió desde ese día hasta hoy.
        const antes = new Map(filasPasado.map((f) => [`${f.pieza}|${f.superficie || 'general'}`, f.estado]));
        const ahora = new Map(inst.filas.map((f) => [`${f.pieza}|${f.superficie || 'general'}`, f.estado]));
        const claves = [...new Set([...antes.keys(), ...ahora.keys()])].sort((x, y) => TODAS.indexOf(x.split('|')[0]) - TODAS.indexOf(y.split('|')[0]));
        const cambios = claves.map((k) => [k, antes.get(k) || 'sano', ahora.get(k) || 'sano']).filter(([, a, b]) => a !== b);
        cambios.forEach(([k]) => { const b = lienzo.querySelector(`[data-ver-pieza="${k.split('|')[0]}"]`); if (b) b.classList.add('odo-cambio'); });
        avisoPasado.hidden = false;
        avisoPasado.innerHTML = `<div class="odo-pasado-cab"><span>Así estaba el <strong>${esc(fmtFecha(dia))}</strong>. Las piezas con recuadro punteado cambiaron después.</span>
            <button type="button" class="dova-btn-secundario" data-odo-hoy>Volver a hoy</button></div>
          ${cambios.length ? `<p class="odo-editor-titulo">Qué cambió desde ese día hasta hoy</p><ul class="odo-cambios">${cambios.map(([k, a, b]) => {
            const [p, s] = k.split('|');
            return `<li><strong>Pieza ${esc(p)}</strong> · ${esc(NOMBRE_CARA[s] || s)}: ${esc(NOMBRE_ESTADO[a] || a)} → ${esc(NOMBRE_ESTADO[b] || b)}</li>`;
          }).join('')}</ul>` : '<p class="dova-nota">No hubo cambios desde ese día.</p>'}`;
        if (inst.pieza) abrirEditor(inst.pieza);
      };
      if (selFecha) selFecha.addEventListener('change', () => verFecha(selFecha.value));
      avisoPasado.addEventListener('click', (e) => { if (e.target.closest('[data-odo-hoy]')) { selFecha.value = ''; verFecha(''); } });

      odo.querySelector('[data-odo-imprimir]').addEventListener('click', () => imprimir(inst));

      // El panel puede estar oculto al dibujarse: se ubica cuando toma ancho (y al cambiar el tamaño).
      if (window.ResizeObserver) new ResizeObserver(() => { if (lienzo.clientWidth && lienzo.clientWidth !== ultimoAncho) ubicar(false); }).observe(lienzo);
      ubicar(false);
      cargarFechas();
    });
  }

  return { html, activar, dibujo, nombrePieza, NOMBRE_ESTADO, ESTADOS_PIEZA, ESTADOS_CARA };
})();
window.DovaOdontograma = DovaOdontograma;
