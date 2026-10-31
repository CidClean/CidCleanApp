import type { IcaInfo, JobOffer } from './icaApi';
import type { IcaStrings } from '@/i18n/ica';

/** Día "YYYY-MM-DD" como instante del mediodía, para no correrlo de día al pasarlo a la hora de Naples. */
export const noon = (day: string) => `${day}T12:00:00Z`;

/** Frecuencia corta para el admin ("L, M, J, V, S, D", muestra D-292). Los días van con el lunes en 0. */
export function freqLetters(f: JobOffer['frequency'], t: Pick<IcaStrings, 'days'>): string {
  if (!f) return '';
  if (f.kind === 'daily') return t.days.join(', ');
  if (f.kind === 'other') return f.other?.trim() ?? '';
  return [...(f.days ?? [])].sort((a, b) => a - b).map((d) => t.days[d]).join(', ');
}

/** Frecuencia para el 1099 ("6 días por semana", muestra D-292). */
export function freqCount(f: JobOffer['frequency'], t: Pick<IcaStrings, 'daysPerWeek' | 'everyDay'>): string {
  if (!f) return '';
  if (f.kind === 'daily') return t.everyDay;
  if (f.kind === 'other') return f.other?.trim() ?? '';
  return t.daysPerWeek((f.days ?? []).length);
}

/** Ficha del ICA en Documentos (D-292): neutra sin ICA, ámbar en curso, verde firmado por ambas partes. */
export function icaPill(i: Pick<IcaInfo, 'state'>, t: Pick<IcaStrings, 'noIca' | 'status'>): { label: string; tone: 'neutral' | 'warn' | 'ok' } {
  if (i.state === 'signed') return { label: t.status.signed, tone: 'ok' };
  if (i.state === 'none' || i.state === 'not_required') return { label: t.noIca, tone: 'neutral' };
  return { label: t.status[i.state] ?? i.state, tone: 'warn' };
}

/** Contador de advertencias: ámbar desde la primera vigente, neutro sin ninguna. */
export const warningsTone = (active: number): 'warn' | 'neutral' => (active > 0 ? 'warn' : 'neutral');

/** "$80" o "$82.50" (muestra D-292). */
export function rateText(n: number): string {
  return Number.isInteger(n) ? `$${n.toLocaleString('en-US')}` : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Inicial del apellido: "Karina S." (muestra D-292). */
export function shortName(full: string): string {
  const p = full.trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0] ?? '';
}

const MONTHS = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** "Oct 31" / "31 oct" en la hora de Naples (como la ficha del contrato, D-289). */
export function shortDay(iso: string, l: 'es' | 'en'): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric' }).formatToParts(new Date(iso));
  const m = MONTHS[l][Number(p.find((x) => x.type === 'month')?.value) - 1];
  const d = p.find((x) => x.type === 'day')?.value;
  return l === 'es' ? `${d} ${m}` : `${m} ${d}`;
}
