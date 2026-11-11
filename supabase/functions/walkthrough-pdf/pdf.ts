// PDF del resumen del walkthrough (D-212) como documento de impresión (orden 70, D-293, _shared/docPdf.ts): hoja
// blanca carta, Helvetica, encabezado con el logo y la dirección sobre la línea #0F766E en cada hoja, título y
// subtítulo; Sitio y contacto, Áreas en tabla y Frecuencia; las fotos van en un anexo; pie con "Generated" y la
// página. Las notas internas NO salen (flujo: no salen al cliente).
import { PDFDocument, type PDFFont, type PDFPage, type RGB } from 'npm:pdf-lib@1.17.1';

import { direccionDe, type PartesDireccion } from '../_shared/address.ts';
import { ALTO_PIE, C, encabezado, fuentesDoc, hoja, LADO, logoDoc, partir as partirDoc, pies, titulo as tituloDoc } from '../_shared/docPdf.ts';

export type Fuente = {
  company: string;
  site_name: string | null;
  site_address: string;
  version: number;
  closed_at: string;
  pdf_path: string | null;
  data: {
    contact?: { address?: string; contactName?: string; phone?: string; email?: string; general?: string } & PartesDireccion;
    areas?: {
      name?: string;
      type?: string;
      size?: string | null;
      condition?: string | null;
      specialRequest?: string;
      notes?: string;
      photos?: { path: string; note?: string }[];
    }[];
    frequency?: { kind?: string; days?: number[]; other?: string };
  };
};

// Colores del documento (D-293).
const TEXTO = C.texto;
const GRIS = C.gris;
const LINEA = C.linea;

const ANCHO = 612;
const MARGEN = LADO;
const UTIL = ANCHO - MARGEN * 2;

const T = {
  es: {
    title: 'Resumen del walkthrough',
    version: (n: number) => `Versión ${n}`,
    site: 'Sitio y contacto',
    address: 'Dirección',
    contact: 'Persona de contacto',
    phone: 'Teléfono',
    email: 'Email',
    general: 'Datos generales del lugar',
    areas: 'Áreas',
    noAreas: 'Sin áreas.',
    cols: ['Área', 'Tamaño', 'Condición', 'Pedido especial', 'Notas', 'Fotos'],
    frequency: 'Frecuencia',
    daily: 'Diaria',
    weekly: 'Semanal',
    other: 'Otra',
    times: (n: number) => (n === 1 ? '1 vez por semana' : `${n} veces por semana`),
    days: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
    annex: 'Anexo: fotos',
    noPhotos: 'Sin fotos.',
    unsupported: 'Foto en un formato que el PDF no muestra.',
    types: {
      bathroom: 'Baño', office: 'Oficina', lobby: 'Lobby', kitchen: 'Cocina', conference: 'Sala de juntas',
      hallway: 'Pasillo', reception: 'Recepción', stairs: 'Escaleras', storage: 'Almacén', other: 'Otro',
    } as Record<string, string>,
    conditions: { good: 'Buena', fair: 'Regular', poor: 'Mala' } as Record<string, string>,
    sizes: { small: 'Pequeña', medium: 'Mediana', big: 'Grande' } as Record<string, string>, // D-217
    months: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
    date: (d: number, m: string, y: number) => `${d} ${m} ${y}`,
  },
  en: {
    title: 'Walkthrough summary',
    version: (n: number) => `Version ${n}`,
    site: 'Site and contact',
    address: 'Address',
    contact: 'Contact person',
    phone: 'Phone',
    email: 'Email',
    general: 'General site details',
    areas: 'Areas',
    noAreas: 'No areas.',
    cols: ['Area', 'Size', 'Condition', 'Special request', 'Notes', 'Photos'],
    frequency: 'Frequency',
    daily: 'Daily',
    weekly: 'Weekly',
    other: 'Other',
    times: (n: number) => (n === 1 ? 'Once a week' : `${n} times a week`),
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    annex: 'Appendix: photos',
    noPhotos: 'No photos.',
    unsupported: "Photo in a format the PDF can't show.",
    types: {
      bathroom: 'Bathroom', office: 'Office', lobby: 'Lobby', kitchen: 'Kitchen', conference: 'Conference room',
      hallway: 'Hallway', reception: 'Reception', stairs: 'Stairs', storage: 'Storage room', other: 'Other',
    } as Record<string, string>,
    conditions: { good: 'Good', fair: 'Fair', poor: 'Poor' } as Record<string, string>,
    sizes: { small: 'Small', medium: 'Medium', big: 'Big' } as Record<string, string>, // D-217
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    date: (d: number, m: string, y: number) => `${m} ${d}, ${y}`,
  },
};

const partir = partirDoc;

/** Recuadro de línea fina, sin fondo. */
function recuadro(page: PDFPage, x: number, yTop: number, w: number, h: number, borde: RGB = LINEA) {
  page.drawRectangle({ x, y: yTop - h, width: w, height: h, borderColor: borde, borderWidth: 0.75 });
}

export async function armarPdf(
  f: Fuente,
  idioma: 'es' | 'en',
  bajarFoto: (path: string) => Promise<Uint8Array | null>,
): Promise<Uint8Array> {
  const t = T[idioma];
  const doc = await PDFDocument.create();
  const fuentes = await fuentesDoc(doc);
  const logo = await logoDoc(doc);
  const fReg = fuentes.regular;
  const fMed = fuentes.bold;
  doc.setTitle(`${t.title} · ${f.company}`);
  doc.setAuthor('Cid Clean');

  const sitio = f.site_name && f.site_name.trim() ? f.site_name : f.site_address;
  const fecha = new Date(f.closed_at);
  const fechaTexto = t.date(fecha.getUTCDate(), t.months[fecha.getUTCMonth()], fecha.getUTCFullYear());

  let page = hoja(doc);
  let y = encabezado(page, fuentes, logo);

  const nuevaPagina = () => {
    page = hoja(doc);
    y = encabezado(page, fuentes, logo);
  };
  const espacio = (alto: number) => {
    if (y - alto < ALTO_PIE + 8) nuevaPagina();
  };
  const texto = (s: string, x: number, tam: number, fuente: PDFFont, color = TEXTO) => {
    page.drawText(s, { x, y: y - tam, size: tam, font: fuente, color });
  };

  // Título y subtítulo bajo el encabezado.
  y = tituloDoc(page, fuentes, y, t.title, `${f.company} · ${sitio} · ${t.version(f.version)} · ${fechaTexto}`);

  const titulo = (s: string) => {
    espacio(40);
    texto(s, MARGEN, 10, fMed);
    y -= 16;
  };

  // Sitio y contacto: filas de etiqueta gris y valor.
  const c = f.data.contact ?? {};
  titulo(t.site);
  const filas: [string, string | undefined][] = [
    [t.address, direccionDe(c) || f.site_address], // D-301
    [t.contact, c.contactName],
    [t.phone, c.phone],
    [t.email, c.email],
    [t.general, c.general],
  ];
  for (const [etiqueta, valor] of filas) {
    const lineas = partir(valor && valor.trim() ? valor : '—', fReg, 10.5, UTIL);
    espacio(14 + lineas.length * 15 + 8);
    texto(etiqueta, MARGEN, 9, fReg, GRIS);
    y -= 13;
    for (const l of lineas) {
      texto(l, MARGEN, 10.5, fReg);
      y -= 15;
    }
    y -= 4;
    page.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 0.5, color: LINEA });
    y -= 10;
  }
  y -= 8;

  // Áreas en tabla.
  const areas = f.data.areas ?? [];
  titulo(t.areas);
  if (areas.length === 0) {
    texto(t.noAreas, MARGEN, 10.5, fReg, GRIS);
    y -= 22;
  } else {
    const anchos = [118, 56, 62, 108, 128, 44].map((w) => (w * UTIL) / 516); // proporciones de siempre sobre UTIL
    const xs = anchos.map((_, i) => MARGEN + anchos.slice(0, i).reduce((a, b) => a + b, 0));
    const encabezado = () => {
      espacio(26);
      t.cols.forEach((col, i) => page.drawText(col.toUpperCase(), { x: xs[i] + 6, y: y - 12, size: 7, font: fMed, color: GRIS }));
      y -= 17;
      page.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 0.75, color: C.regla });
      y -= 2;
    };
    encabezado();
    for (const a of areas) {
      const celdas = [
        `${a.name ?? ''}\n${t.types[a.type ?? ''] ?? ''}`,
        // D-217: tamaño cualitativo; un texto en ft² anterior a D-217 no se muestra.
        a.size ? t.sizes[a.size] ?? '—' : '—',
        a.condition ? t.conditions[a.condition] ?? '—' : '—',
        a.specialRequest?.trim() || '—',
        a.notes?.trim() || '—',
        String(a.photos?.length ?? 0),
      ].map((v, i) => partir(v, fReg, 9.5, anchos[i] - 12));
      const alto = Math.max(...celdas.map((l) => l.length)) * 13 + 10;
      if (y - alto < ALTO_PIE + 8) {
        nuevaPagina();
        encabezado();
      }
      celdas.forEach((lineas, i) =>
        lineas.forEach((l, j) =>
          page.drawText(l, {
            x: xs[i] + 6,
            y: y - 12 - j * 13,
            size: 9.5,
            font: i === 0 && j === 0 ? fMed : fReg,
            color: i === 0 && j > 0 ? GRIS : TEXTO,
          }),
        ),
      );
      y -= alto;
      page.drawLine({ start: { x: MARGEN, y: y + 2 }, end: { x: ANCHO - MARGEN, y: y + 2 }, thickness: 0.5, color: LINEA });
    }
    y -= 16;
  }

  // Frecuencia.
  const fr = f.data.frequency ?? {};
  titulo(t.frequency);
  let linea = '—';
  if (fr.kind === 'daily') linea = `${t.daily} · ${t.times(7)}`;
  else if (fr.kind === 'weekly') {
    const dias = (fr.days ?? []).map((d) => t.days[d]).filter(Boolean);
    linea = dias.length ? `${t.weekly}: ${dias.join(', ')} · ${t.times(dias.length)}` : t.weekly;
  } else if (fr.kind === 'other') linea = `${t.other}: ${fr.other?.trim() || '—'}`;
  for (const l of partir(linea, fReg, 10.5, UTIL)) {
    espacio(16);
    texto(l, MARGEN, 10.5, fReg);
    y -= 15;
  }

  // Anexo: fotos, dos por fila con su nota debajo.
  nuevaPagina();
  texto(t.annex, MARGEN, 12.75, fMed);
  y -= 24;
  const conFotos = areas.filter((a) => (a.photos ?? []).length > 0);
  if (conFotos.length === 0) {
    texto(t.noPhotos, MARGEN, 10.5, fReg, GRIS);
  }
  const col = (UTIL - 12) / 2;
  const maxAlto = 180;
  for (const a of conFotos) {
    espacio(40);
    texto(a.name ?? '', MARGEN, 10, fMed);
    y -= 16;
    const fotos = a.photos ?? [];
    for (let i = 0; i < fotos.length; i += 2) {
      const par = await Promise.all(
        fotos.slice(i, i + 2).map(async (p) => {
          const bytes = await bajarFoto(p.path);
          let img = null;
          try {
            if (bytes && /\.png$/i.test(p.path)) img = await doc.embedPng(bytes);
            else if (bytes && /\.jpe?g$/i.test(p.path)) img = await doc.embedJpg(bytes);
          } catch {
            img = null;
          }
          const dims = img ? img.scaleToFit(col, maxAlto) : { width: col, height: 40 };
          const nota = partir(p.note?.trim() || '', fReg, 9, col);
          return { img, dims, nota };
        }),
      );
      const alto = Math.max(...par.map((p) => p.dims.height + (p.nota[0] ? p.nota.length * 12 + 6 : 0))) + 14;
      espacio(alto);
      par.forEach((p, k) => {
        const x = MARGEN + k * (col + 12);
        if (p.img) page.drawImage(p.img, { x, y: y - p.dims.height, width: p.dims.width, height: p.dims.height });
        else {
          recuadro(page, x, y, col, 40);
          page.drawText(t.unsupported, { x: x + 10, y: y - 24, size: 9, font: fReg, color: GRIS });
        }
        p.nota.forEach((l, j) => {
          if (l) page.drawText(l, { x, y: y - p.dims.height - 14 - j * 12, size: 9, font: fReg, color: GRIS });
        });
      });
      y -= alto;
    }
    y -= 8;
  }

  // Pie de documento en todas, con "Page n of m" (D-293).
  pies(doc, fuentes, { ref: `Walkthrough v${f.version}` }); // D-200: la referencia va en el pie

  return await doc.save();
}
