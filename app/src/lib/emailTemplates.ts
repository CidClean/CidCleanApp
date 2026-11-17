/**
 * Plantillas de correo (orden 120; D-321, D-322, D-323; surveys/plantillas-correo-aprobado.html): llenado de
 * {nombre}, {empresa}, {dirección} y {firma}, pie legal (legal/rev3/5_Prospect_Email_Footer_EN.pdf: Footer A a
 * prospectos, Footer C a clientes) en texto plano y el enlace `mailto:` que abre la app de correo de quien envía.
 * La app no manda correos.
 */

export type TemplateAudience = 'prospect' | 'client';
export type TemplateEntity = 'lead' | 'client';

export type EmailTemplate = {
  id: string;
  name: string;
  audience: TemplateAudience;
  subject: string;
  body: string;
  active: boolean;
  sort: number;
};

export type TemplateContact = { name: string | null; email: string | null; address: string | null };

export type TemplateContext = {
  company: string | null;
  address: string | null;
  contacts: TemplateContact[];
  sender: { name: string | null; phone: string | null };
};

export const PLACEHOLDERS = ['nombre', 'empresa', 'dirección', 'firma'] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];
/** Lo que se puede escribir a mano si falta (la firma falta si falta el teléfono o el nombre de quien envía). */
export type FillValues = { nombre: string; empresa: string; dirección: string; telefono: string; remitente: string };

export const audienceFor = (entity: TemplateEntity): TemplateAudience => (entity === 'lead' ? 'prospect' : 'client');

/** Footer A del abogado (anuncios a prospectos), con el motivo de D-323 (3) y la baja respondiendo "UNSUBSCRIBE". */
export const FOOTER_PROSPECT = [
  'You are receiving this email because your business is located in our service area.',
  'This message is an advertisement from Cid Clean LLC.',
  'Cid Clean LLC · 3727 Milano Lakes Cir, Naples, FL 34114 · (786) 250-1324 · info@cidclean.com',
  'Don\'t want these emails? Reply with "UNSUBSCRIBE". We will remove you within 10 business days. Unsubscribing from marketing emails will not stop service messages about an active quote or account.',
  'Privacy Policy: cidclean.com/privacy',
].join('\n');

/** Footer C del abogado (servicio a clientes), "about your account". */
export const FOOTER_CLIENT = [
  'This is a service message about your account with Cid Clean LLC.',
  'Cid Clean LLC · 3727 Milano Lakes Cir, Naples, FL 34114 · (786) 250-1324 · info@cidclean.com · Privacy Policy: cidclean.com/privacy',
].join('\n');

export const footerFor = (audience: TemplateAudience) => (audience === 'prospect' ? FOOTER_PROSPECT : FOOTER_CLIENT);

/** Largo máximo del `mailto:` en la web antes de avisar y ofrecer "Copiar texto" (orden 120). */
export const MAILTO_WEB_LIMIT = 1800;

/** Placeholders que usa el asunto o el texto. */
export function usedPlaceholders(subject: string, body: string): Placeholder[] {
  const all = `${subject}\n${body}`;
  return PLACEHOLDERS.filter((p) => all.includes(`{${p}}`));
}

/** Primer nombre del contacto ("Hi Armando", muestra del survey). D-200 */
export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

/** Valores de partida para el contacto elegido. */
/** Solo la calle: una dirección sin número de calle (por ejemplo "Naples, FL 34114") no se usa. D-330 */
export function streetOnly(a: string | null | undefined): string {
  const t = (a ?? '').trim();
  return /^\d/.test(t) ? t.split(',')[0].trim() : '';
}

export function initialValues(ctx: TemplateContext, contact: TemplateContact | null): FillValues {
  return {
    nombre: firstName(contact?.name),
    empresa: (ctx.company ?? '').trim(),
    dirección: streetOnly(contact?.address ?? ctx.address),
    telefono: (ctx.sender.phone ?? '').trim(),
    remitente: (ctx.sender.name ?? '').trim(),
  };
}

/** {firma} = nombre de quien envía, "Cid Clean LLC" y su teléfono de Mi perfil (D-323 (2); muestra del survey). */
/** Teléfono de EE. UU. con formato (786) 439-5222; si no son 10 dígitos, tal cual. D-330 */
export function formatPhone(p: string): string {
  const d = p.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p.trim();
}

/** Firma de 3 líneas (D-330): nombre, "Cid Clean LLC | Commercial Cleaning" y teléfono | cidclean.com. */
export function signature(v: Pick<FillValues, 'remitente' | 'telefono'>): string {
  const tel = formatPhone(v.telefono);
  return `${v.remitente.trim()}\nCid Clean LLC | Commercial Cleaning\n${tel ? `${tel} | ` : ''}cidclean.com`;
}

/** Datos que faltan para los placeholders usados (D-323 (1): la vista previa los marca). */
export function missingFields(used: Placeholder[], v: FillValues): (keyof FillValues)[] {
  const out: (keyof FillValues)[] = [];
  if (used.includes('nombre') && !v.nombre.trim()) out.push('nombre');
  if (used.includes('empresa') && !v.empresa.trim()) out.push('empresa');
  // D-331: la dirección no se pide; sin calle, el texto dice "your office".
  if (used.includes('firma') && !v.remitente.trim()) out.push('remitente');
  if (used.includes('firma') && !v.telefono.trim()) out.push('telefono');
  return out;
}

/** D-200: si un dato queda vacío, el texto usa un genérico ("Hi there", "your business", "your location"). */
export function fill(text: string, v: FillValues): string {
  return text
    .split('{nombre}').join(v.nombre.trim() || 'there')
    .split('{empresa}').join(v.empresa.trim() || 'your business')
    .split('{dirección}').join(v.dirección.trim() || 'your office')
    .split('{firma}').join(signature(v));
}

const RULE = '______________________________';

/** Pie en párrafos cortos (D-330): mismo texto del abogado, solo cambia la separación. */
function footerBlocks(audience: TemplateAudience): string[][] {
  const l = footerFor(audience).split('\n');
  return audience === 'prospect' ? [[l[0], l[1]], [l[2]], [l[3]], [l[4]]] : [[l[0]], [l[1]]];
}

/** Asunto y cuerpo listos, con el pie legal al final en texto plano. */
export function buildEmail(t: Pick<EmailTemplate, 'subject' | 'body' | 'audience'>, v: FillValues) {
  const foot = footerBlocks(t.audience).map((b) => b.join(' ')).join('\n\n');
  return { subject: fill(t.subject, v), body: `${fill(t.body, v)}\n\n${RULE}\n\n${foot}` };
}

const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Mismo correo en HTML para pegar con formato (D-330): texto a 14px y pie legal más pequeño (11px) y gris. */
export function buildEmailHtml(t: Pick<EmailTemplate, 'subject' | 'body' | 'audience'>, v: FillValues): string {
  const paras = fill(t.body, v)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const foot = footerBlocks(t.audience)
    .map((b) => `<p style="margin:0 0 6px">${esc(b.join(' '))}</p>`)
    .join('');
  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937">${paras}</div>` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.45;color:#6b7280;border-top:1px solid #e5e7eb;margin-top:18px;padding-top:10px">${foot}</div>`
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const validEmail = (e: string) => EMAIL.test(e.trim());

/** `mailto:` con to, subject y body codificados (saltos de línea como %0D%0A). */
export function buildMailto(to: string, subject: string, body: string): string {
  const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, '\r\n'));
  const b = body ? `&body=${enc(body)}` : '';
  return `mailto:${encodeURIComponent(to.trim()).replace(/%40/g, '@')}?subject=${enc(subject)}${b}`;
}

/** Texto que se copia: solo el cuerpo; el asunto ya va en el enlace (D-326). */
export const copyText = (_subject: string, body: string) => body;

/** Inserta el placeholder en la posición del cursor (o al final). Devuelve el texto y el cursor nuevo. */
export function insertAt(text: string, sel: { start: number; end: number } | null, p: Placeholder) {
  const token = `{${p}}`;
  const start = sel ? Math.max(0, Math.min(sel.start, text.length)) : text.length;
  const end = sel ? Math.max(start, Math.min(sel.end, text.length)) : start;
  return { text: text.slice(0, start) + token + text.slice(end), cursor: start + token.length };
}

export type TemplateForm = { name: string; audience: TemplateAudience; subject: string; body: string; active: boolean };
export type TemplateFormErrors = Partial<Record<'name' | 'subject' | 'body', true>>;

export function validateTemplate(f: TemplateForm): TemplateFormErrors {
  const e: TemplateFormErrors = {};
  if (!f.name.trim()) e.name = true;
  if (!f.subject.trim()) e.subject = true;
  if (!f.body.trim()) e.body = true;
  return e;
}

/** Orden de la lista: por `sort` y luego por nombre (D-200). */
export function sortTemplates(list: EmailTemplate[]): EmailTemplate[] {
  return [...list].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}
