import type { ApiResult } from './employeesApi';
import { failureFromCode } from './employeesApi';
import { monthStart, type DashboardFigures, type Period, type RecurringFrequency, type ReportKind } from './accountingRules';
import { supabase } from './supabase';

/** Accounting (hito 7, migración 20261027000001): todo por funciones de la base que validan el permiso. */

async function rpc<T>(name: string, args: Record<string, unknown>, map: (d: unknown) => T): Promise<ApiResult<T>> {
  try {
    const { data, error } = await supabase.rpc(name, args);
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: map(data) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const range = (p: Period) => ({ p_from: monthStart(p.from), p_to: monthStart(p.to) });

export type AccountingJobsite = { id: string; name: string; client: string; status: 'active' | 'paused' | 'terminated' };

export function fetchAccountingJobsites(): Promise<ApiResult<AccountingJobsite[]>> {
  return rpc('accounting_jobsites', {}, (d) =>
    ((d ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.jobsite_id),
      name: String(r.jobsite_name ?? ''),
      client: String(r.client_name ?? ''),
      status: r.status as AccountingJobsite['status'],
    })),
  );
}

export function fetchDashboard(p: Period, jobsiteId: string | null): Promise<ApiResult<DashboardFigures>> {
  return rpc('accounting_dashboard', { ...range(p), p_jobsite: jobsiteId }, (d) => {
    const x = (d ?? {}) as Record<string, unknown>;
    return {
      expected: n(x.expected),
      received: n(x.received),
      pending: n(x.pending),
      staff: n(x.staff),
      expenses: n(x.expenses),
      profit: n(x.profit),
      months: ((x.months ?? []) as Record<string, unknown>[]).map((m) => ({
        month: String(m.month),
        expected: n(m.expected),
        received: n(m.received),
        pending: n(m.pending),
        staff: n(m.staff),
        expenses: n(m.expenses),
        profit: n(m.profit),
      })),
      atRisk: ((x.at_risk ?? []) as Record<string, unknown>[]).map((r) => ({ jobsiteId: String(r.jobsite_id), name: String(r.name ?? '') })),
    };
  });
}

export type IncomeExtra = { id: string; label: string; amount: number; serviceDate: string | null; afterReceived: boolean };
export type IncomeRow = {
  id: string;
  jobsiteId: string;
  jobsite: string;
  client: string;
  month: string;
  /** Lo calculado con la tarifa; null si el mes solo tiene extras. */
  amount: number | null;
  adjustedAmount: number | null;
  adjustNote: string | null;
  adjustedBy: string | null;
  base: number;
  extrasTotal: number;
  total: number;
  receivedAmount: number;
  received: boolean;
  receivedOn: string | null;
  extras: IncomeExtra[];
};

export function fetchIncome(p: Period, jobsiteId: string | null = null): Promise<ApiResult<IncomeRow[]>> {
  return rpc('list_income', { ...range(p), p_jobsite: jobsiteId }, (d) =>
    ((d ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      jobsiteId: String(r.jobsite_id),
      jobsite: String(r.jobsite ?? ''),
      client: String(r.client ?? ''),
      month: String(r.month),
      amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
      adjustedAmount: r.adjusted_amount === null || r.adjusted_amount === undefined ? null : Number(r.adjusted_amount),
      adjustNote: (r.adjust_note as string | null) ?? null,
      adjustedBy: (r.adjusted_by as string | null) ?? null,
      base: n(r.base),
      extrasTotal: n(r.extras_total),
      total: n(r.total),
      receivedAmount: n(r.received_amount),
      received: r.received === true,
      receivedOn: (r.received_on as string | null) ?? null,
      extras: ((r.extras ?? []) as Record<string, unknown>[]).map((x) => ({
        id: String(x.id),
        label: String(x.label ?? ''),
        amount: n(x.amount),
        serviceDate: (x.service_date as string | null) ?? null,
        afterReceived: x.after_received === true,
      })),
    })),
  );
}

export function adjustIncome(id: string, amount: number, note: string): Promise<ApiResult<null>> {
  return rpc('adjust_income', { p_id: id, p_amount: amount, p_note: note }, () => null);
}

export function setIncomeReceived(id: string, received: boolean, on: string | null): Promise<ApiResult<null>> {
  return rpc('set_income_received', { p_id: id, p_received: received, p_on: on }, () => null);
}

export type ExpenseCategory = { id: string; labelEs: string; labelEn: string; sort: number; active: boolean };

/** Categorías de la lista de Ajustes (D-130), en su orden. */
export async function fetchExpenseCategories(): Promise<ApiResult<ExpenseCategory[]>> {
  try {
    const { data, error } = await supabase.from('expense_categories').select('id, label_es, label_en, sort, active').order('sort');
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return {
      ok: true,
      data: ((data ?? []) as { id: string; label_es: string; label_en: string; sort: number; active: boolean }[]).map((r) => ({
        id: r.id,
        labelEs: r.label_es,
        labelEn: r.label_en,
        sort: r.sort,
        active: r.active,
      })),
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Ajustes → Categorías de gastos (D-113, D-114): agrega una al final. Las reglas por fila dejan escribir solo al Super Admin. */
export async function createExpenseCategory(labelEs: string, labelEn: string, sort: number): Promise<ApiResult<string>> {
  try {
    const { data, error } = await supabase
      .from('expense_categories')
      .insert({ label_es: labelEs.trim(), label_en: labelEn.trim(), sort })
      .select('id')
      .single();
    if (error || !data) return { ok: false, reason: failureFromCode(error?.code) };
    return { ok: true, data: (data as { id: string }).id };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Lápiz de Ajustes: cambia el texto en español y en inglés. Sin fila devuelta = sin permiso o ya no existe. */
export async function updateExpenseCategory(id: string, labelEs: string, labelEn: string): Promise<ApiResult<null>> {
  try {
    const { data, error } = await supabase
      .from('expense_categories')
      .update({ label_es: labelEs.trim(), label_en: labelEn.trim() })
      .eq('id', id)
      .select('id');
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    if (!data || data.length === 0) return { ok: false, reason: 'forbidden' };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Papelera de Ajustes: borra la categoría, o la desactiva si algún gasto la usa (RPC remove_expense_category). */
export function removeExpenseCategory(id: string): Promise<ApiResult<'deleted' | 'deactivated'>> {
  return rpc('remove_expense_category', { p_id: id }, (d) => (d === 'deactivated' ? 'deactivated' : 'deleted'));
}

export type Expense = {
  id: string;
  categoryId: string;
  categoryEs: string;
  categoryEn: string;
  spentOn: string;
  amount: number;
  note: string | null;
  jobsiteId: string | null;
  jobsite: string | null;
  recurring: boolean;
};

export function fetchExpenses(p: Period, jobsiteId: string | null = null): Promise<ApiResult<Expense[]>> {
  return rpc('list_expenses', { ...range(p), p_jobsite: jobsiteId }, (d) =>
    ((d ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      categoryId: String(r.category_id),
      categoryEs: String(r.category_es ?? ''),
      categoryEn: String(r.category_en ?? ''),
      spentOn: String(r.spent_on),
      amount: n(r.amount),
      note: (r.note as string | null) ?? null,
      jobsiteId: (r.jobsite_id as string | null) ?? null,
      jobsite: (r.jobsite as string | null) ?? null,
      recurring: r.recurring === true,
    })),
  );
}

export function saveExpense(e: {
  id: string | null;
  categoryId: string;
  spentOn: string;
  amount: number;
  note: string;
  jobsiteId: string | null;
}): Promise<ApiResult<string>> {
  return rpc(
    'save_expense',
    { p_id: e.id, p_category: e.categoryId, p_on: e.spentOn, p_amount: e.amount, p_note: e.note, p_jobsite: e.jobsiteId },
    (d) => String(d),
  );
}

export type Recurring = {
  id: string;
  name: string;
  categoryId: string;
  categoryEs: string;
  categoryEn: string;
  jobsiteId: string | null;
  jobsite: string | null;
  amount: number;
  frequency: RecurringFrequency;
  day: number;
  month: number | null;
  active: boolean;
};

export function fetchRecurring(): Promise<ApiResult<Recurring[]>> {
  return rpc('list_recurring_expenses', {}, (d) =>
    ((d ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ''),
      categoryId: String(r.category_id),
      categoryEs: String(r.category_es ?? ''),
      categoryEn: String(r.category_en ?? ''),
      jobsiteId: (r.jobsite_id as string | null) ?? null,
      jobsite: (r.jobsite as string | null) ?? null,
      amount: n(r.amount),
      frequency: r.frequency === 'yearly' ? 'yearly' : 'monthly',
      day: Number(r.day ?? 1),
      month: r.month === null || r.month === undefined ? null : Number(r.month),
      active: r.active === true,
    })),
  );
}

export function saveRecurring(r: Omit<Recurring, 'id' | 'categoryEs' | 'categoryEn' | 'jobsite'> & { id: string | null }): Promise<ApiResult<string>> {
  return rpc(
    'save_recurring_expense',
    {
      p_id: r.id,
      p_name: r.name,
      p_category: r.categoryId,
      p_jobsite: r.jobsiteId,
      p_amount: r.amount,
      p_frequency: r.frequency,
      p_day: r.day,
      p_month: r.frequency === 'yearly' ? r.month : null,
      p_active: r.active,
    },
    (d) => String(d),
  );
}

export type StaffCostJobsite = { jobsiteId: string; jobsite: string; month: string; minutes: number; amount: number };
export type StaffCost = { profileId: string; name: string; workerType: string | null; minutes: number; amount: number; jobsites: StaffCostJobsite[] };

export function fetchStaffCost(p: Period, jobsiteId: string | null = null): Promise<ApiResult<StaffCost[]>> {
  return rpc('staff_cost', { ...range(p), p_jobsite: jobsiteId }, (d) =>
    ((d ?? []) as Record<string, unknown>[]).map((r) => ({
      profileId: String(r.profile_id),
      name: String(r.name ?? ''),
      workerType: (r.worker_type as string | null) ?? null,
      minutes: n(r.minutes),
      amount: n(r.amount),
      jobsites: ((r.jobsites ?? []) as Record<string, unknown>[]).map((j) => ({
        jobsiteId: String(j.jobsite_id),
        jobsite: String(j.jobsite ?? ''),
        month: String(j.month),
        minutes: n(j.minutes),
        amount: n(j.amount),
      })),
    })),
  );
}

export function fetchReport(kind: ReportKind, p: Period): Promise<ApiResult<Record<string, unknown>[]>> {
  return rpc('accounting_export', { p_kind: kind, ...range(p) }, (d) => (d ?? []) as Record<string, unknown>[]);
}
