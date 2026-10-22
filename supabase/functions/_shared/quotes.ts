// Quote y portal del cliente (hito 4, D-209): textos de los correos, formato de montos, fechas y frecuencia, y el
// PDF de una página. Este archivo no contiene llaves: RESEND_QUOTES_KEY, PORTAL_CODE_PEPPER y PORTAL_BASE_URL son
// secretos de las funciones.
import { PDFDocument, rgb, StandardFonts, type PDFFont } from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';

export type Lang = 'es' | 'en';
export type Line = { label: string; amount?: number; taxable?: boolean; kind?: 'amount' | 'percent'; value?: number };
export type Lines = { services: Line[]; addons: Line[]; discounts: Line[] };
export type Frequency = { kind: 'daily' | 'weekly' | 'other'; days: number[]; other: string } | null;

export const FROM = 'Cid Clean <quotes@mail.cidclean.com>';
export const REPLY_TO = 'admin@cidclean.com';
const BRAND = rgb(15 / 255, 118 / 255, 110 / 255);
const TEXT = rgb(26 / 255, 26 / 255, 26 / 255);
const SECONDARY = rgb(107 / 255, 107 / 255, 107 / 255);
const BORDER = rgb(226 / 255, 226 / 255, 226 / 255);

export function lang(value: unknown): Lang {
  return value === 'es' ? 'es' : 'en';
}

export function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function money(n: number): string {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MONTHS: Record<Lang, string[]> = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** Fecha en la hora de Naples: "21 nov 2026" / "Nov 21, 2026". */
export function fecha(iso: string, l: Lang): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(new Date(iso));
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const m = MONTHS[l][get('month') - 1];
  return l === 'es' ? `${get('day')} ${m} ${get('year')}` : `${m} ${get('day')}, ${get('year')}`;
}

const DAYS: Record<Lang, string[]> = {
  es: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], // D-038
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

/** Frecuencia del walkthrough (D-075, D-080, D-105) en texto. */
export function frecuencia(f: Frequency, l: Lang): string {
  if (!f) return '';
  if (f.kind === 'other') return f.other ?? '';
  const n = f.kind === 'daily' ? 7 : f.days.length;
  const veces = l === 'es' ? `${n} ${n === 1 ? 'vez' : 'veces'} por semana` : `${n} ${n === 1 ? 'time' : 'times'} a week`;
  if (f.kind === 'daily') return l === 'es' ? `Diaria · ${veces}` : `Daily · ${veces}`;
  const dias = [...f.days].sort((a, b) => a - b).map((d) => DAYS[l][d]).join(', ');
  return l === 'es' ? `Semanal: ${dias} · ${veces}` : `Weekly: ${dias} · ${veces}`;
}

export const T = {
  es: {
    quote: 'Cotización',
    services: 'Servicios',
    addons: 'Add-ons',
    discounts: 'Descuentos',
    subtotal: 'Subtotal',
    tax: (rate: number) => `Tax (${rate}%)`,
    total: 'Total mensual',
    date: 'Fecha',
    validUntil: 'Válida hasta',
    frequency: 'Frecuencia',
    version: 'Versión',
    footer: 'Cid Clean · Naples, Florida',
    mailSubject: (site: string) => `Tu cotización de Cid Clean: ${site}`,
    mailIntro: (company: string, site: string) => `Preparamos la cotización para ${company} · ${site}.`,
    mailValid: (date: string) => `Vence el ${date}.`,
    mailButton: 'Ver cotización',
    mailCode: 'Para verla te pediremos un código que enviaremos a este correo.',
    mailReply: 'Si tienes preguntas, responde a este correo.',
    codeSubject: (code: string) => `Tu código de Cid Clean: ${code}`,
    codeBody: (code: string) => `Tu código para ver la cotización es ${code}. Vale 10 minutos.`,
    codeIgnore: 'Si no lo pediste, ignora este correo.',
  },
  en: {
    quote: 'Quote',
    services: 'Services',
    addons: 'Add-ons',
    discounts: 'Discounts',
    subtotal: 'Subtotal',
    tax: (rate: number) => `Tax (${rate}%)`,
    total: 'Monthly total',
    date: 'Date',
    validUntil: 'Valid until',
    frequency: 'Frequency',
    version: 'Version',
    footer: 'Cid Clean · Naples, Florida',
    mailSubject: (site: string) => `Your Cid Clean quote: ${site}`,
    mailIntro: (company: string, site: string) => `We prepared the quote for ${company} · ${site}.`,
    mailValid: (date: string) => `It expires on ${date}.`,
    mailButton: 'View quote',
    mailCode: "To view it, we'll ask for a code that we'll send to this email.",
    mailReply: 'If you have questions, reply to this email.',
    codeSubject: (code: string) => `Your Cid Clean code: ${code}`,
    codeBody: (code: string) => `Your code to view the quote is ${code}. It's valid for 10 minutes.`,
    codeIgnore: "If you didn't request it, ignore this email.",
  },
};

/** Avisos a quien envió el quote (D-209), en el idioma de su perfil. */
export const DECISION = {
  es: {
    accepted: (c: string, s: string) => `${c} aceptó el quote de ${s}`,
    rejected: (c: string, s: string) => `${c} rechazó el quote de ${s}`,
    changes_requested: (c: string, s: string) => `${c} pidió cambios al quote de ${s}`,
    body: (v: string) => `Versión ${v}. Míralo en la app: Pipeline, el lead y la pestaña Sitios.`,
  },
  en: {
    accepted: (c: string, s: string) => `${c} accepted the quote for ${s}`,
    rejected: (c: string, s: string) => `${c} rejected the quote for ${s}`,
    changes_requested: (c: string, s: string) => `${c} requested changes to the quote for ${s}`,
    body: (v: string) => `Version ${v}. See it in the app: Pipeline, the lead and the Sites tab.`,
  },
};

function plantilla(cuerpo: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F4F4F4;font-family:Manrope,Arial,sans-serif;color:#1A1A1A">
<div style="max-width:520px;margin:0 auto;padding:24px 16px"><div style="background:#FFFFFF;border:1px solid #E2E2E2;border-radius:12px;overflow:hidden">
<div style="background:#0F766E;color:#FFFFFF;padding:14px 16px;font-size:18px;font-weight:600">Cid Clean</div>
<div style="padding:16px;font-size:15px;line-height:1.5">${cuerpo}</div></div></div></body></html>`;
}

export function correoQuote(l: Lang, d: { company: string; site: string; expires: string; link: string }) {
  const t = T[l];
  const e = escaparHtml;
  const html = plantilla(`<p style="margin:0 0 8px">${e(t.mailIntro(d.company, d.site))}</p>
<p style="margin:0 0 16px;color:#6B6B6B">${e(t.mailValid(d.expires))}</p>
<p style="margin:0 0 16px"><a href="${e(d.link)}" style="display:inline-block;background:#0F766E;color:#FFFFFF;text-decoration:none;padding:10px 18px;border-radius:12px;font-weight:600">${e(t.mailButton)}</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#6B6B6B">${e(t.mailCode)}</p>
<p style="margin:0;font-size:13px;color:#6B6B6B">${e(t.mailReply)}</p>`);
  const text = [t.mailIntro(d.company, d.site), t.mailValid(d.expires), '', `${t.mailButton}: ${d.link}`, '', t.mailCode, t.mailReply].join('\n');
  return { subject: t.mailSubject(d.site), html, text };
}

export function correoCodigo(l: Lang, code: string) {
  const t = T[l];
  const html = plantilla(`<p style="margin:0 0 12px">${escaparHtml(t.codeBody(code))}</p>
<p style="margin:0 0 12px;font-size:28px;letter-spacing:6px;font-weight:600">${code}</p>
<p style="margin:0;font-size:13px;color:#6B6B6B">${escaparHtml(t.codeIgnore)}</p>`);
  return { subject: t.codeSubject(code), html, text: `${t.codeBody(code)}\n\n${t.codeIgnore}` };
}

export function correoDecision(l: Lang, kind: 'accepted' | 'rejected' | 'changes_requested', company: string, site: string, version: string) {
  const t = DECISION[l];
  const subject = t[kind](company, site);
  const html = plantilla(`<p style="margin:0 0 8px;font-weight:600">${escaparHtml(subject)}</p><p style="margin:0;color:#6B6B6B">${escaparHtml(t.body(version))}</p>`);
  return { subject, html, text: `${subject}\n${t.body(version)}` };
}

/** Envía un correo con la llave de envío de mail.cidclean.com. Devuelve si Resend lo aceptó. */
export async function enviarCorreo(to: string, m: { subject: string; html: string; text: string }): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_QUOTES_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject: m.subject, html: m.html, text: m.text }),
  });
  return res.ok;
}

export async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function tokenAleatorio(bytes = 32): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Código de 6 dígitos sin sesgo. */
export function codigo(): string {
  const max = 4294967296 - (4294967296 % 1000000);
  let n: number;
  do {
    n = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (n >= max);
  return String(n % 1000000).padStart(6, '0');
}

async function manrope(doc: PDFDocument): Promise<{ regular: PDFFont; medium: PDFFont } | null> {
  try {
    const css = await (await fetch('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500', { headers: { 'User-Agent': 'Deno' } })).text();
    const urls = [...css.matchAll(/url\((https:[^)]+\.ttf)\)/g)].map((m) => m[1]);
    if (urls.length < 2) return null;
    const [r, m] = await Promise.all(urls.slice(0, 2).map(async (u) => new Uint8Array(await (await fetch(u)).arrayBuffer())));
    doc.registerFontkit(fontkit);
    return { regular: await doc.embedFont(r, { subset: true }), medium: await doc.embedFont(m, { subset: true }) };
  } catch {
    return null;
  }
}

export type PdfData = {
  language: Lang;
  version: string;
  company: string;
  site: string;
  address: string;
  frequency: Frequency;
  lines: Lines;
  tax_rate: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  sent_at: string;
  expires_at: string;
};

/** PDF de una página (D-209): sitio, servicios, add-ons, descuentos, tax, total mensual, vigencia, versión y frecuencia. */
export async function pdfQuote(d: PdfData): Promise<Uint8Array> {
  const t = T[d.language];
  const doc = await PDFDocument.create();
  doc.setTitle(`${t.quote} ${d.version} · ${d.company}`);
  doc.setAuthor('Cid Clean');
  const page = doc.addPage([612, 792]);
  const fonts = (await manrope(doc)) ?? {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    medium: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const W = 612;
  const M = 48;
  let y = 792;
  const txt = (s: string, x: number, yy: number, size: number, font: PDFFont, color = TEXT) =>
    page.drawText(s, { x, y: yy, size, font, color });
  const right = (s: string, yy: number, size: number, font: PDFFont, color = TEXT) =>
    txt(s, W - M - font.widthOfTextAtSize(s, size), yy, size, font, color);
  const cut = (s: string, size: number, font: PDFFont, max: number) => {
    let out = s;
    while (out.length > 1 && font.widthOfTextAtSize(out, size) > max) out = out.slice(0, -2) + '…';
    return out;
  };

  page.drawRectangle({ x: 0, y: 792 - 64, width: W, height: 64, color: BRAND });
  txt('Cid Clean', M, 792 - 40, 22, fonts.medium, rgb(1, 1, 1));
  const head = `${t.quote} ${d.version}`;
  txt(head, W - M - fonts.medium.widthOfTextAtSize(head, 13), 792 - 38, 13, fonts.medium, rgb(1, 1, 1));
  y = 792 - 64 - 40;
  txt(cut(d.company, 18, fonts.medium, W - 2 * M), M, y, 18, fonts.medium);
  y -= 22;
  txt(cut(d.site, 13, fonts.regular, W - 2 * M), M, y, 13, fonts.regular);
  y -= 17;
  txt(cut(d.address, 11, fonts.regular, W - 2 * M), M, y, 11, fonts.regular, SECONDARY);
  y -= 30;
  const info: [string, string][] = [
    [t.date, fecha(d.sent_at, d.language)],
    [t.validUntil, fecha(d.expires_at, d.language)],
    [t.frequency, frecuencia(d.frequency, d.language)],
  ];
  for (const [k, v] of info) {
    txt(k, M, y, 10, fonts.regular, SECONDARY);
    txt(cut(v, 11, fonts.regular, W - 2 * M - 110), M + 110, y, 11, fonts.regular);
    y -= 17;
  }
  y -= 14;

  const sep = () => page.drawLine({ start: { x: M, y: y + 12 }, end: { x: W - M, y: y + 12 }, thickness: 0.5, color: BORDER });
  const section = (title: string, rows: { label: string; value: string }[]) => {
    if (rows.length === 0) return;
    txt(title, M, y, 10, fonts.medium, SECONDARY);
    y -= 18;
    for (const r of rows) {
      txt(cut(r.label, 11, fonts.regular, W - 2 * M - 120), M, y, 11, fonts.regular);
      right(r.value, y, 11, fonts.regular);
      y -= 8;
      sep();
      y -= 12;
    }
    y -= 8;
  };
  section(t.services, d.lines.services.map((l) => ({ label: l.label, value: money(l.amount ?? 0) })));
  section(t.addons, d.lines.addons.map((l) => ({ label: l.label, value: money(l.amount ?? 0) })));
  section(
    t.discounts,
    d.lines.discounts.map((l) => ({
      label: l.kind === 'percent' ? `${l.label} (${l.value}%)` : l.label,
      value: '−' + money(l.kind === 'percent' ? (d.subtotal * (l.value ?? 0)) / 100 : (l.value ?? 0)),
    })),
  );
  y -= 4;
  const totals: [string, string][] = [[t.subtotal, money(d.subtotal)]];
  if (d.discount > 0) totals.push([t.discounts, '−' + money(d.discount)]);
  totals.push([t.tax(Number(d.tax_rate)), money(d.tax)]);
  for (const [k, v] of totals) {
    txt(k, W - M - 250, y, 11, fonts.regular, SECONDARY);
    right(v, y, 11, fonts.regular);
    y -= 18;
  }
  page.drawLine({ start: { x: W - M - 250, y: y + 10 }, end: { x: W - M, y: y + 10 }, thickness: 0.5, color: BORDER });
  y -= 10;
  txt(t.total, W - M - 250, y, 13, fonts.medium);
  right(money(d.total), y, 16, fonts.medium, BRAND);

  txt(`${t.footer} · ${t.version} ${d.version}`, M, 36, 9, fonts.regular, SECONDARY);
  return await doc.save();
}
