import type { Strings } from '@/i18n/es';

/**
 * "Mis horas" de cada empleado (D-272, D-274). Reglas puras, sin React ni red. Solo horas del trabajo aprobado:
 * nunca dinero ni el tope de 32 h (D-223).
 */

export type MyHoursRow = { date: string; account: string; workedMinutes: number; insuredMinutes: number };
export type MyHours = { rows: MyHoursRow[]; workedMinutes: number; insuredMinutes: number };

/** Lo que devuelve `my_hours(p_month)`. */
export function parseMyHours(d: unknown): MyHours {
  const x = (d ?? {}) as {
    rows?: { date: string; account: string; worked_minutes: number; insured_minutes: number }[];
    worked_minutes?: number;
    insured_minutes?: number;
  };
  return {
    rows: (x.rows ?? []).map((r) => ({
      date: r.date,
      account: r.account,
      workedMinutes: Number(r.worked_minutes) || 0,
      insuredMinutes: Number(r.insured_minutes) || 0,
    })),
    workedMinutes: Number(x.worked_minutes) || 0,
    insuredMinutes: Number(x.insured_minutes) || 0,
  };
}

/** Horas como en el survey (D-274): "14 h 40 m", "4 h", "0 h". */
export function hoursLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} m`;
}

/** Fecha de la fila: "Oct 26" (D-274). `date` es "AAAA-MM-DD". */
export function rowDate(date: string, strings: Strings): string {
  const [, mo, d] = date.split('-').map(Number);
  return `${strings.myHours.shortMonths[mo - 1] ?? ''} ${d}`;
}
