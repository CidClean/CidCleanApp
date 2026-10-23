/**
 * Teléfonos de EE. UU. (D-216): 10 dígitos, mostrados como "(239) 555-0142".
 * Se acepta el 1 del país al inicio (11 dígitos) y se quita. El código de área y la central empiezan de 2 a 9
 * (regla del plan de numeración de Norteamérica; delegado D-200).
 * Se guarda ya formateado, así cualquier pantalla que lo muestre tal cual lo ve igual.
 */

/** Solo los dígitos, sin el 1 del país si sobra. */
export function phoneDigits(text: string): string {
  const d = text.replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

/** Valida 10 dígitos de EE. UU. Vacío cuenta como válido: el teléfono es opcional en todos los formularios. */
export function isValidPhone(text: string): boolean {
  const d = phoneDigits(text);
  if (d.length === 0) return true;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(d);
}

/** "(239) 555-0142" si son 10 dígitos; si no, el texto tal cual (datos viejos que no se pueden leer). */
export function formatPhone(text: string | null | undefined): string {
  if (!text) return '';
  const d = phoneDigits(text);
  if (d.length !== 10) return text.trim();
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Formato mientras se escribe: "(239) 555-0142" a medida que llegan los dígitos (máximo 10). */
export function formatPhoneInput(text: string): string {
  let d = text.replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('1')) d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length === 0) return '';
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Lo que se guarda: el teléfono formateado, o '' si está vacío. Llamar solo con un teléfono válido. */
export function normalizePhone(text: string): string {
  return phoneDigits(text).length === 0 ? '' : formatPhone(text);
}
