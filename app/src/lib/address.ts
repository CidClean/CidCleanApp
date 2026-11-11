import { isUsState, isValidZip } from './usStates';

/**
 * Direcciones con la misma composición en toda la app (D-301): Dirección (calle), Dirección 2, City, State (50 estados
 * + DC, por defecto FL) y ZIP code (5 o 5+4). Mismas reglas que format_address y parse_us_address de la base
 * (20261111000001) y que supabase/functions/_shared/address.ts.
 */
export type AddressParts = { addressLine1: string; addressLine2: string; city: string; state: string; zip: string };

export const DEFAULT_STATE = 'FL';

export function emptyAddress(state: string = DEFAULT_STATE): AddressParts {
  return { addressLine1: '', addressLine2: '', city: '', state, zip: '' };
}

/** Sin calle no hay dirección (el State por defecto no cuenta). */
export function isAddressEmpty(a: AddressParts): boolean {
  return a.addressLine1.trim() === '' && a.addressLine2.trim() === '' && a.city.trim() === '' && a.zip.trim() === '';
}

/** Una línea: "calle, dirección 2, City, ST ZIP" con lo que haya. */
export function formatAddressLine(a: Partial<Record<keyof AddressParts, string | null | undefined>>): string {
  const t = (v: string | null | undefined) => (v ?? '').trim();
  if (!t(a.addressLine1) && !t(a.addressLine2) && !t(a.city) && !t(a.zip)) return '';
  const stateZip = [t(a.state), t(a.zip)].filter(Boolean).join(' ');
  return [t(a.addressLine1), t(a.addressLine2), t(a.city), stateZip].filter(Boolean).join(', ');
}

/** Línea 5 del W-9: calle y dirección 2. */
export function streetLine(a: Pick<AddressParts, 'addressLine1' | 'addressLine2'>): string {
  return [a.addressLine1.trim(), a.addressLine2.trim()].filter(Boolean).join(', ');
}

/** Línea 6 del W-9: "City, ST ZIP". */
export function cityStateZipLine(a: Pick<AddressParts, 'city' | 'state' | 'zip'>): string {
  if (!a.city.trim() && !a.zip.trim()) return ''; // el State por defecto solo no cuenta
  const stateZip = [a.state.trim(), a.zip.trim()].filter(Boolean).join(' ');
  return [a.city.trim(), stateZip].filter(Boolean).join(', ');
}

const UNIT = /^(.*\S)\s+((?:suite|ste|apt|apartment|unit|bldg|building|floor|fl|room|rm)\.?\s*\S.*|#\s*\S.*)$/i;

/**
 * Separa un texto libre. Solo separa si reconoce ciudad, estado y ZIP (D-301); si no, todo queda en Dirección y
 * `needsReview` es true. "1250 Pine Ridge Rd Suite 202, Naples, FL 34108" → calle, Suite 202, Naples, FL, 34108.
 */
export function parseAddress(text: string | null | undefined): { parts: AddressParts; needsReview: boolean } {
  let t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (t === '') return { parts: emptyAddress(), needsReview: false };
  t = t.replace(/,?\s*(USA|U\.S\.A\.|US|United States)\.?$/i, '');
  const m = /^(.+),\s*([^,0-9][^,]*?)\s*,?\s+([A-Za-z]{2}|Florida)\.?\s*,?\s*(\d{5}(?:-\d{4})?)$/i.exec(t);
  if (m) {
    const state = m[3].toLowerCase() === 'florida' ? 'FL' : m[3].toUpperCase();
    const street = m[1].trim();
    const city = m[2].trim();
    if (isUsState(state) && street && city && city.length <= 80) {
      let line1 = street;
      let line2 = '';
      const comma = street.indexOf(',');
      if (comma >= 0) {
        line1 = street.slice(0, comma).trim();
        line2 = street.slice(comma + 1).trim();
      } else {
        const u = UNIT.exec(street);
        if (u && /[A-Za-z]/.test(u[1])) {
          line1 = u[1];
          line2 = u[2];
        }
      }
      if (line1 && line1.length <= 120 && line2.length <= 120) {
        return { parts: { addressLine1: line1, addressLine2: line2, city, state, zip: m[4] }, needsReview: false };
      }
    }
  }
  return { parts: { ...emptyAddress(), addressLine1: t.slice(0, 120) }, needsReview: true };
}

/** Partes desde una fila de la base (lead_sites, clients, jobsites, profiles). */
export type AddressRow = {
  address?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  address_needs_review?: boolean | null;
};

export function addressFromRow(r: AddressRow): { parts: AddressParts; line: string; needsReview: boolean } {
  if (r.address_line1 == null) {
    // Base sin la migración de D-301 o fila sin dirección: se separa aquí con las mismas reglas.
    const p = parseAddress(r.address);
    return { parts: p.parts, line: (r.address ?? '').trim(), needsReview: p.needsReview };
  }
  const parts: AddressParts = {
    addressLine1: r.address_line1 ?? '',
    addressLine2: r.address_line2 ?? '',
    city: r.city ?? '',
    state: r.state ?? '',
    zip: r.zip ?? '',
  };
  return {
    parts,
    line: formatAddressLine(parts) || (r.address ?? '').trim(),
    needsReview: r.address_needs_review ?? (!parts.city || !parts.state || !parts.zip),
  };
}

/** Cuerpo para la base: partes limpias y la línea de compatibilidad `address` (vacía sin calle). */
export function addressBody(a: AddressParts) {
  const noStreet = a.addressLine1.trim() === '';
  const parts: AddressParts = {
    addressLine1: a.addressLine1.trim(),
    addressLine2: noStreet ? '' : a.addressLine2.trim(),
    city: noStreet ? '' : a.city.trim(),
    state: noStreet ? '' : a.state,
    zip: noStreet ? '' : a.zip.trim(),
  };
  return {
    address_line1: parts.addressLine1,
    address_line2: parts.addressLine2,
    city: parts.city,
    state: parts.state,
    zip: parts.zip,
    address: formatAddressLine(parts),
  };
}

export type AddressErrors = { addressLine1?: true; city?: true; state?: true; zip?: true };

/**
 * Errores de la dirección. `required`: la dirección es obligatoria (sitios y jobsites). Si es opcional y tiene algo,
 * se pide completa (D-301: todas con la misma composición). `partial`: el empleado puede dejarla a medias (D-267).
 */
export function addressErrors(a: AddressParts, mode: 'required' | 'optional' | 'partial'): AddressErrors {
  const e: AddressErrors = {};
  if (a.state !== '' && !isUsState(a.state)) e.state = true;
  if (!isValidZip(a.zip)) e.zip = true;
  if (mode === 'partial') return e;
  if (mode === 'optional' && isAddressEmpty(a)) return e;
  if (a.addressLine1.trim() === '') e.addressLine1 = true;
  if (a.city.trim() === '') e.city = true;
  if (a.state === '') e.state = true;
  if (a.zip.trim() === '') e.zip = true;
  return e;
}

export function hasAddressErrors(e: AddressErrors): boolean {
  return Object.keys(e).length > 0;
}

export function sameAddress(a: AddressParts, b: AddressParts): boolean {
  return (['addressLine1', 'addressLine2', 'city', 'state', 'zip'] as const).every((k) => a[k].trim() === b[k].trim());
}

/**
 * Partes desde las líneas 5 y 6 del W-9 ("calle, dirección 2" y "City, ST ZIP"). Si no se reconoce la línea 6, la
 * calle queda en Dirección y la ciudad en City para completar.
 */
export function partsFromTwoLines(street: string, cityLine: string): AddressParts {
  const s = street.trim();
  const c = cityLine.trim();
  if (!s && !c) return emptyAddress();
  const joined = parseAddress([s || '-', c].filter(Boolean).join(', '));
  if (!joined.needsReview && s) {
    // La calle se respeta como la escribió la persona: solo se separa en la primera coma.
    const comma = s.indexOf(',');
    return {
      ...joined.parts,
      addressLine1: comma >= 0 ? s.slice(0, comma).trim() : s,
      addressLine2: comma >= 0 ? s.slice(comma + 1).trim() : '',
    };
  }
  return { ...emptyAddress(), addressLine1: s, city: c };
}
