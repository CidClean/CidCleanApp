// Entrada segura de leads de anuncios y agentes de IA (orden 160; D-347, D-348, D-350). Lógica sin Deno para poder
// probarla con Node; lead-intake/index.ts solo conecta Deno. La base (lead_intake, solo service role) valida la clave
// por su hash, limita por fuente (D-200), crea o junta y avisa. Este archivo no contiene llaves.

export const KEY_HEADER = 'x-cidclean-key';
export const MAX_BATCH = 200;
export const MAX_BODY = 512 * 1024; // D-200: 512 KB por petición (200 leads de sobra).

export type IntakeLead = {
  company: string;
  contact_name: string;
  phone: string;
  email: string;
  city: string;
  zip: string;
  service: 'recurring' | 'one_time' | '';
  property: 'commercial' | 'residential' | '';
  notes: string;
  source_detail: string;
};

export type IntakeResult =
  | { status: 'ok'; created: number; merged: number; rejected: number; errors?: { index: number; reason: string }[] }
  | { status: 'unauthorized' | 'invalid' | 'rate_limited' };

export interface Deps {
  intake: (keyHash: string, leads: IntakeLead[]) => Promise<IntakeResult>;
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join('');

/** SHA-256 (hex) de la clave: la base solo conoce el hash. */
export async function hashKey(key: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)));
}

/** Texto limpio: sin etiquetas HTML, sin caracteres de control, espacios juntos y recortado. */
export function clean(v: unknown, max: number): string {
  if (typeof v === 'number') v = String(v);
  if (typeof v !== 'string') return '';
  return v
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

/** Igual que clean pero conserva los saltos de línea (notas). */
function cleanNotes(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
    .trim();
}

/** Teléfono de EE. UU. (D-216, D-219): 10 dígitos (un 1 inicial se quita), área y central de 2 a 9; si no, vacío. */
export function normalizePhone(v: unknown): string {
  const d0 = clean(v, 40).replace(/\D/g, '');
  const d = d0.length === 11 && d0.startsWith('1') ? d0.slice(1) : d0;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(d)) return '';
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
const first = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
};

function service(v: unknown): IntakeLead['service'] {
  const s = clean(v, 20).toLowerCase().replace(/[\s_-]/g, '');
  if (s === 'onetime' || s === 'once' || s === 'oneoff') return 'one_time';
  if (s === 'recurring' || s === 'recurrent' || s === 'recurrente') return 'recurring';
  return '';
}

function property(v: unknown): IntakeLead['property'] {
  const s = clean(v, 20).toLowerCase();
  if (s === 'residential' || s === 'residencial' || s === 'home') return 'residential';
  if (s === 'commercial' || s === 'comercial' || s === 'business') return 'commercial';
  return '';
}

/**
 * Un lead del cuerpo, con los nombres de la app o los típicos de Meta y TikTok Lead Ads (full_name, phone_number,
 * email, company_name), para que Make los pase casi sin mapear. Sin email válido queda vacío (la base decide).
 */
export function normalizeLead(raw: unknown): IntakeLead | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const email = clean(first(o, ['email', 'email_address']), 160).toLowerCase();
  const zip = clean(first(o, ['zip', 'zip_code', 'postal_code', 'post_code']), 10);
  return {
    company: clean(first(o, ['company', 'company_name']), 120),
    contact_name: clean(first(o, ['contact_name', 'contact name', 'full_name', 'name']), 80),
    phone: normalizePhone(first(o, ['phone', 'phone_number'])),
    email: EMAIL.test(email) ? email : '',
    city: clean(o.city, 80),
    zip: /^\d{5}(-\d{4})?$/.test(zip) ? zip : '',
    service: service(o.service),
    property: property(o.property),
    notes: cleanNotes(first(o, ['notes', 'message', 'job']), 2000),
    source_detail: clean(first(o, ['source_detail', 'platform']), 100),
  };
}

const HEADERS = { 'Content-Type': 'application/json' };
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: HEADERS });

/** Maneja una petición: POST con la clave en `x-cidclean-key`; un lead, una lista o `{ leads: [...] }` (máx. 200). */
export async function manejar(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const key = req.headers.get(KEY_HEADER) ?? '';
  // Sin clave con forma válida: 401 sin detalles (la base ni se consulta).
  if (!/^ccl_[0-9a-f]{48}$/.test(key)) return json(401, { error: 'unauthorized' });
  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json(413, { error: 'too_large' });
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const list = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && Array.isArray((body as { leads?: unknown }).leads)
      ? (body as { leads: unknown[] }).leads
      : [body];
  if (list.length === 0) return json(400, { error: 'empty' });
  if (list.length > MAX_BATCH) return json(400, { error: 'too_many', max: MAX_BATCH });
  // Lo que no es un objeto se manda como {} para que la base lo cuente como rechazado con su índice.
  const leads = list.map((x) => normalizeLead(x) ?? ({} as IntakeLead));
  let r: IntakeResult;
  try {
    r = await deps.intake(await hashKey(key), leads);
  } catch {
    return json(500, { error: 'server_error' });
  }
  if (r.status === 'unauthorized') return json(401, { error: 'unauthorized' });
  if (r.status === 'rate_limited') return json(429, { error: 'rate_limited' });
  if (r.status !== 'ok') return json(400, { error: 'invalid' });
  return json(200, { ok: true, created: r.created, merged: r.merged, rejected: r.rejected, errors: r.errors ?? [] });
}
