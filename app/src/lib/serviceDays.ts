import { rpc, type ServiceDayStatus } from './scheduleApi';

/**
 * Días de servicio de los 1099 (migración 20261030000006; D-275, D-276, D-279, D-286). Sin horas, sin entrada y
 * salida y sin ubicación: el 1099 marca "Completado" y un admin aprueba o devuelve con nota. Reglas puras y llamadas.
 */

export type MyServiceDay = { id: string; visitId: string; date: string; account: string; status: ServiceDayStatus; note: string | null };
export type MyServiceDays = { month: string; rows: MyServiceDay[]; approved: number; pending: number; needsCorrection: number };

export function parseMyServiceDays(d: unknown): MyServiceDays {
  const x = (d ?? {}) as {
    month?: string;
    rows?: { id: string; visit_id: string; date: string; account: string; status: ServiceDayStatus; note: string | null }[];
    approved?: number;
    pending?: number;
    needs_correction?: number;
  };
  return {
    month: x.month ?? '',
    rows: (x.rows ?? []).map((r) => ({ id: r.id, visitId: r.visit_id, date: r.date, account: r.account, status: r.status, note: r.note ?? null })),
    approved: Number(x.approved) || 0,
    pending: Number(x.pending) || 0,
    needsCorrection: Number(x.needs_correction) || 0,
  };
}

export type StatementRow = {
  profileId: string;
  name: string;
  days: number;
  edited: number;
  daysAmount: number;
  fixedAmount: number;
  amount: number;
};
export type Statement = { month: string; closesOn: string; dueOn: string; rows: StatementRow[]; days: number; amount: number };

export function parseStatement(d: unknown): Statement {
  const x = (d ?? {}) as {
    month?: string;
    closes_on?: string;
    due_on?: string;
    days?: number;
    amount?: number | string;
    rows?: { profile_id: string; name: string; days: number; edited: number; days_amount: number | string; fixed_amount: number | string; amount: number | string }[];
  };
  return {
    month: x.month ?? '',
    closesOn: x.closes_on ?? '',
    dueOn: x.due_on ?? '',
    days: Number(x.days) || 0,
    amount: Number(x.amount) || 0,
    rows: (x.rows ?? []).map((r) => ({
      profileId: r.profile_id,
      name: r.name,
      days: Number(r.days) || 0,
      edited: Number(r.edited) || 0,
      daysAmount: Number(r.days_amount) || 0,
      fixedAmount: Number(r.fixed_amount) || 0,
      amount: Number(r.amount) || 0,
    })),
  };
}

/** Ficha de cada estado (D-286 (2)): gris Pendiente, ámbar Requiere corrección, verde Aprobado. */
export function statusTone(s: ServiceDayStatus): 'muted' | 'warning' | 'success' {
  return s === 'approved' ? 'success' : s === 'needs_correction' ? 'warning' : 'muted';
}

/** CSV del estado de cuenta: una fila por contratista. Montos con dos decimales, sin $. */
export function statementCsv(st: Statement, header: readonly string[]): string {
  const esc = (v: unknown) => {
    const t = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lines = [header.map(esc).join(',')];
  for (const r of st.rows)
    lines.push([r.name, r.days, r.edited, r.daysAmount.toFixed(2), r.fixedAmount.toFixed(2), r.amount.toFixed(2), st.dueOn].map(esc).join(','));
  return lines.join('\n') + '\n';
}

export const fetchMyServiceDays = (month: string) => rpc('my_service_days', { p_month: month }, parseMyServiceDays);
export const completeServiceDay = (visitId: string) =>
  rpc('complete_service_day', { p_visit: visitId }, (d) => d as { id: string; status: ServiceDayStatus });
export const approveServiceDay = (id: string) => rpc('approve_service_day', { p_id: id }, () => null);
export const returnServiceDay = (id: string, note: string) => rpc('return_service_day', { p_id: id, p_note: note }, () => null);
export const recordAndApproveServiceDay = (visitId: string, profileId: string) =>
  rpc('record_and_approve_service_day', { p_visit: visitId, p_profile: profileId }, (d) => d as string);
export const editServiceDayAmount = (id: string, amount: number, note: string) =>
  rpc('edit_service_day_amount', { p_id: id, p_amount: amount, p_note: note }, () => null);
export const fetchStatement = (month: string) => rpc('service_day_statement', { p_month: month }, parseStatement);

const escHtml = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** PDF del estado de cuenta (como el del dashboard, D-215): una fila por contratista con días, monto y fecha de pago. */
export function statementHtml(
  st: Statement,
  t: { title: string; monthTitle: string; payBefore: string; note: string; header: readonly string[] },
  brand: { css: string; header: string; footer: string },
  money: (n: number) => string,
): string {
  const rows = st.rows
    .map(
      (r) =>
        `<tr><td>${escHtml(r.name)}</td><td>${r.days}</td><td>${r.edited}</td><td>${money(r.daysAmount)}</td><td>${money(r.fixedAmount)}</td><td>${money(r.amount)}</td></tr>`,
    )
    .join('');
  const head = t.header.slice(0, 6).map((h) => `<th>${escHtml(h)}</th>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:Manrope,Arial,sans-serif;color:#1E2A28;background:#FBF6EF;margin:24px}
h1{font-size:22px;margin:0 0 2px}.s{color:#6B5F52;font-size:13px;margin-bottom:16px}
table{width:100%;border-collapse:collapse;background:#FFFFFF;font-size:12px}
th,td{padding:8px;border-bottom:1px solid #EFE5D8;text-align:right}th:first-child,td:first-child{text-align:left}
.n{color:#6B5F52;font-size:12px;margin-top:12px}
${brand.css}
</style></head><body>${brand.header}<h1>${escHtml(t.title)}</h1><div class="s">${escHtml(t.monthTitle)} · ${escHtml(t.payBefore)}</div>
<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table><div class="n">${escHtml(t.note)}</div>
${brand.footer}</body></html>`;
}
