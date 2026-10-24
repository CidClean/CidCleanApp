import { dateFromKey, dayKey } from "./leadRules";
import type { ScheduleVisit } from "./scheduleApi";
import { addDays, formatMinutes, sundayOf } from "./scheduleRules";
import { formatTime } from "./week";

/** Reglas puras de las vistas Tabla y Calendario del Schedule (D-231). Sin red ni React: se prueban solas. */

export type ScheduleView = "list" | "table" | "calendar";
export type CalendarMode = "day" | "three" | "week" | "month";

/** Nombre corto del jobsite para las celdas (D-200): hasta 12 letras; si es más largo, se corta con "…". */
export function abbreviate(name: string, max = 12): string {
  const n = name.trim();
  return n.length <= max ? n : `${n.slice(0, max - 1).trimEnd()}…`;
}

/** Hora corta de la cuadrícula del calendario: "6 AM", "12 PM". */
export function hourLabel(h: number): string {
  return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
}

/** Días que muestra cada vista, como claves AAAA-MM-DD. La semana va de domingo a sábado (D-231). */
export function viewDays(
  view: ScheduleView,
  mode: CalendarMode,
  anchor: Date,
): string[] {
  if (view !== "calendar" || mode === "week") {
    const sun = sundayOf(anchor);
    return Array.from({ length: 7 }, (_, i) => dayKey(addDays(sun, i)));
  }
  if (mode === "day") return [dayKey(anchor)];
  // 3 días con el día elegido al centro (D-231).
  if (mode === "three")
    return [-1, 0, 1].map((i) => dayKey(addDays(anchor, i)));
  // Mes: semanas completas de domingo a sábado que cubren el mes (5 o 6 filas).
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = sundayOf(first);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const total = Math.ceil((first.getDay() + last.getDate()) / 7) * 7;
  return Array.from({ length: total }, (_, i) => dayKey(addDays(start, i)));
}

/** A dónde llevan las flechas (D-200): semana ±7 días, Día ±1, 3 días ±3, Mes ±1 mes. */
export function shiftAnchor(
  view: ScheduleView,
  mode: CalendarMode,
  anchor: Date,
  dir: 1 | -1,
): Date {
  if (view !== "calendar" || mode === "week") return addDays(anchor, 7 * dir);
  if (mode === "day") return addDays(anchor, dir);
  if (mode === "three") return addDays(anchor, 3 * dir);
  return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
}

/** Detallado (D-235): la tabla Empleado → días por semana (domingo a sábado) o por mes (del 1 al último día). */
export type TableRange = "week" | "month";

export function tableDays(range: TableRange, anchor: Date): string[] {
  if (range === "week") {
    const sun = sundayOf(anchor);
    return Array.from({ length: 7 }, (_, i) => dayKey(addDays(sun, i)));
  }
  const last = new Date(
    anchor.getFullYear(),
    anchor.getMonth() + 1,
    0,
  ).getDate();
  return Array.from({ length: last }, (_, i) =>
    dayKey(new Date(anchor.getFullYear(), anchor.getMonth(), i + 1)),
  );
}

/** Flechas de la tabla: semana ±7 días, mes ±1 mes. */
export function shiftTable(range: TableRange, anchor: Date, dir: 1 | -1): Date {
  return range === "week"
    ? addDays(anchor, 7 * dir)
    : new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
}

/**
 * Bloques de una semana (D-236): los días se reparten en semanas de domingo a sábado. En la semana va un solo bloque; en
 * el mes, uno por semana, y los días de la primera y la última semana que no son del mes quedan fuera (`inRange` falso).
 */
export function weekBlocks(
  days: readonly string[],
): { days: string[]; inRange: boolean[] }[] {
  if (days.length === 0) return [];
  const set = new Set(days);
  const start = sundayOf(dateFromKey(days[0]));
  const end = dateFromKey(days[days.length - 1]);
  const blocks: { days: string[]; inRange: boolean[] }[] = [];
  for (let d = start; d <= end; d = addDays(d, 7)) {
    const week = Array.from({ length: 7 }, (_, i) => dayKey(addDays(d, i)));
    blocks.push({ days: week, inRange: week.map((k) => set.has(k)) });
  }
  return blocks;
}

export type EmployeeRow = {
  id: string;
  name: string;
  cells: ScheduleVisit[][];
};

/**
 * Tabla Empleado → días (D-231): una fila por persona programada en la semana, en orden de nombre, con sus visitas de
 * cada día; al final, si hay, la fila de visitas sin personal (D-200) para que no quede nada escondido.
 */
export function employeeRows(
  visits: readonly ScheduleVisit[],
  days: readonly string[],
  unstaffed: string,
): EmployeeRow[] {
  const people = new Map<string, string>();
  for (const v of visits) for (const p of v.staff) people.set(p.id, p.name);
  const sorted = [...visits].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
  const rows: EmployeeRow[] = [...people.entries()]
    .sort(([, a], [, b]) => a.localeCompare(b))
    .map(([id, name]) => ({
      id,
      name,
      cells: days.map((d) =>
        sorted.filter((v) => v.day === d && v.staff.some((p) => p.id === id)),
      ),
    }));
  if (sorted.some((v) => v.staff.length === 0)) {
    rows.push({
      id: "",
      name: unstaffed,
      cells: days.map((d) =>
        sorted.filter((v) => v.day === d && v.staff.length === 0),
      ),
    });
  }
  return rows;
}

export type DayChip = { visit: ScheduleVisit; person: string | null };

/** Tabla Día → empleados (D-231): una fila por día con quién trabaja y dónde (persona → jobsite y hora). */
export function dayRows(
  visits: readonly ScheduleVisit[],
  days: readonly string[],
): { day: string; chips: DayChip[] }[] {
  const sorted = [...visits].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
  return days.map((day) => ({
    day,
    chips: sorted
      .filter((v) => v.day === day)
      .flatMap((v): DayChip[] =>
        v.staff.length
          ? v.staff.map((p) => ({ visit: v, person: p.name }))
          : [{ visit: v, person: null }],
      ),
  }));
}

/** Calendario: posición de cada visita en su día (minuto de inicio, duración y carril si se cruzan). */
export type Placed = {
  visit: ScheduleVisit;
  start: number;
  minutes: number;
  lane: number;
  lanes: number;
};

export function placeDay(visits: readonly ScheduleVisit[]): Placed[] {
  const sorted = [...visits].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
  const placed: Placed[] = [];
  let group: Placed[] = [];
  let groupEnd = -1;
  const close = () => {
    const lanes = Math.max(1, ...group.map((p) => p.lane + 1));
    for (const p of group) p.lanes = lanes;
    group = [];
  };
  for (const v of sorted) {
    const start = v.startsAt.getHours() * 60 + v.startsAt.getMinutes();
    const minutes = Math.min(v.minutes, 24 * 60 - start);
    if (start >= groupEnd) close();
    const used = new Set(
      group.filter((p) => p.start + p.minutes > start).map((p) => p.lane),
    );
    let lane = 0;
    while (used.has(lane)) lane++;
    const p = { visit: v, start, minutes, lane, lanes: 1 };
    group.push(p);
    placed.push(p);
    groupEnd = Math.max(groupEnd, start + minutes);
  }
  close();
  return placed;
}

/** Hora a la que se abre la cuadrícula: una hora antes de la primera visita, o a las 7 AM si no hay (D-200). */
export function firstHour(visits: readonly ScheduleVisit[]): number {
  if (visits.length === 0) return 7;
  return Math.max(0, Math.min(...visits.map((v) => v.startsAt.getHours())) - 1);
}

// --- PDF de la tabla (D-231) -----------------------------------------------------------------------------------

const esc = (x: string) =>
  x
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

type PdfStrings = {
  title: string;
  range: string;
  employee: string;
  unstaffed: string;
  noVisits: string;
  dayHeaders: readonly string[];
  dayTitle: (key: string) => string;
  hours: { h: string };
};

/**
 * HTML del PDF de la semana en el estilo C1 (D-223, D-226): fondo crema #FBF6EF, tarjeta blanca de 24px, Manrope 800
 * en los títulos y el color de marca #0F766E. Empleado → días va en hoja horizontal; Día → empleados en vertical.
 */
export function scheduleHtml(
  mode: "employee" | "day",
  visits: readonly ScheduleVisit[],
  days: readonly string[],
  s: PdfStrings,
): string {
  const cell = (v: ScheduleVisit) =>
    `<div class="v"><b>${esc(abbreviate(v.jobsite))}</b><span>${esc(formatTime(v.startsAt))} · ${esc(formatMinutes(v.minutes, s.hours))}</span></div>`;
  let body: string;
  if (visits.length === 0) {
    body = `<p class="muted">${esc(s.noVisits)}</p>`;
  } else if (mode === "employee") {
    // Las mismas filas en todos los bloques; cada bloque es una semana con su encabezado (D-236).
    const rows = employeeRows(visits, days, s.unstaffed);
    const byDay = (r: EmployeeRow, key: string) =>
      r.cells[days.indexOf(key)] ?? [];
    body = weekBlocks(days)
      .map(
        (b) =>
          `<table><thead><tr><th class="name">${esc(s.employee)}</th>${b.days
            .map(
              (d, i) =>
                `<th${b.inRange[i] ? "" : ' class="out"'}>${esc(s.dayHeaders[dateFromKey(d).getDay()] ?? "")}<br><small>${dateFromKey(d).getDate()}</small></th>`,
            )
            .join("")}</tr></thead><tbody>${rows
            .map(
              (r) =>
                `<tr><td class="name">${esc(r.name)}</td>${b.days
                  .map((d, i) =>
                    b.inRange[i]
                      ? `<td>${byDay(r, d).map(cell).join("")}</td>`
                      : '<td class="out"></td>',
                  )
                  .join("")}</tr>`,
            )
            .join("")}</tbody></table>`,
      )
      .join("");
  } else {
    body = dayRows(visits, days)
      .map(
        (r) =>
          `<div class="day"><h3>${esc(s.dayTitle(r.day))}</h3>${
            r.chips.length
              ? r.chips
                  .map(
                    (c) =>
                      `<span class="chip${c.person ? "" : " warn"}">${esc(c.person ?? s.unstaffed)} → ${esc(abbreviate(c.visit.jobsite, 20))} · ${esc(formatTime(c.visit.startsAt))}</span>`,
                  )
                  .join("")
              : `<span class="muted">—</span>`
          }</div>`,
      )
      .join("");
  }
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;700;800&display=swap" rel="stylesheet">
<style>
@page { size: letter ${mode === "employee" ? "landscape" : "portrait"}; margin: 24px; }
* { box-sizing: border-box; }
body { margin: 0; background: #FBF6EF; color: #1E2A28; font-family: Manrope, -apple-system, Roboto, Arial, sans-serif; font-size: 11px; }
.card { background: #FFFFFF; border-radius: 24px; padding: 20px; }
h1 { font-weight: 800; font-size: 22px; margin: 0; }
.range { color: #6B5F52; margin: 4px 0 16px; font-size: 13px; }
.brand { color: #0F766E; font-weight: 800; font-size: 12px; letter-spacing: 0.4px; margin-bottom: 6px; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th { background: #0F766E; color: #FFFFFF; font-weight: 700; padding: 8px 4px; text-align: center; }
table + table { margin-top: 16px; }
th.out { background: #5E9E97; }
td.out { background: #F6EFE6; }
tr { page-break-inside: avoid; }
th:first-child { border-top-left-radius: 12px; } th:last-child { border-top-right-radius: 12px; }
td { border-bottom: 0.5px solid #EADFD2; padding: 6px 4px; vertical-align: top; }
.name { width: 15%; text-align: left; font-weight: 700; }
.v { background: #DDEFEC; border-radius: 8px; padding: 4px 6px; margin-bottom: 4px; }
.v b { display: block; color: #0F766E; } .v span { color: #1E2A28; }
.day { border-bottom: 0.5px solid #EADFD2; padding: 10px 0; }
.day h3 { margin: 0 0 6px; font-weight: 800; font-size: 13px; }
.chip { display: inline-block; background: #DDEFEC; color: #0F766E; border-radius: 999px; padding: 4px 10px; margin: 0 6px 6px 0; font-weight: 700; }
.chip.warn { background: #FBE3C7; color: #8A4B0F; }
.muted { color: #6B5F52; }
</style></head><body><div class="card"><div class="brand">CID CLEAN</div><h1>${esc(s.title)}</h1><div class="range">${esc(s.range)}</div>${body}</div></body></html>`;
}

// --- Semana por semana (D-232) ----------------------------------------------------------------------------------

type PlanSite = {
  id: string;
  days: number[];
  locked: number[];
  cells: string[][];
  people: { id: string; name: string }[];
  startTime?: string | null;
  minutes?: number | null;
};

/**
 * "Copiar semana anterior" (D-200, orden 24): por jobsite, quién fue cada día de la semana anterior, solo en los días
 * que el jobsite trabaja y que todavía se pueden cambiar. Devuelve las celdas nuevas y las personas que hay que sumar
 * a la cuadrícula. No guarda: se guarda con "Guardar semana".
 */
export function copyWeek<T extends PlanSite>(
  current: readonly T[],
  previous: readonly PlanSite[],
  drafts: Readonly<Record<string, string[][]>>,
): {
  cells: Record<string, string[][]>;
  people: Record<string, { id: string; name: string }[]>;
} {
  const cells: Record<string, string[][]> = {};
  const people: Record<string, { id: string; name: string }[]> = {};
  for (const site of current) {
    const prev = previous.find((p) => p.id === site.id);
    // Sin hora y duración no se puede guardar esa semana (D-234): no se copia nada a ese jobsite.
    if (!prev || site.startTime === null || site.minutes === null) continue;
    const base = drafts[site.id] ?? site.cells;
    cells[site.id] = base.map((c, i) =>
      site.days.includes(i) && !site.locked.includes(i)
        ? [...(prev.cells[i] ?? [])]
        : c,
    );
    const ids = new Set(cells[site.id].flat());
    people[site.id] = prev.people.filter(
      (p) => ids.has(p.id) && !site.people.some((x) => x.id === p.id),
    );
  }
  return { cells, people };
}

/** Marcar o desmarcar a una persona un día. */
export function toggleCell(
  cells: readonly string[][],
  day: number,
  person: string,
): string[][] {
  return cells.map((c, i) =>
    i !== day
      ? c
      : c.includes(person)
        ? c.filter((x) => x !== person)
        : [...c, person],
  );
}

export function sameCells(
  a: readonly string[][],
  b: readonly string[][],
): boolean {
  return a.every(
    (c, i) =>
      c.length === (b[i] ?? []).length &&
      c.every((x) => (b[i] ?? []).includes(x)),
  );
}
