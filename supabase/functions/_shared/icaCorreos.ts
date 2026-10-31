// Correos del ICA (orden 65, D-285), en inglés (D-247) con la marca de D-250 (correo.ts), desde
// documents@mail.cidclean.com con respuesta a info@cidclean.com (D-268). Sin pdf-lib: se prueban con Node
// (supabase/tests/ica.test.mjs). Textos D-200. Este archivo no contiene llaves.
import { boton, codigoGrande, correoHtml, esc, nota, parrafo, pieTexto, titulo } from './correo.ts';
import { horaNaples } from './contratoCorreos.ts';

const PAPEL = 'You can ask for a free paper copy at any time: reply to this email or write to info@cidclean.com.';

/** Correo con el link para firmar el ICA. */
export function correoIca(o: { name: string | null; ica: string; link: string; expires: string }) {
  const first = (o.name ?? '').trim().split(/\s+/)[0] ?? '';
  const subject = `Please sign your Independent Contractor Agreement ${o.ica}`;
  const intro = 'Your Independent Contractor Agreement with Cid Clean LLC is ready to sign.';
  const seguro = "We'll send a code to this email so only you can open it. You sign by typing your full name.";
  const vence = `This link can be used once and expires on ${o.expires}.`;
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

export function correoCodigoIca(code: string) {
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

/** Copia del ICA firmado por ambas partes, para el contratista y para info@cidclean.com, con el PDF adjunto. */
export function correoIcaFirmado(o: { contractor: string; ica: string; signedAt: Date; paraCidClean: boolean; paper?: boolean }) {
  const subject = `Signed Independent Contractor Agreement ${o.ica} · ${o.contractor}`;
  const intro = o.paraCidClean
    ? `The Independent Contractor Agreement ${o.ica} with ${o.contractor} is signed by both parties.`
    : `Your Independent Contractor Agreement ${o.ica} with Cid Clean LLC is signed by both parties. Your signed copy${o.paper ? '' : ', with the e-signature certificate,'} is attached.`;
  const fecha = o.paper ? `Recorded on ${horaNaples(o.signedAt)} (America/New_York) from the signed paper copy.` : `Fully signed on ${horaNaples(o.signedAt)} (America/New_York).`;
  const html = correoHtml({
    preview: subject,
    tarjeta: titulo(o.paraCidClean ? 'Agreement signed by both parties' : 'Your signed agreement', 22) + parrafo(esc(intro)) +
      nota(esc(fecha)) + (o.paraCidClean ? '' : nota(esc(PAPEL), '8px')),
  });
  const text = [intro, '', fecha, ...(o.paraCidClean ? [] : [PAPEL]), '', pieTexto()].join('\n');
  return { subject, html, text };
}

/** Aviso a quien envió el ICA de que el contratista firmó y falta la contrafirma. */
export function correoFirmaContratista(o: { contractor: string; ica: string }) {
  const subject = `${o.contractor} signed agreement ${o.ica}`;
  const body = `${o.contractor} signed the Independent Contractor Agreement ${o.ica}. Countersign it in the app.`;
  const html = correoHtml({ preview: subject, tarjeta: titulo(subject, 22) + nota(esc(body)).replace('font-size:13px', 'font-size:15px') });
  return { subject, html, text: `${subject}\n${body}\n\n${pieTexto()}` };
}
