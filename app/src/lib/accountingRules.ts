/**
 * Reglas puras de Accounting (hito 7). Los cálculos de dinero los hace la base de datos (migración 20261027000001);
 * aquí solo hay periodos, formatos, permisos de pantalla y los archivos de los exportes (CSV y HTML del PDF).
 */
import type { AccountingStrings } from '@/i18n/accounting';
import type { StaffCost } from './accountingApi';
import type { Access } from './visibility';
import { can, canAny } from './visibility';
import { BRAND_PDF_CSS, brandFooterHtml, brandHeaderHtml } from './pdfBrand';

// --- Periodos (D-069 mes con flechas; D-215 por mes o rango) ----------------------------------------------------

/** Mes como "AAAA-MM". */
export type MonthKey = string;
export type Period = { from: MonthKey; to: MonthKey };

export function monthKeyOf(d: Date): MonthKey {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(key: MonthKey, n: number): MonthKey {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return monthKeyOf(d);
}

/** Primer día del mes para la base de datos: "AAAA-MM-01". */
export function monthStart(key: MonthKey): string {
  return `${key}-01`;
}

export function isMonthKey(v: unknown): v is MonthKey {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function monthTitle(key: MonthKey, a: AccountingStrings): string {
  const [y, m] = key.split('-').map(Number);
  return a.monthTitle(a.months[m - 1], y);
}

export function isRange(p: Period): boolean {
  return p.from !== p.to;
}

export function periodTitle(p: Period, a: AccountingStrings): string {
  return isRange(p) ? a.rangeTitle(monthTitle(p.from, a), monthTitle(p.to, a)) : monthTitle(p.from, a);
}

/** Un rango al revés se ordena; más de 60 meses se recorta (el servidor no acepta más de 5 años). */
export function normalizePeriod(p: Period): Period {
  let { from, to } = p;
  if (to < from) [from, to] = [to, from];
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  if ((ty - fy) * 12 + (tm - fm) > 59) to = shiftMonth(from, 59);
  return { from, to };
}

/** Flechas del selector de mes: mueven el periodo entero (un mes o el rango). */
export function shiftPeriod(p: Period, n: number): Period {
  const [fy, fm] = p.from.split('-').map(Number);
  const [ty, tm] = p.to.split('-').map(Number);
  const span = (ty - fy) * 12 + (tm - fm) + 1;
  const step = n * span;
  return { from: shiftMonth(p.from, step), to: shiftMonth(p.to, step) };
}

/** Periodo de la ruta (?from=AAAA-MM&to=AAAA-MM); sin nada, el mes actual. */
export function periodFromParams(from: unknown, to: unknown, now: Date = new Date()): Period {
  const f = isMonthKey(from) ? from : monthKeyOf(now);
  const t = isMonthKey(to) ? to : f;
  return normalizePeriod({ from: f, to: t });
}

// --- Formatos -------------------------------------------------------------------------------------------------

/** Montos con $ y dos decimales (orden 27). */
export function money(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  const sign = v < 0 ? '−' : '';
  return `${sign}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Horas en horas (D-231): 42.5, 38, 1.25. */
export function hoursText(minutes: number): string {
  const h = Math.round((minutes / 60) * 100) / 100;
  return String(h);
}

/** Monto escrito: "1,200.50", "$80"; null si no es válido. */
export function parseMoney(text: string): number | null {
  const t = text.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n <= 10000000 ? n : null;
}

/** Fecha AAAA-MM-DD de hoy (hora del teléfono). */
export function todayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Barra de avance de lo recibido (D-063): de 0 a 1. */
export function progress(received: number, expected: number): number {
  if (!(expected > 0)) return 0;
  return Math.max(0, Math.min(1, received / expected));
}

// --- Permisos de pantalla (current/permisos.md) -----------------------------------------------------------------

export type AccountingAccess = {
  /** Dashboard global (D-068). */
  global: boolean;
  /** Dashboard por cuenta (D-102): dashboard_cuenta y ver tarifa. */
  account: boolean;
  /** Ver ingresos (por cuenta = su tarifa): ingresos_ver_registrar y ver tarifa. */
  income: boolean;
  /** Ajustar (D-238): el permiso de ingresos, antes de recibido. */
  adjust: boolean;
  markReceived: boolean;
  staff: boolean;
  expenses: boolean;
  editExpenses: boolean;
  recurring: boolean;
  export: boolean;
};

export function accountingAccess(access: Access): AccountingAccess {
  const rate = can(access, 'clientes_ver_tarifa');
  const income = can(access, 'ingresos_ver_registrar') && rate;
  return {
    global: can(access, 'dashboard_global'),
    account: canAny(access, ['dashboard_cuenta', 'dashboard_global']) && rate,
    income,
    adjust: income,
    markReceived: income && can(access, 'ingresos_marcar_recibidos'),
    staff: can(access, 'personal_ver_costo'),
    expenses: can(access, 'gastos_ver'),
    editExpenses: can(access, 'gastos_registrar_editar'),
    recurring: can(access, 'gastos_recurrentes'),
    export: can(access, 'reportes_exportar'),
  };
}

export type ReportKind = 'profit' | 'staff' | 'expenses' | 'income';

/** Cada exporte con su permiso, como en el servidor (accounting_export). */
export function canExport(a: AccountingAccess, kind: ReportKind): boolean {
  if (!a.export) return false;
  if (kind === 'profit') return a.global;
  if (kind === 'staff') return a.staff;
  if (kind === 'expenses') return a.expenses;
  return a.income;
}

// --- Exportes (D-215): CSV --------------------------------------------------------------------------------------

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const num = (v: unknown) => (v === null || v === undefined || v === '' ? '' : Number(v).toFixed(2));
const monthOf = (v: unknown) => String(v ?? '').slice(0, 7);

/** CSV de cada reporte con encabezados en el idioma de quien exporta. Los montos con dos decimales, sin $. */
export function reportCsv(kind: ReportKind, rows: readonly Record<string, unknown>[], a: AccountingStrings, locale: 'es' | 'en'): string {
  const c = a.csv;
  if (kind === 'profit')
    return toCsv(
      [c.month, c.expected, c.received, c.pending, c.staff, c.expenses, c.profit],
      rows.map((r) => [monthOf(r.month), num(r.expected), num(r.received), num(r.pending), num(r.staff), num(r.expenses), num(r.profit)]),
    );
  if (kind === 'staff')
    return toCsv(
      [c.month, c.employee, c.type, c.jobsite, c.hours, c.amount],
      rows.map((r) => [monthOf(r.month), r.employee, r.worker_type === '1099' ? '1099' : 'W-2', r.jobsite, Number(r.hours ?? 0), num(r.amount)]),
    );
  if (kind === 'expenses')
    return toCsv(
      [c.month, c.category, c.amount],
      rows.map((r) => [monthOf(r.month), locale === 'es' ? r.category_es : r.category_en, num(r.amount)]),
    );
  return toCsv(
    [c.month, c.client, c.jobsite, c.expected, c.received, c.pending, c.receivedOn, c.note],
    rows.map((r) => [monthOf(r.month), r.client, r.jobsite, num(r.expected), num(r.received), num(r.pending), r.received_on ?? '', r.adjust_note ?? '']),
  );
}

export function reportFileName(kind: ReportKind, p: Period): string {
  return `cidclean-${kind}-${p.from}${isRange(p) ? `_${p.to}` : ''}.csv`;
}

// --- PDF del dashboard (D-215, con lib/sharePdf) -------------------------------------------------------------------

export type DashboardFigures = {
  expected: number;
  received: number;
  pending: number;
  staff: number;
  expenses: number;
  profit: number;
  months: { month: string; expected: number; received: number; pending: number; staff: number; expenses: number; profit: number }[];
  atRisk: { jobsiteId: string; name: string }[];
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** HTML de una página para el PDF del dashboard, con encabezado y pie de la marca (orden 33, D-250): las cuatro cifras, Recibido / Pendiente y la tabla por mes. */
export function dashboardHtml(d: DashboardFigures, p: Period, scope: string, a: AccountingStrings): string {
  const tile = (label: string, value: number, brand = false) =>
    `<div class="t${brand ? ' b' : ''}"><div class="l">${esc(label)}</div><div class="v">${esc(money(value))}</div></div>`;
  const rows = d.months
    .map(
      (m) =>
        `<tr><td>${esc(monthTitle(monthOf(m.month), a))}</td><td>${money(m.expected)}</td><td>${money(m.received)}</td><td>${money(m.pending)}</td><td>${money(m.staff)}</td><td>${money(m.expenses)}</td><td>${money(m.profit)}</td></tr>`,
    )
    .join('');
  const c = a.csv;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:Manrope,Arial,sans-serif;color:#1E2A28;background:#FBF6EF;margin:24px}
h1{font-size:22px;margin:0 0 2px}.s{color:#6B5F52;font-size:13px;margin-bottom:16px}
.g{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px}.t{flex:1 1 40%;background:#FFFFFF;border-radius:24px;padding:16px}
.t.b{background:#0F766E;color:#FFFFFF}.l{font-size:13px;opacity:.85}.v{font-size:20px;font-weight:800;margin-top:4px}
.rp{font-size:13px;color:#6B5F52;margin-bottom:16px}table{width:100%;border-collapse:collapse;background:#FFFFFF;font-size:12px}
th,td{padding:8px;border-bottom:1px solid #EFE5D8;text-align:right}th:first-child,td:first-child{text-align:left}
${BRAND_PDF_CSS}
</style></head><body>${brandHeaderHtml()}<h1>${esc(a.title)}</h1><div class="s">${esc(scope)} · ${esc(periodTitle(p, a))}</div>
<div class="g">${tile(a.income, d.expected)}${tile(a.staff, d.staff)}${tile(a.expenses, d.expenses)}${tile(a.profit, d.profit, true)}</div>
<div class="rp">${esc(a.receivedPending(money(d.received), money(d.pending)))}</div>
<table><thead><tr><th>${esc(c.month)}</th><th>${esc(c.expected)}</th><th>${esc(c.received)}</th><th>${esc(c.pending)}</th><th>${esc(c.staff)}</th><th>${esc(c.expenses)}</th><th>${esc(c.profit)}</th></tr></thead><tbody>${rows}</tbody></table>
${brandFooterHtml()}</body></html>`;
}

// --- Gastos recurrentes (D-103, D-215) --------------------------------------------------------------------------

export type RecurringFrequency = 'monthly' | 'yearly';

export function recurringLine(r: { frequency: RecurringFrequency; day: number; month: number | null }, a: AccountingStrings): string {
  if (r.frequency === 'yearly' && r.month) return a.yearlyLine(r.day, a.months[r.month - 1]);
  return `${a.monthly} · ${a.dayLine(r.day)}`;
}

// --- Personal (D-067) ------------------------------------------------------------------------------------------

export type StaffGroup = { key: string; name: string; minutes: number; amount: number; detail: { key: string; name: string; minutes: number; amount: number }[] };

/** Agrupa lo que se debe por empleado o por jobsite (D-067), con el detalle del otro lado. */
export function groupStaff(rows: readonly StaffCost[], by: 'employee' | 'jobsite', monthLabel: (m: string) => string | null): StaffGroup[] {
  if (by === 'employee')
    return rows.map((r) => ({
      key: r.profileId,
      name: r.name,
      minutes: r.minutes,
      amount: r.amount,
      detail: r.jobsites.map((j) => {
        const m = monthLabel(j.month);
        return { key: `${j.jobsiteId}-${j.month}`, name: m ? `${j.jobsite} · ${m}` : j.jobsite, minutes: j.minutes, amount: j.amount };
      }),
    }));
  const map = new Map<string, StaffGroup>();
  for (const r of rows)
    for (const j of r.jobsites) {
      const g: StaffGroup = map.get(j.jobsiteId) ?? { key: j.jobsiteId, name: j.jobsite, minutes: 0, amount: 0, detail: [] };
      g.minutes += j.minutes;
      g.amount = Math.round((g.amount + j.amount) * 100) / 100;
      const m = monthLabel(j.month);
      g.detail.push({ key: `${r.profileId}-${j.month}`, name: m ? `${r.name} · ${m}` : r.name, minutes: j.minutes, amount: j.amount });
      map.set(j.jobsiteId, g);
    }
  return [...map.values()].sort((x, y) => x.name.localeCompare(y.name));
}

