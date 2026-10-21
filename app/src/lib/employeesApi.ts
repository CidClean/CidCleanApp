import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { isLocale } from '@/i18n';
import {
  createEmployeeBody,
  sortEmployees,
  type EditForm,
  type Employee,
  type NewEmployeeForm,
  type RoleKey,
  type WorkerType,
} from './employeeRules';
import { supabase } from './supabase';

/** Acceso a empleados: lectura directa (las reglas por fila filtran por permiso), cambios por funciones del servidor. */

export type ApiFailure = 'forbidden' | 'email_taken' | 'invalid' | 'not_found' | 'network' | 'server';
export type ApiResult<T> = { ok: true; data: T } | { ok: false; reason: ApiFailure };

const COLUMNS = 'id, full_name, phone, email, worker_type, role, is_super_admin, has_app_access, language, active, first_login_at';

type Row = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  worker_type: WorkerType | null;
  role: RoleKey;
  is_super_admin: boolean;
  has_app_access: boolean;
  language: string;
  active: boolean;
  first_login_at: string | null;
};

export function rowToEmployee(r: Row): Employee {
  return {
    id: r.id,
    fullName: r.full_name,
    phone: r.phone,
    email: r.email,
    workerType: r.worker_type,
    role: r.role,
    isSuperAdmin: r.is_super_admin,
    hasAppAccess: r.has_app_access,
    language: isLocale(r.language) ? r.language : 'en',
    active: r.active,
    firstLoginAt: r.first_login_at,
  };
}

/** Código de error de Postgres o de la función a una razón simple. */
export function failureFromCode(code: string | undefined, status?: number): ApiFailure {
  if (code === '42501' || code === 'forbidden' || status === 403) return 'forbidden';
  if (code === '23505' || code === 'email_taken' || status === 409) return 'email_taken';
  if (code === '22023' || code === 'invalid' || status === 400) return 'invalid';
  if (code === 'P0002' || code === 'not_found' || status === 404) return 'not_found';
  return 'server';
}

export async function fetchEmployees(): Promise<ApiResult<Employee[]>> {
  try {
    const { data, error } = await supabase.from('profiles').select(COLUMNS);
    if (error) return { ok: false, reason: 'server' };
    return { ok: true, data: sortEmployees((data as Row[]).map(rowToEmployee)) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function fetchEmployee(id: string): Promise<ApiResult<Employee>> {
  try {
    const { data, error } = await supabase.from('profiles').select(COLUMNS).eq('id', id).maybeSingle();
    if (error) return { ok: false, reason: 'server' };
    if (!data) return { ok: false, reason: 'not_found' };
    return { ok: true, data: rowToEmployee(data as Row) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Lee la razón de error de una Edge Function (el cuerpo trae `{ error }`). */
export async function functionFailure(error: unknown): Promise<ApiFailure> {
  if (error instanceof FunctionsHttpError) {
    let code: string | undefined;
    try {
      code = (await error.context.json())?.error;
    } catch {
      code = undefined;
    }
    return failureFromCode(code, error.context.status);
  }
  if (error instanceof FunctionsFetchError) return 'network';
  return 'server';
}

export type Invitation = 'none' | 'sent' | 'failed';

export async function createEmployee(form: NewEmployeeForm): Promise<ApiResult<{ id: string; invitation: Invitation }>> {
  try {
    const { data, error } = await supabase.functions.invoke('create-employee', { body: createEmployeeBody(form) });
    if (error) return { ok: false, reason: await functionFailure(error) };
    return { ok: true, data: { id: data.id as string, invitation: data.invitation as Invitation } };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function resendInvitation(profileId: string): Promise<ApiResult<null>> {
  try {
    const { error } = await supabase.functions.invoke('resend-invitation', { body: { profile_id: profileId } });
    if (error) return { ok: false, reason: await functionFailure(error) };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function setEmployeeActive(profileId: string, active: boolean): Promise<ApiResult<null>> {
  try {
    const { error } = await supabase.rpc('set_employee_active', { p_profile: profileId, p_active: active });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function updateEmployee(profileId: string, form: EditForm): Promise<ApiResult<null>> {
  try {
    const { error } = await supabase.rpc('update_employee', {
      p_profile: profileId,
      p_full_name: form.fullName.trim(),
      p_phone: form.phone.trim() === '' ? null : form.phone.trim(),
      p_worker_type: form.workerType,
      p_language: form.language,
    });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
