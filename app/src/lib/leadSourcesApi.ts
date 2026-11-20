import type { ApiResult } from './employeesApi';
import { failureFromCode } from './employeesApi';
import type { EntersAs, LeadSourceItem, SourceKind } from './leadSources';
import { supabase } from './supabase';

/** Fuentes de leads (migración 20261122000002): solo el Super Admin con aal2; la clave sale una sola vez. */

type Row = { id: string; name: string; kind: string; enters_as: string; active: boolean; key_last4: string | null; lead_count: number };

const toItem = (r: Row): LeadSourceItem => ({
  id: r.id,
  name: r.name,
  kind: r.kind === 'ads' || r.kind === 'agent' ? r.kind : 'other',
  entersAs: r.enters_as === 'potential' ? 'potential' : 'cold',
  active: r.active,
  keyLast4: r.key_last4,
  leadCount: Number(r.lead_count ?? 0),
});

export async function fetchLeadSources(): Promise<ApiResult<LeadSourceItem[]>> {
  try {
    const { data, error } = await supabase
      .from('lead_sources')
      .select('id, name, kind, enters_as, active, key_last4, lead_count')
      .order('created_at');
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: (data as Row[]).map(toItem) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function updateLeadSource(id: string, patch: { active?: boolean; entersAs?: EntersAs }): Promise<ApiResult<null>> {
  try {
    const cols: Record<string, unknown> = {};
    if (patch.active !== undefined) cols.active = patch.active;
    if (patch.entersAs !== undefined) cols.enters_as = patch.entersAs;
    const { data, error } = await supabase.from('lead_sources').update(cols).eq('id', id).select('id');
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    if (!data || data.length === 0) return { ok: false, reason: 'forbidden' };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** "+ Add source": devuelve la clave en claro (solo esta vez). 'duplicate' si el nombre ya existe. */
export async function createLeadSource(
  name: string,
  kind: SourceKind,
  entersAs: EntersAs,
): Promise<{ ok: true; data: { id: string; key: string } } | { ok: false; reason: string }> {
  try {
    const { data, error } = await supabase.rpc('lead_source_create', { p_name: name.trim(), p_kind: kind, p_enters_as: entersAs });
    if (error) return { ok: false, reason: error.code === '23505' ? 'duplicate' : failureFromCode(error.code) };
    const d = data as { id: string; key: string };
    return { ok: true, data: { id: d.id, key: d.key } };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Rehacer la clave: la anterior deja de servir; devuelve la nueva (solo esta vez). */
export async function rotateLeadSourceKey(id: string): Promise<ApiResult<string>> {
  try {
    const { data, error } = await supabase.rpc('lead_source_rotate_key', { p_id: id });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: String((data as { key: string }).key) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
