// Quote y portal del cliente (hito 4, D-209): textos de los correos, formato de montos, fechas y frecuencia, y el
// PDF de una página. Este archivo no contiene llaves: RESEND_QUOTES_KEY, PORTAL_CODE_PEPPER y PORTAL_BASE_URL son
// secretos de las funciones.
import { PDFDocument, rgb } from 'npm:pdf-lib@1.17.1';

import { correoHtml, EMPRESA, esc, filas, nota, parrafo, pieTexto, titulo, boton, codigoGrande, firma } from './correo.ts';
import { ALTO, ALTO_PIE, ANCHO, C, caja, encabezado, fuentesMarca, LADO, logoMarca, partir, pie, recortar } from './pdfMarca.ts';

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
    page: 'Página 1 de 1', // D-200
  },
  en: {
    preparedFor: 'Prepared for', details: 'Details', visitTime: 'Visit time',
    salesTax: (r: number) => `Sales tax (${r}%)`, included: 'tax included',
    howTitle: 'How to accept:',
    how: 'open the link in the email we sent, enter the code we email you, read the scope of work and accept online.',
    page: 'Page 1 of 1',
  },
};

/**
 * PDF de una página (D-209) con la marca (D-250, surveys/marca-aprobado/quote-pdf-aprobado.pdf): logo y "Cid Clean
 * LLC", número de quote, franja, tarjetas "Prepared for" y "Details", servicios y add-ons con descripción, descuentos,
 * total con tax en tarjeta verde, "How to accept" y pie de contacto. Un extra (D-238) lleva "Total" y la fecha del
 * servicio en vez de la frecuencia.
 */
export async function pdfQuote(d: PdfData): Promise<Uint8Array> {
  const l = d.language;
  const t = T[l];
  const p = PDF_T[l];
  const doc = await PDFDocument.create();
  doc.setTitle(`${t.quote} ${d.version} · ${d.company}`);
  doc.setAuthor('Cid Clean LLC');
  const page = doc.addPage([ANCHO, ALTO]);
  const f = await fuentesMarca(doc);
  const logo = await logoMarca(doc);
  const W = ANCHO - 2 * LADO;
  let y = encabezado(page, f, logo, { etiqueta: t.quote, valor: d.version });

  // Tarjetas "Prepared for" (1.3fr) y "Details" (1fr), 12 pt de separación.
  const gap = 12;
  const w1 = ((W - gap) * 1.3) / 2.3;
  const w2 = W - gap - w1;
  const x2 = LADO + w1 + gap;
  const pad = 12;
  const h4 = (s: string, x: number, yy: number) => {
    let cx = x;
    for (const ch of s.toUpperCase()) {
      page.drawText(ch, { x: cx, y: yy, size: 7.1, font: f.extra, color: C.gris });
      cx += f.extra.widthOfTextAtSize(ch, 7.1) + 0.7;
    }
  };
  const izq: { s: string; size: number; font: typeof f.regular }[] = [
    ...partir(d.company, f.extra, 12, w1 - 2 * pad).map((s) => ({ s, size: 12, font: f.extra })),
    ...(d.contact_name ? [{ s: recortar(d.contact_name, 8.25, f.regular, w1 - 2 * pad), size: 8.25, font: f.regular }] : []),
    ...partir([d.site, d.address && d.address !== d.site ? d.address : ''].filter(Boolean).join(' · '), f.regular, 8.25, w1 - 2 * pad)
      .map((s) => ({ s, size: 8.25, font: f.regular })),
  ];
  const det: [string, string][] = [
    [t.date, fecha(d.sent_at, l)],
    [t.validUntil, fecha(d.expires_at, l)],
    d.extra
      ? [t.serviceDate, d.service_date ? fecha(`${d.service_date}T12:00:00Z`, l) : '—']
      : [t.frequency, frecuenciaPdf(d.frequency, l) || '—'],
  ];
  if (!d.extra && d.visit_time) det.push([p.visitTime, horaCorreo(d.visit_time)]);
  const altoIzq = 10.5 + 7.1 + 6 + izq.reduce((a, r) => a + r.size * 1.45, 0) + 10.5;
  const altoDer = 10.5 + 7.1 + 6 + det.length * 12.4 + 10.5;
  const altoCaja = Math.max(altoIzq, altoDer);
  caja(page, LADO, y, w1, altoCaja, 12, C.crema);
  caja(page, x2, y, w2, altoCaja, 12, C.crema);
  h4(p.preparedFor, LADO + pad, y - 10.5 - 7.1);
  h4(p.details, x2 + pad, y - 10.5 - 7.1);
  let yy = y - 10.5 - 7.1 - 6;
  for (const r of izq) {
    yy -= r.size * 1.45;
    page.drawText(r.s, { x: LADO + pad, y: yy + r.size * 0.3, size: r.size, font: r.font, color: C.texto });
  }
  const dtW = Math.max(...det.map(([k]) => f.regular.widthOfTextAtSize(k, 8.25))) + 9;
  yy = y - 10.5 - 7.1 - 6;
  for (const [k, v] of det) {
    yy -= 12.4;
    page.drawText(k, { x: x2 + pad, y: yy + 2.5, size: 8.25, font: f.regular, color: C.gris });
    page.drawText(recortar(v, 8.25, f.bold, w2 - 2 * pad - dtW), { x: x2 + pad + dtW, y: yy + 2.5, size: 8.25, font: f.bold, color: C.texto });
  }
  y -= altoCaja;

  // Secciones: título en marca y filas con nombre, descripción y monto.
  const limite = ALTO_PIE + 150; // deja sitio para totales, "How to accept" y pie
  const seccion = (titulo: string, rows: { label: string; detail?: string; value: string }[]) => {
    if (rows.length === 0) return;
    y -= 16.5;
    let cx = LADO;
    for (const ch of titulo.toUpperCase()) {
      page.drawText(ch, { x: cx, y: y - 7.5, size: 7.5, font: f.extra, color: C.marca });
      cx += f.extra.widthOfTextAtSize(ch, 7.5) + 0.75;
    }
    y -= 7.5 + 4.5;
    for (const r of rows) {
      if (y < limite) break;
      const alto = 6.75 + 9 + (r.detail ? 10.5 : 0) + 6.75;
      page.drawText(recortar(r.label, 9, f.bold, W - 90), { x: LADO, y: y - 6.75 - 8, size: 9, font: f.bold, color: C.texto });
      if (r.detail) {
        page.drawText(recortar(r.detail, 7.9, f.regular, W - 90), { x: LADO, y: y - 6.75 - 9 - 9, size: 7.9, font: f.regular, color: C.gris });
      }
      page.drawText(r.value, { x: ANCHO - LADO - f.bold.widthOfTextAtSize(r.value, 9), y: y - 6.75 - 8, size: 9, font: f.bold, color: C.texto });
      y -= alto;
      page.drawLine({ start: { x: LADO, y }, end: { x: ANCHO - LADO, y }, thickness: 0.75, color: C.linea });
    }
  };
  const item = (x: Line) => ({ label: x.label, detail: x.description?.trim() || undefined, value: money(x.amount ?? 0) });
  seccion(t.services, d.lines.services.map(item));
  seccion(t.addons, d.lines.addons.map(item));
  seccion(
    t.discounts,
    d.lines.discounts.map((x) => ({
      label: x.kind === 'percent' ? `${x.label} (${x.value}%)` : x.label,
      value: '−' + money(x.kind === 'percent' ? (d.subtotal * (x.value ?? 0)) / 100 : (x.value ?? 0)),
    })),
  );

  // Totales a la derecha, 217.5 pt (290 px) de ancho.
  y -= 12;
  const wt = 217.5;
  const xt = ANCHO - LADO - wt;
  const filaTot = (k: string, v: string) => {
    y -= 3 + 8.25;
    page.drawText(k, { x: xt, y, size: 8.25, font: f.regular, color: C.gris });
    page.drawText(v, { x: ANCHO - LADO - f.regular.widthOfTextAtSize(v, 8.25), y, size: 8.25, font: f.regular, color: C.gris });
    y -= 3;
  };
  filaTot(t.subtotal, money(d.subtotal));
  if (d.discount > 0) filaTot(t.discounts, '−' + money(d.discount));
  filaTot(p.salesTax(Number(d.tax_rate)), money(d.tax));
  y -= 6;
  const hg = 42;
  caja(page, xt, y, wt, hg, 10.5, C.marca);
  page.drawText(d.extra ? t.totalOnce : t.total, { x: xt + 12, y: y - 18, size: 9, font: f.bold, color: C.blanco });
  page.drawText(p.included, { x: xt + 12, y: y - 30, size: 7.5, font: f.regular, color: rgb(0.85, 0.93, 0.92) });
  const tot = money(d.total);
  page.drawText(tot, { x: ANCHO - LADO - 12 - f.extra.widthOfTextAtSize(tot, 18), y: y - 27, size: 18, font: f.extra, color: C.blanco });
  y -= hg + 13.5;

  // "How to accept".
  const anchoNota = W - 21;
  const lineas = partir(`${p.howTitle} ${p.how}`, f.regular, 8.25, anchoNota);
  const hn = 9 + lineas.length * 12.4 + 9;
  caja(page, LADO, y, W, hn, 10.5, C.suave);
  lineas.forEach((s, i) => {
    const yl = y - 9 - (i + 1) * 12.4 + 3;
    if (i === 0 && s.startsWith(p.howTitle)) {
      page.drawText(p.howTitle, { x: LADO + 10.5, y: yl, size: 8.25, font: f.extra, color: C.texto });
      page.drawText(s.slice(p.howTitle.length), { x: LADO + 10.5 + f.extra.widthOfTextAtSize(p.howTitle, 8.25), y: yl, size: 8.25, font: f.regular, color: C.texto });
    } else page.drawText(s, { x: LADO + 10.5, y: yl, size: 8.25, font: f.regular, color: C.texto });
  });

  pie(page, f, `${t.quote} ${d.version} · ${p.page}`);
  return await doc.save();
}

/** Frecuencia del PDF como en la muestra: "Mon, Wed and Fri" en inglés; en español la de siempre. */
function frecuenciaPdf(fr: Frequency, l: Lang): string {
  if (!fr) return '';
  if (l === 'en') return fr.kind === 'weekly' ? diasCorreo(fr) : frecuencia(fr, l);
  return frecuencia(fr, l);
}
