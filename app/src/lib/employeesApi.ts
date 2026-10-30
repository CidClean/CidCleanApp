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
  updateEmployeeArgs,
} from './employeeRules';
import { supabase } from './supabase';

/** Acceso a empleados: lectura directa (las reglas por fila filtran por permiso), cambios por funciones del servidor. */

export type ApiFailure = 'forbidden' | 'email_taken' | 'invalid' | 'not_found' | 'network' | 'server';
export type ApiResult<T> = { ok: true; data: T } | { ok: false; reason: ApiFailure };

const COLUMNS =
  'id, full_name, first_name, last_name, phone, email, worker_type, role, is_super_admin, has_app_access, language, active, first_login_at, address_line1, address_line2, state, city, zip';

type Row = {
  id: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  state?: string | null;
  city?: string | null;
  zip?: string | null;
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
    firstName: r.first_name ?? null,
    lastName: r.last_name ?? null,
    addressLine1: r.address_line1 ?? null,
    addressLine2: r.address_line2 ?? null,
    state: r.state ?? null,
    city: r.city ?? null,
    zip: r.zip ?? null,
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

/** D-242: guarda el correo y el acceso (grant_app_access) y manda la invitación (resend-invitation). */
export async function grantAppAccess(profileId: string, email: string): Promise<ApiResult<'sent' | 'failed'>> {
  try {
    const { error } = await supabase.rpc('grant_app_access', { p_profile: profileId, p_email: email.trim() });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
  } catch {
    return { ok: false, reason: 'network' };
  }
  const sent = await resendInvitation(profileId);
  return { ok: true, data: sent.ok ? 'sent' : 'failed' };
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
    const { error } = await supabase.rpc('update_employee', updateEmployeeArgs(profileId, form));
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Permisos del perfil que quien consulta también tiene (D-191): el servidor no devuelve los demás. */
export async function fetchEmployeePermissions(profileId: string): Promise<ApiResult<string[]>> {
  try {
    const { data, error } = await supabase.rpc('employee_permissions', { p_profile: profileId });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: Array.isArray(data) ? (data as string[]) : [] };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Permisos de una plantilla de partida (D-152, D-193); la lista vive en la base, no en la app. */
export async function fetchTemplatePermissions(role: RoleKey): Promise<ApiResult<string[]>> {
  try {
    const { data, error } = await supabase.rpc('role_template_permissions', { p_role: role });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: Array.isArray(data) ? (data as string[]) : [] };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Guarda los cambios pendientes de la pestaña Permisos de una vez (D-188): todo o nada, y el rol de la plantilla (D-190). */
export async function saveEmployeePermissions(
  profileId: string,
  changes: { grant: string[]; revoke: string[] },
  role: RoleKey | null,
): Promise<ApiResult<null>> {
  try {
    const { error } = await supabase.rpc('save_employee_permissions', {
      p_profile: profileId,
      p_grant: changes.grant,
      p_revoke: changes.revoke,
      p_role: role,
    });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
