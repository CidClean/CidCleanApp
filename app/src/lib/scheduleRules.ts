import { dayKey, dateFromKey } from './leadRules';
import type { MyVisit } from './scheduleApi';

/** Reglas puras del Schedule y Work (hito 6). Sin red: se prueban solas. */

/**
 * Duraciones y horas en horas (D-231): "2 h", "1.5 h", "2.25 h". Se guardan al minuto (D-214) y se muestran con hasta
 * dos decimales, sin ceros de más.
 */
export function formatMinutes(total: number, s: { h: string } = { h: 'h' }): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.round((m / 60) * 100) / 100;
  return `${String(h)} ${s.h}`;
}

/** Opciones del selector de horas (D-231): de 0.25 h a 24 h en pasos de 0.25 h, como minutos. */
export const HOUR_STEPS: readonly number[] = Array.from({ length: 96 }, (_, i) => (i + 1) * 15);

/** Minutos al paso de 0.25 h más cercano (para mostrar en el selector una duración guardada fuera de paso). */
export function toQuarter(minutes: number): number {
  return Math.min(1440, Math.max(15, Math.round(minutes / 15) * 15));
}

/** Cronómetro del turno (D-050): "1:05:09". */
export function elapsed(from: Date, now: Date): string {
  const sec = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const x = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
}

/** Domingo de la semana de `d` (D-231: toda semana empieza en domingo). */
export function sundayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Semana actual o siguiente (D-012, D-093): de domingo a sábado (D-231), como claves AAAA-MM-DD. */
export function weekRange(today: Date, which: 'this' | 'next'): { from: string; to: string; days: string[] } {
  const mon = sundayOf(today);
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
