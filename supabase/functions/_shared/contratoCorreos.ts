// Correos del quote aceptado y del contrato del cliente (órdenes 61 y 62, D-283), en inglés (D-247) con la marca de
// D-250 (correo.ts). Sin pdf-lib: se prueban con Node (supabase/tests/contrato.test.mjs). Textos D-200 (D-283).
// Este archivo no contiene llaves.
import { boton, codigoGrande, correoHtml, esc, filas, nota, parrafo, pieTexto, titulo } from './correo.ts';

/** Remitente de los documentos (D-268), con respuesta a info@cidclean.com (REPLY_TO de quotes.ts). */
export const REMITENTE_DOCUMENTOS = 'Cid Clean <documents@mail.cidclean.com>';

/** Fecha y hora en Naples con su zona (EDT o EST): "October 30, 2026, 9:15 AM EDT". */
export function horaNaples(d: Date, segundos = false): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
    ...(segundos ? { second: '2-digit' as const } : {}), hour12: true, timeZoneName: 'short',
  }).format(d).replace(/[  ]/g, ' ');
}

/** MM/DD/YYYY en Naples (formato del contrato). */
export function fechaCorta(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

const dinero = (n: number) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PAPEL = 'You can ask for a free paper copy at any time: reply to this email or write to info@cidclean.com.';

/** Copia de la aceptación del quote para el cliente (D-283), con el PDF del quote adjunto. */
export function correoCopiaAceptacion(o: {
  quoteNumber: string; version: string; company: string; site: string; signer: string; title: string | null;
  email: string; acceptedAt: Date; total: number; extra: boolean; acceptanceText: string | null; termsVersion: string | null;
  userAgent: string | null;
}) {
  const subject = `Copy of your acceptance: quote ${o.quoteNumber} version ${o.version}`;
  const intro = o.extra
    ? `You accepted quote ${o.quoteNumber} version ${o.version} for ${o.site}. Here is your copy.`
    : `You accepted quote ${o.quoteNumber} version ${o.version} for ${o.site}. Here is your copy. This acceptance is not a contract: services begin only after both parties sign the Commercial Service Agreement, which we will send you next.`;
  const items = [
    { title: 'Quote', detail: `${o.quoteNumber} version ${o.version} · ${o.company} · ${o.site}` },
    { title: o.extra ? 'Total' : 'Monthly total', detail: dinero(o.total) },
    { title: 'Accepted by', detail: o.title ? `${o.signer}, ${o.title}` : o.signer },
    { title: 'Verified email', detail: o.email },
    { title: 'Date and time', detail: `${horaNaples(o.acceptedAt)} (America/New_York)` },
    ...(o.termsVersion ? [{ title: 'Client Portal Terms', detail: `Version ${o.termsVersion}` }] : []),
    ...(o.userAgent ? [{ title: 'Browser', detail: o.userAgent }] : []),
  ];
  const html = correoHtml({
    preview: subject,
    tarjeta: titulo('Copy of your quote acceptance', 22) + parrafo(esc(intro)) + filas(items) +
      (o.acceptanceText ? nota(`<b>What you accepted:</b> ${esc(o.acceptanceText)}`, '16px') : '') +
      nota(esc('The quote PDF is attached. ' + PAPEL), '12px'),
  });
  const text = [
    'Copy of your quote acceptance', '', intro, '',
    ...items.map((i) => `${i.title}: ${i.detail}`), '',
    ...(o.acceptanceText ? [`What you accepted: ${o.acceptanceText}`, ''] : []),
    'The quote PDF is attached. ' + PAPEL, '', pieTexto(),
  ].join('\n');
  return { subject, html, text };
}

/** Correo con el link para firmar el contrato (orden 62). */
export function correoContrato(o: { name: string | null; company: string; csa: string; link: string; expires: string }) {
  const first = (o.name ?? '').trim().split(/\s+/)[0] ?? '';
  const subject = `Please sign your Commercial Service Agreement ${o.csa}`;
  const intro = `Your Commercial Service Agreement and Scope of Work for ${o.company} are ready to sign. Services begin only after both parties sign.`;
  const seguro = "We'll send a code to this email so only you can open it. You sign by typing your name and title.";
  const vence = `This link expires on ${o.expires}.`;
  const html = correoHtml({
    preview: subject,
    tarjeta: titulo(first ? `Your agreement is ready to sign, ${first}` : 'Your agreement is ready to sign') +
      parrafo(esc(intro)).replace('margin:0 0 20px', 'margin:0') + boton('Review and sign', o.link) +
      nota(esc(seguro), '6px') + nota(esc(vence), '8px'),
  });
  const text = [first ? `Your agreement is ready to sign, ${first}` : 'Your agreement is ready to sign', '', intro, '',
    `Review and sign: ${o.link}`, '', seguro, vence, '', pieTexto()].join('\n');
  return { subject, html, text };
}

export function correoCodigoContrato(code: string) {
  const subject = `Your Cid Clean code: ${code}`;
  const t1 = 'Your code to open your agreement';
  const t2 = "Enter this code on the agreement page. It's valid for 10 minutes.";
  const t3 = "If you didn't ask for this code, you can ignore this email. Nobody can sign your agreement without it.";
  const html = correoHtml({
    preview: subject,
    tarjeta: titulo(t1, 22).replace('margin:0 0 8px', 'margin:0 0 6px') +
      parrafo(esc(t2)).replace('margin:0 0 20px', 'margin:0 0 18px') + codigoGrande(code) + nota(esc(t3), '16px'),
  });
  return { subject, html, text: [t1, '', t2, '', code, '', t3, '', pieTexto()].join('\n') };
}

/** Copia del contrato firmado por ambas partes, para el cliente y para Cid Clean (D-283), con el PDF adjunto. */
export function correoContratoFirmado(o: { company: string; csa: string; sow: string; signedAt: Date; paraCidClean: boolean }) {
  const subject = `Signed agreement ${o.csa} · ${o.company}`;
  const intro = o.paraCidClean
    ? `The Commercial Service Agreement ${o.csa} and Scope of Work ${o.sow} with ${o.company} are signed by both parties. The jobsite can now be scheduled in the app.`
    : `Your Commercial Service Agreement ${o.csa} and Scope of Work ${o.sow} are signed by both parties. Your signed copy, with the e-signature certificate, is attached.`;
  const fecha = `Fully signed on ${horaNaples(o.signedAt)} (America/New_York).`;
  const html = correoHtml({
    preview: subject,
    tarjeta: titulo(o.paraCidClean ? 'Agreement signed by both parties' : 'Your signed agreement', 22) + parrafo(esc(intro)) +
      nota(esc(fecha)) + (o.paraCidClean ? '' : nota(esc(PAPEL), '8px')),
  });
  const text = [intro, '', fecha, ...(o.paraCidClean ? [] : [PAPEL]), '', pieTexto()].join('\n');
  return { subject, html, text };
}
