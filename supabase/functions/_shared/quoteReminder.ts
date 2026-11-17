// Recordatorio automático del quote sin respuesta (orden 121; D-322 (4), D-323 (5)). Lo manda send-notifications en
// cada pasada del cron que ya existe: claim_quote_reminders (la base decide qué versiones califican a los 3 y a los 7
// días, las marca para que salgan una sola vez y genera el enlace nuevo, D-316) → un correo por versión, solo al
// contacto del quote, desde quotes@mail.cidclean.com con la marca del correo del quote (D-248, D-249, D-250, redes de
// D-314) y el pie C del abogado (legal/rev3/5_Prospect_Email_Footer_EN.pdf) → mark_quote_reminder (historial del lead).
// Sin dependencias de Deno ni npm: se prueba con Node (supabase/tests/quote-reminder.test.mjs). Este archivo no
// contiene llaves.
import { boton, correoHtml, esc, firma, nota, parrafo, pieTexto, titulo, EMPRESA } from './correo.ts';

export const FROM_QUOTES = 'Cid Clean <quotes@mail.cidclean.com>'; // el mismo de _shared/quotes.ts (D-209)
export const REPLY_TO_QUOTES = 'info@cidclean.com'; // D-249

/** Footer C del abogado, para el quote. */
export const PIE_C_QUOTE = [
  'This is a service message about your quote with Cid Clean LLC.',
  'Cid Clean LLC · 3727 Milano Lakes Cir, Naples, FL 34114 · (786) 250-1324 · info@cidclean.com · Privacy Policy: cidclean.com/privacy',
];

export type Recordatorio = {
  version_id: string;
  step: 3 | 7;
  to: string;
  token: string;
  company: string | null;
  site: string | null;
  address: string | null;
  contact_name: string | null;
  version: string | null;
  expires_at: string | null;
  extra?: boolean;
};

const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Nov 21, 2026" en la hora de Naples. */
export function fechaEn(iso: string): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(new Date(iso));
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return `${MESES[get('month') - 1]} ${get('day')}, ${get('year')}`;
}

/** Correo del recordatorio, siempre en inglés (D-247). Textos D-200. */
export function correoRecordatorio(r: Recordatorio, base: string) {
  const link = `${base.replace(/\/+$/, '')}/q/${r.token}`;
  const first = (r.contact_name ?? '').trim().split(/\s+/)[0] ?? '';
  const company = (r.company ?? '').trim();
  const head = first ? `A quick reminder, ${first}` : 'A quick reminder'; // D-200
  const lugar = [r.site, r.address && r.address !== r.site ? r.address : null].filter(Boolean).join(' · ');
  const intro = r.step === 7
    ? `Your Cid Clean quote${company ? ` for ${company}` : ''} is still open. If you have any questions or want to change anything, just reply to this email.` // D-200
    : `We sent you a quote${company ? ` for ${company}` : ''} a few days ago and wanted to make sure it reached you.`; // D-200
  const vence = r.expires_at ? `It's valid until ${fechaEn(r.expires_at)}.` : '';
  const aviso = `For your security, this is a new link: the quote page will send a code to this email. ${vence}`.trim(); // D-200
  const subject = `Reminder: your Cid Clean quote${company ? ` for ${company}` : ''}`; // D-200
  const html = correoHtml({
    preview: subject,
    tarjeta: titulo(head) + parrafo(esc(intro)) +
      (lugar ? `<div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#8A4B0F;margin:0 0 4px">${esc(lugar)}</div>` : '') +
      boton('View quote', link) + nota(esc(aviso)) + firma('Questions? Just reply to this email or call us.'),
    nota: PIE_C_QUOTE.join(' '),
  });
  const text = [
    head,
    '',
    intro,
    ...(lugar ? ['', lugar] : []),
    '',
    `View quote: ${link}`,
    '',
    aviso,
    '',
    'Questions? Just reply to this email or call us.',
    EMPRESA.nombre,
    '',
    pieTexto(PIE_C_QUOTE.join('\n')),
  ].join('\n');
  return { subject, html, text };
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Dependencias = {
  claim: () => Promise<Recordatorio[]>;
  send: (m: { from: string; to: string[]; reply_to: string; subject: string; html: string; text: string }) => Promise<boolean>;
  mark: (versionId: string, step: number, ok: boolean) => Promise<void>;
  base: string;
};

/** Manda los recordatorios reclamados. Un correo por versión y un solo destinatario: el contacto del quote. */
export async function enviarRecordatorios(d: Dependencias): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const r of await d.claim()) {
    const to = (r.to ?? '').trim().toLowerCase();
    let ok = false;
    if (CORREO.test(to) && r.token) {
      const m = correoRecordatorio(r, d.base);
      try {
        ok = await d.send({ from: FROM_QUOTES, to: [to], reply_to: REPLY_TO_QUOTES, subject: m.subject, html: m.html, text: m.text });
      } catch {
        ok = false;
      }
    }
    await d.mark(r.version_id, r.step, ok);
    if (ok) sent++;
    else failed++;
  }
  return { sent, failed };
}
