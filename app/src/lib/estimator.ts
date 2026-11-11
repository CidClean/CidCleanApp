/**
 * Estimador del sitio (orden 91; D-309): tarifas que edita el Super Admin en Ajustes y la misma fórmula que
 * estimate_quote() de la base (migración 20261113000001), solo para la vista previa. El sitio siempre calcula en el
 * servidor con las tarifas guardadas.
 */

export type PlaceType = { key: string; name: string; rate: number };
export type Frequency = { key: string; name: string; visitsPerMonth: number; adjustment: number };
export type EstimatorSettings = {
  placeTypes: PlaceType[];
  frequencies: Frequency[];
  minPerVisit: number;
  rangePct: number; // 0.15 = ±15 %
  roundTo: number;
  walkthroughSqft: number;
};

/** El formulario guarda texto tal como se escribe; se convierte al guardar. */
export type EstimatorForm = {
  rates: Record<string, string>;
  visits: Record<string, string>;
  adjustments: Record<string, string>;
  minPerVisit: string;
  rangePercent: string; // en %: "15"
  roundTo: string;
  walkthroughSqft: string;
};
export type EstimatorErrors = Partial<Record<string, 'invalid'>>;

export type Quote = { perVisit: number; monthly: number; low: number; high: number };

/** por visita = max(mínimo, sq ft × tarifa × ajuste); mes = por visita × visitas; rango = mes × (1 ± rango) redondeado. */
export function estimateQuote(sqft: number, rate: number, visits: number, adjustment: number, min: number, range: number, roundTo: number): Quote {
  const perVisit = Math.max(min, sqft * rate * adjustment);
  const monthly = perVisit * visits;
  return {
    perVisit: Math.round(perVisit * 100) / 100,
    monthly: Math.round(monthly * 100) / 100,
    low: Math.round((monthly * (1 - range)) / roundTo) * roundTo,
    high: Math.round((monthly * (1 + range)) / roundTo) * roundTo,
  };
}

/** Vista previa fija del survey: oficina de 3,000 sq ft, 3 veces por semana (orden 91). */
export const PREVIEW = { type: 'office', sqft: 3000, frequency: 'weekly_3' } as const;

export function toForm(s: EstimatorSettings): EstimatorForm {
  const str = (n: number) => String(n);
  return {
    rates: Object.fromEntries(s.placeTypes.map((t) => [t.key, str(t.rate)])),
    visits: Object.fromEntries(s.frequencies.map((f) => [f.key, str(f.visitsPerMonth)])),
    adjustments: Object.fromEntries(s.frequencies.map((f) => [f.key, str(f.adjustment)])),
    minPerVisit: str(s.minPerVisit),
    rangePercent: str(Math.round(s.rangePct * 10000) / 100),
    roundTo: str(s.roundTo),
    walkthroughSqft: str(s.walkthroughSqft),
  };
}

function num(v: string | undefined): number {
  const t = (v ?? '').trim().replace(/,/g, '');
  return t === '' || !/^\d*\.?\d+$/.test(t) ? NaN : Number(t);
}
const inRange = (n: number, lo: number, hi: number, loOpen = true) => Number.isFinite(n) && (loOpen ? n > lo : n >= lo) && n <= hi;

/** Mismos límites que el disparador estimator_settings_check() y los check de la tabla. */
export function validateEstimatorForm(form: EstimatorForm, base: EstimatorSettings): EstimatorErrors {
  const e: EstimatorErrors = {};
  for (const t of base.placeTypes) if (!inRange(num(form.rates[t.key]), 0, 5)) e[`rate:${t.key}`] = 'invalid';
  for (const f of base.frequencies) {
    if (!inRange(num(form.visits[f.key]), 0, 31)) e[`visits:${f.key}`] = 'invalid';
    if (!inRange(num(form.adjustments[f.key]), 0, 5)) e[`adjustment:${f.key}`] = 'invalid';
  }
  if (!inRange(num(form.minPerVisit), 0, 10000)) e.minPerVisit = 'invalid';
  const pct = num(form.rangePercent);
  if (!(Number.isFinite(pct) && pct >= 0 && pct < 100)) e.rangePercent = 'invalid';
  const r = num(form.roundTo);
  if (!(Number.isInteger(r) && r >= 1 && r <= 1000)) e.roundTo = 'invalid';
  const w = num(form.walkthroughSqft);
  if (!(Number.isInteger(w) && w >= 1000 && w <= 1_000_000)) e.walkthroughSqft = 'invalid';
  return e;
}

/** Ajustes a partir del formulario (ya validado). Claves y nombres no cambian. */
export function fromForm(form: EstimatorForm, base: EstimatorSettings): EstimatorSettings {
  return {
    placeTypes: base.placeTypes.map((t) => ({ ...t, rate: num(form.rates[t.key]) })),
    frequencies: base.frequencies.map((f) => ({ ...f, visitsPerMonth: num(form.visits[f.key]), adjustment: num(form.adjustments[f.key]) })),
    minPerVisit: num(form.minPerVisit),
    rangePct: Math.round(num(form.rangePercent) * 100) / 10000,
    roundTo: num(form.roundTo),
    walkthroughSqft: num(form.walkthroughSqft),
  };
}

/** Rango de la vista previa con lo que hay escrito; null si algún valor necesario no es válido. */
export function previewQuote(form: EstimatorForm, base: EstimatorSettings): Quote | null {
  if (Object.keys(validateEstimatorForm(form, base)).length) return null;
  const s = fromForm(form, base);
  const t = s.placeTypes.find((x) => x.key === PREVIEW.type);
  const f = s.frequencies.find((x) => x.key === PREVIEW.frequency);
  if (!t || !f) return null;
  return estimateQuote(PREVIEW.sqft, t.rate, f.visitsPerMonth, f.adjustment, s.minPerVisit, s.rangePct, s.roundTo);
}

export const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
