/**
 * Reglas puras del quote (hito 4: D-006, D-007, D-077, D-122, D-209). Sin React ni red.
 * Los totales los calcula la base de datos al guardar (quote_totals); aquí se repite el mismo cálculo para la
 * vista previa mientras se arma, y una prueba comprueba que dan lo mismo.
 */

export type QuoteStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'changes_requested' | 'expired' | 'superseded';
export const QUOTE_STATUSES: readonly QuoteStatus[] = [
  'draft', 'sent', 'viewed', 'accepted', 'rejected', 'changes_requested', 'expired', 'superseded',
];

export type ItemLine = { label: string; amount: number | null; taxable: boolean };
export type DiscountLine = { label: string; kind: 'amount' | 'percent'; value: number | null };
export type QuoteLines = { services: ItemLine[]; addons: ItemLine[]; discounts: DiscountLine[] };
export type Totals = { subtotal: number; discount: number; tax: number; total: number };
export type Frequency = { kind: 'daily' | 'weekly' | 'other'; days: number[]; other: string };

export type QuoteDecision = {
  kind: 'accepted' | 'rejected' | 'changes_requested';
  name: string | null;
  title: string | null;
  reasonEs: string | null;
  reasonEn: string | null;
  note: string | null;
  at: string;
  email: string;
};

export type QuoteVersion = {
  id: string;
  version: string;
  minor: number;
  status: QuoteStatus;
  lines: QuoteLines;
  taxRate: number;
  validDays: number;
  /** null cuando quien mira no tiene quotes_ver_precios. */
  totals: Totals | null;
  contactEmail: string | null;
  recipients: string[];
  hasSow: boolean;
  sowPath: string | null;
  pdfPath: string | null;
  sentAt: string | null;
  sentBy: string | null;
  expiresAt: string | null;
  viewedAt: string | null;
  decidedAt: string | null;
  decision: QuoteDecision | null;
  /** Quote de extra (D-238): fecha del servicio, AAAA-MM-DD. */
  serviceDate: string | null;
};

export type SiteQuote = {
  quoteId: string | null;
  walkthroughClosed: boolean;
  versions: QuoteVersion[];
  /** Frecuencia y dirección del walkthrough cerrado (para la vista previa). */
  frequency: Frequency | null;
  address: string | null;
};

export const emptyLines = (): QuoteLines => ({ services: [], addons: [], discounts: [] });

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Igual que quote_totals en la base: descuentos antes del tax y repartidos sobre lo gravable. */
export function computeTotals(lines: QuoteLines, taxRate: number): Totals {
  const items = [...lines.services, ...lines.addons];
  const subtotal = round2(items.reduce((a, l) => a + (l.amount ?? 0), 0));
  const taxable = round2(items.filter((l) => l.taxable).reduce((a, l) => a + (l.amount ?? 0), 0));
  const rawDiscount = lines.discounts.reduce(
    (a, d) => a + (d.kind === 'percent' ? (subtotal * (d.value ?? 0)) / 100 : (d.value ?? 0)),
    0,
  );
  const discount = round2(Math.min(rawDiscount, subtotal));
  const tax = subtotal > 0 ? round2(((taxable - (discount * taxable) / subtotal) * taxRate) / 100) : 0;
  return { subtotal, discount, tax, total: round2(subtotal - discount + tax) };
}

/** Monto de un descuento en dinero (para mostrarlo). */
export function discountAmount(d: DiscountLine, subtotal: number): number {
  return round2(d.kind === 'percent' ? (subtotal * (d.value ?? 0)) / 100 : (d.value ?? 0));
}

export type LinesErrors = { noService?: true; lines: Set<string> };

/** Errores del armado: cada renglón con nombre y monto; % entre 0 y 100. Las claves son "services.0", "discounts.1"... */
export function validateLines(lines: QuoteLines): LinesErrors {
  const bad = new Set<string>();
  (['services', 'addons'] as const).forEach((sec) =>
    lines[sec].forEach((l, i) => {
      if (l.label.trim() === '' || l.amount === null || !(l.amount >= 0) || l.amount > 10_000_000) bad.add(`${sec}.${i}`);
    }),
  );
  lines.discounts.forEach((d, i) => {
    if (d.label.trim() === '' || d.value === null || !(d.value >= 0) || (d.kind === 'percent' && d.value > 100)) bad.add(`discounts.${i}`);
  });
  return lines.services.length === 0 ? { noService: true, lines: bad } : { lines: bad };
}

/** Lo que se guarda en la base (labels sin espacios de más). */
export function linesForSave(lines: QuoteLines) {
  return {
    services: lines.services.map((l) => ({ label: l.label.trim(), amount: l.amount ?? 0, taxable: l.taxable })),
    addons: lines.addons.map((l) => ({ label: l.label.trim(), amount: l.amount ?? 0, taxable: l.taxable })),
    discounts: lines.discounts.map((d) => ({ label: d.label.trim(), kind: d.kind, value: d.value ?? 0 })),
  };
}

/** Monto escrito por la persona: "1,200.50", "$80" o "80" → número; vacío o raro → null. */
export function parseAmount(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, '');
  if (clean === '' || !/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Number(clean);
}

export function formatAmountInput(n: number | null): string {
  return n === null ? '' : String(n);
}

/** "$1,234.56" (dólares, como el resto de la app). */
export function money(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Correos opcionales (D-209): sin repetir, en minúsculas, sin el del contacto; hasta 10. */
export function cleanRecipients(list: readonly string[], contactEmail: string | null): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const e = raw.trim().toLowerCase();
    if (e && e !== contactEmail && !out.includes(e)) out.push(e);
  }
  return out.slice(0, 10);
}

export function isEmail(text: string): boolean {
  return EMAIL.test(text.trim());
}

/** Qué se puede hacer con la última versión. */
export function quoteActions(
  latest: QuoteVersion | null,
  can: { edit: boolean; send: boolean },
): { edit: boolean; send: boolean; newVersion: boolean; resend: boolean } {
  const s = latest?.status;
  return {
    edit: can.edit && s === 'draft',
    send: can.send && s === 'draft',
    // Negociación o renovar un vencido crean versión nueva (D-007, D-209). Aceptado no.
    newVersion: can.edit && s !== undefined && s !== 'draft' && s !== 'accepted',
    resend: can.send && (s === 'sent' || s === 'viewed'),
  };
}

/** Tono de la ficha del estado (D-031): abiertos en marca, Aceptado verde, Cambios pedidos ámbar, cerrados en gris. */
export function statusTone(s: QuoteStatus): 'brand' | 'success' | 'warning' | 'muted' {
  if (s === 'accepted') return 'success';
  if (s === 'changes_requested') return 'warning';
  if (s === 'rejected' || s === 'expired' || s === 'superseded') return 'muted';
  return 'brand';
}

/** Lo que puede enviar: borrador con al menos un servicio, SOW y a quién enviarlo. */
export function sendBlockers(v: QuoteVersion): ('service' | 'sow' | 'recipient')[] {
  const out: ('service' | 'sow' | 'recipient')[] = [];
  if (v.lines.services.length === 0) out.push('service');
  if (!v.hasSow) out.push('sow');
  if (!v.contactEmail && v.recipients.length === 0) out.push('recipient');
  return out;
}

const DAYS = {
  es: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], // D-038
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

/** Frecuencia en texto, igual que en el PDF (D-075, D-080, D-105). */
export function frequencyText(f: Frequency | null | undefined, l: 'es' | 'en'): string {
  if (!f) return '';
  if (f.kind === 'other') return f.other ?? '';
  const n = f.kind === 'daily' ? 7 : f.days.length;
  const times = l === 'es' ? `${n} ${n === 1 ? 'vez' : 'veces'} por semana` : `${n} ${n === 1 ? 'time' : 'times'} a week`;
  if (f.kind === 'daily') return l === 'es' ? `Diaria · ${times}` : `Daily · ${times}`;
  const days = [...f.days].sort((a, b) => a - b).map((d) => DAYS[l][d]).join(', ');
  return l === 'es' ? `Semanal: ${days} · ${times}` : `Weekly: ${days} · ${times}`;
}

const MONTHS = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** "21 nov 2026" / "Nov 21, 2026" en la hora del teléfono. */
export function shortDate(iso: string | null, l: 'es' | 'en'): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const m = MONTHS[l][d.getMonth()];
  return l === 'es' ? `${d.getDate()} ${m} ${d.getFullYear()}` : `${m} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Fecha y hora "21 nov 2026 · 2:35 p. m." / "Nov 21, 2026 · 2:35 PM". */
export function dateTime(iso: string | null, l: 'es' | 'en'): string {
  if (!iso) return '';
  const d = new Date(iso);
  const h = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  const clock = `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? (l === 'es' ? 'a. m.' : 'AM') : l === 'es' ? 'p. m.' : 'PM'}`;
  return `${shortDate(iso, l)} · ${clock}`;
}

/** Fila de la API → versión del quote. */
export function toVersion(r: Record<string, unknown>): QuoteVersion {
  const lines = (r.lines ?? {}) as Partial<Record<keyof QuoteLines, Record<string, unknown>[]>>;
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const items = (arr: Record<string, unknown>[] | undefined): ItemLine[] =>
    (arr ?? []).map((x) => ({ label: String(x.label ?? ''), amount: num(x.amount), taxable: x.taxable === true }));
  const d = r.decision as Record<string, unknown> | null;
  const total = num(r.total);
  return {
    id: String(r.id),
    version: String(r.version),
    minor: Number(r.minor ?? 0),
    status: QUOTE_STATUSES.includes(r.status as QuoteStatus) ? (r.status as QuoteStatus) : 'draft',
    lines: {
      services: items(lines.services),
      addons: items(lines.addons),
      discounts: (lines.discounts ?? []).map((x) => ({
        label: String(x.label ?? ''),
        kind: x.kind === 'percent' ? 'percent' : 'amount',
        value: num(x.value),
      })),
    },
    taxRate: Number(r.tax_rate ?? 6),
    validDays: Number(r.valid_days ?? 30),
    totals: total === null ? null : { subtotal: Number(r.subtotal), discount: Number(r.discount), tax: Number(r.tax), total },
    contactEmail: (r.contact_email as string | null) ?? null,
    recipients: (r.recipients as string[] | null) ?? [],
    hasSow: r.has_sow === true,
    sowPath: (r.sow_path as string | null) ?? null,
    pdfPath: (r.pdf_path as string | null) ?? null,
    sentAt: (r.sent_at as string | null) ?? null,
    sentBy: (r.sent_by as string | null) ?? null,
    serviceDate: (r.service_date as string | null) ?? null,
    expiresAt: (r.expires_at as string | null) ?? null,
    viewedAt: (r.viewed_at as string | null) ?? null,
    decidedAt: (r.decided_at as string | null) ?? null,
    decision: d
      ? {
          kind: d.kind as QuoteDecision['kind'],
          name: (d.name as string | null) ?? null,
          title: (d.title as string | null) ?? null,
          reasonEs: (d.reason_es as string | null) ?? null,
          reasonEn: (d.reason_en as string | null) ?? null,
          note: (d.note as string | null) ?? null,
          at: String(d.at),
          email: String(d.email ?? ''),
        }
      : null,
  };
}
