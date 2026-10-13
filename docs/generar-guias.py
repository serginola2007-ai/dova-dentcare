"""Genera las guías rápidas de DOVA (una página por rol) en frontend/docs/guias/.
Uso: python3 docs/generar-guias.py   (requiere reportlab)"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Frame, KeepInFrame
from reportlab.lib.styles import ParagraphStyle

TERRA = HexColor('#A5522F'); TINTA = HexColor('#2B241E'); SUAVE = HexColor('#6B6055'); CREMA = HexColor('#F7EEE1'); LINEA = HexColor('#E4D3BD')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frontend', 'docs', 'guias')
W, H = A4

st_tit = ParagraphStyle('t', fontName='Helvetica-Bold', fontSize=13, leading=16, textColor=TERRA, spaceAfter=4, spaceBefore=4)
st_txt = ParagraphStyle('p', fontName='Helvetica', fontSize=10.5, leading=14.2, textColor=TINTA, spaceAfter=3)
st_item = ParagraphStyle('i', parent=st_txt, leftIndent=9, bulletIndent=0)

GUIAS = {
  'recepcion': ('Recepción', 'Agenda, pacientes, cobros, caja y mensajes', [
    ('Entrar y salir', ['Entrás con tu usuario y contraseña. Si DOVA queda sin usar, se bloquea: volvés con tu contraseña.',
                        '<b>Ctrl + K</b> (o "Buscar") encuentra pacientes, turnos y facturas desde cualquier pantalla.']),
    ('Dar un turno', ['<b>Movimientos → Agenda → "+ Nuevo turno"</b>: buscá al paciente por nombre o C.I., elegí tratamiento, odontólogo, día y hora.',
                      'En cada turno: <b>Confirmar</b>, <b>Llegó</b>, <b>Reprogramar</b> o <b>Cancelar</b>. Al cancelar, el horario se ofrece solo a la lista de espera.',
                      '<b>Agenda → Lista de espera</b>: quienes quieren un turno antes. Arriba ves los <b>turnos liberados</b> y a quién se ofrecieron.']),
    ('Pacientes', ['<b>Reportes → Pacientes</b>: "+ Nuevo paciente" o "Importar desde Excel" (primero muestra una revisión, no guarda nada hasta que confirmás).',
                   'En la ficha: datos, alertas médicas, turnos, presupuestos, pagos y documentos.']),
    ('Cobrar y caja', ['<b>Movimientos → Caja</b>: abrila al empezar el día con el efectivo del cajón y cerrala con el conteo.',
                       'Ficha → <b>Pagos y presupuestos → Registrar cobro</b>. Marcá "Generar factura" si corresponde. Las cuotas se cobran desde ahí también.']),
    ('Mensajes por WhatsApp', ['<b>Seguimiento → Recordatorios de turnos</b>: "Mandar por mi WhatsApp" abre el mensaje armado con el enlace para confirmar o cancelar.',
                               '<b>Finanzas → Avisos de cobro</b>: cuotas por vencer o vencidas y presupuestos sin respuesta, con su enlace de pago.',
                               '<b>Seguimiento → Controles periódicos</b>: "Mandar enlace para reservar" (el paciente elige día y hora solo).']),
    ('Página web', ['<b>Movimientos → Página web</b>: "Lo que llegó" (turnos y consultas de la web) y "Pagos para revisar" (comprobantes que mandaron los pacientes).',
                    'La campanita avisa de todo lo nuevo: turnos web, pagos, respuestas de pacientes.']),
  ]),
  'odontologo': ('Odontólogo', 'Consulta, ficha clínica, presupuestos e imágenes', [
    ('Tu día', ['En <b>Inicio</b> ves tus turnos del día y quién llegó. Tocá <b>Iniciar consulta</b> en el paciente.',
                'Solo ves tus pacientes y tus recordatorios; en Configuración → <b>Mi WhatsApp</b> registrás tu celular.']),
    ('Modo consulta', ['Arriba aparecen las <b>alertas médicas</b> (alergias, anticoagulantes, embarazo, etc.). Leelas antes de empezar.',
                       'Cargá diagnóstico, procedimiento y evolución; actualizá el odontograma; hacé la receta (DOVA revisa alergias e interacciones y te avisa).',
                       'Al terminar, <b>Finalizar</b>: la consulta queda firmada y podés dar la próxima cita.']),
    ('Presupuesto desde el odontograma', ['Ficha → <b>Odontograma → "Armar presupuesto desde el odontograma"</b>. Tocá las piezas o "Marcar las piezas con hallazgos".',
                                         'DOVA sugiere el tratamiento según el hallazgo (caries, extracción indicada…). Revisalo y tocá <b>Crear presupuesto</b>: se arma con los precios del catálogo.']),
    ('Radiografías y fotos', ['Ficha → <b>Fotos y estudios → "Abrir visor de radiografías"</b>.',
                              'Zoom con la rueda o dos dedos, brillo, contraste, negativo y rotación. <b>Medir</b>: dos toques. <b>Calibrar</b> con una medida conocida para ver milímetros.',
                              '<b>Comparar</b>: dos estudios lado a lado (antes/después, misma pieza en dos fechas).']),
    ('Consentimientos', ['Ficha → <b>Consentimientos → "Firmar en tablet"</b>: pantalla completa para el paciente, con "Leí y acepto" y la firma con el dedo. Después devolvé la tablet: el documento firmado no se puede cambiar.']),
    ('Más herramientas', ['Periodoncia (periodontograma de 6 sitios), Especialidades (implantes, endodoncia, ortodoncia), Salud, Recetas y Documentos (PDF de historia clínica).']),
  ]),
  'administracion': ('Administración', 'Puesta en marcha, usuarios, precios, mensajes y control', [
    ('Puesta en marcha', ['En <b>Inicio</b> está la lista de lo que falta configurar. Cada paso tiene "Ir". Desaparece al completarla.']),
    ('Personal y permisos', ['<b>Administración → Usuarios</b>: creá un usuario por persona, con su rol (recepción, odontólogo, asistente). A los odontólogos, vinculalos con su ficha de odontólogo.',
                             'Podés cerrar las sesiones de alguien o darlo de baja: deja de entrar al instante.']),
    ('Catálogo y agenda', ['<b>Reportes → Tratamientos</b>: tratamientos con precio y duración; odontólogos y su <b>Horario</b> (lo usa la reserva online).',
                           '<b>Movimientos → Clínica → Sillones y días bloqueados</b>: sillones, feriados, vacaciones.']),
    ('Configuración', ['<b>Datos de la clínica</b> (dirección, teléfono, horario), <b>Mensajes automáticos</b> (turnos liberados, controles, encuesta y enlace de reseña de Google), <b>Apariencia</b> (4 diseños).',
                       '<b>Movimientos → Facturación → Configuración</b>: RUC, razón social, timbrado y formato de impresión.',
                       '<b>Movimientos → Página web → Configurar la página</b>: reservas online, horarios y datos para pagos.']),
    ('Números y control', ['<b>Reportes → Estadísticas</b> y <b>Reportes generales</b> (PDF, Excel, CSV). <b>Finanzas</b>: quién debe, comisiones, metas y cierre de meses.',
                           '<b>Administración → Historial de cambios</b>: quién hizo qué y cuándo (no se puede borrar).']),
    ('Seguridad', ['Contraseñas personales, nunca compartidas. Bloqueo por inactividad en Configuración → Seguridad.',
                   'Copias de seguridad diarias cifradas: ver docs/COPIAS.md (necesita la clave guardada fuera de GitHub).']),
  ]),
}

def generar(clave, titulo, sub, secciones):
    ruta = os.path.join(OUT, f'guia-{clave}.pdf')
    c = canvas.Canvas(ruta, pagesize=A4)
    c.setTitle(f'DOVA - Guía rápida: {titulo}'); c.setAuthor('DentCareRC')
    c.setFillColor(TERRA); c.rect(0, H - 30 * mm, W, 30 * mm, stroke=0, fill=1)
    c.setFillColor(HexColor('#FFFFFF')); c.setFont('Helvetica-Bold', 22); c.drawString(16 * mm, H - 16 * mm, f'Guía rápida · {titulo}')
    c.setFont('Helvetica', 10.5); c.drawString(16 * mm, H - 23.5 * mm, f'DOVA · DentCareRC — {sub}')
    # Dos columnas de recuadros
    col_w = (W - 16 * mm * 2 - 8 * mm) / 2
    mitad = (len(secciones) + 1) // 2
    for ci, grupo in enumerate([secciones[:mitad], secciones[mitad:]]):
        x = 16 * mm + ci * (col_w + 8 * mm)
        story = []
        for i, (t, items) in enumerate(grupo):
            n = i + 1 + (mitad if ci else 0)
            story.append(Paragraph(f'{n}. {t}', st_tit))
            for it in items: story.append(Paragraph(it, st_item, bulletText='•'))
            story.append(Paragraph('&nbsp;', ParagraphStyle('s', fontSize=4, leading=6)))
        f = Frame(x, 22 * mm, col_w, H - 30 * mm - 30 * mm, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        f.addFromList([KeepInFrame(col_w, H - 60 * mm, story, mode='shrink')], c)
    c.setStrokeColor(LINEA); c.line(16 * mm, 16 * mm, W - 16 * mm, 16 * mm)
    c.setFillColor(SUAVE); c.setFont('Helvetica', 8)
    c.drawString(16 * mm, 11 * mm, '¿Dudas? Ctrl + K busca cualquier pantalla. Ayuda técnica: Administración → Ayuda técnica.')
    c.drawRightString(W - 16 * mm, 11 * mm, 'dova.onrender.com')
    c.save()
    return ruta

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for k, (t, s, sec) in GUIAS.items():
        print(generar(k, t, s, sec))
