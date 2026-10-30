import { supabase } from './supabase';

/**
 * Schedule y Work (migración 20261026000001, hito 6). Todo va por funciones del servidor: validan el permiso, dejan
 * el historial y miden la distancia al jobsite. El staff nunca recibe sus horas contra el tope de 32 h (D-223).
 */

export type WorkFailure =
  | 'forbidden'
  | 'invalid'
  | 'over_32'
  | 'already_in'
  | 'not_today'
  | 'open_shift'
  | 'gps_pending'
  | 'no_work'
  | 'missing_time'
  | 'no_time'
  | 'no_day'
  | 'not_found'
  | 'network'
  | 'server';
export type WorkResult<T> = { ok: true; data: T } | { ok: false; reason: WorkFailure; detail?: string };

function isNetwork(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e ?? '');
  return /network|fetch|timeout|offline/i.test(m);
}

export function workFailure(code: string | undefined, message: string | undefined): { reason: WorkFailure; detail?: string } {
  const m = message ?? '';
  if (code === '42501') return { reason: 'forbidden' };
  if (code === 'P0002') return { reason: 'not_found' };
  if (m.startsWith('over_32:')) return { reason: 'over_32', detail: m.slice(8) };
  for (const k of ['already_in', 'not_today', 'open_shift', 'gps_pending', 'no_work', 'missing_time', 'no_time', 'no_day'] as const) if (m.startsWith(k)) return { reason: k };
  if (code === '22023' || code === '22P02' || code === '22008' || code === '23514') return { reason: 'invalid' };
  return { reason: 'server' };
}

async function rpc<T>(fn: string, args: Record<string, unknown>, map: (d: unknown) => T = (d) => d as T): Promise<WorkResult<T>> {
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) {
      if (isNetwork(error)) return { ok: false, reason: 'network' };
      return { ok: false, ...workFailure(error.code, error.message) };
    }
    return { ok: true, data: map(data) };
  } catch (e) {
    return { ok: false, reason: isNetwork(e) ? 'network' : 'server' };
  }
}

// --- Schedule del admin ------------------------------------------------------------------------------------

export type StaffChip = { id: string; name: string; weekMinutes?: number };
export type ScheduleVisit = {
  id: string;
  jobsiteId: string;
  jobsite: string;
  client: string;
  day: string;
  startsAt: Date;
  minutes: number;
  generated: boolean;
  approved: boolean;
  worked: boolean;
  staff: StaffChip[];
};

type StaffDb = { id: string; name: string; week_minutes?: number };
const chip = (s: StaffDb): StaffChip => ({ id: s.id, name: s.name, weekMinutes: s.week_minutes });

export const fetchSchedule = (from: string, to: string) =>
  rpc('schedule_range', { p_from: from, p_to: to }, (d) =>
    ((d ?? []) as {
      id: string;
      jobsite_id: string;
      jobsite: string;
      client: string;
      day: string;
      starts_at: string;
      minutes: number;
      generated: boolean;
      approved: boolean;
      worked: boolean;
      staff: StaffDb[];
    }[]).map<ScheduleVisit>((r) => ({
      id: r.id,
      jobsiteId: r.jobsite_id,
      jobsite: r.jobsite,
      client: r.client,
      day: r.day,
      startsAt: new Date(r.starts_at),
      minutes: r.minutes,
      generated: r.generated,
      approved: r.approved,
      worked: r.worked,
      staff: (r.staff ?? []).map(chip),
    })),
  );

export type Schedulable = { id: string; name: string; assigned: boolean; weekMinutes: number };
export const fetchSchedulable = (visitId: string) =>
  rpc('schedulable_staff', { p_visit: visitId }, (d) =>
    ((d ?? []) as { id: string; name: string; assigned: boolean; week_minutes: number }[]).map<Schedulable>((r) => ({
      id: r.id,
      name: r.name,
      assigned: r.assigned,
      weekMinutes: r.week_minutes,
    })),
  );

const warnings = (d: unknown) => ((d ?? []) as StaffDb[]).map(chip);
export const setVisitStaff = (visitId: string, profiles: string[]) => rpc('set_visit_staff', { p_visit: visitId, p_profiles: profiles }, warnings);
export const addVisit = (jobsiteId: string, startsAt: Date, minutes: number, profiles: string[] = []) =>
  rpc('add_visit', { p_jobsite: jobsiteId, p_starts_at: startsAt.toISOString(), p_minutes: minutes, p_profiles: profiles }, (d) => d as string);
export const updateVisit = (visitId: string, startsAt: Date, minutes: number) =>
  rpc('update_visit', { p_visit: visitId, p_starts_at: startsAt.toISOString(), p_minutes: minutes }, warnings);
export const deleteVisit = (visitId: string) => rpc('delete_visit', { p_visit: visitId }, () => null);

// --- Horario del staff y marcar entrada / salida -------------------------------------------------------------

export type MyVisit = {
  id: string;
  jobsite: string;
  address: string;
  day: string;
  startsAt: Date;
  minutes: number;
  scheduled: boolean;
  entry: { id: string; clockIn: Date; clockOut: Date | null } | null;
};

export const fetchMySchedule = () =>
  rpc('my_schedule', {}, (d) =>
    ((d ?? []) as {
      id: string;
      jobsite: string;
      address: string;
      day: string;
      starts_at: string;
      minutes: number;
      scheduled: boolean;
      entry: { id: string; clock_in: string; clock_out: string | null } | null;
    }[]).map<MyVisit>((r) => ({
      id: r.id,
      jobsite: r.jobsite,
      address: r.address,
      day: r.day,
      startsAt: new Date(r.starts_at),
      minutes: r.minutes,
      scheduled: r.scheduled,
      entry: r.entry ? { id: r.entry.id, clockIn: new Date(r.entry.clock_in), clockOut: r.entry.clock_out ? new Date(r.entry.clock_out) : null } : null,
    })),
  );

export type LocationCheck = { status: 'ok' | 'out_of_range' | 'no_location'; distanceM: number | null };
export const checkDistance = (visitId: string, lat: number | null, lng: number | null) =>
  rpc('visit_distance', { p_visit: visitId, p_lat: lat, p_lng: lng }, (d) => {
    const r = d as { status: LocationCheck['status']; distance_m?: number };
    return { status: r.status, distanceM: r.distance_m ?? null } as LocationCheck;
  });

export type ClockResult = { id: string; status: LocationCheck['status'] | 'manual'; distanceM: number | null };
const clockMap = (d: unknown) => {
  const r = d as { id: string; status: ClockResult['status']; distance_m?: number | null };
  return { id: r.id, status: r.status, distanceM: r.distance_m ?? null } as ClockResult;
};
export const clockIn = (p: { visitId: string; clientId: string; at: Date; lat: number | null; lng: number | null; offline: boolean }) =>
  rpc('clock_in', { p_visit: p.visitId, p_client_id: p.clientId, p_at: p.at.toISOString(), p_lat: p.lat, p_lng: p.lng, p_offline: p.offline }, clockMap);
export const clockOut = (p: { entryId: string; at: Date; lat: number | null; lng: number | null; offline: boolean }) =>
  rpc('clock_out', { p_entry: p.entryId, p_at: p.at.toISOString(), p_lat: p.lat, p_lng: p.lng, p_offline: p.offline }, clockMap);

// --- Work: registro por otros, revisión y aprobación ----------------------------------------------------------

/** Estado de una fila de "To approve" (D-266): missing = programado sin registro. */
export type WorkRowStatus = 'ok' | 'auto' | 'manual' | 'gps' | 'offline' | 'unscheduled' | 'missing';
export type EntryStatus = 'ok' | 'out_of_range' | 'no_location' | 'manual' | 'auto';
export type WorkRow = {
  profileId: string;
  name: string;
  entryId: string | null;
  clockIn: Date | null;
  clockOut: Date | null;
  inStatus: EntryStatus | null;
  outStatus: EntryStatus | null;
  status: WorkRowStatus;
  distanceM: number | null;
  offline: boolean;
  unscheduled: boolean;
  manual: boolean;
  gpsPending: boolean;
  gpsReviewed: boolean;
  hasAppAccess: boolean;
  hasPay: boolean;
};
/** Tarjeta de una visita (D-266): cuenta · fecha y una fila por persona (programados sin No show ∪ registros). */
export type VisitCard = {
  id: string;
  jobsiteId: string;
  jobsite: string;
  client: string;
  day: string;
  startsAt: Date;
  minutes: number;
  approved: boolean;
  ended: boolean;
  urgent: boolean;
  rows: WorkRow[];
  noShow: { profileId: string; name: string }[];
};

type RawRow = {
  profile_id: string;
  name: string;
  entry_id: string | null;
  clock_in: string | null;
  clock_out: string | null;
  in_status: EntryStatus | null;
  out_status: EntryStatus | null;
  status: WorkRowStatus;
  distance_m: number | null;
  offline: boolean;
  unscheduled: boolean;
  manual: boolean;
  gps_pending: boolean;
  gps_reviewed: boolean;
  has_app_access: boolean;
  has_pay: boolean;
};
type RawCard = {
  id: string;
  jobsite_id: string;
  jobsite: string;
  client: string | null;
  day: string;
  starts_at: string;
  minutes: number;
  approved: boolean;
  ended: boolean;
  urgent: boolean;
  rows: RawRow[] | null;
  no_show: { profile_id: string; name: string }[] | null;
};

export function mapVisitCard(r: RawCard): VisitCard {
  return {
    id: r.id,
    jobsiteId: r.jobsite_id ?? '',
    jobsite: r.jobsite,
    client: r.client ?? r.jobsite,
    day: r.day,
    startsAt: new Date(r.starts_at),
    minutes: r.minutes,
    approved: r.approved,
    ended: r.ended,
    urgent: r.urgent,
    rows: (r.rows ?? []).map<WorkRow>((e) => ({
      profileId: e.profile_id,
      name: e.name,
      entryId: e.entry_id,
      clockIn: e.clock_in ? new Date(e.clock_in) : null,
      clockOut: e.clock_out ? new Date(e.clock_out) : null,
      inStatus: e.in_status,
      outStatus: e.out_status,
      status: e.status,
      distanceM: e.distance_m,
      offline: e.offline,
      unscheduled: e.unscheduled,
      manual: e.manual,
      gpsPending: e.gps_pending,
      gpsReviewed: e.gps_reviewed,
      hasAppAccess: e.has_app_access,
      hasPay: e.has_pay,
    })),
    noShow: (r.no_show ?? []).map((p) => ({ profileId: p.profile_id, name: p.name })),
  };
}

/** "To approve" (D-266): una tarjeta por visita, la más antigua primero (antes llena los registros automáticos). */
export const fetchToApprove = () => rpc('work_to_approve', {}, (d) => ((d ?? []) as RawCard[]).map(mapVisitCard));
export const fetchVisitWork = (visitId: string) => rpc('visit_work', { p_visit: visitId }, (d) => mapVisitCard(d as RawCard));
export const markNoShow = (visitId: string, profileId: string) => rpc('mark_no_show', { p_visit: visitId, p_profile: profileId }, () => null);
export const undoNoShow = (visitId: string, profileId: string) => rpc('undo_no_show', { p_visit: visitId, p_profile: profileId }, () => null);
/** "+ Agregar persona" (D-266 (3)): cualquier empleado activo que aún no está en la visita. */
export const fetchAddableStaff = (visitId: string) =>
  rpc('work_addable_staff', { p_visit: visitId }, (d) =>
    ((d ?? []) as { id: string; name: string; has_pay: boolean }[]).map((p) => ({ id: p.id, name: p.name, hasPay: p.has_pay })),
  );

export const recordWork = (visitId: string, rows: { profileId: string; clockIn: Date; clockOut: Date | null }[]) =>
  rpc(
    'record_work',
    {
      p_visit: visitId,
      p_rows: rows.map((r) => ({ profile_id: r.profileId, clock_in: r.clockIn.toISOString(), clock_out: r.clockOut ? r.clockOut.toISOString() : null })),
    },
    () => null,
  );
export const editWorkEntry = (entryId: string, clockIn: Date, clockOut: Date | null) =>
  rpc('edit_work_entry', { p_entry: entryId, p_in: clockIn.toISOString(), p_out: clockOut ? clockOut.toISOString() : null }, () => null);
export const reviewGps = (entryId: string) => rpc('review_work_gps', { p_entry: entryId }, () => null);
export const approveVisit = (visitId: string) => rpc('approve_visit', { p_visit: visitId }, () => null);

export type WorkPending = { toApprove: number; urgent: number; gpsOut: number; forgotClockIn: number; openShifts: number };
export const fetchWorkPending = () =>
  rpc('work_home_pending', {}, (d) => {
    const r = (d ?? {}) as { to_approve?: number; urgent?: number; gps_out?: number; forgot_clock_in?: number; open_shifts?: number };
    return {
      toApprove: r.to_approve ?? 0,
      urgent: r.urgent ?? 0,
      gpsOut: r.gps_out ?? 0,
      forgotClockIn: r.forgot_clock_in ?? 0,
      openShifts: r.open_shifts ?? 0,
    } as WorkPending;
  });

// --- Horario del jobsite --------------------------------------------------------------------------------------

export type JobsiteSchedule = {
  startTime: string | null;
  minutes: number | null;
  visits: { id: string; day: string; startsAt: Date; minutes: number; staff: string[] }[];
};
export const fetchJobsiteSchedule = (jobsiteId: string) =>
  rpc('jobsite_visits', { p_jobsite: jobsiteId }, (d) => {
    const r = d as { start_time: string | null; minutes: number | null; visits: { id: string; day: string; starts_at: string; minutes: number; staff: string[] }[] };
    return {
      startTime: r.start_time,
      minutes: r.minutes,
      visits: (r.visits ?? []).map((v) => ({ id: v.id, day: v.day, startsAt: new Date(v.starts_at), minutes: v.minutes, staff: v.staff ?? [] })),
    } as JobsiteSchedule;
  });
export const setJobsiteVisitTime = (jobsiteId: string, start: string, minutes: number) =>
  rpc('set_jobsite_visit_time', { p_jobsite: jobsiteId, p_start: start, p_minutes: minutes }, () => null);
export const setJobsiteLocation = (jobsiteId: string, lat: number | null, lng: number | null) =>
  rpc('set_jobsite_location', { p_jobsite: jobsiteId, p_lat: lat, p_lng: lng }, () => null);

// --- Semana por semana (D-232) ----------------------------------------------------------------------------------

export type WeekSite = {
  id: string;
  name: string;
  client: string;
  startTime: string | null;
  minutes: number | null;
  /** Días que el jobsite trabaja esa semana (0 = domingo). */
  days: number[];
  /** Días que ya no se cambian: pasados, con trabajo o aprobados. */
  locked: number[];
  /** Quién va cada día (7 listas, de domingo a sábado). */
  cells: string[][];
  people: { id: string; name: string; assigned: boolean }[];
};
export type WeekPlan = { sunday: string; staff: { id: string; name: string }[]; jobsites: WeekSite[] };

type WeekSiteDb = {
  id: string;
  name: string;
  client: string;
  start_time: string | null;
  minutes: number | null;
  days: number[];
  locked: number[];
  cells: Record<string, string[]>;
  people: { id: string; name: string; assigned: boolean }[];
};

export const fetchWeekPlan = (sunday: string) =>
  rpc('week_plan', { p_sunday: sunday }, (d) => {
    const r = d as { sunday: string; staff: { id: string; name: string }[]; jobsites: WeekSiteDb[] };
    return {
      sunday: r.sunday,
      staff: r.staff ?? [],
      jobsites: (r.jobsites ?? []).map<WeekSite>((j) => ({
        id: j.id,
        name: j.name,
        client: j.client,
        startTime: j.start_time,
        minutes: j.minutes,
        days: j.days ?? [],
        locked: j.locked ?? [],
        cells: Array.from({ length: 7 }, (_, i) => j.cells?.[String(i)] ?? []),
        people: j.people ?? [],
      })),
    } as WeekPlan;
  });

export const saveWeek = (sunday: string, plan: { jobsite: string; cells: string[][] }[]) =>
  rpc(
    'save_week',
    {
      p_sunday: sunday,
      p_plan: plan.map((p) => ({ jobsite: p.jobsite, days: Object.fromEntries(p.cells.map((c, i) => [String(i), c])) })),
    },
    warnings,
  );
