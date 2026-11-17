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
export function initialValues(ctx: TemplateContext, contact: TemplateContact | null): FillValues {
  return {
    nombre: firstName(contact?.name),
    empresa: (ctx.company ?? '').trim(),
    dirección: (contact?.address ?? ctx.address ?? '').trim(),
    telefono: (ctx.sender.phone ?? '').trim(),
    remitente: (ctx.sender.name ?? '').trim(),
  };
}

/** {firma} = nombre de quien envía, "Cid Clean LLC" y su teléfono de Mi perfil (D-323 (2); muestra del survey). */
export function signature(v: Pick<FillValues, 'remitente' | 'telefono'>): string {
  // D-200: sin teléfono, la firma queda sin él (los datos que faltan no bloquean el envío).
  const tel = v.telefono.trim();
  return `${v.remitente.trim()}\nCid Clean LLC${tel ? ` · ${tel}` : ''}`;
}

/** Datos que faltan para los placeholders usados (D-323 (1): la vista previa los marca). */
export function missingFields(used: Placeholder[], v: FillValues): (keyof FillValues)[] {
  const out: (keyof FillValues)[] = [];
  if (used.includes('nombre') && !v.nombre.trim()) out.push('nombre');
  if (used.includes('empresa') && !v.empresa.trim()) out.push('empresa');
  if (used.includes('dirección') && !v.dirección.trim()) out.push('dirección');
  if (used.includes('firma') && !v.remitente.trim()) out.push('remitente');
  if (used.includes('firma') && !v.telefono.trim()) out.push('telefono');
  return out;
}

/** D-200: si un dato queda vacío, el texto usa un genérico ("Hi there", "your business", "your location"). */
export function fill(text: string, v: FillValues): string {
  return text
    .split('{nombre}').join(v.nombre.trim() || 'there')
    .split('{empresa}').join(v.empresa.trim() || 'your business')
    .split('{dirección}').join(v.dirección.trim() || 'your location')
    .split('{firma}').join(signature(v));
}

/** Asunto y cuerpo listos, con el pie legal al final en texto plano. */
export function buildEmail(t: Pick<EmailTemplate, 'subject' | 'body' | 'audience'>, v: FillValues) {
  return { subject: fill(t.subject, v), body: `${fill(t.body, v)}\n\n--\n${footerFor(t.audience)}` };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const validEmail = (e: string) => EMAIL.test(e.trim());

/** `mailto:` con to, subject y body codificados (saltos de línea como %0D%0A). */
export function buildMailto(to: string, subject: string, body: string): string {
  const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, '\r\n'));
  return `mailto:${encodeURIComponent(to.trim()).replace(/%40/g, '@')}?subject=${enc(subject)}&body=${enc(body)}`;
}

/** Texto de "Copiar texto": asunto y cuerpo. */
export const copyText = (subject: string, body: string) => `${subject}\n\n${body}`;

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
