/* DOVA — odontograma dibujado (objeto global DovaOdontograma).

   Cada pieza es un dibujo en línea de su forma real, vista de frente (corona y raíces):
   incisivos, caninos, premolares y molares, distintos arriba y abajo (cantidad de raíces y de
   cúspides). Sin colores: los estados se marcan con trazos (rayado, X, conducto, etc.).

   Dos vistas, con animación al cambiar:
     - "boca":  las piezas ubicadas como en la boca (arcada de arriba y de abajo).
     - "filas": las 16 de arriba una al lado de la otra y las 16 de abajo debajo.

   Uso (ficha del paciente):
     contenedor.innerHTML = DovaOdontograma.html(filasDelOdontograma);
     DovaOdontograma.activar(contenedor);
   Cada pieza es un <button class="dova-pieza pieza-<estado>" data-ver-pieza="16">, así el
   expediente y el presupuesto desde el odontograma siguen funcionando igual. */
const DovaOdontograma = (() => {
  const { esc } = DovaAyudantes;

  const ARRIBA = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'];
  const ABAJO = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'];

  const NOMBRE_ESTADO = {
    sano: 'Sano', caries: 'Caries', restauracion: 'Restauración', corona: 'Corona', endodoncia: 'Endodoncia',
    extraccion_indicada: 'Extracción indicada', ausente: 'Ausente', implante: 'Implante', protesis: 'Prótesis',
    fractura: 'Fractura', sellante: 'Sellante', tratamiento_realizado: 'Tratamiento realizado', otro: 'Otro',
  };
  // Si una pieza tiene varios registros, la clase principal es la del hallazgo más importante.
  const PRIORIDAD = ['extraccion_indicada', 'caries', 'fractura', 'ausente', 'implante', 'endodoncia', 'corona',
    'protesis', 'restauracion', 'sellante', 'tratamiento_realizado', 'otro', 'sano'];

  /* ---------- Formas de cada pieza ----------
     Dibujadas como pieza de arriba del lado derecho del paciente: raíces hacia arriba, corona
     hacia abajo (borde incisal en y≈78), cuello en y≈44, lado mesial a la derecha. Las de abajo
     se dan vuelta; las del lado izquierdo se espejan.
     vb: [x, ancho] del recorte del dibujo (así cada pieza ocupa lo que mide). */
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

  const esArriba = (pieza) => pieza[0] === '1' || pieza[0] === '2';
  const esIzquierdo = (pieza) => pieza[0] === '2' || pieza[0] === '3'; // lado izquierdo del paciente: se espeja
  const formaDe = (pieza) => FORMAS[(esArriba(pieza) ? 'sup' : 'inf') + pieza[1]];
  function viewBox(pieza) {
    const [x, w] = formaDe(pieza).vb;
    return esIzquierdo(pieza) ? [40 - x - w, w] : [x, w];
  }

  /* ---------- Marcas de cada estado (en el mismo marco que la forma) ---------- */
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

  // SVG de una pieza (sin el número). estados: Set con los estados registrados.
  function dibujo(pieza, estados, idPatron) {
    const f = formaDe(pieza);
    const [vx, vw] = viewBox(pieza);
    const sx = esIzquierdo(pieza) ? -1 : 1; const sy = esArriba(pieza) ? 1 : -1;
    const transformacion = `matrix(${sx} 0 0 ${sy} ${sx < 0 ? 40 : 0} ${sy < 0 ? 80 : 0})`;
    const ausente = estados.has('ausente');
    const implante = estados.has('implante');
    return `<svg class="odo-dibujo" viewBox="${vx} 0 ${vw} 80" aria-hidden="true" focusable="false">
      <g transform="${transformacion}" class="${ausente ? 'odo-ausente' : ''}">
        ${implante ? '' : f.raices.map((d) => `<path class="odo-raiz" d="${d}"/>`).join('')}
        <path class="odo-corona" d="${f.corona}"/>
        ${f.detalles.map((d) => `<path class="odo-detalle" d="${d}"/>`).join('')}
        ${marcas(estados, f, idPatron)}
      </g></svg>`;
  }

  // Patrones de rayado (corona, restauración) y cuadriculado (prótesis): una vez por odontograma.
  const patrones = (id) => `<svg class="odo-defs" aria-hidden="true" focusable="false" width="0" height="0"><defs>
    <pattern id="${id}-rayado" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V3" class="odo-patron"/></pattern>
    <pattern id="${id}-cuadros" width="3.4" height="3.4" patternUnits="userSpaceOnUse"><path d="M0 0H3.4M0 0V3.4" class="odo-patron"/></pattern>
  </defs></svg>`;

  // Leyenda con la marca de cada estado, dibujada sobre un premolar.
  function leyenda(idPatron) {
    const lista = ['caries', 'restauracion', 'sellante', 'corona', 'protesis', 'endodoncia', 'implante', 'fractura', 'extraccion_indicada', 'ausente', 'tratamiento_realizado', 'otro'];
    return `<ul class="odo-leyenda">${lista.map((e) => `<li>${dibujo('15', new Set([e]), idPatron)}<span>${esc(NOMBRE_ESTADO[e])}</span></li>`).join('')}</ul>`;
  }

  let contador = 0;
  function html(filas) {
    const id = `odo${++contador}`;
    const porPieza = new Map();
    (filas || []).forEach((f) => { if (!porPieza.has(f.pieza)) porPieza.set(f.pieza, new Set()); porPieza.get(f.pieza).add(f.estado); });
    const pieza = (p) => {
      const estados = porPieza.get(p) || new Set();
      const principal = PRIORIDAD.find((e) => estados.has(e)) || 'sano';
      const nombres = [...estados].filter((e) => e !== 'sano').map((e) => NOMBRE_ESTADO[e] || e);
      return `<button type="button" class="dova-pieza pieza-${principal} ${esArriba(p) ? 'odo-arriba' : 'odo-abajo'}" data-ver-pieza="${p}"
        title="Pieza ${p}${nombres.length ? ' — ' + esc(nombres.join(', ')) : ''}">${dibujo(p, estados, id)}<span class="odo-numero">${p}</span></button>`;
    };
    return `<div class="dova-odonto" data-odonto="${id}">
      <div class="odo-barra">
        <span class="odo-vista-texto" data-odo-texto>Vista: como en la boca</span>
        <button type="button" class="dova-btn-secundario" data-odo-cambiar aria-pressed="false">Cambiar de vista</button>
      </div>
      ${patrones(id)}
      <div class="dova-odontograma-grid odo-lienzo">${ARRIBA.map(pieza).join('')}${ABAJO.map(pieza).join('')}</div>
      ${leyenda(id)}
    </div>`;
  }

  /* ---------- Ubicación de las piezas en cada vista ----------
     Todo se calcula en píxeles a partir del ancho del lienzo. Cambiar de vista solo cambia
     left/top/giro de cada pieza: la animación la hace el CSS (transition). */
  const SEP = 1.5; // separación entre piezas, en unidades del dibujo

  function posicionesFilas(ancho, piezas) {
    const fila = (lista) => lista.reduce((t, p) => t + viewBox(p)[1], 0) + SEP * (lista.length - 1) + 6;
    const escala = (ancho * 0.97) / Math.max(fila(ARRIBA), fila(ABAJO));
    const alto = 80 * escala; const numero = 18;
    const yArriba = numero + alto / 2 + 4; const yAbajo = yArriba + alto + 22;
    const pos = {};
    [[ARRIBA, yArriba], [ABAJO, yAbajo]].forEach(([lista, y]) => {
      let x = (ancho - fila(lista) * escala) / 2;
      lista.forEach((p, i) => {
        if (i === 8) x += 6 * escala; // línea media
        const w = viewBox(p)[1] * escala;
        pos[p] = { x: x + w / 2, y, giro: 0, w, h: alto };
        x += w + SEP * escala;
      });
    });
    return { pos, alto: yAbajo + alto / 2 + numero + 8, escala, piezas };
  }

  function posicionesBoca(ancho) {
    // Cada arcada es media elipse; las piezas se reparten según su ancho y miran al centro.
    const escala = Math.min(ancho / 560, 1.15);
    const a = Math.min(ancho * 0.30, 215); const b = a * 0.92; // forma de herradura
    const alto = 80 * escala; const numero = 16;
    const cyArriba = numero + alto / 2 + b + 6;
    const cyAbajo = cyArriba + 2 * b * Math.sin(Math.PI / 12) + alto * 0.4 + 16;
    const pos = {};
    const t0 = Math.PI + Math.PI / 12; const t1 = -Math.PI / 12; // de 195° a -15°
    const arco = (lista, cy, signo) => {
      // Largo de arco acumulado para repartir por ancho de cada pieza.
      const N = 400; const puntos = []; let largo = 0;
      for (let i = 0; i <= N; i++) {
        const t = t0 + (t1 - t0) * (i / N);
        const p = { t, x: ancho / 2 + a * Math.cos(t), y: cy - signo * b * Math.sin(t) };
        if (i) largo += Math.hypot(p.x - puntos[i - 1].x, p.y - puntos[i - 1].y);
        p.l = largo; puntos.push(p);
      }
      const anchos = lista.map((p) => viewBox(p)[1] + SEP);
      const total = anchos.reduce((s, w) => s + w, 0);
      let acum = 0;
      lista.forEach((pieza, i) => {
        const objetivo = ((acum + anchos[i] / 2) / total) * largo; acum += anchos[i];
        const pt = puntos.find((q) => q.l >= objetivo) || puntos[N];
        // Normal hacia adentro de la elipse; la corona apunta hacia ahí.
        const nx = -Math.cos(pt.t) / a; const ny = signo * Math.sin(pt.t) / b;
        const angulo = Math.atan2(ny, nx) * 180 / Math.PI;
        const giro = signo > 0 ? angulo - 90 : angulo + 90; // arriba: corona hacia abajo; abajo: hacia arriba
        const w = viewBox(pieza)[1] * escala;
        pos[pieza] = { x: pt.x, y: pt.y, giro, w, h: alto };
      });
      return largo;
    };
    const largo = arco(ARRIBA, cyArriba, 1);
    arco(ABAJO, cyAbajo, -1);
    // Si el arco es corto para las piezas, se achican (celular).
    const total = ARRIBA.reduce((s, p) => s + viewBox(p)[1] + SEP, 0) * escala;
    if (total > largo) {
      const f = largo / total;
      Object.values(pos).forEach((p) => { p.w *= f; p.h *= f; });
    }
    return { pos, alto: cyAbajo + b + alto / 2 + numero + 10 };
  }

  const leerVista = () => { try { return localStorage.getItem('dova-odonto-vista') === 'filas' ? 'filas' : 'boca'; } catch (_e) { return 'boca'; } };
  const guardarVista = (v) => { try { localStorage.setItem('dova-odonto-vista', v); } catch (_e) { /* sin almacenamiento */ } };

  function activar(raiz) {
    (raiz.querySelectorAll ? raiz.querySelectorAll('.dova-odonto') : []).forEach((odo) => {
      if (odo.dataset.activo) return; odo.dataset.activo = '1';
      const lienzo = odo.querySelector('.odo-lienzo');
      const boton = odo.querySelector('[data-odo-cambiar]');
      const texto = odo.querySelector('[data-odo-texto]');
      let vista = leerVista(); let ultimoAncho = 0;

      const ubicar = (animar) => {
        const ancho = lienzo.clientWidth; if (!ancho) return;
        ultimoAncho = ancho;
        const { pos, alto } = vista === 'boca' ? posicionesBoca(ancho) : posicionesFilas(ancho);
        lienzo.classList.toggle('odo-sin-animacion', !animar);
        // Si el lienzo se achica, espera a que las piezas lleguen para no taparlas con la leyenda.
        const altoActual = parseFloat(lienzo.style.height) || 0;
        lienzo.style.transitionDelay = animar && alto < altoActual ? '420ms' : '0ms';
        lienzo.style.height = `${Math.round(alto)}px`;
        lienzo.querySelectorAll('[data-ver-pieza]').forEach((btn) => {
          const p = pos[btn.dataset.verPieza];
          const i = (ARRIBA.includes(btn.dataset.verPieza) ? ARRIBA : ABAJO).indexOf(btn.dataset.verPieza);
          const desdeElMedio = Math.abs(i - 7.5) - 0.5; // 0 en los centrales, 7 en los terceros molares
          btn.style.left = `${p.x}px`; btn.style.top = `${p.y}px`;
          btn.style.width = `${p.w}px`; btn.style.height = `${p.h}px`;
          btn.style.setProperty('--giro', `${p.giro}deg`);
          btn.style.setProperty('--demora', `${Math.round(desdeElMedio * 28)}ms`);
        });
        odo.dataset.vista = vista;
        texto.textContent = vista === 'boca' ? 'Vista: como en la boca' : 'Vista: piezas en fila';
        boton.setAttribute('aria-pressed', vista === 'filas' ? 'true' : 'false');
        if (!animar) requestAnimationFrame(() => requestAnimationFrame(() => lienzo.classList.remove('odo-sin-animacion')));
      };

      boton.addEventListener('click', () => { vista = vista === 'boca' ? 'filas' : 'boca'; guardarVista(vista); ubicar(true); });
      // El panel puede estar oculto al dibujarse: se ubica cuando toma ancho (y al cambiar el tamaño).
      if (window.ResizeObserver) new ResizeObserver(() => { if (lienzo.clientWidth && lienzo.clientWidth !== ultimoAncho) ubicar(false); }).observe(lienzo);
      ubicar(false);
    });
  }

  return { html, activar, dibujo, NOMBRE_ESTADO };
})();
window.DovaOdontograma = DovaOdontograma;
