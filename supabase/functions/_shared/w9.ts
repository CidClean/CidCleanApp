// W-9 prellenado del 1099 (D-255, D-256, D-257, D-258): validación del número, correos en inglés (D-247) con el marco
// de correo.ts (D-250) y el llenado del formulario oficial del IRS (Form W-9, Rev. March 2024) con pdf-lib.
// Seguridad: el SSN/ITIN/EIN solo pasa por fillW9 en memoria; nada de este archivo lo guarda, lo registra ni lo
// devuelve. Este archivo no contiene llaves.
import { degrees, PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';

import { boton, codigoGrande, correoHtml, esc, nota, parrafo, pieTexto, titulo } from './correo.ts';
import { FW9_PDF_BASE64 } from './irs/fw9.ts';

export const FORM_VERSION = 'Form W-9 (Rev. March 2024)';
/** "Requester's name and address" fijo (D-256, D-258). */
export const REQUESTER = ['Cid Clean LLC', '3727 Milano Lakes Cir', 'Naples FL 34114'];

export type TinType = 'ssn' | 'itin' | 'ein';
export type Classification = 'individual' | 'c_corp' | 's_corp' | 'partnership' | 'trust_estate' | 'llc' | 'other';
export type W9Data = {
  name: string;
  business: string;
  classification: Classification;
  llc: '' | 'C' | 'S' | 'P';
  other: string;
  foreign_partners: boolean;
  exempt_payee: string;
  fatca: string;
  address: string;
  city: string;
  accounts: string;
};

/**
 * Formato del número (9 dígitos). ITIN empieza con 9; SSN no empieza con 9 ni con 000 o 666, ni tiene 00 en el
 * grupo o 0000 en la serie; EIN no empieza con 00. Devuelve solo los dígitos o null.
 */
export function tinValid(type: unknown, value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const d = value.replace(/[\s-]/g, '');
  if (!/^\d{9}$/.test(d)) return null;
  if (type === 'itin') return d[0] === '9' ? d : null;
  if (type === 'ssn') {
    if (d[0] === '9' || d.startsWith('000') || d.startsWith('666') || d.slice(3, 5) === '00' || d.slice(5) === '0000') return null;
    return d;
  }
  if (type === 'ein') return d.startsWith('00') ? null : d;
  return null;
}

// Correos (D-247: siempre en inglés; D-250: marco de la marca). Textos de surveys/w9-aprobado.html (D-256).

export function correoW9(o: { name: string; link: string; expires: string }) {
  const first = o.name.trim().split(/\s+/)[0] ?? '';
  const subject = 'Please complete your W-9';
  const intro = 'Cid Clean LLC needs your Form W-9 to pay you as a contractor. We already filled in your details. You only need to add your SSN or ITIN and sign.';
  const seguro = "The page is secure. We'll send a code to this email so only you can open it. Your SSN is not stored in our app: it only goes into your signed form.";
  const vence = `This link expires on ${o.expires}.`;
  const html = correoHtml({
    preview: subject,
    tarjeta: titulo(first ? `Please complete your W-9, ${first}` : subject) + parrafo(esc(intro)).replace('margin:0 0 20px', 'margin:0') +
      boton('Complete W-9', o.link) + nota(esc(seguro), '6px') + nota(esc(vence), '8px'),
  });
  const text = [first ? `Please complete your W-9, ${first}` : subject, '', intro, '', `Complete W-9: ${o.link}`, '', seguro, vence, '', pieTexto()].join('\n');
  return { subject, html, text };
}

export function correoCodigoW9(code: string) {
  const subject = `Your Cid Clean code: ${code}`;
  const t1 = 'Your code to open your W-9';
  const t2 = "Enter this code on the W-9 page. It's valid for 10 minutes.";
  const t3 = "If you didn't ask for this code, you can ignore this email. Nobody can open your W-9 without it.";
  const html = correoHtml({
    preview: subject,
    tarjeta: titulo(t1, 22).replace('margin:0 0 8px', 'margin:0 0 6px') +
      parrafo(esc(t2)).replace('margin:0 0 20px', 'margin:0 0 18px') + codigoGrande(code) + nota(esc(t3), '16px'),
  });
  return { subject, html, text: [t1, '', t2, '', code, '', t3, '', pieTexto()].join('\n') };
}

// PDF ----------------------------------------------------------------------------------------------------------

const P = 'topmostSubform[0].Page1[0].';
const F = {
  name: `${P}f1_01[0]`,
  business: `${P}f1_02[0]`,
  box: (i: number) => `${P}Boxes3a-b_ReadOrder[0].c1_1[${i}]`,
  llc: `${P}Boxes3a-b_ReadOrder[0].f1_03[0]`,
  other: `${P}Boxes3a-b_ReadOrder[0].f1_04[0]`,
  b3: `${P}Boxes3a-b_ReadOrder[0].c1_2[0]`,
  exempt: `${P}f1_05[0]`,
  fatca: `${P}f1_06[0]`,
  address: `${P}Address_ReadOrder[0].f1_07[0]`,
  city: `${P}Address_ReadOrder[0].f1_08[0]`,
  requester: `${P}f1_09[0]`,
  accounts: `${P}f1_10[0]`,
  ssn: [`${P}f1_11[0]`, `${P}f1_12[0]`, `${P}f1_13[0]`],
  ein: [`${P}f1_14[0]`, `${P}f1_15[0]`],
};
const CASILLA: Record<Classification, number> = {
  individual: 0, c_corp: 1, s_corp: 2, partnership: 3, trust_estate: 4, llc: 5, other: 6,
};

/** Las fuentes estándar del PDF (WinAnsi) no dibujan todo: se quitan los caracteres que no pueden. */
function winAnsi(s: string): string {
  return s.normalize('NFC').replace(/[^\x20-\x7E -ÿ‘’“”–—]/g, '');
}

/** Fecha de la firma en la hora de Naples, como la escribe el IRS: MM/DD/YYYY. */
export function fechaFirma(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/**
 * Llena el W-9 oficial: quita el XFA (pdf-lib lo quita al abrir el formulario), llena los campos, marca la casilla de
 * la clasificación, pone el número en SSN o EIN según el tipo, el Requester fijo, escribe la firma tipeada y la fecha
 * sobre la línea "Sign Here" de la página 1 y aplana el formulario. Con `preview` no lleva número ni firma y dice
 * PREVIEW.
 */
export async function fillW9(o: {
  data: W9Data;
  tinType: TinType | null;
  tin: string | null;
  signer: string | null;
  signedAt: Date | null;
  preview?: boolean;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.load(Uint8Array.from(atob(FW9_PDF_BASE64), (c) => c.charCodeAt(0)));
  const form = doc.getForm();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const text = (n: string, v: string, size?: number) => {
    const f = form.getTextField(n);
    const max = f.getMaxLength();
    const val = winAnsi(v);
    f.setText(max !== undefined ? val.slice(0, max) : val);
    if (size) f.setFontSize(size);
  };
  const d = o.data;
  text(F.name, d.name);
  text(F.business, d.business);
  form.getCheckBox(F.box(CASILLA[d.classification])).check();
  if (d.classification === 'llc') text(F.llc, d.llc);
  if (d.classification === 'other') text(F.other, d.other);
  if (d.foreign_partners) form.getCheckBox(F.b3).check();
  text(F.exempt, d.exempt_payee);
  text(F.fatca, d.fatca);
  text(F.address, d.address);
  text(F.city, d.city);
  const req = form.getTextField(F.requester);
  req.enableMultiline();
  req.setText(REQUESTER.join('\n'));
  req.setFontSize(8);
  text(F.accounts, d.accounts);
  if (!o.preview && o.tin && o.tinType) {
    if (o.tinType === 'ein') {
      text(F.ein[0], o.tin.slice(0, 2));
      text(F.ein[1], o.tin.slice(2));
    } else {
      text(F.ssn[0], o.tin.slice(0, 3));
      text(F.ssn[1], o.tin.slice(3, 5));
      text(F.ssn[2], o.tin.slice(5));
    }
  }
  form.updateFieldAppearances(helv);
  form.flatten();

  const page = doc.getPage(0);
  if (!o.preview && o.signer && o.signedAt) {
    // Línea "Signature of U.S. person" (página 1): la firma escrita y la fecha.
    const firma = await doc.embedFont(StandardFonts.TimesRomanItalic);
    page.drawText(winAnsi(o.signer), { x: 124, y: 197, size: 14, font: firma, color: rgb(0.05, 0.1, 0.25), maxWidth: 255 });
    page.drawText(fechaFirma(o.signedAt), { x: 408, y: 197, size: 11, font: helv, color: rgb(0.05, 0.1, 0.25) });
    page.drawText(`Signed electronically by typing the name above on ${o.signedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC.`, {
      x: 124, y: 187, size: 6, font: helv, color: rgb(0.35, 0.35, 0.35),
    });
  }
  if (o.preview) {
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    page.drawText('PREVIEW - NOT SIGNED', { x: 90, y: 250, size: 40, font: bold, color: rgb(0.85, 0.2, 0.2), opacity: 0.25, rotate: degrees(30) });
  }
  doc.setTitle(FORM_VERSION);
  doc.setProducer('Cid Clean');
  doc.setCreator('Cid Clean');
  return await doc.save();
}

/** Base64 para devolver la vista previa (sin número) al portal. */
export function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
