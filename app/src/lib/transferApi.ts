import type { ApiResult } from './employeesApi';
import type { WorkerType } from './employeeRules';
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
export async function transferSuperAdmin(profileId: string, workerType: WorkerType | null): Promise<ApiResult<null>> {
  try {
    // D-206: si quien transfiere no tiene tipo de trabajador, el elegido se guarda en la misma transacción.
    const { error } = await supabase.rpc('transfer_super_admin', { p_new: profileId, p_worker_type: workerType });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Tipo de trabajador del propio perfil: el Super Admin puede no tenerlo y debe elegirlo al transferir (D-206). */
export async function fetchOwnWorkerType(profileId: string): Promise<ApiResult<WorkerType | null>> {
  try {
    const { data, error } = await supabase.from('profiles').select('worker_type').eq('id', profileId).maybeSingle();
    if (error || !data) return { ok: false, reason: 'server' };
    return { ok: true, data: (data as { worker_type: WorkerType | null }).worker_type };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
