/**
 * Reglas puras de Clientes, Jobsites y pago por jobsite (hito 5). Sin red: se prueban solas.
 * Fuente: current/flujo.md ("Operaciones 1" y "Operaciones 2"), current/permisos.md, D-009, D-010, D-016, D-056,
 * D-059 a D-061, D-082, D-096, D-097, D-100, D-125, D-194, D-210, D-211.
 */
import { addressBody, addressErrors, emptyAddress, hasAddressErrors, parseAddress, type AddressErrors, type AddressParts } from './address';
import { dayKey, parseUsDate } from './leadRules';
import { formatPhone, isValidPhone, normalizePhone } from './phone';
import { can, type Access } from './visibility';
import { bySunday } from './weekOrder';

// --- Tipos ------------------------------------------------------------------------------------------

export type JobsiteStatus = 'active' | 'paused' | 'terminated';
export const JOBSITE_STATUSES: readonly JobsiteStatus[] = ['active', 'paused', 'terminated'];

export type Frequency = { kind: 'daily' | 'weekly' | 'other'; days: number[]; other?: string };

export type Client = {
  id: string;
  name: string;
  legacy: boolean;
  /** D-291: sus jobsites se manejan directo, sin quote ni contrato con el cliente final. */
  accountProvider?: boolean;
  phone: string | null;
  email: string | null;
  /** Una línea "calle, dirección 2, City, ST ZIP" (D-301). */
  address: string | null;
  addressParts?: AddressParts;
  addressNeedsReview?: boolean;
  notes: string | null;
};

export type Jobsite = {
  id: string;
  clientId: string;
  clientName: string;
  clientLegacy: boolean;
  clientAccountProvider?: boolean;
  name: string;
  /** Una línea "calle, dirección 2, City, ST ZIP" (D-301). */
  address: string;
  addressParts?: AddressParts;
  addressNeedsReview?: boolean;
  plusCode: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyRelation: string | null;
  emergencyEmail: string | null;
  frequency: Frequency | null;
  estHoursPerVisit: number | null;
  visitsPerMonth: number | null;
  startDate: string | null; // AAAA-MM-DD
  status: JobsiteStatus;
  walkthroughVersion: number | null;
  /** Proyecto one-time (orden 162): una sola visita, sin tarifa mensual; fecha del servicio AAAA-MM-DD. */
  oneTime?: boolean;
  oneTimeOn?: string | null;
};

/**
 * D-200 (orden 162): un one-time se ve en Accounts con la etiqueta One-time hasta que pasa la fecha del servicio;
 * después, en Archived (como un jobsite terminado).
 */
export function isArchivedJobsite(j: Pick<Jobsite, 'status' | 'oneTime' | 'oneTimeOn'>, today: string): boolean {
  if (j.status === 'terminated') return true;
  return Boolean(j.oneTime && j.oneTimeOn && j.oneTimeOn < today);
}

function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type PayKind = 'hourly' | 'fixed';
export type FixedPeriod = 'visit' | 'week' | 'month';

export type Pay = {
  kind: PayKind;
  hourlyRate: number | null;
  guaranteedHours: number | null;
  fixedAmount: number | null;
  fixedPeriod: FixedPeriod | null;
  effectiveFrom: string; // AAAA-MM-DD
  nextChange: string | null;
};

export type StaffRow = {
  assignmentId: string;
  profileId: string;
  fullName: string;
  workerType: 'w2' | '1099' | null;
  startDate: string;
  endDate: string | null;
};

export type ProfileAssignment = {
  assignmentId: string;
  jobsiteId: string;
  jobsiteName: string;
  clientName: string;
  startDate: string;
  endDate: string | null;
};

// --- Permisos (current/permisos.md, D-125, D-194, D-210) ---------------------------------------------

export const canSeeAccounts = (a: Access) => can(a, 'clientes_ver');
export const canSeeRate = (a: Access) => can(a, 'clientes_ver_tarifa');
export const canEditClientData = (a: Access) => can(a, 'clientes_editar_datos');
/** Alta manual de clientes previos y su tarifa: editar datos y ver tarifa (D-210). */
/** Jobsites que se manejan directo (previo a la app, D-210, o proveedor de cuentas, D-291): alta a mano y tarifa editable. */
export const isDirectJobsite = (j: Pick<Jobsite, 'clientLegacy' | 'clientAccountProvider'>) => j.clientLegacy || !!j.clientAccountProvider;
export const canCreateLegacy = (a: Access) => can(a, 'clientes_editar_datos') && can(a, 'clientes_ver_tarifa');
export const canChangeStatus = (a: Access) => can(a, 'clientes_cambiar_estado');
export const canSeePay = (a: Access) => can(a, 'empleados_ver_pagos');
/** Asignar personal sin cifras: quien asigna pago o quien edita el schedule (el supervisor, D-210). */
export const canAssign = (a: Access) => can(a, 'empleados_asignar_pago') || can(a, 'schedule_ver_editar');
/** Definir el pago: asignar pago y ver pagos. */
export const canSetPay = (a: Access) => can(a, 'empleados_asignar_pago') && can(a, 'empleados_ver_pagos');

export type DocKind = 'sow' | 'contract' | 'other';
/** Quién sube cada documento: SOW con editar walkthrough y SOW; contrato con editar datos y ver tarifa; otros con editar datos. */
export function canUploadDoc(a: Access, kind: DocKind): boolean {
  if (kind === 'sow') return can(a, 'clientes_editar_walkthrough_sow');
  if (kind === 'contract') return can(a, 'clientes_editar_datos') && can(a, 'clientes_ver_tarifa');
  return can(a, 'clientes_editar_datos');
}
export function uploadableKinds(a: Access): DocKind[] {
  return (['sow', 'contract', 'other'] as const).filter((k) => canUploadDoc(a, k));
}

// --- Estado (D-056, D-082, D-097) ----------------------------------------------------------------------

/** Ficha: Activo verde, Pausado ámbar (muestra ronda 9), Terminado gris; "Margen en riesgo" ámbar en lugar de Activo. */
export function statusTone(status: JobsiteStatus): 'success' | 'warning' | 'neutral' {
  return status === 'active' ? 'success' : status === 'paused' ? 'warning' : 'neutral';
}

/** Pausar o terminar piden confirmación; volver a Activo desde Pausado no; un terminado no cambia (D-210). */
export function statusChangeNeedsConfirm(current: JobsiteStatus, next: JobsiteStatus): boolean {
  return current !== next && next !== 'active';
}
export function statusOptions(current: JobsiteStatus): JobsiteStatus[] {
  return current === 'terminated' ? ['terminated'] : [...JOBSITE_STATUSES];
}

// --- Lista de Cuentas (D-082) --------------------------------------------------------------------------

export type ClientGroup = { clientId: string; clientName: string; legacy: boolean; accountProvider?: boolean; jobsites: Jobsite[] };

/** Agrupada por cliente, en orden alfabético de cliente y de jobsite; Terminados al final de su grupo. */
export function groupByClient(jobsites: readonly Jobsite[], clients: readonly Client[] = []): ClientGroup[] {
  const groups = new Map<string, ClientGroup>();
  for (const c of clients) groups.set(c.id, { clientId: c.id, clientName: c.name, legacy: c.legacy, accountProvider: c.accountProvider ?? false, jobsites: [] });
  for (const j of jobsites) {
    const g = groups.get(j.clientId) ?? { clientId: j.clientId, clientName: j.clientName, legacy: j.clientLegacy, accountProvider: j.clientAccountProvider ?? false, jobsites: [] };
    g.jobsites.push(j);
    groups.set(j.clientId, g);
  }
  const rank = (j: Jobsite) => (j.status === 'terminated' ? 1 : 0);
  return [...groups.values()]
    .map((g) => ({ ...g, jobsites: [...g.jobsites].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName));
}

// --- Accounts: activas y archivadas (D-337 (3)) ------------------------------------------------------------

/** Tarjeta de la lista de Accounts: un cliente con los jobsites que tocan en esa pestaña. */
export type AccountCard = {
  clientId: string;
  clientName: string;
  accountProvider: boolean;
  jobsites: Jobsite[];
  /** Archivadas: "Cliente inactivo" si no le queda ningún jobsite sin terminar; si no, son sus jobsites terminados. */
  inactiveClient: boolean;
};

/**
 * Activas = clientes con algún jobsite sin terminar (activo o pausado), solo con esos jobsites. Archivadas = jobsites
 * terminados (agrupados por cliente) y clientes sin ningún jobsite sin terminar. Un cliente con uno activo y otro
 * terminado sale en Activas con el activo y en Archivadas con el terminado.
 */
export function splitAccounts(groups: readonly ClientGroup[], today = todayKey()): { active: AccountCard[]; archived: AccountCard[] } {
  const active: AccountCard[] = [];
  const archived: AccountCard[] = [];
  for (const g of groups) {
    const base = { clientId: g.clientId, clientName: g.clientName, accountProvider: g.accountProvider ?? false };
    const open = g.jobsites.filter((j) => !isArchivedJobsite(j, today));
    const ended = g.jobsites.filter((j) => isArchivedJobsite(j, today));
    if (open.length > 0) active.push({ ...base, jobsites: open, inactiveClient: false });
    if (open.length === 0) archived.push({ ...base, jobsites: ended, inactiveClient: true });
    else if (ended.length > 0) archived.push({ ...base, jobsites: ended, inactiveClient: false });
  }
  return { active, archived };
}

/** Búsqueda por cliente o jobsite, sin mayúsculas ni acentos. Si coincide el cliente quedan todos sus jobsites. */
export function filterAccounts(cards: readonly AccountCard[], query: string): AccountCard[] {
  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const q = norm(query.trim());
  if (!q) return [...cards];
  return cards.flatMap((c) => {
    if (norm(c.clientName).includes(q)) return [c];
    const js = c.jobsites.filter((j) => norm(j.name).includes(q) || norm(j.address).includes(q));
    return js.length > 0 ? [{ ...c, jobsites: js }] : [];
  });
}

/** Total mensual de los jobsites activos (no pausados ni terminados) con tarifa conocida. */
export function monthlyTotal(jobsites: readonly Jobsite[], rates: ReadonlyMap<string, number>): number {
  return jobsites.reduce((sum, j) => (j.status === 'active' && !j.oneTime ? sum + (rates.get(j.id) ?? 0) : sum), 0);
}

// --- Dinero y fechas -----------------------------------------------------------------------------------

/** "$1,850.00" (muestras). */
export function money(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Lee un monto escrito: "1850", "1,850.00", "$18". null si no es válido. */
export function parseMoney(text: string): number | null {
  const t = text.trim().replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Number(t);
}

export function parseHours(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= 24 ? n : null;
}

/** "City, ST" del encabezado del jobsite (D-055) desde las partes de la dirección (D-301), o leída del texto. */
export function cityStateOf(j: Pick<Jobsite, 'address' | 'addressParts'>): string {
  const p = j.addressParts;
  if (p && p.city.trim()) return [p.city.trim(), p.state.trim()].filter(Boolean).join(', ');
  return cityFrom(j.address);
}

/** "Ciudad" del encabezado del jobsite (D-055): la parte de la dirección antes del estado, si se puede leer. */
export function cityFrom(address: string): string {
  // "123 5th Ave S, Naples, FL 34102" -> "Naples, FL" (muestra ronda 6).
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const state = parts[parts.length - 1].split(/\s+/)[0];
    return /^[A-Z]{2}$/.test(state) ? `${parts[parts.length - 2]}, ${state}` : parts[parts.length - 2];
  }
  if (parts.length === 2) {
    const m = /^(.*?)(?:\s+([A-Z]{2}))?(?:\s+\d{5})?$/.exec(parts[1]);
    return m && m[2] ? `${m[1]}, ${m[2]}` : parts[1];
  }
  return '';
}

// --- Visitas y costo (mismas reglas que la base, D-009, D-010) ---------------------------------------------

/** Visitas por mes: diaria 7 por semana, semanal los días marcados, "Otra" la cifra escrita. Una semana = 52/12 de mes. */
export function visitsPerMonth(f: Frequency | null, override: number | null): number | null {
  if (!f) return override;
  if (f.kind === 'daily') return Math.round(((7 * 52) / 12) * 100) / 100;
  if (f.kind === 'weekly') return Math.round(((f.days.length * 52) / 12) * 100) / 100;
  return override;
}

export function payMonthlyCost(p: Pick<Pay, 'kind' | 'hourlyRate' | 'guaranteedHours' | 'fixedAmount' | 'fixedPeriod'>, hours: number | null, visits: number | null): number {
  let v = 0;
  if (p.kind === 'hourly') v = (p.hourlyRate ?? 0) * Math.max(hours ?? 0, p.guaranteedHours ?? 0) * (visits ?? 0);
  else if (p.fixedPeriod === 'visit') v = (p.fixedAmount ?? 0) * (visits ?? 0);
  else if (p.fixedPeriod === 'week') v = ((p.fixedAmount ?? 0) * 52) / 12;
  else v = p.fixedAmount ?? 0;
  return Math.round(v * 100) / 100;
}

/**
 * Tarifa fija que empieza o termina a mitad de periodo: se prorratea por días (D-210). Misma regla que
 * prorate_fixed en la base: lo que toca entre `from` y `to` dentro del periodo que empieza en `periodStart`.
 */
export function prorateFixed(amount: number, period: FixedPeriod, periodStart: string, from: string | null, to: string | null): number {
  if (period === 'visit') return amount;
  const start = new Date(`${periodStart}T00:00:00`);
  const end = new Date(start);
  if (period === 'week') end.setDate(end.getDate() + 6);
  else {
    end.setMonth(end.getMonth() + 1);
    end.setDate(end.getDate() - 1);
  }
  const day = 86_400_000;
  const days = Math.round((end.getTime() - start.getTime()) / day) + 1;
  const a = from ? Math.max(new Date(`${from}T00:00:00`).getTime(), start.getTime()) : start.getTime();
  const b = to ? Math.min(new Date(`${to}T00:00:00`).getTime(), end.getTime()) : end.getTime();
  const used = Math.round((b - a) / day) + 1;
  if (used <= 0) return 0;
  return Math.round(((amount * used) / days) * 100) / 100;
}

// --- Formulario del pago (D-059, D-061, D-096, D-100, D-210) ----------------------------------------------

export const MIN_WAGE_W2 = 15; // D-016: Florida, desde el 30 de septiembre de 2026

export type PayForm = {
  kind: PayKind;
  hourlyRate: string;
  guaranteedHours: string;
  fixedPeriod: FixedPeriod;
  fixedAmount: string;
  from: string; // MM/DD/AAAA
};

/** Formulario vacío: Por hora (D-059), Cobra Por visita (D-100) y desde hoy (D-200). */
export function emptyPayForm(today: Date, us: (key: string) => string): PayForm {
  return { kind: 'hourly', hourlyRate: '', guaranteedHours: '', fixedPeriod: 'visit', fixedAmount: '', from: us(dayKey(today)) };
}

/** D-276: al 1099 no se le paga por hora; solo fijo (por visita = por día de servicio, por semana o por mes). */
export function payKindsFor(workerType: 'w2' | '1099' | null): PayKind[] {
  return workerType === '1099' ? ['fixed'] : ['hourly', 'fixed'];
}

export type PayErrors = { hourlyRate?: 'invalid' | 'minWage'; guaranteedHours?: true; fixedAmount?: true; from?: 'invalid' | 'past' };

/**
 * D-241: una fecha de inicio (asignación de personal, su pago, una visita) puede ser pasada solo en un jobsite de un
 * cliente "Previo a la app"; en los demás no (D-210: sin efecto retroactivo).
 */
export function startDateError(key: string | null, today: Date, legacy: boolean): 'invalid' | 'past' | null {
  if (key === null || key === 'invalid') return 'invalid';
  if (!legacy && key < dayKey(today)) return 'past';
  return null;
}

export function validatePay(f: PayForm, workerType: 'w2' | '1099' | null, today: Date, legacy = false): PayErrors {
  const e: PayErrors = {};
  if (f.kind === 'hourly' && workerType === '1099') e.fixedAmount = true; // D-276: nunca por hora
  else if (f.kind === 'hourly') {
    const rate = parseMoney(f.hourlyRate);
    if (rate === null) e.hourlyRate = 'invalid';
    // D-096: Guardar queda activo; con menos de $15.00 un W-2 no guarda y ve el error bajo el campo.
    else if (workerType === 'w2' && rate < MIN_WAGE_W2) e.hourlyRate = 'minWage';
    if (f.guaranteedHours.trim() !== '' && parseHours(f.guaranteedHours) === null) e.guaranteedHours = true;
  } else if (parseMoney(f.fixedAmount) === null) e.fixedAmount = true;
  const from = startDateError(parseUsDate(f.from), today, legacy); // D-210 sin efecto retroactivo; D-241 previos sí
  if (from) e.from = from;
  return e;
}

export function hasPayErrors(e: PayErrors): boolean {
  return Object.keys(e).length > 0;
}

/** Parámetros de set_assignment_pay. */
export function payParams(f: PayForm) {
  const hourly = f.kind === 'hourly';
  return {
    p_kind: f.kind,
    p_hourly: hourly ? parseMoney(f.hourlyRate) : null,
    p_guaranteed: hourly && f.guaranteedHours.trim() !== '' ? parseHours(f.guaranteedHours) : null,
    p_amount: hourly ? null : parseMoney(f.fixedAmount),
    p_period: hourly ? null : f.fixedPeriod,
    p_from: parseUsDate(f.from) as string,
  };
}

/** Línea que explica el pago (D-100): "Se pagan $120.00 por cada visita trabajada." */
export function payExplanation(
  f: Pick<PayForm, 'kind' | 'fixedPeriod' | 'fixedAmount'>,
  s: { perVisit: (m: string) => string; perWeek: (m: string) => string; perMonth: (m: string) => string },
): string | null {
  if (f.kind !== 'fixed') return null;
  const amount = parseMoney(f.fixedAmount);
  if (amount === null) return null;
  const m = money(amount);
  return f.fixedPeriod === 'visit' ? s.perVisit(m) : f.fixedPeriod === 'week' ? s.perWeek(m) : s.perMonth(m);
}

/** Resumen corto del pago para las filas: "$18.00/h · 3 h garantizadas", "$120.00 por visita". */
export function paySummary(
  p: Pay | null,
  s: { perHour: (m: string) => string; guaranteed: (h: number) => string; visit: (m: string) => string; week: (m: string) => string; month: (m: string) => string; none: string },
): string {
  if (!p) return s.none;
  if (p.kind === 'hourly') {
    const base = s.perHour(money(p.hourlyRate ?? 0));
    return p.guaranteedHours ? `${base} · ${s.guaranteed(p.guaranteedHours)}` : base;
  }
  const m = money(p.fixedAmount ?? 0);
  return p.fixedPeriod === 'visit' ? s.visit(m) : p.fixedPeriod === 'week' ? s.week(m) : s.month(m);
}

// --- Formulario del jobsite -------------------------------------------------------------------------------

export type JobsiteForm = AddressParts & {
  name: string;
  plusCode: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelation: string;
  emergencyEmail: string;
  frequency: Frequency;
  estHours: string;
  visitsPerMonth: string;
  startDate: string; // MM/DD/AAAA
  rate: string; // solo al dar de alta un jobsite previo
};

export type JobsiteErrors = {
  name?: true;
  /** D-301: dirección obligatoria y completa. */
  address?: AddressErrors;
  plusCode?: true;
  contactEmail?: true;
  emergencyEmail?: true;
  contactPhone?: true;
  emergencyPhone?: true;
  estHours?: true;
  visitsPerMonth?: true;
  startDate?: true;
  rate?: true;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateJobsite(f: JobsiteForm, opts: { withRate: boolean; plusCodeOk: (code: string) => boolean }): JobsiteErrors {
  const e: JobsiteErrors = {};
  if (f.name.trim() === '') e.name = true;
  const a = addressErrors(f, 'required');
  if (hasAddressErrors(a)) e.address = a;
  if (f.plusCode.trim() !== '' && !opts.plusCodeOk(f.plusCode)) e.plusCode = true;
  if (f.contactEmail.trim() !== '' && !EMAIL.test(f.contactEmail.trim())) e.contactEmail = true;
  if (f.emergencyEmail.trim() !== '' && !EMAIL.test(f.emergencyEmail.trim())) e.emergencyEmail = true;
  // D-216: teléfonos de EE. UU. de 10 dígitos.
  if (!isValidPhone(f.contactPhone)) e.contactPhone = true;
  if (!isValidPhone(f.emergencyPhone)) e.emergencyPhone = true;
  if (f.estHours.trim() !== '' && parseHours(f.estHours) === null) e.estHours = true;
  if (f.frequency.kind === 'other' && f.visitsPerMonth.trim() !== '') {
    const v = Number(f.visitsPerMonth.replace(',', '.'));
    if (!Number.isFinite(v) || v < 0 || v > 62) e.visitsPerMonth = true;
  }
  if (parseUsDate(f.startDate) === 'invalid') e.startDate = true;
  if (opts.withRate && parseMoney(f.rate) === null) e.rate = true;
  return e;
}

/** Datos para create_legacy_jobsite / update_jobsite. */
export function jobsiteData(f: JobsiteForm) {
  const start = parseUsDate(f.startDate);
  return {
    name: f.name.trim(),
    ...addressBody(f),
    plus_code: f.plusCode.trim(),
    contact_name: f.contactName,
    contact_phone: normalizePhone(f.contactPhone),
    contact_email: f.contactEmail,
    emergency_name: f.emergencyName,
    emergency_phone: normalizePhone(f.emergencyPhone),
    emergency_relation: f.emergencyRelation,
    emergency_email: f.emergencyEmail,
    frequency: f.frequency.kind === 'weekly' ? { kind: 'weekly', days: f.frequency.days } : f.frequency.kind === 'daily'
      ? { kind: 'daily', days: [0, 1, 2, 3, 4, 5, 6] }
      : { kind: 'other', days: [], other: f.frequency.other ?? '' },
    est_hours_per_visit: f.estHours.trim() === '' ? null : parseHours(f.estHours),
    visits_per_month: f.frequency.kind === 'other' && f.visitsPerMonth.trim() !== '' ? Number(f.visitsPerMonth.replace(',', '.')) : null,
    start_date: start === 'invalid' ? null : start,
  };
}

/** Frecuencia en una línea (muestra ronda 6: "Lun, Mié y Vie"). */
export function frequencyLabel(
  f: Frequency | null,
  s: { daily: string; other: string; days: readonly string[]; and: string },
): string | null {
  if (!f) return null;
  if (f.kind === 'daily') return s.daily;
  if (f.kind === 'other') return f.other?.trim() || s.other;
  const names = [...f.days].sort(bySunday).map((d) => s.days[d]);
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} ${s.and} ${names[names.length - 1]}`;
}

export const emptyJobsiteForm: JobsiteForm = {
  name: '',
  ...emptyAddress(),
  plusCode: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  emergencyName: '',
  emergencyPhone: '',
  emergencyRelation: '',
  emergencyEmail: '',
  // D-200: un jobsite nuevo parte en Semanal sin días, como el walkthrough (D-213).
  frequency: { kind: 'weekly', days: [] },
  estHours: '',
  visitsPerMonth: '',
  startDate: '',
  rate: '',
};

export function jobsiteFormFrom(j: Jobsite, us: (key: string | null) => string): JobsiteForm {
  return {
    name: j.name,
    ...(j.addressParts ?? parseAddress(j.address).parts),
    plusCode: j.plusCode ?? '',
    contactName: j.contactName ?? '',
    contactPhone: formatPhone(j.contactPhone),
    contactEmail: j.contactEmail ?? '',
    emergencyName: j.emergencyName ?? '',
    emergencyPhone: formatPhone(j.emergencyPhone),
    emergencyRelation: j.emergencyRelation ?? '',
    emergencyEmail: j.emergencyEmail ?? '',
    frequency: j.frequency ?? { kind: 'weekly', days: [] },
    estHours: j.estHoursPerVisit === null ? '' : String(j.estHoursPerVisit),
    visitsPerMonth: j.visitsPerMonth === null ? '' : String(j.visitsPerMonth),
    startDate: us(j.startDate),
    rate: '',
  };
}

// --- Detalle del jobsite (orden 150, D-339, D-340) ---------------------------------------------------------

export type ReadableFrequencyStrings = {
  daily: string;
  other: string;
  /** Nombres cortos, 0 = lunes (D-038). */
  days: readonly string[];
  /** Nombres largos, 0 = lunes. */
  daysLong: readonly string[];
  and: string;
  everyDay: string;
  daysAWeek: (n: number) => string;
  /** "no Wednesday" / "no Wednesday or Sunday". */
  except: (names: string) => string;
  or: string;
};

const joinWith = (names: string[], word: string) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ${word} ${names[names.length - 1]}`;

/**
 * Frecuencia legible (D-340): 7 días "Every day"; de 4 a 6, "6 days a week · no Wednesday"; si son pocos días (1 a 3),
 * la lista "Mon, Wed and Fri". Diaria y Otra como siempre. D-200: el corte entre lista y "N days a week" es 4 días.
 */
export function readableFrequency(f: Frequency | null, s: ReadableFrequencyStrings): string | null {
  if (!f) return null;
  if (f.kind === 'daily') return s.daily;
  if (f.kind === 'other') return f.other?.trim() || s.other;
  const days = [...new Set(f.days)].filter((d) => d >= 0 && d <= 6).sort(bySunday);
  if (days.length === 0) return null;
  if (days.length === 7) return s.everyDay;
  if (days.length <= 3) return joinWith(days.map((d) => s.days[d]), s.and);
  const missing = [0, 1, 2, 3, 4, 5, 6].filter((d) => !days.includes(d)).sort(bySunday);
  return `${s.daysAWeek(days.length)} · ${s.except(joinWith(missing.map((d) => s.daysLong[d]), s.or))}`;
}

/** Principal y emergencia son la misma persona si coinciden nombre y teléfono (D-340), sin mayúsculas ni formato. */
export function sameContact(j: Pick<Jobsite, 'contactName' | 'contactPhone' | 'emergencyName' | 'emergencyPhone'>): boolean {
  const name = (x: string | null) => (x ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const digits = (x: string | null) => (x ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (name(j.emergencyName) === '' && digits(j.emergencyPhone) === '') return true; // sin emergencia: una sola fila
  return name(j.contactName) === name(j.emergencyName) && digits(j.contactPhone) === digits(j.emergencyPhone);
}

/** Enlace de Maps: las coordenadas del Plus Code si las hay, si no la dirección (D-340). */
export function mapsUrl(address: string | null, coords: { latitude: number; longitude: number } | null): string | null {
  if (coords) return `https://www.google.com/maps/search/?api=1&query=${coords.latitude},${coords.longitude}`;
  const a = (address ?? '').trim();
  return a ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}` : null;
}

/** Margen del mes sobre la tarifa: % de margen y % del personal (barra), o null sin tarifa (D-340). */
export function monthMargin(rate: number | null, staff: number | null): { margin: number; staffShare: number } | null {
  if (rate === null || staff === null || rate <= 0) return null;
  const share = staff / rate;
  return { margin: Math.round((1 - share) * 100), staffShare: Math.round(share * 100) };
}

/** Acciones del menú ⋯ con la misma lógica del selector de estado de antes (D-056): Activo ↔ Pausado, y Terminar. */
export function statusMenuActions(current: JobsiteStatus): JobsiteStatus[] {
  if (current === 'terminated') return [];
  return statusOptions(current).filter((s) => s !== current);
}
