import { dayKey, dateFromKey } from './leadRules';
import type { MyVisit } from './scheduleApi';

/** Reglas puras del Schedule y Work (hito 6). Sin red: se prueban solas. */

/** "2 h 15 min", "45 min", "3 h" (horas al minuto, D-214). */
export function formatMinutes(total: number, s: { h: string; min: string } = { h: 'h', min: 'min' }): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} ${s.min}`;
  return r === 0 ? `${h} ${s.h}` : `${h} ${s.h} ${r} ${s.min}`;
}

/** Cronómetro del turno (D-050): "1:05:09". */
export function elapsed(from: Date, now: Date): string {
  const sec = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const x = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
}

export function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** Semana actual o siguiente (D-012, D-093): de lunes a domingo, como claves AAAA-MM-DD. */
export function weekRange(today: Date, which: 'this' | 'next'): { from: string; to: string; days: string[] } {
  const mon = mondayOf(today);
  if (which === 'next') mon.setDate(mon.getDate() + 7);
  const days = Array.from({ length: 7 }, (_, i) => dayKey(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i)));
  return { from: days[0], to: days[6], days };
}

/** Aviso de horas de la semana (D-214), solo para quien programa: desde 28 h avisa; más de 32 h no deja. */
export function weekWarning(minutes: number): 'over' | 'warn' | null {
  if (minutes > 32 * 60) return 'over';
  if (minutes >= 28 * 60) return 'warn';
  return null;
}

export function workedMinutes(clockIn: Date, clockOut: Date | null, now: Date = new Date()): number {
  return Math.round(((clockOut ?? now).getTime() - clockIn.getTime()) / 60000);
}

/** Fecha y hora locales de un día y una hora. */
export function atTime(key: string, hours: number, minutes: number): Date {
  const d = dateFromKey(key);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/** Visitas por día, en orden. */
export function groupByDay<T extends { day: string; startsAt: Date }>(visits: readonly T[]): { day: string; visits: T[] }[] {
  const map = new Map<string, T[]>();
  for (const v of [...visits].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    map.set(v.day, [...(map.get(v.day) ?? []), v]);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, list]) => ({ day, visits: list }));
}

/**
 * Inicio del staff (D-165): la visita de hoy que toca mostrar. Primero la que tiene el turno abierto; si no, la próxima
 * de hoy sin marcar (la entrada se marca a cualquier hora del día de la visita, D-214); si ya se marcó todo, ninguna.
 */
export function pickToday(visits: readonly MyVisit[], now: Date): MyVisit | null {
  const today = dayKey(now);
  const list = visits.filter((v) => v.day === today).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return list.find((v) => v.entry && !v.entry.clockOut) ?? list.find((v) => !v.entry) ?? null;
}

/** La próxima visita programada después de hoy (tarjeta "Próxima", D-223). */
export function pickNext(visits: readonly MyVisit[], now: Date): MyVisit | null {
  const today = dayKey(now);
  return [...visits].filter((v) => v.day > today && v.scheduled).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0] ?? null;
}
