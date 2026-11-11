import type { ApiFailure, ApiResult } from './employeesApi';
import type { WorkerType } from './employeeRules';
import { failureFromCode } from './employeesApi';
import { supabase } from './supabase';

/** hasTotp: ya tiene la app de autenticación (factor TOTP verificado); sin ella no puede recibir el rol (orden 102, D-306). */
export type Candidate = { id: string; fullName: string; hasTotp: boolean };
export type TransferResult = { ok: true; data: null } | { ok: false; reason: ApiFailure | 'needs_totp' };

/** Quién puede recibir el rol de Super Admin (D-090): activos, con acceso a la app, que ya entraron, menos uno mismo. */
export async function fetchSuperAdminCandidates(): Promise<ApiResult<Candidate[]>> {
  try {
    const { data, error } = await supabase.rpc('super_admin_candidates');
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return {
      ok: true,
      data: ((data ?? []) as { id: string; full_name: string; has_totp?: boolean }[]).map((r) => ({
        id: r.id,
        fullName: r.full_name,
        hasTotp: r.has_totp === true,
      })),
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Transfiere el rol de Super Admin (D-090, D-116, D-199). */
export async function transferSuperAdmin(profileId: string, workerType: WorkerType | null): Promise<TransferResult> {
  try {
    // D-206: si quien transfiere no tiene tipo de trabajador, el elegido se guarda en la misma transacción.
    const { error } = await supabase.rpc('transfer_super_admin', { p_new: profileId, p_worker_type: workerType });
    // Orden 102 (N6): la base exige que quien recibe el rol ya tenga la app de autenticación (P0010).
    if (error?.code === 'P0010') return { ok: false, reason: 'needs_totp' };
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
