// Quote y portal del cliente (hito 4, D-209): textos de los correos, formato de montos, fechas y frecuencia, y el
// PDF de una página. Este archivo no contiene llaves: RESEND_QUOTES_KEY, PORTAL_CODE_PEPPER y PORTAL_BASE_URL son
// secretos de las funciones.
import { PDFDocument, rgb, StandardFonts, type PDFFont } from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';

import { correoHtml, EMPRESA, esc, filas, nota, parrafo, pieTexto, titulo, boton, codigoGrande, firma } from './correo.ts';

export type Lang = 'es' | 'en';
export type Line = { label: string; description?: string; amount?: number; taxable?: boolean; kind?: 'amount' | 'percent'; value?: number };
export type Lines = { services: Line[]; addons: Line[]; discounts: Line[] };
export type Frequency = { kind: 'daily' | 'weekly' | 'other'; days: number[]; other: string } | null;

export const FROM = 'Cid Clean <quotes@mail.cidclean.com>';
export const REPLY_TO = 'info@cidclean.com'; // D-249
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
    // D-238 (D-200): un quote de extra no es mensual.
    totalOnce: 'Total',
    serviceDate: 'Fecha del servicio',
    date: 'Fecha',
    validUntil: 'Válida hasta',
    frequency: 'Frecuencia',
    version: 'Versión',
    footer: 'Cid Clean · Naples, Florida',
  },
  en: {
    quote: 'Quote',
    services: 'Services',
    addons: 'Add-ons',
    discounts: 'Discounts',
    subtotal: 'Subtotal',
    tax: (rate: number) => `Tax (${rate}%)`,
    total: 'Monthly total',
    totalOnce: 'Total',
    serviceDate: 'Service date',
    date: 'Date',
    validUntil: 'Valid until',
    frequency: 'Frequency',
    version: 'Version',
    footer: 'Cid Clean · Naples, Florida',
  },
};

/** Día de la semana en inglés para el correo (0 = lunes). */
const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Mon, Wed and Fri" (muestra de D-250); "Every day" para diaria; el texto libre para "otra". D-200 */
export function diasCorreo(f: Frequency): string {
  if (!f) return '';
  if (f.kind === 'other') return f.other ?? '';
  if (f.kind === 'daily') return 'Every day'; // D-200
  const d = [...f.days].sort((a, b) => a - b).map((x) => DAYS_EN[x]);
  return d.length <= 1 ? (d[0] ?? '') : `${d.slice(0, -1).join(', ')} and ${d[d.length - 1]}`;
}

/** "6:00 PM" desde "18:00" o "18:00:00". */
export function horaCorreo(t: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

export type QuoteMail = {
  company: string;
  site: string;
  address: string | null;
  contactName: string | null;
  frequency: Frequency;
  visitTime?: string | null;
  lines: Lines | null;
  total: number | null;
  extra: boolean;
  serviceDate: string | null;
  expires: string;
  link: string;
};

/** Correo del quote al cliente (D-247, D-250; muestra surveys/marca-aprobado/quote-email.html). Siempre en inglés. */
export function correoQuote(d: QuoteMail) {
  const first = (d.contactName ?? '').trim().split(/\s+/)[0] ?? '';
  const head = first ? `Your quote is ready, ${first}` : 'Your quote is ready';
  const lugar = [d.site, d.address && d.address !== d.site ? d.address : null].filter(Boolean).join(' · ');
  const cuando = d.extra
    ? d.serviceDate ? `Service date · ${fecha(`${d.serviceDate}T12:00:00Z`, 'en')}` : '' // D-238
    : [diasCorreo(d.frequency), horaCorreo(d.visitTime)].filter(Boolean).join(' · ');
  const items = d.lines ? [...d.lines.services, ...d.lines.addons].map((l) => ({ title: l.label, detail: l.description ?? null })) : [];
  const totalLabel = d.extra ? 'Total' : 'Monthly total';
  const intro = `Thanks for walking us through your space. Here's a preview of what we put together for <b style="color:#1E2A28">${esc(d.company)}</b>.`;
  const caja = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6EFE6;border-radius:18px"><tr><td style="padding:18px 18px 8px">
<div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#8A4B0F">${esc(lugar)}</div>
${cuando ? `<div style="font-size:14px;color:#6B5F52;margin:4px 0 6px">${esc(cuando)}</div>` : '<div style="height:6px"></div>'}
${items.length ? filas(items) : ''}
</td></tr>${d.total != null ? `<tr><td style="padding:0 18px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0F766E;border-radius:14px"><tr>
<td style="padding:14px 16px;color:#FFFFFF;font-size:14px">${totalLabel}<br><span style="font-size:12px;opacity:.85">tax included</span></td>
<td align="right" style="padding:14px 16px;color:#FFFFFF;font-size:26px;font-weight:800">${money(d.total)}</td></tr></table></td></tr>` : ''}</table>`;
  const aviso = `The full quote and the scope of work are on a secure page. We'll send a code to this email so only you can review and accept it. Valid until <b style="color:#1E2A28">${esc(d.expires)}</b>.`;
  const html = correoHtml({
    preview: `A preview of your Cid Clean quote for ${d.company}.`,
    tarjeta: titulo(head) + parrafo(intro) + caja + boton('View quote', d.link) + nota(aviso) +
      firma('Questions? Just reply to this email or call us.'),
  });
  const text = [
    head,
    '',
    `Thanks for walking us through your space. Here's a preview of what we put together for ${d.company}.`,
    '',
    lugar,
    ...(cuando ? [cuando] : []),
    ...items.map((i) => `- ${i.title}${i.detail ? `: ${i.detail}` : ''}`),
    ...(d.total != null ? ['', `${totalLabel} (tax included): ${money(d.total)}`] : []),
    '',
    `View quote: ${d.link}`,
    '',
    `The full quote and the scope of work are on a secure page. We'll send a code to this email so only you can review and accept it. Valid until ${d.expires}.`,
    '',
    'Questions? Just reply to this email or call us.',
    EMPRESA.nombre,
    '',
    pieTexto(),
  ].join('\n');
  return { subject: `Your Cid Clean quote for ${d.company}`, html, text };
}

/** Código del portal (D-250; muestra surveys/marca-aprobado/code-email.html). */
export function correoCodigo(code: string) {
  const subject = `Your Cid Clean code: ${code}`;
  const html = correoHtml({
    preview: subject,
    tarjeta: titulo('Your code to view the quote', 22).replace('margin:0 0 8px', 'margin:0 0 6px') +
      parrafo("Enter this code on the quote page. It's valid for 10 minutes.").replace('margin:0 0 20px', 'margin:0 0 18px') +
      codigoGrande(code) +
      nota("If you didn't ask for this code, you can ignore this email. Nobody can accept your quote without it.", '16px'),
  });
  const text = [
    'Your code to view the quote',
    '',
    "Enter this code on the quote page. It's valid for 10 minutes.",
    '',
    code,
    '',
    "If you didn't ask for this code, you can ignore this email. Nobody can accept your quote without it.",
    '',
    pieTexto(),
  ].join('\n');
  return { subject, html, text };
}

/** Aviso a quien envió el quote (D-209), en inglés (D-247) con el estilo de D-250. Textos D-200. */
const DECISION = {
  accepted: (c: string, s: string) => `${c} accepted the quote for ${s}`,
  rejected: (c: string, s: string) => `${c} rejected the quote for ${s}`,
  changes_requested: (c: string, s: string) => `${c} requested changes to the quote for ${s}`,
  body: (v: string) => `Version ${v}. See it in the app: Pipeline, the lead and the Sites tab.`,
  bodyExtra: (v: string) => `Version ${v}. See it in the app: Accounts and the jobsite.`,
};

export function correoDecision(
  kind: 'accepted' | 'rejected' | 'changes_requested',
  company: string,
  site: string,
  version: string,
  extra = false,
) {
  const subject = DECISION[kind](company, site);
  const body = extra ? DECISION.bodyExtra(version) : DECISION.body(version);
  const html = correoHtml({
    preview: subject,
    tarjeta: titulo(subject, 22) + nota(esc(body)).replace('font-size:13px', 'font-size:15px'),
  });
  return { subject, html, text: `${subject}\n${body}\n\n${pieTexto()}` };
}

/** Envía un correo con la llave de envío de mail.cidclean.com, con respuesta a info@cidclean.com (D-249) y adjuntos
 * opcionales (el PDF del quote). Devuelve si Resend lo aceptó. */
export async function enviarCorreo(
  to: string,
  m: { subject: string; html: string; text: string },
  adjuntos: { filename: string; content: Uint8Array }[] = [],
): Promise<boolean> {
  const attachments = adjuntos.map((a) => ({ filename: a.filename, content: base64(a.content) }));
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_QUOTES_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM, to: [to], reply_to: REPLY_TO, subject: m.subject, html: m.html, text: m.text,
      ...(attachments.length ? { attachments } : {}),
    }),
  });
  return res.ok;
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
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
  /** Quote de extra (D-238): total de una vez y fecha del servicio en vez de la frecuencia. */
  extra?: boolean;
  service_date?: string | null;
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
    d.extra
      ? [t.serviceDate, d.service_date ? fecha(`${d.service_date}T12:00:00Z`, d.language) : '']
      : [t.frequency, frecuencia(d.frequency, d.language)],
  ];
  for (const [k, v] of info) {
    txt(k, M, y, 10, fonts.regular, SECONDARY);
    txt(cut(v, 11, fonts.regular, W - 2 * M - 110), M + 110, y, 11, fonts.regular);
    y -= 17;
  }
  y -= 14;

  // Línea fina bajo cada renglón (muestra ronda 4 `.ln`).
  const sep = (yy: number) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: 0.5, color: BORDER });
  const section = (title: string, rows: { label: string; value: string }[]) => {
    if (rows.length === 0) return;
    txt(title, M, y, 10, fonts.medium, SECONDARY);
    y -= 18;
    for (const r of rows) {
      txt(cut(r.label, 11, fonts.regular, W - 2 * M - 120), M, y, 11, fonts.regular);
      right(r.value, y, 11, fonts.regular);
      sep(y - 7);
      y -= 22;
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
  txt(d.extra ? t.totalOnce : t.total, W - M - 250, y, 13, fonts.medium);
  right(money(d.total), y, 16, fonts.medium, BRAND);

  txt(`${t.footer} · ${t.version} ${d.version}`, M, 36, 9, fonts.regular, SECONDARY);
  return await doc.save();
}
