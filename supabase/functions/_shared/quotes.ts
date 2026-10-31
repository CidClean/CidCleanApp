// Quote y portal del cliente (hito 4, D-209): textos de los correos, formato de montos, fechas y frecuencia, y el
// PDF de una página. Este archivo no contiene llaves: RESEND_QUOTES_KEY, PORTAL_CODE_PEPPER y PORTAL_BASE_URL son
// secretos de las funciones.
import { correoHtml, EMPRESA, esc, filas, nota, parrafo, pieTexto, titulo, boton, codigoGrande, firma } from './correo.ts';
import { C, Documento, LADO, partir, recortar } from './docPdf.ts';

export type Lang = 'es' | 'en';
export type Line = { label: string; description?: string; amount?: number; taxable?: boolean; kind?: 'amount' | 'percent'; value?: number };
export type Lines = { services: Line[]; addons: Line[]; discounts: Line[] };
export type Frequency = { kind: 'daily' | 'weekly' | 'other'; days: number[]; other: string } | null;

export const FROM = 'Cid Clean <quotes@mail.cidclean.com>';
export const REPLY_TO = 'info@cidclean.com'; // D-249
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
  from: string = FROM,
): Promise<boolean> {
  const attachments = adjuntos.map((a) => ({ filename: a.filename, content: base64(a.content) }));
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_QUOTES_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [to], reply_to: REPLY_TO, subject: m.subject, html: m.html, text: m.text,
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
  /** Contacto del sitio (migración 20261027000012) y hora de la visita si existe. */
  contact_name?: string | null;
  visit_time?: string | null;
};

/** Textos del PDF que no están en T (orden 33, muestra quote-pdf.html). El PDF sigue en el idioma del lead. */
const PDF_T = {
  es: {
    preparedFor: 'Preparado para', details: 'Detalles', visitTime: 'Hora de la visita', // D-200
    salesTax: (r: number) => `Tax (${r}%)`, included: 'tax incluido', // D-200
    howTitle: 'Cómo aceptar:', // D-200
    how: 'abre el enlace del correo que te enviamos, escribe el código que te mandamos por correo, lee el alcance del trabajo y acepta en línea.', // D-200
  },
  en: {
    preparedFor: 'Prepared for', details: 'Details', visitTime: 'Visit time',
    salesTax: (r: number) => `Sales tax (${r}%)`, included: 'tax included',
    howTitle: 'How to accept:',
    how: 'open the link in the email we sent, enter the code we email you, read the scope of work and accept online.',
  },
};

/**
 * PDF del quote (D-209) como documento de impresión (orden 70, D-293, docPdf.ts): título con el número de quote,
 * "Prepared for" y "Details" en dos columnas, servicios y add-ons con descripción, descuentos, subtotal, tax y total
 * en la fila de total, "How to accept" y el pie con página. Un extra (D-238) lleva "Total" y la fecha del servicio en
 * vez de la frecuencia.
 */
export async function pdfQuote(d: PdfData): Promise<Uint8Array> {
  const l = d.language;
  const t = T[l];
  const p = PDF_T[l];
  const D = await Documento.crear(`${t.quote} ${d.version} · ${d.company}`);
  const { f } = D;
  D.titulo(`${t.quote} ${d.version}`, [d.company, d.site].filter(Boolean).join(' · '));

  // "Prepared for" y "Details" en dos columnas, sin tarjetas.
  const gap = 18;
  const w1 = ((D.ancho - gap) * 1.3) / 2.3;
  const x2 = LADO + w1 + gap;
  const w2 = D.ancho - gap - w1;
  const h4 = (s: string, x: number, y: number) => D.page.drawText(s.toUpperCase(), { x, y, size: 6.75, font: f.bold, color: C.gris });
  const top = D.y;
  h4(p.preparedFor, LADO, top - 7);
  h4(p.details, x2, top - 7);
  let yy = top - 7 - 6;
  const izq: { s: string; bold?: boolean }[] = [
    ...partir(d.company, f.bold, 9.5, w1).map((s) => ({ s, bold: true })),
    ...(d.contact_name ? [{ s: recortar(d.contact_name, 8.25, f.regular, w1) }] : []),
    ...partir([d.site, d.address && d.address !== d.site ? d.address : ''].filter(Boolean).join(' · '), f.regular, 8.25, w1).map((s) => ({ s })),
  ];
  for (const r of izq) {
    yy -= 12;
    D.page.drawText(r.s, { x: LADO, y: yy, size: r.bold ? 9.5 : 8.25, font: r.bold ? f.bold : f.regular, color: C.texto });
  }
  const yIzq = yy;
  const det: [string, string][] = [
    [t.date, fecha(d.sent_at, l)],
    [t.validUntil, fecha(d.expires_at, l)],
    d.extra
      ? [t.serviceDate, d.service_date ? fecha(`${d.service_date}T12:00:00Z`, l) : '—']
      : [t.frequency, frecuenciaPdf(d.frequency, l) || '—'],
  ];
  if (!d.extra && d.visit_time) det.push([p.visitTime, horaCorreo(d.visit_time)]);
  const dtW = Math.max(...det.map(([k]) => f.regular.widthOfTextAtSize(k, 8.25))) + 9;
  yy = top - 7 - 6;
  for (const [k, v] of det) {
    yy -= 12;
    D.page.drawText(k, { x: x2, y: yy, size: 8.25, font: f.regular, color: C.gris });
    D.page.drawText(recortar(v, 8.25, f.bold, w2 - dtW), { x: x2 + dtW, y: yy, size: 8.25, font: f.bold, color: C.texto });
  }
  D.y = Math.min(yIzq, yy) - 14;

  // Servicios, add-ons y descuentos: una tabla con la descripción debajo del nombre y el monto a la derecha.
  const filas: string[][] = [];
  const item = (x: Line) => [x.description?.trim() ? `${x.label}\n${x.description.trim()}` : x.label, money(x.amount ?? 0)];
  const grupo = (titulo: string, rows: string[][]) => {
    if (rows.length === 0) return;
    filas.push([titulo.toUpperCase(), '']);
    filas.push(...rows);
  };
  grupo(t.services, d.lines.services.map(item));
  grupo(t.addons, d.lines.addons.map(item));
  grupo(
    t.discounts,
    d.lines.discounts.map((x) => [
      x.kind === 'percent' ? `${x.label} (${x.value}%)` : x.label,
      '-' + money(x.kind === 'percent' ? (d.subtotal * (x.value ?? 0)) / 100 : (x.value ?? 0)),
    ]),
  );
  filas.push([t.subtotal, money(d.subtotal)]);
  if (d.discount > 0) filas.push([t.discounts, '-' + money(d.discount)]);
  filas.push([p.salesTax(Number(d.tax_rate)), money(d.tax)]);
  D.tabla(
    [{ head: l === 'es' ? 'Concepto' : 'Item', w: 4 }, { head: l === 'es' ? 'Monto' : 'Amount', w: 1, num: true }], // D-200
    filas,
    { total: [`${d.extra ? t.totalOnce : t.total} (${p.included})`, money(d.total)], boldFirst: true },
  );

  // "How to accept".
  D.y -= 4;
  D.espacio(30);
  D.page.drawText(p.howTitle, { x: LADO, y: D.y - 8.25, size: 8.25, font: f.bold, color: C.texto });
  D.y -= 12;
  D.parrafo(p.how, { size: 8.25 });

  return await D.guardar();
}

/** Frecuencia del PDF como en la muestra: "Mon, Wed and Fri" en inglés; en español la de siempre. */
function frecuenciaPdf(fr: Frequency, l: Lang): string {
  if (!fr) return '';
  if (l === 'en') return fr.kind === 'weekly' ? diasCorreo(fr) : frecuencia(fr, l);
  return frecuencia(fr, l);
}
