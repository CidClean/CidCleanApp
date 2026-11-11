// Estimador y contacto del sitio cidclean.com (orden 91; D-307, D-309, D-200). Lógica sin Deno para poder probarla
// con Node: validación, anti-spam, llamada a site_submit y correos. index.ts de site-estimate solo conecta Deno.
// Este archivo no contiene llaves.
import { correoHtml, esc, filas, firma, nota, parrafo, pieTexto, titulo } from './correo.ts';

export const CITIES = ['Naples', 'Bonita Springs', 'Estero', 'Marco Island', 'Other'] as const;
export const FROM_ESTIMATES = 'Cid Clean <estimates@mail.cidclean.com>'; // D-200
export const INTERNAL_TO = 'info@cidclean.com';
export const APP_URL = 'https://app.cidclean.com';
export const MIN_FILL_MS = 3000; // D-311: menos de 3 s llenando el formulario se trata como robot.
export const MAX_TOKEN_MS = 2 * 60 * 60 * 1000; // D-200: el token del formulario vale 2 h.
export const NAME_MAX = 60; // D-200: el nombre se recorta a 60 caracteres.
// Orden 100 (N3): sin la vista previa de Cloudflare Pages.
const ORIGINS = ['https://cidclean.com', 'https://www.cidclean.com'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ZIP = /^\d{5}(-\d{4})?$/;
const KEY = /^[a-z0-9_]{1,40}$/;

export type Kind = 'estimate' | 'contact';
export interface Submission {
  kind: Kind;
  name: string;
  company: string;
  email: string;
  phone: string;
  city: string;
  zip: string;
  type: string | null;
  sqft: number | null;
  frequency: string | null;
  message: string | null;
}
export interface SubmitResult {
  status: 'ok' | 'invalid' | 'rate_limited';
  lead_id?: string;
  new_lead?: boolean;
  type_name?: string;
  frequency_name?: string;
  per_visit?: number;
  monthly?: number;
  range_low?: number;
  range_high?: number;
  walkthrough_recommended?: boolean;
  /** Tope global de la base (D-200): false si este envío ya no lleva correo al cliente. */
  send_customer_mail?: boolean;
}
export interface Deps {
  submit: (s: Submission, ipHash: string | null) => Promise<SubmitResult>;
  send: (m: { from: string; to: string; replyTo: string; subject: string; html: string; text: string }) => Promise<boolean>;
  pepper: string;
  /** Reloj inyectable para las pruebas. */
  now?: () => number;
}

export function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max + 1) : '');
const digits = (s: string) => s.replace(/\D/g, '');

/** Valida el cuerpo. Devuelve los datos limpios o los errores por campo (textos de D-200, iguales a los del sitio). */
export function validar(b: Record<string, unknown>): { ok: true; data: Submission } | { ok: false; fields: Record<string, string> } {
  const f: Record<string, string> = {};
  const kind = b.kind === 'estimate' || b.kind === 'contact' ? b.kind : null;
  if (!kind) return { ok: false, fields: { kind: 'Invalid request.' } };
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, NAME_MAX).trim() : ''; // D-200: se recorta, no es error
  const company = str(b.company, 120);
  const email = str(b.email, 160).toLowerCase();
  const phone = str(b.phone, 20);
  const city = str(b.city, 40);
  const zip = str(b.zip, 10);
  if (!name) f.name = 'Please fill in this field.';
  if (company.length > 120) f.company = 'Please use 120 characters or fewer.';
  if (!EMAIL.test(email) || email.length > 160) f.email = 'Please enter a valid email address.';
  const d = digits(phone);
  if (!(d.length === 10 || (d.length === 11 && d[0] === '1'))) f.phone = 'Please enter a 10-digit US phone number.';
  if (!(CITIES as readonly string[]).includes(city)) f.city = 'Please choose a city.';
  if (zip && !ZIP.test(zip)) f.zip = 'Please enter a 5-digit ZIP code.';
  let type: string | null = null;
  let sqft: number | null = null;
  let frequency: string | null = null;
  let message: string | null = null;
  if (kind === 'estimate') {
    type = typeof b.type === 'string' && KEY.test(b.type) ? b.type : null;
    frequency = typeof b.frequency === 'string' && KEY.test(b.frequency) ? b.frequency : null;
    const n = typeof b.sqft === 'number' ? b.sqft : Number(digits(String(b.sqft ?? '')));
    sqft = Number.isInteger(n) && n >= 200 && n <= 1_000_000 ? n : null;
    if (!type) f.type = 'Please choose a type of space.';
    if (!frequency) f.frequency = 'Please choose how often.';
    if (sqft === null) f.sqft = 'Enter a size between 200 and 1,000,000 sq ft.';
  } else {
    message = str(b.message, 2000);
    if (message.length < 10) f.message = 'Please tell us a little about what you need (at least 10 characters).';
    else if (message.length > 2000) f.message = 'Please use 2,000 characters or fewer.';
  }
  if (Object.keys(f).length) return { ok: false, fields: f };
  return { ok: true, data: { kind, name, company, email, phone, city, zip, type, sqft, frequency, message } };
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join('');

/** Firma HMAC-SHA-256 con una llave derivada de la pimienta (no se usa la pimienta tal cual). */
async function firmar(pepper: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`${pepper}:site-form-token:v1`),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
}

/** Token del formulario (orden 100): la hora de emisión firmada por el servidor. El cliente no puede fijarla. */
export async function crearToken(pepper: string, nowMs: number): Promise<string> {
  const t = String(Math.floor(nowMs));
  return `v1.${t}.${await firmar(pepper, `site:${t}`)}`;
}

/** Vale si la firma es buena y tiene entre 3 s y 2 h. */
export async function tokenValido(pepper: string, token: unknown, nowMs: number): Promise<boolean> {
  if (!pepper || typeof token !== 'string' || token.length > 200) return false;
  const m = /^v1\.(\d{1,15})\.([0-9a-f]{64})$/.exec(token);
  if (!m) return false;
  const edad = nowMs - Number(m[1]);
  if (!(edad >= MIN_FILL_MS && edad <= MAX_TOKEN_MS)) return false;
  const esperado = await firmar(pepper, `site:${m[1]}`);
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= esperado.charCodeAt(i) ^ m[2].charCodeAt(i);
  return diff === 0;
}

/** Campo trampa lleno o sin un token válido (enviado en menos de 3 s, viejo o falso). */
export async function esSpam(b: Record<string, unknown>, pepper: string, nowMs: number): Promise<boolean> {
  if (typeof b.website === 'string' && b.website.trim() !== '') return true;
  return !(await tokenValido(pepper, b.token, nowMs));
}

/** Lo que cuenta para el límite por IP: la IPv4 completa; en IPv6, su prefijo /64 (cada cliente tiene un /64). */
export function claveIp(ip: string | null): string | null {
  if (!ip) return null;
  const s = ip.trim().toLowerCase().replace(/%.*$/, '');
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (v4) return v4[1];
  if (!s.includes(':')) return null;
  const [cabeza, cola = ''] = s.split('::');
  const a = cabeza ? cabeza.split(':') : [];
  const b = s.includes('::') ? (cola ? cola.split(':') : []) : [];
  if (b.some((x) => x.includes('.')) || a.some((x) => x.includes('.'))) return null;
  const grupos = s.includes('::') ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b] : a;
  if (grupos.length !== 8 || grupos.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return grupos.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

/** Hash de la IP (o de su /64) con pimienta (como los portales): la base nunca guarda la IP. Sin IP: null (balde común). */
export async function hashIp(pepper: string, ip: string | null): Promise<string | null> {
  const k = claveIp(ip);
  if (!k) return null;
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${pepper}:site:${k}`)));
}

/** Saludo del correo (D-200): genérico si el nombre trae un enlace, "http", "www." o "@". */
export function saludo(name: string): string {
  const n = name.slice(0, NAME_MAX);
  if (/https?|www\.|@|:\/\/|[a-z0-9-]\.[a-z]{2,}/i.test(n)) return 'Hi there';
  return `Hi ${n.split(/\s+/)[0]}`;
}

export const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const sq = (n: number) => n.toLocaleString('en-US');

/** Correo al cliente "Your Cid Clean estimate" (D-250: marca de los correos actuales). */
export function correoCliente(s: Submission, r: SubmitResult) {
  const range = `${money(r.range_low!)} – ${money(r.range_high!)}`;
  const hola = saludo(s.name);
  const items = [
    { title: 'Type of space', detail: r.type_name ?? '' },
    { title: 'Size', detail: `${sq(s.sqft!)} sq ft` },
    { title: 'Frequency', detail: r.frequency_name ?? '' },
    { title: 'City', detail: s.zip ? `${s.city}, FL ${s.zip}` : s.city === 'Other' ? 'Other' : `${s.city}, FL` },
  ];
  const tarjeta = [
    titulo(`${hola}, here's your estimate`),
    parrafo('Thanks for using the Cid Clean estimator. Here is what you chose and your estimated monthly range.'),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0F766E;border-radius:18px;margin:0 0 18px"><tr><td style="padding:18px 20px;color:#FFFFFF"><div style="font-size:13px;font-weight:700;opacity:.85">Estimated monthly range</div><div style="font-size:30px;font-weight:800;letter-spacing:-0.3px">${esc(range)}</div><div style="font-size:13px;opacity:.85">About ${esc(money(r.per_visit!))} per visit</div></td></tr></table>`,
    filas(items),
    r.walkthrough_recommended
      ? parrafo('<b>Your space is over 25,000 sq ft</b>, so we recommend a free walkthrough to price it accurately.')
      : '',
    `<div style="font-size:15px;line-height:1.55;color:#8A4B0F;background:#FBE3C7;border-radius:12px;padding:12px 14px;margin:18px 0">This is an estimate, not a final price. Your exact price is set after a free walkthrough.</div>`,
    parrafo(`<b>Next step:</b> schedule your free walkthrough. Reply to this email, call <a href="tel:+17862501324" style="color:#0F766E;font-weight:700;text-decoration:none">(786) 250-1324</a> or write to <a href="mailto:info@cidclean.com" style="color:#0F766E;font-weight:700;text-decoration:none">info@cidclean.com</a>.`),
    firma('Thank you,'),
  ].join('');
  const text = [
    `${hola}, here's your estimate.`,
    '',
    `Estimated monthly range: ${range} (about ${money(r.per_visit!)} per visit)`,
    ...items.map((i) => `${i.title}: ${i.detail}`),
    ...(r.walkthrough_recommended ? ['', 'Your space is over 25,000 sq ft, so we recommend a free walkthrough to price it accurately.'] : []),
    '',
    'This is an estimate, not a final price. Your exact price is set after a free walkthrough.',
    '',
    'Next step: schedule your free walkthrough. Reply to this email, call (786) 250-1324 or write to info@cidclean.com.',
    '',
    'Thank you,',
    'Cid Clean LLC',
    '',
    pieTexto(),
  ].join('\n');
  return { subject: 'Your Cid Clean estimate', html: correoHtml({ preview: `Your estimated monthly range: ${range}`, tarjeta }), text };
}

export const SIN_CORREO = 'Estimate email to the customer not sent: hourly limit reached.'; // D-200

/** Aviso interno a info@cidclean.com con los datos y el enlace al lead en la app. */
export function correoInterno(s: Submission, r: SubmitResult) {
  const url = `${APP_URL}/leads/${r.lead_id}`;
  const esEstimado = s.kind === 'estimate';
  const subject = `${esEstimado ? 'New website estimate' : 'New website message'}: ${s.company || s.name}${r.new_lead ? '' : ' (existing lead)'}`;
  const items = [
    { title: 'Name', detail: s.name },
    ...(s.company ? [{ title: 'Company', detail: s.company }] : []),
    { title: 'Email', detail: s.email },
    { title: 'Phone', detail: s.phone },
    { title: 'City', detail: s.zip ? `${s.city} ${s.zip}` : s.city },
    ...(esEstimado
      ? [
          { title: 'Type', detail: r.type_name ?? s.type ?? '' },
          { title: 'Size', detail: `${sq(s.sqft!)} sq ft` },
          { title: 'Frequency', detail: r.frequency_name ?? s.frequency ?? '' },
          { title: 'Range shown', detail: `${money(r.range_low!)} – ${money(r.range_high!)} per month (about ${money(r.per_visit!)} per visit)${r.walkthrough_recommended ? ' · walkthrough recommended' : ''}` },
        ]
      : [{ title: 'Message', detail: s.message ?? '' }]),
  ];
  const tarjeta = [
    titulo(esEstimado ? 'New website estimate' : 'New website message', 22),
    parrafo(r.new_lead ? 'A new lead was created in Leads.' : 'This email already had an open lead, so the details were added to its notes.'),
    r.send_customer_mail === false && esEstimado ? parrafo(SIN_CORREO) : '',
    filas(items),
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 10px"><tr><td style="background:#0F766E;border-radius:14px"><a href="${esc(url)}" style="display:inline-block;padding:14px 26px;color:#FFFFFF;font-size:16px;font-weight:800;text-decoration:none">Open lead</a></td></tr></table>`,
    nota('Sent automatically by the cidclean.com estimator.'),
  ].join('');
  const text = [subject, '', ...items.map((i) => `${i.title}: ${i.detail}`),
    ...(r.send_customer_mail === false && esEstimado ? ['', SIN_CORREO] : []), '', `Open lead: ${url}`].join('\n');
  return { subject, html: correoHtml({ preview: subject, tarjeta }), text };
}

function json(status: number, body: Record<string, unknown>, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } });
}

/** Maneja una petición. `ip` viene de _shared/ip.ts. */
export async function manejar(req: Request, ip: string | null, deps: Deps): Promise<Response> {
  const origin = req.headers.get('origin');
  const ahora = (deps.now ?? Date.now)();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  // Token del formulario (orden 100): la página lo pide al cargarse y lo devuelve al enviar.
  if (req.method === 'GET') return json(200, { token: await crearToken(deps.pepper, ahora) }, origin);
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' }, origin);
  let b: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 10_000) return json(413, { error: 'too_large' }, origin);
    b = JSON.parse(raw);
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error('shape');
  } catch {
    return json(400, { error: 'invalid' }, origin);
  }
  if (b.kind === 'token') return json(200, { token: await crearToken(deps.pepper, ahora) }, origin);
  // Robots: misma respuesta que un envío correcto, sin crear nada ni mandar correos.
  if (await esSpam(b, deps.pepper, ahora)) return json(200, { ok: true }, origin);
  const v = validar(b);
  if (!v.ok) return json(400, { error: 'invalid', fields: v.fields }, origin);
  let r: SubmitResult;
  try {
    r = await deps.submit(v.data, await hashIp(deps.pepper, ip));
  } catch {
    return json(500, { error: 'server_error' }, origin);
  }
  if (r.status === 'rate_limited') return json(429, { error: 'rate_limited' }, origin);
  if (r.status !== 'ok') return json(400, { error: 'invalid', fields: {} }, origin);

  // Correos: si fallan, el lead ya quedó creado; no se le muestra error al cliente.
  const interno = correoInterno(v.data, r);
  const tareas = [deps.send({ from: FROM_ESTIMATES, to: INTERNAL_TO, replyTo: v.data.email, ...interno })];
  // Tope global (D-200): la base dice si este envío todavía lleva correo al cliente.
  if (v.data.kind === 'estimate' && r.send_customer_mail === true) {
    tareas.push(deps.send({ from: FROM_ESTIMATES, to: v.data.email, replyTo: INTERNAL_TO, ...correoCliente(v.data, r) }));
  }
  await Promise.allSettled(tareas);

  if (v.data.kind === 'contact') return json(200, { ok: true }, origin);
  return json(200, {
    ok: true,
    range_low: r.range_low,
    range_high: r.range_high,
    per_visit: r.per_visit,
    walkthrough_recommended: r.walkthrough_recommended === true,
  }, origin);
}
