// Encabezado y pie con la marca para los PDFs que arma el servidor (orden 33, D-248, D-250; copia de
// surveys/marca-aprobado/quote-pdf.html): logo y "Cid Clean LLC" arriba, franja de degradado de marca y pie con los
// datos de contacto. Medidas del HTML aprobado pasadas a puntos (1 px = 0.75 pt). Este archivo no contiene llaves.
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';

import { LOGO_PNG_BASE64 } from './logo.ts';

const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

export const C = {
  marca: hex('#0F766E'),
  texto: hex('#1E2A28'),
  gris: hex('#6B5F52'),
  ambar: hex('#8A4B0F'),
  crema: hex('#FBF6EF'),
  linea: hex('#EFE5D8'),
  suave: hex('#DDEFEC'),
  blanco: rgb(1, 1, 1),
};

export type Fuentes = { regular: PDFFont; bold: PDFFont; extra: PDFFont };

const MANROPE = 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/manrope@0.4.2';
const URLS = [
  `${MANROPE}/400Regular/Manrope_400Regular.ttf`,
  `${MANROPE}/700Bold/Manrope_700Bold.ttf`,
  `${MANROPE}/800ExtraBold/Manrope_800ExtraBold.ttf`,
];

/** Manrope 400, 700 y 800; si no hay red, Helvetica. */
export async function fuentesMarca(doc: PDFDocument): Promise<Fuentes> {
  doc.registerFontkit(fontkit);
  try {
    const bytes = await Promise.all(
      URLS.map(async (u) => {
        const r = await fetch(u);
        if (!r.ok) throw new Error(u);
        return new Uint8Array(await r.arrayBuffer());
      }),
    );
    const [regular, bold, extra] = await Promise.all(bytes.map((b) => doc.embedFont(b, { subset: true })));
    return { regular, bold, extra };
  } catch {
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    return { regular, bold, extra: bold };
  }
}

export function logoMarca(doc: PDFDocument): Promise<PDFImage> {
  return doc.embedPng(LOGO_PNG_BASE64);
}

/** Rectángulo con esquinas redondeadas; `yTop` es el borde de arriba. */
export function caja(page: PDFPage, x: number, yTop: number, w: number, h: number, r: number, color: RGB) {
  const k = Math.min(r, w / 2, h / 2);
  const path =
    `M ${k} 0 H ${w - k} A ${k} ${k} 0 0 1 ${w} ${k} V ${h - k} A ${k} ${k} 0 0 1 ${w - k} ${h} ` +
    `H ${k} A ${k} ${k} 0 0 1 0 ${h - k} V ${k} A ${k} ${k} 0 0 1 ${k} 0 Z`;
  page.drawSvgPath(path, { x, y: yTop, color });
}

const mezcla = (a: RGB, b: RGB, t: number) => rgb(a.red + (b.red - a.red) * t, a.green + (b.green - a.green) * t, a.blue + (b.blue - a.blue) * t);

/** Franja de degradado #0F766E → #2FB8AE (60 %) → #BFE9E4, aproximada con rectángulos (pdf-lib no tiene degradados). */
export function franja(page: PDFPage, x: number, yTop: number, w: number, h = 4.5) {
  const a = hex('#0F766E');
  const b = hex('#2FB8AE');
  const c = hex('#BFE9E4');
  const n = 60;
  const paso = w / n;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const color = t < 0.6 ? mezcla(a, b, t / 0.6) : mezcla(b, c, (t - 0.6) / 0.4);
    const xi = x + i * paso;
    // Extremos redondeados como el border-radius de la muestra.
    if (i === 0 || i === n - 1) caja(page, xi, yTop, paso + 0.4, h, h / 2, color);
    else page.drawRectangle({ x: xi, y: yTop - h, width: paso + 0.4, height: h, color });
  }
}

export const ANCHO = 612;
export const ALTO = 792;
export const LADO = 34.5; // 46 px
export const ARRIBA = 30; // 40 px

/**
 * Encabezado: logo de 43.5 pt (58 px) con "Cid Clean LLC" y "Commercial cleaning · Naples, FL"; a la derecha una
 * etiqueta en ámbar y su valor grande (por ejemplo "QUOTE" y "1.1"); debajo la franja. Devuelve la y libre debajo.
 */
export function encabezado(
  page: PDFPage,
  f: Fuentes,
  logo: PDFImage,
  derecha?: { etiqueta: string; valor: string },
): number {
  const top = ALTO - ARRIBA;
  const L = 43.5;
  page.drawImage(logo, { x: LADO, y: top - L, width: L, height: L });
  page.drawText('Cid Clean LLC', { x: LADO + L + 9, y: top - L / 2 + 1, size: 16.5, font: f.extra, color: C.marca });
  page.drawText('Commercial cleaning · Naples, FL', { x: LADO + L + 9, y: top - L / 2 - 11, size: 8.25, font: f.regular, color: C.gris });
  if (derecha) {
    const et = derecha.etiqueta.toUpperCase();
    const wEt = f.extra.widthOfTextAtSize(et, 7.5) + et.length * 0.75;
    let x = ANCHO - LADO - wEt;
    for (const ch of et) {
      page.drawText(ch, { x, y: top - 9, size: 7.5, font: f.extra, color: C.ambar });
      x += f.extra.widthOfTextAtSize(ch, 7.5) + 0.75; // letter-spacing .1em
    }
    const v = derecha.valor;
    page.drawText(v, { x: ANCHO - LADO - f.extra.widthOfTextAtSize(v, 18), y: top - 28, size: 18, font: f.extra, color: C.texto });
  }
  const yBanda = top - L - 16.5;
  franja(page, LADO, yBanda, ANCHO - 2 * LADO);
  return yBanda - 4.5 - 13.5;
}

/** Alto que ocupa el pie, desde el borde de abajo de la página. */
export const ALTO_PIE = 72;

/** Pie: línea fina y los datos de contacto (D-249) a la izquierda; `derecha` (por ejemplo "Page 1 of 1") a la derecha. */
export function pie(page: PDFPage, f: Fuentes, derecha: string) {
  const yLinea = 25.5 + 3 * 11.25 + 10.5;
  page.drawLine({ start: { x: LADO, y: yLinea }, end: { x: ANCHO - LADO, y: yLinea }, thickness: 0.75, color: C.linea });
  const s = 7.5;
  let y = yLinea - 10.5 - s;
  const b = 'Cid Clean LLC';
  page.drawText(b, { x: LADO, y, size: s, font: f.extra, color: C.texto });
  page.drawText(' · cidclean.com', { x: LADO + f.extra.widthOfTextAtSize(b, s), y, size: s, font: f.regular, color: C.gris });
  page.drawText(derecha, { x: ANCHO - LADO - f.regular.widthOfTextAtSize(derecha, s), y, size: s, font: f.regular, color: C.gris });
  y -= 11.25;
  page.drawText('(786) 250-1324 · humbertovp@cidclean.com', { x: LADO, y, size: s, font: f.regular, color: C.gris });
  y -= 11.25;
  page.drawText('Instagram · Facebook · TikTok · LinkedIn', { x: LADO, y, size: s, font: f.regular, color: C.gris });
}

/** Recorta un texto con "…" para que quepa en `max`. */
export function recortar(s: string, size: number, font: PDFFont, max: number): string {
  let out = s;
  while (out.length > 1 && font.widthOfTextAtSize(out, size) > max) out = out.slice(0, -2) + '…';
  return out;
}

/** Parte un texto en líneas que caben en `ancho`. */
export function partir(texto: string, fuente: PDFFont, tam: number, ancho: number): string[] {
  const lineas: string[] = [];
  for (const parrafo of texto.split(/\r?\n/)) {
    let actual = '';
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (fuente.widthOfTextAtSize(prueba, tam) <= ancho) actual = prueba;
      else {
        if (actual) lineas.push(actual);
        actual = palabra;
      }
    }
    lineas.push(actual);
  }
  return lineas.length ? lineas : [''];
}
