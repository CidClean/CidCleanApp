import type { EstimatorSettings } from './estimator';
import { failureFrom, type LeadsResult } from './leadsApi';
import { supabase } from './supabase';

/** Tarifas del estimador del sitio (tabla estimator_settings, una fila; solo el Super Admin lee y cambia, D-014). */
type Row = {
  place_types: { key: string; name: string; rate: number }[];
  frequencies: { key: string; name: string; visits_per_month: number; adjustment: number }[];
  min_per_visit: number | string;
  range_pct: number | string;
  round_to: number;
  walkthrough_sqft: number;
};
const COLUMNS = 'place_types, frequencies, min_per_visit, range_pct, round_to, walkthrough_sqft';

function toSettings(r: Row): EstimatorSettings {
  return {
    placeTypes: r.place_types.map((t) => ({ key: t.key, name: t.name, rate: Number(t.rate) })),
    frequencies: r.frequencies.map((f) => ({ key: f.key, name: f.name, visitsPerMonth: Number(f.visits_per_month), adjustment: Number(f.adjustment) })),
    minPerVisit: Number(r.min_per_visit),
    rangePct: Number(r.range_pct),
    roundTo: Number(r.round_to),
    walkthroughSqft: Number(r.walkthrough_sqft),
  };
}

export async function fetchEstimatorSettings(): Promise<LeadsResult<EstimatorSettings>> {
  try {
    const { data, error } = await supabase.from('estimator_settings').select(COLUMNS).maybeSingle();
    if (error) return { ok: false, reason: failureFrom(error.code) };
    if (!data) return { ok: false, reason: 'forbidden' };
    return { ok: true, data: toSettings(data as Row) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function saveEstimatorSettings(s: EstimatorSettings): Promise<LeadsResult<null>> {
  try {
    const { data, error } = await supabase
      .from('estimator_settings')
      .update({
        place_types: s.placeTypes.map((t) => ({ key: t.key, name: t.name, rate: t.rate })),
        frequencies: s.frequencies.map((f) => ({ key: f.key, name: f.name, visits_per_month: f.visitsPerMonth, adjustment: f.adjustment })),
        min_per_visit: s.minPerVisit,
        range_pct: s.rangePct,
        round_to: s.roundTo,
        walkthrough_sqft: s.walkthroughSqft,
      })
      .eq('id', true)
      .select('id');
    if (error) return { ok: false, reason: failureFrom(error.code) };
    if (!data || data.length === 0) return { ok: false, reason: 'forbidden' };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
