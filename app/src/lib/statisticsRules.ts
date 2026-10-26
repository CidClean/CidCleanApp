/**
 * Reglas puras de Estadísticas y del Inicio nuevo del admin (órdenes 38 y 39; D-252, D-253). Los cálculos de horas
 * y dinero los hace la base (migración 20261027000014: statistics_report y admin_home); aquí solo hay la lectura de
 * la respuesta, los derivados por hora y en %, quién ve cada tarjeta, y los archivos CSV y HTML del PDF.
 */
import type { AccountingStrings } from '@/i18n/accounting';
import type { StatisticsStrings } from '@/i18n/statistics';
import { hoursText, monthTitle, money, periodTitle, toCsv, type Period } from './accountingRules';
import { BRAND_PDF_CSS, brandFooterHtml, brandHeaderHtml } from './pdfBrand';
import { can, canAny, type Access } from './visibility';

// --- Tipos -------------------------------------------------------------------------------------------------

export type Absence = { visitId: string; jobsiteId: string; jobsite: string; profileId: string; name: string; day: string };

/** Lo que mide cada grupo de registros (una cuenta, un empleado o los dos). Minutos y dinero de la base. */
export type ShiftFigures = {
  visits: number;
  shifts: number;
  /** Reales, de clock in a clock out, del trabajo aprobado (D-053, D-245). */
  workedMinutes: number;
  /** Lo que se pagó, con las horas garantizadas (D-214). */
  paidMinutes: number;
  unworkedMinutes: number;
  unworkedAmount: number;
  avgMinutes: number | null;
  /** Entradas marcadas por el propio empleado y cuántas fueron a tiempo (hasta 5 min tarde, D-200). */
  punctualSelf: number;
  punctualOnTime: number;
  scheduled: number;
  scheduledWorked: number;
  absences: Absence[];
};

export type EmployeeStats = ShiftFigures & { profileId: string; name: string; workerType: string | null; cost: number };

export type AccountStats = ShiftFigures & {
  jobsiteId: string;
  name: string;
  client: string;
  status: string;
  estMinutes: number | null;
  expected: number;
  staff: number;
  expenses: number;
  profit: number;
  margin: number | null;
  employees: EmployeeStats[];
};

export type TrendMonth = { month: string; expected: number; staff: number; expenses: number; profit: number };

export type StatisticsReport = { accounts: AccountStats[]; employees: EmployeeStats[]; trend: TrendMonth[] };

// --- Lectura de la respuesta --------------------------------------------------------------------------------

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const nn = (v: unknown) => (v === null || v === undefined ? null : Number(v));
type Row = Record<string, unknown>;

function figures(r: Row): ShiftFigures {
  return {
    visits: n(r.visits),
    shifts: n(r.shifts),
    workedMinutes: n(r.worked_minutes),
    paidMinutes: n(r.paid_minutes),
    unworkedMinutes: n(r.unworked_minutes),
    unworkedAmount: n(r.unworked_amount),
    avgMinutes: nn(r.avg_minutes),
    punctualSelf: n(r.punctual_self),
    punctualOnTime: n(r.punctual_on_time),
    scheduled: n(r.scheduled),
    scheduledWorked: n(r.scheduled_worked),
    absences: ((r.absences ?? []) as Row[]).map((a) => ({
      visitId: String(a.visit_id),
      jobsiteId: String(a.jobsite_id),
      jobsite: String(a.jobsite ?? ''),
      profileId: String(a.profile_id),
      name: String(a.name ?? ''),
      day: String(a.day),
    })),
  };
}

function employee(r: Row): EmployeeStats {
  return {
    ...figures(r),
    profileId: String(r.profile_id),
    name: String(r.name ?? ''),
    workerType: (r.worker_type as string | null) ?? null,
    cost: n(r.cost),
  };
}

export function toReport(d: unknown): StatisticsReport {
  const x = (d ?? {}) as Row;
  return {
    accounts: ((x.accounts ?? []) as Row[]).map((r) => ({
      ...figures(r),
      jobsiteId: String(r.jobsite_id),
      name: String(r.name ?? ''),
      client: String(r.client ?? ''),
      status: String(r.status ?? ''),
      estMinutes: nn(r.est_minutes),
      expected: n(r.expected),
      staff: n(r.staff),
      expenses: n(r.expenses),
      profit: n(r.profit),
      margin: nn(r.margin),
      employees: ((r.employees ?? []) as Row[]).map(employee),
    })),
    employees: ((x.employees ?? []) as Row[]).map(employee),
    trend: ((x.trend ?? []) as Row[]).map((m) => ({
      month: String(m.month),
      expected: n(m.expected),
      staff: n(m.staff),
      expenses: n(m.expenses),
      profit: n(m.profit),
    })),
  };
}

// --- Derivados -----------------------------------------------------------------------------------------------

/** Horas como en Accounting (hasta dos decimales) con "h": 203.1 h, 204 h, 3.98 h. */
export function hours(minutes: number): string {
  return `${hoursText(minutes)} h`;
}

/** Un número con un decimal sin ".0" de más: 41.9, 99.5, 100. */
export function pct(v: number): string {
  const r = Math.round(v * 10) / 10;
  return String(r);
}

/** % aprovechado: horas trabajadas sobre pagadas; null sin horas pagadas. */
export function usedPct(f: Pick<ShiftFigures, 'workedMinutes' | 'paidMinutes'>): number | null {
  if (!(f.paidMinutes > 0)) return null;
  return Math.min(100, (f.workedMinutes * 100) / f.paidMinutes);
}

/** Dinero por hora trabajada (ingreso o costo); null sin horas trabajadas. */
export function perHour(amount: number, workedMinutes: number): number | null {
  if (!(workedMinutes > 0)) return null;
  return Math.round((amount / (workedMinutes / 60)) * 100) / 100;
}

/** Puntualidad: % de las entradas propias que fueron a tiempo; null si nadie marcó la suya. */
export function punctualityPct(f: Pick<ShiftFigures, 'punctualSelf' | 'punctualOnTime'>): number | null {
  if (!(f.punctualSelf > 0)) return null;
  return (f.punctualOnTime * 100) / f.punctualSelf;
}

/** Faltas de una lista de turnos programados. */
export function missing(f: Pick<ShiftFigures, 'scheduled' | 'scheduledWorked'>): number {
  return Math.max(0, f.scheduled - f.scheduledWorked);
}

/** Día corto de una falta: "dom 25 oct" / "Sun Oct 25". */
export function absenceDay(day: string, dayNames: readonly string[], monthShort: readonly string[], locale: 'es' | 'en'): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return locale === 'es'
    ? `${dayNames[dow].toLowerCase()} ${d} ${monthShort[m - 1]}`
    : `${dayNames[dow]} ${monthShort[m - 1]} ${d}`;
}

/** Barras de la tendencia: escala hasta el mayor valor del periodo (mínimo 1 para no dividir entre 0). */
export function trendScale(months: readonly TrendMonth[]): number {
  return Math.max(1, ...months.flatMap((m) => [m.expected, m.staff, m.profit]));
}

// --- Inicio del admin (D-253) -----------------------------------------------------------------------------------

export type HomeVisitStaff = { profileId: string; name: string; clockIn: string | null; clockOut: string | null };
export type HomeVisit = { id: string; jobsite: string; startsAt: string; minutes: number; staff: HomeVisitStaff[] };
export type WeekHours = { profileId: string; name: string; programmedMinutes: number; workedMinutes: number };

export type AdminHomeData = {
  month: { month: string; expected: number; staff: number; expenses: number; profit: number; margin: number | null } | null;
  receivable: { month: string; pending: number; count: number } | null;
  toApprove: { visits: number; shifts: number; urgent: number } | null;
  today: HomeVisit[] | null;
  weekHours: WeekHours[] | null;
  pipeline: { open: number; quoteSent: number } | null;
  accounts: { active: number; atRisk: number | null } | null;
};

export function toAdminHome(d: unknown): AdminHomeData {
  const x = (d ?? {}) as Row;
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null);
  const month = obj(x.month);
  const rec = obj(x.receivable);
  const appr = obj(x.to_approve);
  const pipe = obj(x.pipeline);
  const acc = obj(x.accounts);
  return {
    month: month
      ? { month: String(month.month), expected: n(month.expected), staff: n(month.staff), expenses: n(month.expenses), profit: n(month.profit), margin: nn(month.margin) }
      : null,
    receivable: rec ? { month: String(rec.month), pending: n(rec.pending), count: n(rec.count) } : null,
    toApprove: appr ? { visits: n(appr.visits), shifts: n(appr.shifts), urgent: n(appr.urgent) } : null,
    today: Array.isArray(x.today)
      ? (x.today as Row[]).map((v) => ({
          id: String(v.id),
          jobsite: String(v.jobsite ?? ''),
          startsAt: String(v.starts_at),
          minutes: n(v.minutes),
          staff: ((v.staff ?? []) as Row[]).map((s) => ({
            profileId: String(s.profile_id),
            name: String(s.name ?? ''),
            clockIn: (s.clock_in as string | null) ?? null,
            clockOut: (s.clock_out as string | null) ?? null,
          })),
        }))
      : null,
    weekHours: Array.isArray(x.week_hours)
      ? (x.week_hours as Row[]).map((h) => ({
          profileId: String(h.profile_id),
          name: String(h.name ?? ''),
          programmedMinutes: n(h.programmed_minutes),
          workedMinutes: n(h.worked_minutes),
        }))
      : null,
    pipeline: pipe ? { open: n(pipe.open), quoteSent: n(pipe.quote_sent) } : null,
    accounts: acc ? { active: n(acc.active), atRisk: nn(acc.at_risk) } : null,
  };
}

/** Parte de lo esperado que se va en personal y gastos (la barra de la tarjeta de marca), de 0 a 1. */
export function costShare(m: { expected: number; staff: number; expenses: number }): number {
  if (!(m.expected > 0)) return m.staff + m.expenses > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, (m.staff + m.expenses) / m.expected));
}

/**
 * Quién ve cada tarjeta del Inicio (D-253): cada una con el permiso de su área, como las calcula admin_home.
 * Horas contra 32 h solo con el schedule (D-223: el staff nunca las ve).
 */
export function homeCards(access: Access) {
  return {
    profit: can(access, 'dashboard_global'),
    receivable: can(access, 'dashboard_global') || (can(access, 'ingresos_ver_registrar') && can(access, 'clientes_ver_tarifa')),
    toApprove: can(access, 'work_aprobar'),
    today: canAny(access, ['schedule_ver_editar', 'work_registrar_por_otros']),
    weekHours: can(access, 'schedule_ver_editar'),
    pipeline: can(access, 'leads_ver'),
    accounts: can(access, 'clientes_ver'),
  };
}

/** Tocar una falta lleva a esa visita: el schedule de la visita, o el detalle del trabajo con permisos de Work. */
export function absenceTarget(access: Access): 'visit' | 'work' | null {
  if (can(access, 'schedule_ver_editar')) return 'visit';
  if (canAny(access, ['work_aprobar', 'work_editar', 'work_revisar_gps', 'work_registrar_por_otros'])) return 'work';
  return null;
}

// --- Exportar (D-253): CSV y PDF -----------------------------------------------------------------------------

export type StatsTab = 'accounts' | 'employees' | 'trend';

const h2 = (minutes: number) => (Math.round((minutes / 60) * 100) / 100).toFixed(2);
const m2 = (v: number | null) => (v === null ? '' : v.toFixed(2));
const p1 = (v: number | null) => (v === null ? '' : (Math.round(v * 10) / 10).toFixed(1));

export function statsCsv(tab: StatsTab, r: StatisticsReport, s: StatisticsStrings): string {
  const c = s.csv;
  if (tab === 'accounts')
    return toCsv(
      [c.account, c.client, c.visits, c.shifts, c.workedHours, c.paidHours, c.unworkedHours, c.unworkedAmount, c.used, c.expected, c.staff,
        c.expenses, c.profit, c.margin, c.incomePerHour, c.costPerHour, c.avgHours, c.estHours, c.punctualSelf, c.punctualOnTime, c.scheduled,
        c.worked, c.absences],
      r.accounts.map((a) => [
        a.name, a.client, a.visits, a.shifts, h2(a.workedMinutes), h2(a.paidMinutes), h2(a.unworkedMinutes), m2(a.unworkedAmount), p1(usedPct(a)),
        m2(a.expected), m2(a.staff), m2(a.expenses), m2(a.profit), p1(a.margin), m2(perHour(a.expected, a.workedMinutes)),
        m2(perHour(a.staff, a.workedMinutes)), a.avgMinutes === null ? '' : h2(a.avgMinutes), a.estMinutes === null ? '' : h2(a.estMinutes),
        a.punctualSelf, a.punctualOnTime, a.scheduled, a.scheduledWorked, missing(a),
      ]),
    );
  if (tab === 'employees')
    return toCsv(
      [c.employee, c.type, c.scheduled, c.worked, c.absences, c.workedHours, c.paidHours, c.unworkedHours, c.unworkedAmount, c.cost,
        c.punctualSelf, c.punctualOnTime],
      r.employees.map((e) => [
        e.name, e.workerType === '1099' ? '1099' : 'W-2', e.scheduled, e.scheduledWorked, missing(e), h2(e.workedMinutes), h2(e.paidMinutes),
        h2(e.unworkedMinutes), m2(e.unworkedAmount), m2(e.cost), e.punctualSelf, e.punctualOnTime,
      ]),
    );
  return toCsv(
    [c.month, c.expected, c.staff, c.expenses, c.profit],
    r.trend.map((m) => [m.month.slice(0, 7), m2(m.expected), m2(m.staff), m2(m.expenses), m2(m.profit)]),
  );
}

export function statsFileName(tab: StatsTab, p: Period): string {
  return `cidclean-estadisticas-${tab}-${p.from}${p.from !== p.to ? `_${p.to}` : ''}.csv`;
}

function esc(x: string): string {
  return x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** PDF de Estadísticas con el encabezado y el pie de la marca (D-250): cuentas, empleados, faltas y tendencia. */
export function statsHtml(r: StatisticsReport, p: Period, s: StatisticsStrings, a: AccountingStrings): string {
  const c = s.csv;
  const table = (head: string[], rows: string[][]) =>
    `<table><thead><tr>${head.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows
      .map((row) => `<tr>${row.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`)
      .join('')}</tbody></table>`;
  const accounts = table(
    [c.account, c.workedHours, c.paidHours, c.unworkedAmount, c.expected, c.staff, c.profit, c.margin, c.incomePerHour, c.costPerHour, c.worked],
    r.accounts.map((x) => [
      `${x.name} · ${x.client}`, hours(x.workedMinutes), hours(x.paidMinutes), money(x.unworkedAmount), money(x.expected), money(x.staff),
      money(x.profit), x.margin === null ? '—' : `${pct(x.margin)}%`, (() => { const v = perHour(x.expected, x.workedMinutes); return v === null ? '—' : money(v); })(),
      (() => { const v = perHour(x.staff, x.workedMinutes); return v === null ? '—' : money(v); })(), `${x.scheduledWorked}/${x.scheduled}`,
    ]),
  );
  const employees = table(
    [c.employee, c.worked, c.workedHours, c.paidHours, c.unworkedAmount, c.cost, c.punctualOnTime],
    r.employees.map((e) => [
      e.name, `${e.scheduledWorked}/${e.scheduled}`, hours(e.workedMinutes), hours(e.paidMinutes), money(e.unworkedAmount), money(e.cost),
      e.punctualSelf > 0 ? `${e.punctualOnTime}/${e.punctualSelf}` : '—',
    ]),
  );
  const absences = r.employees.flatMap((e) => e.absences);
  const absTable = absences.length
    ? `<h2>${esc(c.absences)}</h2>${table([c.employee, c.account, c.day], absences.map((x) => [x.name, x.jobsite, x.day.slice(0, 10)]))}`
    : '';
  const trend = table(
    [c.month, c.expected, c.staff, c.expenses, c.profit],
    r.trend.map((m) => [monthTitle(m.month.slice(0, 7), a), money(m.expected), money(m.staff), money(m.expenses), money(m.profit)]),
  );
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:Manrope,Arial,sans-serif;color:#1E2A28;background:#FBF6EF;margin:24px}
h1{font-size:22px;margin:0 0 2px}h2{font-size:15px;margin:18px 0 6px}.s{color:#6B5F52;font-size:13px;margin-bottom:12px}
table{width:100%;border-collapse:collapse;background:#FFFFFF;font-size:11px}
th,td{padding:6px;border-bottom:1px solid #EFE5D8;text-align:right}th:first-child,td:first-child{text-align:left}
${BRAND_PDF_CSS}
</style></head><body>${brandHeaderHtml()}<h1>${esc(s.title)}</h1><div class="s">${esc(periodTitle(p, a))}</div>
<h2>${esc(s.tabs.accounts)}</h2>${accounts}<h2>${esc(s.tabs.employees)}</h2>${employees}${absTable}<h2>${esc(s.tabs.trend)}</h2>${trend}
${brandFooterHtml()}</body></html>`;
}
