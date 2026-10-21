import type { ApiFailure, ApiResult } from './employeesApi';
import { failureFromCode } from './employeesApi';
import { supabase } from './supabase';

export type Candidate = { id: string; fullName: string };

/** Quién puede recibir el rol de Super Admin (D-090): activos, con acceso a la app, que ya entraron, menos uno mismo. */
export async function fetchSuperAdminCandidates(): Promise<ApiResult<Candidate[]>> {
  try {
    const { data, error } = await supabase.rpc('super_admin_candidates');
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: ((data ?? []) as { id: string; full_name: string }[]).map((r) => ({ id: r.id, fullName: r.full_name })) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Transfiere el rol de Super Admin (D-090, D-116, D-199). */
export async function transferSuperAdmin(
  profileId: string,
): Promise<{ ok: true; data: null } | { ok: false; reason: ApiFailure | 'no_worker_type' }> {
  try {
    const { error } = await supabase.rpc('transfer_super_admin', { p_new: profileId });
    // 23514: quien transfiere no tiene tipo de trabajador y la base no deja un perfil sin tipo fuera del Super Admin.
    if (error) return { ok: false, reason: error.code === '23514' ? 'no_worker_type' : failureFromCode(error.code) };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
