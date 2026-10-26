import type { ApiResult } from './employeesApi';
import { failureFromCode } from './employeesApi';
import { monthStart, type Period } from './accountingRules';
import { toAdminHome, toReport, type AdminHomeData, type StatisticsReport } from './statisticsRules';
import { supabase } from './supabase';

/** Estadísticas e Inicio del admin (migración 20261027000014): funciones de la base que validan el permiso. */

async function rpc<T>(name: string, args: Record<string, unknown>, map: (d: unknown) => T): Promise<ApiResult<T>> {
  try {
    const { data, error } = await supabase.rpc(name, args);
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: map(data) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Por cuenta, por empleado y tendencia de un mes o rango de meses (D-253). Exige estadisticas_ver (D-252). */
export function fetchStatistics(p: Period): Promise<ApiResult<StatisticsReport>> {
  return rpc('statistics_report', { p_from: monthStart(p.from), p_to: monthStart(p.to) }, toReport);
}

/** Tarjetas del Inicio del admin, cada una solo con el permiso de su área (null sin permiso). */
export function fetchAdminHome(): Promise<ApiResult<AdminHomeData>> {
  return rpc('admin_home', {}, toAdminHome);
}
