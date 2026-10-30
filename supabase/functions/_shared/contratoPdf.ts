// PDF del contrato del cliente (orden 62, D-283): Scope of Work + Commercial Service Agreement con el texto exacto de
// la plantilla 1.0 (legal/csa-sow-1.0.ts), con el encabezado y el pie de la marca (pdfMarca.ts, D-250) en cada hoja.
// Sin firmar (el que se envía), o con las firmas escritas en Times Italic (como el W-9, D-268) y la hoja de certificado
// al final. Este archivo no contiene llaves.
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1';

import * as m from './pdfMarca.ts';
import { rellenar, type Campos, type Firmas } from './contrato.ts';
import { fechaCorta } from './contratoCorreos.ts';
import { PLANTILLA } from './legal/csa-sow-1.0.ts';

/** Las fuentes estándar (WinAnsi) no dibujan todo: se quitan los caracteres que no pueden (como en w9.ts). */
function limpio(s: string): string {
  return s.normalize('NFC').replace(/[^\x20-\x7E -ÿ‘’“”–—•…]/g, '');
}

type Lienzo = { doc: PDFDocument; page: PDFPage; y: number; f: m.Fuentes; firma: PDFFont; nueva: () => void };

const ANCHO_TXT = m.ANCHO - 2 * m.LADO;
const LIMITE = m.ALTO_PIE + 12;

function lineas(l: Lienzo, texto: string, font: PDFFont, size: number, x: number, ancho: number, color = m.C.texto, lh = size * 1.38) {
  for (const linea of m.partir(limpio(texto), font, size, ancho)) {
    if (l.y - lh < LIMITE) l.nueva();
    l.y -= lh;
    l.page.drawText(linea, { x, y: l.y + (lh - size) / 2, size, font, color });
  }
}

function alto(texto: string, font: PDFFont, size: number, ancho: number, lh = size * 1.38): number {
  return m.partir(limpio(texto), font, size, ancho).length * lh;
}

function filaTabla(l: Lienzo, celdas: { text: string; w: number; bold?: boolean }[], size = 9) {
  const lh = size * 1.38;
  const h = Math.max(...celdas.map((c) => alto(c.text, c.bold ? l.f.bold : l.f.regular, size, c.w - 8, lh))) + 8;
  if (l.y - h < LIMITE) l.nueva();
  const top = l.y;
  let x = m.LADO;
  for (const c of celdas) {
    const font = c.bold ? l.f.bold : l.f.regular;
    let y = top - 4;
    for (const linea of m.partir(limpio(c.text), font, size, c.w - 8)) {
      y -= lh;
      l.page.drawText(linea, { x: x + 4, y: y + (lh - size) / 2, size, font, color: c.bold ? m.C.gris : m.C.texto });
    }
    x += c.w;
  }
  l.y = top - h;
  l.page.drawLine({ start: { x: m.LADO, y: l.y }, end: { x: m.ANCHO - m.LADO, y: l.y }, thickness: 0.5, color: m.C.linea });
}

function firmas(l: Lienzo, campos: Campos, f: Firmas) {
  const col = ANCHO_TXT / 2 - 10;
  const necesita = 150;
  if (l.y - necesita < LIMITE) l.nueva();
  const top = l.y - 10;
  const lado = (x: number, titulo: string, s: { name: string; title: string; at: Date } | null | undefined, title: string) => {
    let y = top - 12;
    l.page.drawText(limpio(titulo), { x, y, size: 10, font: l.f.extra, color: m.C.texto });
    y -= 40;
    if (s) l.page.drawText(limpio(s.name), { x: x + 62, y: y + 4, size: 16, font: l.firma, color: m.C.texto });
    l.page.drawText('Signature:', { x, y, size: 9, font: l.f.bold, color: m.C.gris });
    l.page.drawLine({ start: { x: x + 58, y: y - 2 }, end: { x: x + col, y: y - 2 }, thickness: 0.6, color: m.C.texto });
    for (const [k, v] of [['Name:', s?.name ?? ''], ['Title:', s ? s.title : title], ['Date:', s ? fechaCorta(s.at) : '']] as const) {
      y -= 18;
      l.page.drawText(k, { x, y, size: 9, font: l.f.bold, color: m.C.gris });
      l.page.drawText(limpio(v || '____________'), { x: x + 58, y, size: 9, font: l.f.regular, color: m.C.texto });
    }
  };
  lado(m.LADO, 'CID CLEAN LLC', f.cidClean, campos.cc_title || 'Managing Member');
  lado(m.LADO + col + 20, (campos.client_legal_name || '').toUpperCase(), f.cliente, '');
  l.y = top - 12 - 40 - 3 * 18 - 16;
}

/** Arma el contrato. `firmas` vacío = sin firmar. */
export async function pdfContrato(o: { campos: Campos; csa: string; firmas?: Firmas; conCertificado?: boolean }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Commercial Service Agreement ${o.csa} · ${o.campos.client_legal_name ?? ''}`);
  doc.setAuthor('Cid Clean LLC');
  const f = await m.fuentesMarca(doc);
  const logo = await m.logoMarca(doc);
  const firma = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const l = {} as Lienzo;
  Object.assign(l, {
    doc, f, firma,
    nueva: () => {
      l.page = doc.addPage([m.ANCHO, m.ALTO]);
      l.y = m.encabezado(l.page, f, logo, { etiqueta: 'Agreement', valor: o.csa });
    },
  });
  l.nueva();
  const c = o.campos;
  for (const b of PLANTILLA) {
    switch (b.t) {
      case 'title': lineas(l, b.text, f.extra, 16, m.LADO, ANCHO_TXT); l.y -= 4; break;
      case 'meta': lineas(l, rellenar(b.text, c), f.regular, 8.5, m.LADO, ANCHO_TXT, m.C.gris); break;
      case 'p': l.y -= 6; lineas(l, rellenar(b.text, c), f.regular, 9.5, m.LADO, ANCHO_TXT); break;
      case 'small': l.y -= 10; lineas(l, rellenar(b.text, c), f.regular, 8, m.LADO, ANCHO_TXT, m.C.gris); break;
      case 'h1':
        if (l.y - 60 < LIMITE) l.nueva();
        l.y -= 14; lineas(l, b.text, f.extra, 14, m.LADO, ANCHO_TXT, m.C.marca); break;
      case 'h2':
        if (l.y - 50 < LIMITE) l.nueva();
        l.y -= 10; lineas(l, b.text, f.bold, 10.5, m.LADO, ANCHO_TXT); break;
      case 'bullet': {
        l.y -= 3;
        if (l.y - 13 < LIMITE) l.nueva();
        l.page.drawText('•', { x: m.LADO + 3, y: l.y - 10, size: 9.5, font: f.regular, color: m.C.marca });
        lineas(l, rellenar(b.text, c), f.regular, 9.5, m.LADO + 14, ANCHO_TXT - 14);
        break;
      }
      case 'table2':
        l.y -= 4;
        for (const [k, v] of b.rows) filaTabla(l, [{ text: k, w: 150, bold: true }, { text: rellenar(v, c), w: ANCHO_TXT - 150 }]);
        break;
      case 'table3': {
        l.y -= 4;
        const w = [120, ANCHO_TXT - 210, 90];
        filaTabla(l, b.head.map((t, i) => ({ text: t, w: w[i], bold: true })));
        for (const r of b.rows) filaTabla(l, r.map((t, i) => ({ text: rellenar(t, c), w: w[i] })));
        break;
      }
      case 'check': {
        l.y -= 8;
        if (l.y - 14 < LIMITE) l.nueva();
        const y = l.y - 11;
        l.page.drawRectangle({ x: m.LADO, y, width: 9, height: 9, borderColor: m.C.texto, borderWidth: 0.8 });
        if ((c.a9_name ?? '').trim()) {
          l.page.drawLine({ start: { x: m.LADO + 1.8, y: y + 4.5 }, end: { x: m.LADO + 3.8, y: y + 2 }, thickness: 1.1, color: m.C.marca });
          l.page.drawLine({ start: { x: m.LADO + 3.8, y: y + 2 }, end: { x: m.LADO + 7.5, y: y + 7.5 }, thickness: 1.1, color: m.C.marca });
        }
        lineas(l, rellenar(b.text, c), f.regular, 9.5, m.LADO + 16, ANCHO_TXT - 16);
        break;
      }
      case 'signatures': firmas(l, c, o.firmas ?? {}); break;
      case 'break': l.nueva(); break;
    }
  }
  // El pie con "Page X of N" cuando ya se sabe cuántas hojas hay (la hoja del certificado se suma después).
  const total = doc.getPageCount() + (o.conCertificado ? 1 : 0);
  doc.getPages().forEach((p, i) => m.pie(p, f, `Page ${i + 1} of ${total}`));
  return await doc.save();
}

/** Hoja de certificado como última página (D-283; como el W-9, D-268 (4)). El PDF se armó con `conCertificado`. */
export async function agregarCertificadoContrato(pdf: Uint8Array, csa: string, filas: [string, string][], nota: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf);
  const f = await m.fuentesMarca(doc);
  const logo = await m.logoMarca(doc);
  const page = doc.addPage([m.ANCHO, m.ALTO]);
  let y = m.encabezado(page, f, logo, { etiqueta: 'Agreement', valor: 'Certificate' });
  page.drawText('Electronic signature certificate', { x: m.LADO, y: y - 18, size: 18, font: f.extra, color: m.C.texto });
  page.drawText(limpio(csa), { x: m.LADO, y: y - 32, size: 9, font: f.regular, color: m.C.gris });
  y -= 52;
  const etiqueta = 150;
  for (const [k, v] of filas) {
    const ls = m.partir(limpio(v), f.regular, 8.5, ANCHO_TXT - etiqueta);
    page.drawText(limpio(k), { x: m.LADO, y, size: 8.5, font: f.bold, color: m.C.gris });
    for (const [i, t] of ls.entries()) page.drawText(t, { x: m.LADO + etiqueta, y: y - i * 11, size: 8.5, font: f.regular, color: m.C.texto });
    y -= ls.length * 11 + 6;
    page.drawLine({ start: { x: m.LADO, y: y + 3 }, end: { x: m.ANCHO - m.LADO, y: y + 3 }, thickness: 0.5, color: m.C.linea });
    y -= 5;
  }
  y -= 4;
  for (const t of m.partir(limpio(nota), f.regular, 8.5, ANCHO_TXT)) {
    page.drawText(t, { x: m.LADO, y, size: 8.5, font: f.regular, color: m.C.ambar });
    y -= 12;
  }
  m.pie(page, f, `Page ${doc.getPageCount()} of ${doc.getPageCount()}`);
  return await doc.save();
}

export const NOTA_CERTIFICADO_CONTRATO =
  'This certificate records how each party signed this Commercial Service Agreement and Scope of Work electronically. A free paper copy is available on request at info@cidclean.com.';
