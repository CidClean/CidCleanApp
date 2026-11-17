import type { ApiResult } from './employeesApi';
import { failureFromCode, functionFailure } from './employeesApi';
import { toSowData, type SowData } from './sowRules';
import { supabase } from './supabase';

/** SOW de una versión del quote (orden 112, migración 20261117000002): datos, faltantes y si se puede editar. */
export async function fetchQuoteSow(versionId: string): Promise<ApiResult<SowData>> {
  try {
    const { data, error } = await supabase.rpc('quote_sow', { p_version: versionId });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: toSowData((data ?? {}) as Record<string, unknown>) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function saveQuoteSow(versionId: string, fields: Record<string, string>): Promise<ApiResult<SowData>> {
  try {
    const { data, error } = await supabase.rpc('save_quote_sow', { p_version: versionId, p_fields: fields });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: toSowData((data ?? {}) as Record<string, unknown>) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** "Ver PDF del SOW": URL firmada de 60 s del SOW tal como va (send-quote, sow_preview). */
export async function fetchSowPreviewUrl(versionId: string): Promise<ApiResult<{ url: string; fileName?: string }>> {
  try {
    const { data, error } = await supabase.functions.invoke('send-quote', { body: { version_id: versionId, sow_preview: true } });
    if (error) return { ok: false, reason: await functionFailure(error) };
    const d = (data ?? {}) as { url?: string; file_name?: string };
    if (!d.url) return { ok: false, reason: 'server' };
    return { ok: true, data: { url: d.url, fileName: d.file_name } };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
