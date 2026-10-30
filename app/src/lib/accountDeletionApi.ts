import { failureFromCode, type ApiResult } from './employeesApi';
import { supabase } from './supabase';

/**
 * Eliminar cuenta (orden 57, D-282). La persona pide la eliminación (request_account_deletion); el Super Admin ve las
 * solicitudes y las marca como atendidas (complete_account_deletion: desactiva la cuenta y su acceso a la app).
 */

export type DeletionRequest = {
  id: string;
  profileId: string;
  fullName: string;
  email: string | null;
  requestedAt: string;
  status: 'pending' | 'done';
  handledAt: string | null;
};

/** Última solicitud propia (null si nunca pidió). */
export async function fetchMyDeletionRequest(): Promise<ApiResult<{ requestedAt: string; status: 'pending' | 'done' } | null>> {
  try {
    const { data, error } = await supabase
      .from('account_deletion_requests')
      .select('requested_at, status')
      .order('requested_at', { ascending: false })
      .limit(1);
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    const row = (data as { requested_at: string; status: 'pending' | 'done' }[] | null)?.[0];
    return { ok: true, data: row ? { requestedAt: row.requested_at, status: row.status } : null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Envía la solicitud; devuelve su fecha (la pendiente si ya había una). */
export async function requestAccountDeletion(): Promise<ApiResult<{ requestedAt: string }>> {
  try {
    const { data, error } = await supabase.rpc('request_account_deletion');
    if (error || typeof data !== 'string') return { ok: false, reason: error ? failureFromCode(error.code) : 'server' };
    return { ok: true, data: { requestedAt: data } };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function fetchDeletionRequests(): Promise<ApiResult<DeletionRequest[]>> {
  try {
    const { data, error } = await supabase.rpc('list_account_deletion_requests');
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    type Row = { id: string; profile_id: string; full_name: string; email: string | null; requested_at: string; status: 'pending' | 'done'; handled_at: string | null };
    return {
      ok: true,
      data: ((data as Row[] | null) ?? []).map((r) => ({
        id: r.id,
        profileId: r.profile_id,
        fullName: r.full_name,
        email: r.email,
        requestedAt: r.requested_at,
        status: r.status,
        handledAt: r.handled_at,
      })),
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function completeDeletionRequest(id: string): Promise<ApiResult<null>> {
  try {
    const { error } = await supabase.rpc('complete_account_deletion', { p_id: id });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
