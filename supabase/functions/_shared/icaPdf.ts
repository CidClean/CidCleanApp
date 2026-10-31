// PDF del ICA (orden 65, D-285): texto exacto de la plantilla 1.0 (legal/ica-1.0.ts) con el encabezado y el pie de la
// marca (pdfMarca.ts, D-250) en cada hoja. Sin firmar (el que se envía), o con las firmas escritas en Times Italic
// (como el W-9 y el contrato del cliente, D-268) y la hoja de certificado al final (agregarCertificadoContrato).
// Este archivo no contiene llaves.
import { PDFDocument, StandardFonts } from 'npm:pdf-lib@1.17.1';

import * as m from './pdfMarca.ts';
import { rellenar } from './contrato.ts';
import { fechaCorta } from './contratoCorreos.ts';
import { ANCHO_TXT, filaTabla, LIMITE, limpio, lineas, type Lienzo } from './contratoPdf.ts';
import type { CamposIca, FirmasIca } from './ica.ts';
import { PLANTILLA_ICA } from './legal/ica-1.0.ts';

function firmas(l: Lienzo, campos: CamposIca, f: FirmasIca, firmado: boolean) {
  const col = ANCHO_TXT / 2 - 10;
  if (l.y - 150 < LIMITE) l.nueva();
  const top = l.y - 10;
  const lado = (x: number, titulo: string, nombre: string | null, at: Date | null, filas: [string, string][]) => {
    let y = top - 12;
    l.page.drawText(titulo, { x, y, size: 10, font: l.f.extra, color: m.C.texto });
    y -= 40;
    if (nombre) l.page.drawText(limpio(nombre), { x: x + 62, y: y + 4, size: 16, font: l.firma, color: m.C.texto });
    l.page.drawText('Signature:', { x, y, size: 9, font: l.f.bold, color: m.C.gris });
    l.page.drawLine({ start: { x: x + 58, y: y - 2 }, end: { x: x + col, y: y - 2 }, thickness: 0.6, color: m.C.texto });
    for (const [k, v] of [['Name:', nombre ?? ''], ...filas, ['Date:', at ? fechaCorta(at) : '']] as [string, string][]) {
      y -= 18;
      const w = k.length > 8 ? 112 : 58;
      l.page.drawText(k, { x, y, size: 9, font: l.f.bold, color: m.C.gris });
      l.page.drawText(limpio(v || '____________'), { x: x + w, y, size: 9, font: l.f.regular, color: m.C.texto });
    }
  };
  const negocio = (campos.business_name ?? '').trim() || (firmado ? '—' : '');
  lado(m.LADO, 'CID CLEAN LLC', f.cidClean?.name ?? null, f.cidClean?.at ?? null, [['Title:', f.cidClean?.title ?? (campos.cc_title || 'Managing Member')]]);
  lado(m.LADO + col + 20, 'CONTRACTOR', f.contratista?.name ?? null, f.contratista?.at ?? null, [['Business name (if any):', negocio]]);
  l.y = top - 12 - 40 - 3 * 18 - 16;
}

/** Arma el ICA. `firmas` vacío = sin firmar. */
export async function pdfIca(o: { campos: CamposIca; ica: string; firmas?: FirmasIca; conCertificado?: boolean }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Independent Contractor Agreement ${o.ica} · ${o.campos.contractor_name ?? ''}`);
  doc.setAuthor('Cid Clean LLC');
  const f = await m.fuentesMarca(doc);
  const logo = await m.logoMarca(doc);
  const firma = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const l = {} as Lienzo;
  Object.assign(l, {
    doc, f, firma,
    nueva: () => {
      l.page = doc.addPage([m.ANCHO, m.ALTO]);
      l.y = m.encabezado(l.page, f, logo, { etiqueta: 'Agreement', valor: o.ica });
    },
  });
  l.nueva();
  const c = o.campos;
  const firmado = !!(o.firmas?.contratista || o.firmas?.cidClean);
  for (const b of PLANTILLA_ICA) {
    switch (b.t) {
      case 'title': lineas(l, b.text, f.extra, 16, m.LADO, ANCHO_TXT); l.y -= 4; break;
      case 'meta': lineas(l, rellenar(b.text, c), f.regular, 8.5, m.LADO, ANCHO_TXT, m.C.gris); break;
      case 'p': l.y -= 6; lineas(l, rellenar(b.text, c), f.regular, 9.5, m.LADO, ANCHO_TXT); break;
      case 'small': l.y -= 10; lineas(l, rellenar(b.text, c), f.regular, 8, m.LADO, ANCHO_TXT, m.C.gris); break;
      case 'h2':
        if (l.y - 50 < LIMITE) l.nueva();
        l.y -= 12; lineas(l, b.text, f.bold, 11, m.LADO, ANCHO_TXT, m.C.marca); break;
      case 'bullet': case 'num': {
        l.y -= 3;
        if (l.y - 13 < LIMITE) l.nueva();
        const marca = b.t === 'num' ? b.n : '•';
        l.page.drawText(marca, { x: m.LADO + 3, y: l.y - 10, size: 9.5, font: f.regular, color: m.C.marca });
        lineas(l, rellenar(b.text, c), f.regular, 9.5, m.LADO + 16, ANCHO_TXT - 16);
        break;
      }
      case 'table3': {
        l.y -= 4;
        const w = [ANCHO_TXT - 260, 100, 160];
        filaTabla(l, b.head.map((t, i) => ({ text: t, w: w[i], bold: true })));
        for (const r of b.rows) filaTabla(l, r.map((t, i) => ({ text: rellenar(t, c), w: w[i] })));
        break;
      }
      case 'signatures': firmas(l, c, o.firmas ?? {}, firmado); break;
    }
  }
  const total = doc.getPageCount() + (o.conCertificado ? 1 : 0);
  doc.getPages().forEach((p, i) => m.pie(p, f, `Page ${i + 1} of ${total}`));
  return await doc.save();
}
