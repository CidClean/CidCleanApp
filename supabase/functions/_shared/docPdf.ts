// Un solo estilo para los PDF que arma el servidor con pdf-lib (orden 70, D-293; muestra en
// surveys/resumen-pl-pdf-aprobado.html, panel 4), el mismo que app/src/lib/docPdf.ts: hoja blanca tamaño carta,
// Helvetica, logo y "Cid Clean LLC" a la izquierda, dirección, teléfono y cidclean.com a la derecha sobre una línea
// #0F766E, título y subtítulo, tablas con cifras a la derecha y fila de total, y pie "Generated {fecha} · Cid Clean LLC"
// con "Page n of m". Sin fondo crema ni tarjetas. Reemplaza el aspecto de pdfMarca.ts (D-250). Este archivo no
// contiene llaves.
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'npm:pdf-lib@1.17.1';

import { LOGO_PNG_BASE64 } from './logo.ts';

const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

export const C = {
  marca: hex('#0F766E'),
  texto: hex('#111111'),
  gris: hex('#555555'),
  suave: hex('#777777'),
  regla: hex('#999999'),
  linea: hex('#E5E5E5'),
  pie: hex('#CCCCCC'),
  blanco: rgb(1, 1, 1),
};

export type Fuentes = { regular: PDFFont; bold: PDFFont; extra: PDFFont };

export const ANCHO = 612;
export const ALTO = 792;
export const LADO = 40;
export const ARRIBA = 36;
/** Alto que ocupa el pie, desde el borde de abajo de la página. */
export const ALTO_PIE = 48;

export const DIRECCION = ['3727 Milano Lakes Cir', 'Naples, FL 34114', '(786) 250-1324 · cidclean.com'];

/** Helvetica no dibuja todo (WinAnsi): se quitan los caracteres que no puede, y el signo menos pasa a guion. */
export function limpio(s: string): string {
  return s.normalize('NFC').replace(/−/g, '-').replace(/[^\x20-\x7E -ÿ‘’“”–—•…€]/g, '');
}

/** Helvetica y Helvetica-Bold (D-293: tipografía de documento). */
export async function fuentesDoc(doc: PDFDocument): Promise<Fuentes> {
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { regular, bold, extra: bold };
}

export function logoDoc(doc: PDFDocument): Promise<PDFImage> {
  return doc.embedPng(LOGO_PNG_BASE64);
}

/** Hoja nueva tamaño carta; su drawText limpia el texto para Helvetica. */
export function hoja(doc: PDFDocument): PDFPage {
  const page = doc.addPage([ANCHO, ALTO]);
  const draw = page.drawText.bind(page);
  page.drawText = (t: string, o?: Parameters<PDFPage['drawText']>[1]) => draw(limpio(t), o);
  return page;
}

/** Encabezado: logo y "Cid Clean LLC" a la izquierda, la dirección a la derecha y la línea de marca. Devuelve la y libre. */
export function encabezado(page: PDFPage, f: Fuentes, logo: PDFImage): number {
  const top = ALTO - ARRIBA;
  const L = 22.5;
  page.drawImage(logo, { x: LADO, y: top - L, width: L, height: L });
  page.drawText('Cid Clean LLC', { x: LADO + L + 6, y: top - L / 2 - 4, size: 11.5, font: f.bold, color: C.marca });
  DIRECCION.forEach((s, i) => {
    page.drawText(s, { x: ANCHO - LADO - f.regular.widthOfTextAtSize(limpio(s), 7.5), y: top - 7.5 - i * 10, size: 7.5, font: f.regular, color: C.gris });
  });
  const yLinea = top - Math.max(L, 30) - 6;
  page.drawLine({ start: { x: LADO, y: yLinea }, end: { x: ANCHO - LADO, y: yLinea }, thickness: 1.5, color: C.marca });
  return yLinea - 14;
}

/** Título (12.75 pt) y subtítulo gris debajo del encabezado. Devuelve la y libre. */
export function titulo(page: PDFPage, f: Fuentes, y: number, t: string, sub?: string): number {
  page.drawText(t, { x: LADO, y: y - 12.75, size: 12.75, font: f.bold, color: C.texto });
  y -= 12.75 + 4;
  if (sub) {
    for (const l of partir(sub, f.regular, 7.5, ANCHO - 2 * LADO)) {
      page.drawText(l, { x: LADO, y: y - 7.5, size: 7.5, font: f.regular, color: C.gris });
      y -= 10;
    }
  }
  return y - 8;
}

const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 31, 2026", en la hora de Naples. */
export function fechaGenerado(d: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(d);
  const v = (k: string) => Number(p.find((x) => x.type === k)?.value);
  return `${MESES[v('month') - 1]} ${v('day')}, ${v('year')}`;
}

/** Pie de una hoja: línea fina, "Generated {fecha} · Cid Clean LLC" (más una referencia, D-200) y "Page n of m". */
export function pie(page: PDFPage, f: Fuentes, n: number, total: number, o: { generado?: Date; ref?: string } = {}) {
  const y = 26;
  page.drawLine({ start: { x: LADO, y: y + 10 }, end: { x: ANCHO - LADO, y: y + 10 }, thickness: 0.75, color: C.pie });
  const izq = `Generated ${fechaGenerado(o.generado)} · Cid Clean LLC${o.ref ? ` · ${o.ref}` : ''}`;
  page.drawText(izq, { x: LADO, y, size: 6.4, font: f.regular, color: C.suave });
  const der = `Page ${n} of ${total}`;
  page.drawText(der, { x: ANCHO - LADO - f.regular.widthOfTextAtSize(der, 6.4), y, size: 6.4, font: f.regular, color: C.suave });
}

/** El pie en todas las hojas del documento, cuando ya se sabe cuántas hay (`extra` = hojas que se suman después). */
export function pies(doc: PDFDocument, f: Fuentes, o: { generado?: Date; ref?: string; extra?: number } = {}) {
  const ps = doc.getPages();
  const total = ps.length + (o.extra ?? 0);
  ps.forEach((p, i) => pie(p, f, i + 1, total, o));
}

/** Recorta un texto con "…" para que quepa en `max`. */
export function recortar(s: string, size: number, font: PDFFont, max: number): string {
  let out = limpio(s);
  while (out.length > 1 && font.widthOfTextAtSize(out, size) > max) out = out.slice(0, -2) + '…';
  return out;
}

/** Parte un texto en líneas que caben en `ancho`. */
export function partir(texto: string, fuente: PDFFont, tam: number, ancho: number): string[] {
  const lineas: string[] = [];
  for (const parrafo of texto.split(/\r?\n/).map(limpio)) {
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

/**
 * Lienzo que fluye por hojas: cada hoja nueva lleva el encabezado; `espacio(h)` pasa de hoja si no cabe.
 * `tabla` dibuja una tabla de documento (encabezado en mayúsculas gris con regla, filas con línea fina, cifras a la
 * derecha y fila de total en negrita con regla arriba) y repite el encabezado de la tabla al pasar de hoja.
 */
export class Documento {
  page!: PDFPage;
  y = 0;
  readonly ancho = ANCHO - 2 * LADO;
  private constructor(readonly doc: PDFDocument, readonly f: Fuentes, readonly logo: PDFImage) {}

  static async crear(titleMeta: string): Promise<Documento> {
    const doc = await PDFDocument.create();
    doc.setTitle(limpio(titleMeta));
    doc.setAuthor('Cid Clean LLC');
    const d = new Documento(doc, await fuentesDoc(doc), await logoDoc(doc));
    d.nueva();
    return d;
  }

  nueva() {
    this.page = hoja(this.doc);
    this.y = encabezado(this.page, this.f, this.logo);
  }

  espacio(h: number) {
    if (this.y - h < ALTO_PIE + 8) this.nueva();
  }

  titulo(t: string, sub?: string) {
    this.y = titulo(this.page, this.f, this.y, t, sub);
  }

  /** Subtítulo de sección (9 pt, negrita). */
  seccion(t: string) {
    this.espacio(40);
    this.y -= 6;
    this.page.drawText(t, { x: LADO, y: this.y - 9, size: 9, font: this.f.bold, color: C.texto });
    this.y -= 9 + 5;
  }

  /** Párrafo con salto de línea y de hoja. */
  parrafo(t: string, o: { size?: number; color?: RGB; bold?: boolean; x?: number } = {}) {
    const size = o.size ?? 8.5;
    const x = o.x ?? LADO;
    const font = o.bold ? this.f.bold : this.f.regular;
    const lh = size * 1.38;
    for (const l of partir(t, font, size, ANCHO - LADO - x)) {
      this.espacio(lh);
      this.y -= lh;
      this.page.drawText(l, { x, y: this.y + (lh - size) / 2, size, font, color: o.color ?? C.texto });
    }
  }

  tabla(
    cols: { head: string; w: number; num?: boolean }[],
    rows: string[][],
    o: { total?: string[]; size?: number; boldFirst?: boolean } = {},
  ) {
    const size = o.size ?? 8.25;
    const lh = size * 1.3;
    const tot = cols.reduce((a, c) => a + c.w, 0);
    const ws = cols.map((c) => (c.w * this.ancho) / tot);
    const xs = ws.map((_, i) => LADO + ws.slice(0, i).reduce((a, b) => a + b, 0));
    const cabecera = () => {
      this.espacio(18 + lh * 2);
      cols.forEach((c, i) => {
        const h = limpio(c.head.toUpperCase());
        const w = this.f.bold.widthOfTextAtSize(h, 6.75);
        const x = c.num ? xs[i] + ws[i] - 2 - w : xs[i] + 2;
        this.page.drawText(recortar(h, 6.75, this.f.bold, ws[i] - 4), { x, y: this.y - 9, size: 6.75, font: this.f.bold, color: C.gris });
      });
      this.y -= 13;
      this.page.drawLine({ start: { x: LADO, y: this.y }, end: { x: ANCHO - LADO, y: this.y }, thickness: 0.75, color: C.regla });
    };
    const fila = (celdas: string[], total: boolean) => {
      const font = total ? this.f.bold : this.f.regular;
      const ls = celdas.map((t, i) => (cols[i].num ? [recortar(t, size, font, ws[i] - 4)] : partir(t || '', i === 0 && o.boldFirst ? this.f.bold : font, size, ws[i] - 4)));
      const h = Math.max(...ls.map((l) => l.length)) * lh + 6;
      if (this.y - h < ALTO_PIE + 8) {
        this.nueva();
        cabecera();
      }
      if (total) this.page.drawLine({ start: { x: LADO, y: this.y }, end: { x: ANCHO - LADO, y: this.y }, thickness: 0.75, color: C.texto });
      ls.forEach((lineas, i) =>
        lineas.forEach((l, j) => {
          const fnt = total || (i === 0 && o.boldFirst && j === 0) ? this.f.bold : this.f.regular;
          const x = cols[i].num ? xs[i] + ws[i] - 2 - fnt.widthOfTextAtSize(l, size) : xs[i] + 2;
          this.page.drawText(l, { x, y: this.y - 3 - (j + 1) * lh + (lh - size) / 2, size, font: fnt, color: C.texto });
        }),
      );
      this.y -= h;
      if (!total) this.page.drawLine({ start: { x: LADO, y: this.y }, end: { x: ANCHO - LADO, y: this.y }, thickness: 0.5, color: C.linea });
    };
    cabecera();
    for (const r of rows) fila(r, false);
    if (o.total) fila(o.total, true);
    this.y -= 8;
  }

  async guardar(o: { ref?: string; generado?: Date; extra?: number } = {}): Promise<Uint8Array> {
    pies(this.doc, this.f, o);
    return await this.doc.save();
  }
}
