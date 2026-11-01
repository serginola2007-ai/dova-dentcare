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


  /* ---------- Vista oclusal (desde arriba): opción B ----------
     Mismo ancho que la vista de frente; alto 40. Vestibular arriba (y≈4), lingual/palatino abajo. */
  const OCLUSAL = {
    sup1: { contorno: 'M7 12Q20 5 33 12Q35 17 30 25Q25 33 20 33Q15 33 10 25Q5 17 7 12Z', detalles: ['M9 13Q20 8.5 31 13', 'M15 27Q20 31 25 27', 'M12 15Q14 21 17 26', 'M28 15Q26 21 23 26'] },
    sup2: { contorno: 'M10 13Q20 7 30 13Q32 18 28 25Q24 31 20 31Q16 31 12 25Q8 18 10 13Z', detalles: ['M11.5 14Q20 9.5 28.5 14', 'M16.5 26Q20 29 23.5 26'] },
    sup3: { contorno: 'M9 16Q13 7 20.5 6Q28 7 32 16Q33 23 27 29Q20.5 34 14 29Q8 23 9 16Z', detalles: ['M10 16L20.5 12.5L31 16', 'M20.5 12.5L20.5 27', 'M15 25Q20.5 30 26 25'] },
    sup4: { contorno: 'M8 11Q20 4 32 11Q35 20 32 29Q20 36 8 29Q5 20 8 11Z', detalles: ['M10 20Q20 17.5 30 20', 'M13 12Q20 9 27 12', 'M13 28Q20 31 27 28'] },
    sup5: { contorno: 'M9 11Q20 5 31 11Q34 20 31 29Q20 35 9 29Q6 20 9 11Z', detalles: ['M11 20Q20 18.5 29 20', 'M14 12Q20 10 26 12', 'M14 28Q20 30 26 28'] },
    sup6: { contorno: 'M5 8Q13 3.5 22 4.5Q33 5.5 36 11Q38.5 21 35 31Q28 37 17 36Q6 35 4 27Q2 17 5 8Z', detalles: ['M10 11Q16 16 20 20Q24 16 30 11', 'M20 20Q17 26 12 31', 'M20 20Q25 24 31 27', 'M28 27Q23 32 19 33'] },
    sup7: { contorno: 'M6 9Q14 4.5 22 5Q31 6 34 11Q36.5 20 33 29Q27 35 18 34Q8 33 6 26Q4 17 6 9Z', detalles: ['M11 11Q16 16 20 19Q24 16 29 11', 'M20 19Q17 25 13 29', 'M20 19Q25 23 30 25'] },
    sup8: { contorno: 'M8 11Q15 6 21 6.5Q29 7.5 32 13Q34 21 30 28Q24 33 17 32Q10 30 8 24Q6 17 8 11Z', detalles: ['M12 13Q17 17 20 19Q24 16 28 13', 'M20 19Q18 24 15 28'] },
    inf1: { contorno: 'M11.5 14Q20 10.5 28.5 14Q30 20 26 26Q20 30 14 26Q10 20 11.5 14Z', detalles: ['M12.5 15Q20 12 27.5 15'] },
    inf2: { contorno: 'M10.5 14Q20 10 29.5 14Q31 20 27 26Q20 30.5 13 26Q9 20 10.5 14Z', detalles: ['M11.5 15Q20 11.5 28.5 15'] },
    inf3: { contorno: 'M10 15Q14 8 20.5 7.5Q27 8 31 15Q32 22 27 28Q20.5 32 14 28Q9 22 10 15Z', detalles: ['M11 15L20.5 12L30 15', 'M20.5 12L20.5 26'] },
    inf4: { contorno: 'M9 13Q20 6 31 13Q33 21 29 28Q20 33 11 28Q7 21 9 13Z', detalles: ['M11 22Q20 20 29 22', 'M20 9Q19.5 15 20 21'] },
    inf5: { contorno: 'M8.5 12Q20 5 31.5 12Q34 20 31 28Q20 34 9 28Q6 20 8.5 12Z', detalles: ['M11 19Q16 19 20 21.5Q24 19 29 19', 'M20 21.5L20 30'] },
    inf6: { contorno: 'M4 10Q12 5.5 22 6Q32 6.5 36 11Q38.5 20 36 29Q30 34.5 20 34.5Q9 34.5 4 29Q1.5 20 4 10Z', detalles: ['M7 20Q14 18 20 20Q27 22 34 19', 'M14 8Q15 14 14 19', 'M26 8Q25 14 26.5 21', 'M20 20L20 32'] },
    inf7: { contorno: 'M5 10Q20 5 35 10Q37.5 20 35 30Q20 35 5 30Q2.5 20 5 10Z', detalles: ['M7.5 20Q20 18 32.5 20', 'M20 8L20 32'] },
    inf8: { contorno: 'M7 12Q20 6 33 12Q35 20 32 28Q20 33.5 9 28Q5.5 20 7 12Z', detalles: ['M10 20Q20 18.5 30 20', 'M18 10Q20 15 20 19.5Q21 25 19 30'] },
  };
  const oclusalDe = (pieza) => OCLUSAL[(esArriba(pieza) ? 'sup' : 'inf') + pieza[1]];

  function marcasOclusal(estados, f, contorno, idPatron) {
    const cx = f.cx; const [x0, w] = f.vb; const x1 = x0 + w;
    const m = [];
    if (estados.has('corona')) m.push(`<path class="odo-marca-relleno" d="${contorno}" fill="url(#${idPatron}-rayado)"/>`);
    if (estados.has('protesis')) m.push(`<path class="odo-marca-relleno" d="${contorno}" fill="url(#${idPatron}-cuadros)"/>`);
    if (estados.has('restauracion')) m.push(`<ellipse class="odo-marca-relleno" cx="${cx}" cy="20" rx="${Math.min(6, w / 4)}" ry="4.5" fill="url(#${idPatron}-rayado)"/>`);
    if (estados.has('sellante')) m.push(`<path class="odo-marca-relleno" d="M${cx - 7} 18.5h14v3h-14Z" fill="url(#${idPatron}-rayado)"/>`);
    if (estados.has('caries')) m.push(`<path class="odo-marca-llena" d="M${cx - 2} 16.5q2.2-3.4 5.4-1.4q2.6 1.8.6 5.2q-2.4 2.8-5.2.8q-2.4-1.8-.8-4.6Z"/>`);
    if (estados.has('endodoncia')) m.push(`<circle class="odo-marca" cx="${cx}" cy="20" r="3.2"/><circle class="odo-marca-llena" cx="${cx}" cy="20" r="1.2"/>`);
    if (estados.has('implante')) m.push(`<circle class="odo-marca" cx="${cx}" cy="20" r="6"/><path class="odo-marca" d="M${cx - 2.6} 18.5L${cx} 17L${cx + 2.6} 18.5V21.5L${cx} 23L${cx - 2.6} 21.5Z"/>`);
    if (estados.has('fractura')) {
      const pasos = []; let x = x0 + 3; let arriba = true;
      while (x < x1 - 3) { pasos.push(`${x} ${arriba ? 17 : 23}`); x += 3.6; arriba = !arriba; }
      m.push(`<path class="odo-marca-fuerte" d="M${pasos.join('L')}"/>`);
    }
    if (estados.has('tratamiento_realizado')) m.push(`<path class="odo-marca-fuerte" d="M${cx - 4.5} 20l3.2 3.6l6.5-7.5"/>`);
    if (estados.has('otro')) m.push(`<path class="odo-marca-fuerte" d="M${cx} 16v8M${cx - 3.5} 18l7 4M${cx + 3.5} 18l-7 4"/>`);
    if (estados.has('extraccion_indicada')) m.push(`<path class="odo-marca-x" d="M${x0 + 3} 4L${x1 - 3} 36M${x1 - 3} 4L${x0 + 3} 36"/>`);
    return m.join('');
  }

  function dibujoOclusal(pieza, estados, idPatron) {
    const f = formaDe(pieza); const o = oclusalDe(pieza);
    const [vx, vw] = viewBox(pieza);
    const sx = esIzquierdo(pieza) ? -1 : 1; const sy = esArriba(pieza) ? 1 : -1;
    const transformacion = `matrix(${sx} 0 0 ${sy} ${sx < 0 ? 40 : 0} ${sy < 0 ? 40 : 0})`;
    return `<svg class="odo-dibujo odo-dibujo-ocl" viewBox="${vx} 0 ${vw} 40" aria-hidden="true" focusable="false">
      <g transform="${transformacion}" class="${estados.has('ausente') ? 'odo-ausente' : ''}">
        <path class="odo-corona" d="${o.contorno}"/>
        ${o.detalles.map((d) => `<path class="odo-detalle odo-surco" d="${d}"/>`).join('')}
        ${marcasOclusal(estados, f, o.contorno, idPatron)}
      </g></svg>`;
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
  // grabado: suma sombreado con líneas del lado distal (opción C).
  function dibujo(pieza, estados, idPatron, grabado = false) {
    const f = formaDe(pieza);
    const [vx, vw] = viewBox(pieza);
    const sx = esIzquierdo(pieza) ? -1 : 1; const sy = esArriba(pieza) ? 1 : -1;
    const transformacion = `matrix(${sx} 0 0 ${sy} ${sx < 0 ? 40 : 0} ${sy < 0 ? 80 : 0})`;
    const ausente = estados.has('ausente');
    const implante = estados.has('implante');
    const raices = implante ? [] : f.raices;
    const idClip = `${idPatron}-c${pieza}`;
    const [x0, w] = f.vb;
    const sombra = grabado && !ausente ? `<clipPath id="${idClip}">${[...raices, f.corona].map((d) => `<path d="${d}"/>`).join('')}</clipPath>
        <g clip-path="url(#${idClip})" class="odo-sombra">
          <rect x="${x0}" y="0" width="${w * 0.36}" height="80" fill="url(#${idPatron}-sombra)"/>
          <rect x="${x0}" y="0" width="${w}" height="44" fill="url(#${idPatron}-sombra-suave)"/>
        </g>` : '';
    return `<svg class="odo-dibujo odo-dibujo-lat" viewBox="${vx} 0 ${vw} 80" aria-hidden="true" focusable="false">
      <g transform="${transformacion}" class="${ausente ? 'odo-ausente' : ''}">
        ${raices.map((d) => `<path class="odo-raiz" d="${d}"/>`).join('')}
        <path class="odo-corona" d="${f.corona}"/>
        ${sombra}
        ${f.detalles.map((d) => `<path class="odo-detalle" d="${d}"/>`).join('')}
        ${marcas(estados, f, idPatron)}
      </g></svg>`;
  }

  // Patrones de rayado (corona, restauración) y cuadriculado (prótesis): una vez por odontograma.
  const patrones = (id) => `<svg class="odo-defs" aria-hidden="true" focusable="false" width="0" height="0"><defs>
    <pattern id="${id}-rayado" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V3" class="odo-patron"/></pattern>
    <pattern id="${id}-cuadros" width="3.4" height="3.4" patternUnits="userSpaceOnUse"><path d="M0 0H3.4M0 0V3.4" class="odo-patron"/></pattern>
    <pattern id="${id}-sombra" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)"><path d="M0 0V1.6" class="odo-patron-fino"/></pattern>
    <pattern id="${id}-sombra-suave" width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)"><path d="M0 0V3.2" class="odo-patron-fino"/></pattern>
  </defs></svg>`;

  // Leyenda con la marca de cada estado, dibujada sobre un premolar.
  function leyenda(idPatron) {
    const lista = ['caries', 'restauracion', 'sellante', 'corona', 'protesis', 'endodoncia', 'implante', 'fractura', 'extraccion_indicada', 'ausente', 'tratamiento_realizado', 'otro'];
    return `<ul class="odo-leyenda">${lista.map((e) => `<li>${dibujo('15', new Set([e]), idPatron)}<span>${esc(NOMBRE_ESTADO[e])}</span></li>`).join('')}</ul>`;
  }

  // Estilo del dibujo: linea (A), oclusal (B) o grabado (C).
  const ESTILOS = ['linea', 'oclusal', 'grabado'];
  const leerEstilo = () => { try { const e = localStorage.getItem('dova-odonto-estilo'); return ESTILOS.includes(e) ? e : 'linea'; } catch (_e) { return 'linea'; } };

  let contador = 0;
  function html(filas, estilo = leerEstilo()) {
    const id = `odo${++contador}`;
    const porPieza = new Map();
    (filas || []).forEach((f) => { if (!porPieza.has(f.pieza)) porPieza.set(f.pieza, new Set()); porPieza.get(f.pieza).add(f.estado); });
    const pieza = (p) => {
      const estados = porPieza.get(p) || new Set();
      const principal = PRIORIDAD.find((e) => estados.has(e)) || 'sano';
      const nombres = [...estados].filter((e) => e !== 'sano').map((e) => NOMBRE_ESTADO[e] || e);
      return `<button type="button" class="dova-pieza pieza-${principal} ${esArriba(p) ? 'odo-arriba' : 'odo-abajo'}" data-ver-pieza="${p}"
        title="Pieza ${p}${nombres.length ? ' — ' + esc(nombres.join(', ')) : ''}">${dibujo(p, estados, id, estilo === 'grabado')}${estilo === 'oclusal' ? dibujoOclusal(p, estados, id) : ''}<span class="odo-numero">${p}</span></button>`;
    };
    return `<div class="dova-odonto" data-odonto="${id}" data-estilo="${estilo}">
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

  // Forma de la arcada por estilo: a = mitad del ancho, b = profundidad, barrido = cuánto baja a los costados.
  const ARCADA = {
    linea: { a: 0.30, aMax: 215, b: 0.92, barrido: Math.PI / 12, altoUnidades: 80 },
    oclusal: { a: 0.25, aMax: 175, b: 1.28, barrido: Math.PI / 30, altoUnidades: 40, llenar: true },
    grabado: { a: 0.27, aMax: 195, b: 1.12, barrido: Math.PI / 18, altoUnidades: 80 },
  };

  function posicionesBoca(ancho, estilo = 'linea', abierta = 0) {
    // Cada arcada es media elipse; las piezas se reparten según su ancho y miran al centro.
    const forma = ARCADA[estilo] || ARCADA.linea;
    const a = Math.min(ancho * forma.a, forma.aMax); const b = a * forma.b;
    let escala = Math.min(ancho / 560, 1.15);
    const numero = 16;
    const t0 = Math.PI + forma.barrido; const t1 = -forma.barrido;
    const totalUnidades = ARRIBA.reduce((s, p) => s + viewBox(p)[1] + SEP, 0);
    // Largo de la media elipse (para que las piezas oclusales se toquen, como en la boca).
    const largoArco = (() => { let l = 0; let ant = null; for (let i = 0; i <= 400; i++) { const t = t0 + (t1 - t0) * (i / 400); const q = [a * Math.cos(t), b * Math.sin(t)]; if (ant) l += Math.hypot(q[0] - ant[0], q[1] - ant[1]); ant = q; } return l; })();
    if (forma.llenar) escala = (largoArco * 0.98) / totalUnidades;
    const alto = forma.altoUnidades * escala;
    const cyArriba = numero + alto / 2 + b + 6 - abierta;
    const cyAbajo = cyArriba + abierta + 2 * b * Math.sin(forma.barrido) + alto * (forma.llenar ? 0.5 : 0.4) + 16 + abierta;
    const pos = {};
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
    const total = totalUnidades * escala;
    if (total > largo * 1.001) {
      const f = largo / total;
      Object.values(pos).forEach((p) => { p.w *= f; p.h *= f; });
    }
    return { pos, alto: cyAbajo - abierta + b + alto / 2 + numero + 10 };
  }

  const leerVista = () => { try { return localStorage.getItem('dova-odonto-vista') === 'filas' ? 'filas' : 'boca'; } catch (_e) { return 'boca'; } };
  const guardarVista = (v) => { try { localStorage.setItem('dova-odonto-vista', v); } catch (_e) { /* sin almacenamiento */ } };

  function activar(raiz) {
    (raiz.querySelectorAll ? raiz.querySelectorAll('.dova-odonto') : []).forEach((odo) => {
      if (odo.dataset.activo) return; odo.dataset.activo = '1';
      const lienzo = odo.querySelector('.odo-lienzo');
      const boton = odo.querySelector('[data-odo-cambiar]');
      const texto = odo.querySelector('[data-odo-texto]');
      const estilo = odo.dataset.estilo || 'linea';
      let vista = leerVista(); let ultimoAncho = 0; let espera = null;

      // abierta > 0: la boca separada (primer tiempo de la animación del estilo grabado).
      const ubicar = (animar, abierta = 0) => {
        const ancho = lienzo.clientWidth; if (!ancho) return;
        ultimoAncho = ancho;
        const { pos, alto } = vista === 'boca' || abierta ? posicionesBoca(ancho, estilo, abierta) : posicionesFilas(ancho);
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
          btn.style.setProperty('--demora', abierta ? '0ms' : `${Math.round(desdeElMedio * 28)}ms`);
        });
        if (abierta) return;
        odo.dataset.vista = vista;
        texto.textContent = vista === 'boca' ? 'Vista: como en la boca' : 'Vista: piezas en fila';
        boton.setAttribute('aria-pressed', vista === 'filas' ? 'true' : 'false');
        if (!animar) requestAnimationFrame(() => requestAnimationFrame(() => lienzo.classList.remove('odo-sin-animacion')));
      };

      boton.addEventListener('click', () => {
        clearTimeout(espera);
        vista = vista === 'boca' ? 'filas' : 'boca'; guardarVista(vista);
        if (estilo !== 'grabado') { ubicar(true); return; }
        // Grabado: primero se separan las arcadas (se abre la boca) y después se acomodan.
        if (vista === 'filas') { odo.dataset.vista = 'abriendo'; ubicar(true, 40); espera = setTimeout(() => ubicar(true), 430); }
        else { ubicar(true, 40); odo.dataset.vista = 'boca'; espera = setTimeout(() => ubicar(true), 900); }
      });
      // El panel puede estar oculto al dibujarse: se ubica cuando toma ancho (y al cambiar el tamaño).
      if (window.ResizeObserver) new ResizeObserver(() => { if (lienzo.clientWidth && lienzo.clientWidth !== ultimoAncho) ubicar(false); }).observe(lienzo);
      ubicar(false);
    });
  }

  return { html, activar, dibujo, dibujoOclusal, NOMBRE_ESTADO, ESTILOS };
})();
window.DovaOdontograma = DovaOdontograma;
