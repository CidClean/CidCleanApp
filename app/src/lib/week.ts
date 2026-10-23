/**
 * Visitas y tira de la semana del Inicio del staff (D-048, D-165).
 * Todavía no existen las tablas de schedule (etapa 4): `fetchWeekVisits` devuelve una lista vacía
 * con la forma que tendrá cuando se conecte.
 */

export type Visit = {
  id: string;
  siteName: string;
  start: Date;
  end: Date;
};

/** TEMPORAL: conectar con el schedule en la etapa 4. */
export async function fetchWeekVisits(_weekStart: Date): Promise<Visit[]> {
  return [];
}

export function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Domingo de la semana de `d` (D-231), a las 00:00 locales. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() - out.getDay());
  return out;
}

export type WeekDay = {
  label: string;
  dayNumber: number;
  key: string;
  hasVisit: boolean;
  isToday: boolean;
};

/** Los 7 días de la semana (domingo a sábado, D-231) con los días de visita marcados. */
export function weekDays(today: Date, visits: readonly Visit[], labels: readonly string[]): WeekDay[] {
  const monday = startOfWeek(today);
  const visitDays = new Set(visits.map((v) => dateKey(v.start)));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const key = dateKey(day);
    return {
      label: labels[i] ?? '',
      dayNumber: day.getDate(),
      key,
      hasVisit: visitDays.has(key),
      isToday: key === dateKey(today),
    };
  });
}

/** D-165: si no hay visita hoy no se muestra la tarjeta; si hay varias, la próxima. */
export function pickTodayVisit(visits: readonly Visit[], now: Date): Visit | null {
  const today = dateKey(now);
  const upcoming = visits
    .filter((v) => dateKey(v.start) === today && v.end.getTime() > now.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  return upcoming[0] ?? null;
}

/** "6:00 PM", igual en español e inglés (así lo muestra la muestra aprobada). */
export function formatTime(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .format(d)
    .replace(/[  ]/g, ' ');
}

/** D-223: la próxima visita después de hoy (tarjeta ámbar "Próxima" del inicio del staff). */
export function pickNextVisit(visits: readonly Visit[], now: Date): Visit | null {
  const today = dateKey(now);
  const later = visits.filter((v) => dateKey(v.start) > today).sort((a, b) => a.start.getTime() - b.start.getTime());
  return later[0] ?? null;
}
