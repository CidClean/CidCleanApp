import type { ApiResult } from './employeesApi';
import { failureFromCode } from './employeesApi';
import { HISTORY_PAGE, type HistoryEntry } from './history';
import { supabase } from './supabase';

/** Una página del historial (list_change_log, exige historial_ver). `before`: id de la última fila ya mostrada. */
export async function fetchHistoryPage(before: number | null): Promise<ApiResult<HistoryEntry[]>> {
  try {
    const { data, error } = await supabase.rpc('list_change_log', { p_before: before, p_limit: HISTORY_PAGE });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return {
      ok: true,
      data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: Number(r.id),
        at: String(r.at),
        action: String(r.action),
        subject: (r.subject as string | null) ?? null,
        actor: (r.actor as string | null) ?? null,
        info: (r.info as HistoryEntry['info']) ?? {},
      })),
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
