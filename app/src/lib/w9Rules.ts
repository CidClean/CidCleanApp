/**
 * Reglas del W-9 prellenado del 1099 (D-255, D-256, D-257, D-258), iguales a las de la base (w9_clean, w9_data_valid)
 * y de la Edge Function (tinValid). El número (SSN, ITIN o EIN) solo vive en la pantalla mientras se escribe: estas
 * funciones no lo guardan en ningún lado.
 */

export const CLASSIFICATIONS = ['individual', 'c_corp', 's_corp', 'partnership', 'trust_estate', 'llc', 'other'] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];
export type LlcLetter = '' | 'C' | 'S' | 'P';
export type TinType = 'ssn' | 'itin' | 'ein';

/** Nombres de la línea 3a como en el formulario oficial (D-257). */
export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  individual: 'Individual/sole proprietor',
  c_corp: 'C corporation',
  s_corp: 'S corporation',
  partnership: 'Partnership',
  trust_estate: 'Trust/estate',
  llc: 'LLC',
  other: 'Other',
};

export type W9Data = {
  name: string;
  business: string;
  classification: Classification;
  llc: LlcLetter;
  other: string;
  foreign_partners: boolean;
  exempt_payee: string;
  fatca: string;
  address: string;
  city: string;
  accounts: string;
};

export function emptyW9(name = ''): W9Data {
  return {
    name, business: '', classification: 'individual', llc: '', other: '', foreign_partners: false,
    exempt_payee: '', fatca: '', address: '', city: '', accounts: '',
  };
}

/** Como w9_clean: recorta y deja la letra del LLC y el texto de Other solo con su clasificación (D-258). */
export function cleanW9(d: W9Data): W9Data {
  return {
    name: d.name.trim(),
    business: d.business.trim(),
    classification: d.classification,
    llc: d.classification === 'llc' ? (d.llc.trim().toUpperCase() as LlcLetter) : '',
    other: d.classification === 'other' ? d.other.trim() : '',
    foreign_partners: d.foreign_partners === true,
    exempt_payee: d.exempt_payee.trim(),
    fatca: d.fatca.trim().toUpperCase(),
    address: d.address.trim(),
    city: d.city.trim(),
    accounts: d.accounts.trim(),
  };
}

export type W9Error = 'name' | 'llc' | 'other' | 'exempt' | 'fatca' | 'address' | 'city' | 'accounts' | 'long';

/** Errores del formulario, en el orden de las líneas. Vacío si se puede enviar o firmar. */
export function w9Errors(raw: W9Data): W9Error[] {
  const d = cleanW9(raw);
  const e: W9Error[] = [];
  if (!d.name) e.push('name');
  if (d.name.length > 120 || d.business.length > 120 || d.address.length > 120 || d.city.length > 120) e.push('long');
  if (d.classification === 'llc' && !['C', 'S', 'P'].includes(d.llc)) e.push('llc');
  if (d.classification === 'other' && (!d.other || d.other.length > 60)) e.push('other');
  if (d.exempt_payee && !/^([1-9]|1[0-3])$/.test(d.exempt_payee)) e.push('exempt');
  if (d.fatca && !/^[A-M]$/.test(d.fatca)) e.push('fatca');
  if (!d.address) e.push('address');
  if (!d.city) e.push('city');
  if (d.accounts.length > 100) e.push('accounts');
  return e;
}

/** Texto de la clasificación (con la letra del LLC o el texto de Other). */
export function classificationText(d: Pick<W9Data, 'classification' | 'llc' | 'other'>): string {
  if (d.classification === 'llc' && d.llc) return `LLC (${d.llc})`;
  if (d.classification === 'other' && d.other.trim()) return `Other: ${d.other.trim()}`;
  return CLASSIFICATION_LABELS[d.classification];
}

export function addressText(d: Pick<W9Data, 'address' | 'city'>): string {
  return [d.address.trim(), d.city.trim()].filter(Boolean).join(', ');
}

/** Solo los dígitos, hasta 9. */
export function tinDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 9);
}

/** Como tinValid de la Edge Function: 9 dígitos; ITIN empieza con 9; SSN no (ni 000, 666, grupo 00 o serie 0000); EIN no empieza con 00. */
export function tinValid(type: TinType, value: string): boolean {
  const d = value.replace(/[\s-]/g, '');
  if (!/^\d{9}$/.test(d)) return false;
  if (type === 'itin') return d[0] === '9';
  if (type === 'ssn') return !(d[0] === '9' || d.startsWith('000') || d.startsWith('666') || d.slice(3, 5) === '00' || d.slice(5) === '0000');
  return !d.startsWith('00');
}

/** Máscara mientras se escribe: SSN e ITIN 123-45-6789, EIN 12-3456789. */
export function formatTin(type: TinType, value: string): string {
  const d = tinDigits(value);
  if (type === 'ein') return d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d;
  if (d.length > 5) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  if (d.length > 3) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return d;
}

/** Máscara oculta (muestra aprobada: •••-••-4821): solo se ven los últimos 4. */
export function maskTin(type: TinType, value: string): string {
  const d = tinDigits(value);
  let pos = 0;
  return formatTin(type, d)
    .split('')
    .map((c) => (c === '-' ? c : pos++ < d.length - 4 ? '•' : c))
    .join('');
}

export type W9Change = { field: 'name' | 'business' | 'classification' | 'address'; before: string | null; after: string | null };
