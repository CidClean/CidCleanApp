/**
 * Reglas puras de Ventas A (hito 2): quién ve y edita leads, estados, formularios, fechas y horas,
 * calendario del mes (D-104) y pendientes del Inicio (D-111). Sin red: se prueban solas.
 */
import type { SalesStrings } from '@/i18n/sales';
import { can, type Access } from './visibility';

// --- Tipos ------------------------------------------------------------------------------------------

/** Estados del flujo, en su orden (current/flujo.md, D-071). */
export const LEAD_STATUSES = [
  'new',
  'contacted',
  'walkthrough_scheduled',
  'walkthrough_done',
  'quote_sent',
  'negotiation',
  'won',
  'lost',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Fuentes (flujo): web, campañas de marketing y registro manual. */
export const LEAD_SOURCES = ['web', 'campaign', 'manual'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export type Appointment = { id: string; startsAt: Date; status: 'scheduled' | 'done' | 'canceled' };

export type LeadSite = {
  id: string;
  name: string | null;
  address: string;
  /** La cita agendada (una a la vez por sitio), si hay. */
  scheduled: Appointment | null;
  /** El walkthrough del sitio ya se cerró (hito 3). */
  walkthroughDone: boolean;
};

export type LostReason = { id: string; labelEs: string; labelEn: string; sort: number; active: boolean };

export type Lead = {
  id: string;
  company: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  source: LeadSource;
  notes: string | null;
  status: LeadStatus;
  lostReason: LostReason | null;
  lostNote: string | null;
  createdAt: Date;
  /** Fecha del seguimiento abierto (AAAA-MM-DD), si hay. */
  followUpOn: string | null;
  sites: LeadSite[];
};

/** Fila de la lista del Pipeline. */
export type LeadSummary = {
  id: string;
  company: string;
  contactName: string | null;
  status: LeadStatus;
  createdAt: Date;
  followUpOn: string | null;
  /** La próxima cita agendada entre todos sus sitios. */
  nextWalkthrough: Date | null;
};

export function isLeadStatus(v: unknown): v is LeadStatus {
  return typeof v === 'string' && (LEAD_STATUSES as readonly string[]).includes(v);
}

export function isLeadSource(v: unknown): v is LeadSource {
  return typeof v === 'string' && (LEAD_SOURCES as readonly string[]).includes(v);
}

// --- Permisos (current/permisos.md, D-169) ----------------------------------------------------------

/** La lista y el detalle de leads piden `leads_ver`. */
export function canSeeLeads(access: Access): boolean {
  return can(access, 'leads_ver');
}

/** Crear, editar, cambiar estado, sitios, citas y seguimientos: `leads_editar` (y ver, para poder abrirlos). */
export function canEditLeads(access: Access): boolean {
  return can(access, 'leads_ver') && can(access, 'leads_editar');
}

/** Eliminar un lead (D-201): `leads_eliminar` (y ver, para poder abrirlo). */
export function canDeleteLeads(access: Access): boolean {
  return can(access, 'leads_ver') && can(access, 'leads_eliminar');
}

/** Los pendientes de Ventas del Inicio salen solo con `leads_ver` (D-111: solo las áreas con permiso). */
export function showsSalesPending(access: Access): boolean {
  return canSeeLeads(access);
}

// --- Estado ----------------------------------------------------------------------------------------

/** Tono de la ficha de estado (D-031): de marca mientras el lead está abierto (muestra ronda 8), verde Ganado, gris Perdido. */
export function statusTone(status: LeadStatus): 'brand' | 'success' | 'neutral' {
  if (status === 'won') return 'success';
  if (status === 'lost') return 'neutral';
  return 'brand';
}

/** Elegir Perdido en el campo de estado no guarda: abre "Marcar como perdido" para pedir el motivo (D-079). */
export function statusChangeAction(current: LeadStatus, next: LeadStatus): 'none' | 'askLostReason' | 'save' {
  if (current === next) return 'none';
  if (next === 'lost') return 'askLostReason';
  return 'save';
}

// --- Fechas y horas ---------------------------------------------------------------------------------

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** AAAA-MM-DD de un día local. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Día local (00:00) de una clave AAAA-MM-DD. */
export function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Lee "MM/DD/AAAA" (también M/D/AAAA). Vacío = sin fecha. Devuelve AAAA-MM-DD, null si vacío o 'invalid'. */
export function parseUsDate(text: string): string | null | 'invalid' {
  const t = text.trim();
  if (t === '') return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return 'invalid';
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return 'invalid';
  return dayKey(d);
}

/** AAAA-MM-DD a "MM/DD/AAAA" para el campo. */
export function formatUsDate(key: string | null): string {
  if (!key) return '';
  const [y, m, d] = key.split('-');
  return `${m}/${d}/${y}`;
}

/**
 * Lee la hora del campo Hora: "10:00 AM", "10 am", "2:30pm", "2:30 p. m.", "14:30".
 * Devuelve horas (0-23) y minutos, o null si no es válida.
 */
export function parseTime(text: string): { hours: number; minutes: number } | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?$/.exec(t);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] === undefined ? 0 : Number(m[2]);
  if (minutes > 59) return null;
  const suffix = m[3]?.replace(/[.\s]/g, '');
  if (suffix) {
    if (hours < 1 || hours > 12) return null;
    if (suffix === 'am') hours = hours === 12 ? 0 : hours;
    else hours = hours === 12 ? 12 : hours + 12;
  } else if (hours > 23) {
    return null;
  }
  return { hours, minutes };
}

/** "10:00 AM", igual en los dos idiomas (muestras ronda 8 y 12, como formatTime del Inicio). */
export function formatClock(hours: number, minutes: number): string {
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${pad2(minutes)} ${hours < 12 ? 'AM' : 'PM'}`;
}

export function formatTimeOf(d: Date): string {
  return formatClock(d.getHours(), d.getMinutes());
}

/** "Mar 22 oct" / "Tue, Oct 22" (muestra ronda 1). */
export function formatShortDate(d: Date, s: SalesStrings): string {
  return s.shortDate(s.dayNames[d.getDay()], d.getDate(), s.monthShort[d.getMonth()]);
}

/** "Mar 22 oct · 10:00 AM" (muestra ronda 1). */
export function formatDateTime(d: Date, s: SalesStrings): string {
  return `${formatShortDate(d, s)} · ${formatTimeOf(d)}`;
}

/** Fecha y hora locales de la cita. */
export function combineDayAndTime(key: string, hours: number, minutes: number): Date {
  const d = dateFromKey(key);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

// --- Formulario del lead ----------------------------------------------------------------------------

export type LeadForm = {
  company: string;
  contactName: string;
  phone: string;
  email: string;
  source: LeadSource;
  followUp: string; // MM/DD/AAAA
  notes: string;
};

/** Un lead registrado a mano parte con fuente Manual (D-200). */
export const emptyLeadForm: LeadForm = {
  company: '',
  contactName: '',
  phone: '',
  email: '',
  source: 'manual',
  followUp: '',
  notes: '',
};

export type LeadFormErrors = { company?: true; email?: true; followUp?: true };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLeadForm(f: LeadForm): LeadFormErrors {
  const errors: LeadFormErrors = {};
  if (f.company.trim() === '') errors.company = true;
  if (f.email.trim() !== '' && !EMAIL.test(f.email.trim())) errors.email = true;
  if (parseUsDate(f.followUp) === 'invalid') errors.followUp = true;
  return errors;
}

export function hasLeadErrors(e: LeadFormErrors): boolean {
  return Boolean(e.company || e.email || e.followUp);
}

export function leadFormFrom(lead: Lead): LeadForm {
  return {
    company: lead.company,
    contactName: lead.contactName ?? '',
    phone: lead.phone ?? '',
    email: lead.email ?? '',
    source: lead.source,
    followUp: formatUsDate(lead.followUpOn),
    notes: lead.notes ?? '',
  };
}

/** Columnas de la tabla `leads` desde el formulario: textos sin espacios de más y vacío = null. */
export function leadColumns(f: LeadForm) {
  const clean = (v: string) => (v.trim() === '' ? null : v.trim());
  return {
    company: f.company.trim(),
    contact_name: clean(f.contactName),
    phone: clean(f.phone),
    email: clean(f.email)?.toLowerCase() ?? null,
    source: f.source,
    notes: clean(f.notes),
  };
}

// --- Lista del Pipeline (D-027) ----------------------------------------------------------------------

/** Orden de la lista: el más reciente arriba (D-200). */
export function sortLeads<T extends { createdAt: Date }>(leads: readonly T[]): T[] {
  return [...leads].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Línea gris bajo la empresa (D-200): la próxima cita si hay y el lead sigue abierto,
 * si no la fecha de seguimiento, si no la persona de contacto.
 */
export function leadListDetail(lead: LeadSummary, s: SalesStrings): string {
  const open = lead.status !== 'won' && lead.status !== 'lost';
  if (open && lead.nextWalkthrough) return s.list.walkthroughOn(formatDateTime(lead.nextWalkthrough, s));
  if (open && lead.followUpOn) return s.list.followUpOn(formatShortDate(dateFromKey(lead.followUpOn), s));
  return lead.contactName ?? '';
}

/** Próxima cita agendada desde ahora entre varias. */
export function nextScheduled(appointments: readonly Appointment[], now: Date): Date | null {
  const upcoming = appointments
    .filter((a) => a.status === 'scheduled' && a.startsAt.getTime() >= now.getTime())
    .map((a) => a.startsAt)
    .sort((a, b) => a.getTime() - b.getTime());
  return upcoming[0] ?? null;
}

/** Nombre visible de un sitio: su nombre o, si no tiene, la dirección. */
export function siteLabel(site: Pick<LeadSite, 'name' | 'address'>): string {
  return site.name && site.name.trim() !== '' ? site.name : site.address;
}

// --- Calendario del mes (D-104) -----------------------------------------------------------------------

export type CalendarCell = {
  key: string;
  day: number;
  /** Del mes que se muestra; los de los meses vecinos van atenuados y no se eligen. */
  inMonth: boolean;
  /** Antes de hoy: no se puede agendar. */
  past: boolean;
  /** Ya tiene citas (punto de 4px). */
  hasAppointment: boolean;
  selected: boolean;
};

/** Semanas de lunes a domingo que cubren el mes (5 o 6 filas), como la muestra de la ronda 12. */
export function monthGrid(
  year: number,
  month: number,
  today: Date,
  appointmentDays: ReadonlySet<string>,
  selectedKey: string | null,
): CalendarCell[][] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // lunes = 0
  const start = new Date(year, month, 1 - offset);
  const last = new Date(year, month + 1, 0);
  const total = Math.ceil((offset + last.getDate()) / 7) * 7;
  const todayKey = dayKey(today);
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = dayKey(d);
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({
      key,
      day: d.getDate(),
      inMonth: d.getMonth() === month,
      past: key < todayKey,
      hasAppointment: appointmentDays.has(key),
      selected: key === selectedKey,
    });
  }
  return weeks;
}

/** Mes anterior o siguiente. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** No se vuelve a meses ya pasados (D-200): el primero que se muestra es el de hoy. */
export function canGoToPreviousMonth(year: number, month: number, today: Date): boolean {
  return year > today.getFullYear() || (year === today.getFullYear() && month > today.getMonth());
}

/** Días (AAAA-MM-DD) que tienen citas agendadas. */
export function appointmentDayKeys(starts: readonly Date[]): Set<string> {
  return new Set(starts.map(dayKey));
}

export type ScheduleCheck =
  | { ok: true; startsAt: Date }
  | { ok: false; error: 'time' | 'past' };

/** Valida el día elegido y la hora escrita antes de agendar. */
export function checkSchedule(dayKeyValue: string, timeText: string, now: Date): ScheduleCheck {
  const time = parseTime(timeText);
  if (!time) return { ok: false, error: 'time' };
  const startsAt = combineDayAndTime(dayKeyValue, time.hours, time.minutes);
  if (startsAt.getTime() <= now.getTime()) return { ok: false, error: 'past' };
  return { ok: true, startsAt };
}

// --- Pendientes del Inicio (D-111, D-131) -------------------------------------------------------------

export type SalesPendingCounts = { followUpsDue: number; walkthroughsUpcoming: number };

export type PendingRow = {
  key: 'followUps' | 'walkthroughs';
  title: string;
  detail: string;
  /** D-131: ningún pendiente de Ventas A es Urgente (solo quotes por vencer, hito 4); va con flecha. */
  urgent: boolean;
};

/**
 * Filas de Ventas para la lista de pendientes del Inicio: solo con permiso y con algo pendiente.
 * Orden (D-200): seguimientos y después walkthroughs.
 */
export function salesPendingRows(access: Access, counts: SalesPendingCounts | null, s: SalesStrings): PendingRow[] {
  if (!counts || !showsSalesPending(access)) return [];
  const rows: PendingRow[] = [];
  if (counts.followUpsDue > 0) {
    rows.push({ key: 'followUps', title: s.home.followUps, detail: s.home.followUpsDetail(counts.followUpsDue), urgent: false });
  }
  if (counts.walkthroughsUpcoming > 0) {
    rows.push({
      key: 'walkthroughs',
      title: s.home.walkthroughs,
      detail: s.home.walkthroughsDetail(counts.walkthroughsUpcoming),
      urgent: false,
    });
  }
  return rows;
}

/** Lista única por urgencia (D-111): primero las Urgentes; entre iguales se respeta el orden de llegada. */
export function sortPending<T extends { urgent: boolean }>(rows: readonly T[]): T[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => Number(b.row.urgent) - Number(a.row.urgent) || a.i - b.i)
    .map((x) => x.row);
}

/** Etiqueta del motivo según el idioma. */
export function reasonLabel(r: Pick<LostReason, 'labelEs' | 'labelEn'>, locale: 'es' | 'en'): string {
  return locale === 'es' ? r.labelEs : r.labelEn;
}

// --- Motivos de lead perdido en Ajustes (D-107, D-113, D-114, D-203) ----------------------------------

/** Motivos que se ofrecen y se cuentan: los activos, en su orden. Los desactivados solo siguen en los leads que los usan. */
export function activeReasons(reasons: readonly LostReason[]): LostReason[] {
  return reasons.filter((r) => r.active).sort((a, b) => a.sort - b.sort);
}

/** Lugar de un motivo nuevo: al final de la lista (D-200). */
export function nextReasonSort(reasons: readonly LostReason[]): number {
  return reasons.reduce((max, r) => Math.max(max, r.sort), 0) + 1;
}

export type ReasonForm = { labelEs: string; labelEn: string };
export type ReasonFormErrors = { labelEs?: true; labelEn?: true };

/** Cada motivo lleva texto en español y en inglés (D-203). */
export function validateReasonForm(f: ReasonForm): ReasonFormErrors {
  const errors: ReasonFormErrors = {};
  if (f.labelEs.trim() === '') errors.labelEs = true;
  if (f.labelEn.trim() === '') errors.labelEn = true;
  return errors;
}
