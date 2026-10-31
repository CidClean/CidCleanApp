import { readableFileName } from './fileName';
import type { AccountingStrings } from '@/i18n/accounting';
import type { SummaryPlStrings } from '@/i18n/summaryPl';

import { hoursText, money, toCsv } from './accountingRules';
import { docHtml, docTable, esc } from './docPdf';
import { rpc } from './scheduleApi';

// --- Resumen del empleado (orden 71, D-294) ----------------------------------------------------------------------

export type SummaryAccount = { jobsiteId: string; jobsite: string; client: string; startDate: string; endDate: string | null; current: boolean };
export type SummaryMonth = { month: string; days: number; minutes: number; amount: number };
export type EmployeeSummary = {
  name: string;
  workerType: 'w2' | '1099' | null;
  year: number;
  accounts: SummaryAccount[];
  months: SummaryMonth[];
  days: number;
  minutes: number;
  amount: number;
};

export function parseEmployeeSummary(d: unknown): EmployeeSummary {
  const x = (d ?? {}) as Record<string, unknown>;
  const accounts = (Array.isArray(x.accounts) ? x.accounts : []) as Record<string, unknown>[];
  const months = (Array.isArray(x.months) ? x.months : []) as Record<string, unknown>[];
  return {
    name: String(x.name ?? ''),
    workerType: x.worker_type === 'w2' || x.worker_type === '1099' ? x.worker_type : null,
    year: Number(x.year) || 0,
    accounts: accounts.map((a) => ({
      jobsiteId: String(a.jobsite_id ?? ''),
      jobsite: String(a.jobsite ?? ''),
      client: String(a.client ?? ''),
      startDate: String(a.start_date ?? ''),
      endDate: a.end_date ? String(a.end_date) : null,
      current: a.current === true,
    })),
    months: months.map((m) => ({
      month: String(m.month ?? '').slice(0, 7),
      days: Number(m.days) || 0,
      minutes: Number(m.minutes) || 0,
      amount: Number(m.amount) || 0,
    })),
    days: Number(x.days) || 0,
    minutes: Number(x.minutes) || 0,
    amount: Number(x.amount) || 0,
  };
}

export const fetchEmployeeSummary = (profileId: string, year: number) =>
  rpc('employee_summary', { p_profile: profileId, p_year: year }, parseEmployeeSummary);

/** De la primera a la última con trabajo, con los meses de en medio en cero (D-200). */
export function summaryMonths(s: EmployeeSummary): SummaryMonth[] {
  if (s.months.length === 0) return [];
  const sorted = [...s.months].sort((a, b) => a.month.localeCompare(b.month));
  const first = Number(sorted[0].month.slice(5, 7));
  const last = Number(sorted[sorted.length - 1].month.slice(5, 7));
  const out: SummaryMonth[] = [];
  for (let m = first; m <= last; m++) {
    const key = `${s.year}-${String(m).padStart(2, '0')}`;
    out.push(sorted.find((x) => x.month === key) ?? { month: key, days: 0, minutes: 0, amount: 0 });
  }
  return out;
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function monthName(key: string, a: AccountingStrings): string {
  return cap(a.months[Number(key.slice(5, 7)) - 1] ?? key);
}

/** "Sep 17, 2026" (como la muestra aprobada). */
export function shortDate(iso: string, a: AccountingStrings): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${cap((a.months[m - 1] ?? '').slice(0, 3))} ${d}, ${y}`;
}

/** "Wilson Franquicia · desde Sep 17, 2026" o "Wilson Franquicia · Aug 1 – Aug 31, 2026". */
export function accountLine(acc: SummaryAccount, a: AccountingStrings, t: SummaryPlStrings): string {
  if (!acc.endDate || acc.current) return `${acc.client} · ${t.since(shortDate(acc.startDate, a))}`;
  const from = shortDate(acc.startDate, a);
  const to = shortDate(acc.endDate, a);
  const sameYear = acc.startDate.slice(0, 4) === acc.endDate.slice(0, 4);
  return `${acc.client} · ${sameYear ? from.replace(/, \d{4}$/, '') : from} – ${to}`;
}

/** Días (1099) u horas (W-2) de un mes. */
export function workLabel(s: EmployeeSummary, m: { days: number; minutes: number }, t: SummaryPlStrings): string {
  return s.workerType === 'w2' ? `${hoursText(m.minutes)} h` : t.days(m.days);
}

export function summaryCsv(s: EmployeeSummary, t: SummaryPlStrings): string {
  const rows: unknown[][] = summaryMonths(s).map((m) => [m.month, m.days, hoursText(m.minutes), m.amount.toFixed(2)]);
  rows.push([t.total(s.year), s.days, hoursText(s.minutes), s.amount.toFixed(2)]);
  rows.push([]);
  rows.push([...t.accountsHeader]);
  for (const x of s.accounts) rows.push([x.jobsite, x.client, x.startDate, x.endDate ?? '', x.current ? t.current : t.ended]);
  return toCsv(t.summaryHeader, rows);
}

export function summaryHtml(s: EmployeeSummary, t: SummaryPlStrings, a: AccountingStrings, generated?: Date): string {
  const w2 = s.workerType === 'w2';
  const head = w2 ? [t.summaryHeader[0], t.summaryHeader[2], t.summaryHeader[3]] : [t.summaryHeader[0], t.summaryHeader[1], t.summaryHeader[3]];
  const work = (m: { days: number; minutes: number }) => (w2 ? hoursText(m.minutes) : String(m.days));
  const months = docTable(
    head,
    summaryMonths(s).map((m) => [monthName(m.month, a), work(m), money(m.amount)]),
    { num: [1, 2], total: [t.total(s.year), work(s), money(s.amount)] },
  );
  const accounts = docTable(
    t.accountsHeader,
    s.accounts.map((x) => [x.jobsite, x.client, shortDate(x.startDate, a), x.endDate ? shortDate(x.endDate, a) : '—', x.current ? t.current : t.ended]),
  );
  return docHtml({
    title: `${t.summaryTitle} · ${s.name}`,
    subtitle: `${s.year}${s.workerType ? ` · ${s.workerType === 'w2' ? 'W-2' : '1099'}` : ''}`,
    body: `<h2>${esc(t.byMonth)}</h2>${months}<h2>${esc(t.accounts)}</h2>${accounts}`,
    generated,
  });
}

// --- Profit & Loss (orden 72, D-295) -----------------------------------------------------------------------------

export type PlExpense = { categoryId: string; labelEs: string; labelEn: string; line: string; amount: number };
export type PlLine = { line: string; name: string; amount: number };
export type ProfitAndLoss = {
  year: number;
  income: number;
  contractLabor: number;
  wages: number;
  expenses: PlExpense[];
  expensesTotal: number;
  net: number;
  scheduleC: PlLine[];
};

export function parseProfitAndLoss(d: unknown): ProfitAndLoss {
  const x = (d ?? {}) as Record<string, unknown>;
  const exp = (Array.isArray(x.expenses) ? x.expenses : []) as Record<string, unknown>[];
  const sc = (Array.isArray(x.schedule_c) ? x.schedule_c : []) as Record<string, unknown>[];
  return {
    year: Number(x.year) || 0,
    income: Number(x.income) || 0,
    contractLabor: Number(x.contract_labor) || 0,
    wages: Number(x.wages) || 0,
    expenses: exp.map((e) => ({
      categoryId: String(e.category_id ?? ''),
      labelEs: String(e.label_es ?? ''),
      labelEn: String(e.label_en ?? ''),
      line: String(e.line ?? ''),
      amount: Number(e.amount) || 0,
    })),
    expensesTotal: Number(x.expenses_total) || 0,
    net: Number(x.net) || 0,
    scheduleC: sc.map((l) => ({ line: String(l.line ?? ''), name: String(l.name ?? ''), amount: Number(l.amount) || 0 })),
  };
}

export const fetchProfitAndLoss = (year: number) => rpc('profit_and_loss', { p_year: year }, parseProfitAndLoss);

/** Líneas del Schedule C (Form 1040) que puede llevar una categoría de gasto, con su nombre en inglés (D-295). */
export const SCHEDULE_C_LINES: readonly { line: string; name: string }[] = [
  { line: '8', name: 'Advertising' },
  { line: '9', name: 'Car and truck expenses' },
  { line: '10', name: 'Commissions and fees' },
  { line: '11', name: 'Contract labor' },
  { line: '13', name: 'Depreciation' },
  { line: '14', name: 'Employee benefit programs' },
  { line: '15', name: 'Insurance' },
  { line: '16a', name: 'Mortgage interest' },
  { line: '16b', name: 'Other interest' },
  { line: '17', name: 'Legal and professional services' },
  { line: '18', name: 'Office expense' },
  { line: '20a', name: 'Rent or lease: vehicles, machinery, equipment' },
  { line: '20b', name: 'Rent or lease: other business property' },
  { line: '21', name: 'Repairs and maintenance' },
  { line: '22', name: 'Supplies' },
  { line: '23', name: 'Taxes and licenses' },
  { line: '24a', name: 'Travel' },
  { line: '24b', name: 'Deductible meals' },
  { line: '25', name: 'Utilities' },
  { line: '26', name: 'Wages' },
  { line: '27a', name: 'Other expenses' },
];

/** "22 · Supplies". */
export function lineLabel(line: string, name?: string): string {
  const n = name ?? SCHEDULE_C_LINES.find((l) => l.line === line)?.name ?? '';
  return n ? `${line} · ${n}` : line;
}

const expenseLabel = (e: PlExpense, locale: 'es' | 'en') => (locale === 'es' ? e.labelEs : e.labelEn);

/** Filas de la vista Resumen: ingresos, personal 1099, personal W-2 y cada categoría de gasto. */
export function plSummaryRows(p: ProfitAndLoss, t: SummaryPlStrings, locale: 'es' | 'en'): { label: string; amount: number }[] {
  return [
    { label: t.contractLabor, amount: p.contractLabor },
    { label: t.wages, amount: p.wages },
    ...p.expenses.map((e) => ({ label: expenseLabel(e, locale), amount: e.amount })),
  ];
}

export function plCsv(p: ProfitAndLoss, view: 'summary' | 'schedule_c', t: SummaryPlStrings, locale: 'es' | 'en'): string {
  if (view === 'schedule_c') {
    return toCsv(['Line', 'Category', 'Amount'], p.scheduleC.map((l) => [l.line, l.name, l.amount.toFixed(2)]));
  }
  const rows: unknown[][] = [[t.income, p.income.toFixed(2)]];
  for (const r of plSummaryRows(p, t, locale)) rows.push([r.label, r.amount.toFixed(2)]);
  rows.push([t.net, p.net.toFixed(2)]);
  return toCsv([t.plTitle, String(p.year)], rows);
}

const plain = (n: number) => money(n).replace('$', '');

/** PDF del P&L (D-293, D-295): "January 1 – December 31, {año} · Cash basis", y la tabla de la vista elegida. */
export function plHtml(p: ProfitAndLoss, view: 'summary' | 'schedule_c', t: SummaryPlStrings, locale: 'es' | 'en', generated?: Date): string {
  const subtitle = `January 1 – December 31, ${p.year} · Cash basis`;
  let body: string;
  if (view === 'schedule_c') {
    const lines = p.scheduleC.filter((l) => l.line !== '31');
    const net = p.scheduleC.find((l) => l.line === '31');
    body = docTable(
      ['Line', 'Category', 'Amount'],
      lines.map((l) => [l.line, l.name, plain(l.amount)]),
      { num: [2], total: ['31', 'Net profit', plain(net?.amount ?? p.net)] },
    );
    body = `<h2>${esc(t.scheduleCTitle(p.year))}</h2>${body}`;
  } else {
    body = docTable(
      ['', ''],
      [[{ text: t.income }, plain(p.income)], ...plSummaryRows(p, t, locale).map((r) => [r.label, plain(r.amount)])],
      { num: [1], total: [t.net, plain(p.net)] },
    );
    body += `<div class="note">${esc(t.plNote)}</div>`;
  }
  return docHtml({ title: t.plTitle, subtitle, body, generated });
}

/** D-296: "Cid Clean - Profit and Loss - 2026.pdf" (con "Schedule C" en esa vista). */
export function plFileName(year: number, view: 'summary' | 'schedule_c', ext: 'csv' | 'pdf' = 'csv'): string {
  return readableFileName(['Profit and Loss', view === 'schedule_c' ? 'Schedule C' : null, year], ext);
}
