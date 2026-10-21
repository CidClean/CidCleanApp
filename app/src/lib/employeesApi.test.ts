const mockInvoke = jest.fn();
const mockRpc = jest.fn();
const mockSelect = jest.fn();

jest.mock('./supabase', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: () => ({ select: (...a: unknown[]) => mockSelect(...a) }),
  },
}));

import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { emptyNewEmployee } from './employeeRules';
import { createEmployee, failureFromCode, fetchEmployees, resendInvitation, rowToEmployee, setEmployeeActive, updateEmployee } from './employeesApi';

beforeEach(() => {
  mockInvoke.mockReset();
  mockRpc.mockReset();
  mockSelect.mockReset();
});

const httpError = (status: number, body: unknown) =>
  new FunctionsHttpError(new Response(JSON.stringify(body), { status }));

describe('failureFromCode', () => {
  test('traduce códigos de Postgres y de las funciones', () => {
    expect(failureFromCode('42501')).toBe('forbidden');
    expect(failureFromCode('forbidden')).toBe('forbidden');
    expect(failureFromCode('23505')).toBe('email_taken');
    expect(failureFromCode('email_taken')).toBe('email_taken');
    expect(failureFromCode('22023')).toBe('invalid');
    expect(failureFromCode('P0002')).toBe('not_found');
    expect(failureFromCode(undefined)).toBe('server');
    expect(failureFromCode('xx', 403)).toBe('forbidden');
  });
});

describe('createEmployee', () => {
  const form = { ...emptyNewEmployee(), fullName: ' Ana Ruiz ', email: 'Ana@Correo.com', phone: '1' };

  test('llama a create-employee con el cuerpo limpio y devuelve el id y el estado de la invitación', async () => {
    mockInvoke.mockResolvedValue({ data: { id: 'p1', invitation: 'sent' }, error: null });
    const result = await createEmployee(form);
    expect(mockInvoke).toHaveBeenCalledWith('create-employee', {
      body: { full_name: 'Ana Ruiz', phone: '1', worker_type: 'w2', role: 'employee', language: 'en', has_app_access: true, email: 'ana@correo.com' },
    });
    expect(result).toEqual({ ok: true, data: { id: 'p1', invitation: 'sent' } });
  });

  test('correo repetido (409), sin permiso (403), datos inválidos (400)', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: httpError(409, { error: 'email_taken' }) });
    expect(await createEmployee(form)).toEqual({ ok: false, reason: 'email_taken' });
    mockInvoke.mockResolvedValueOnce({ data: null, error: httpError(403, { error: 'forbidden' }) });
    expect(await createEmployee(form)).toEqual({ ok: false, reason: 'forbidden' });
    mockInvoke.mockResolvedValueOnce({ data: null, error: httpError(400, { error: 'invalid' }) });
    expect(await createEmployee(form)).toEqual({ ok: false, reason: 'invalid' });
  });

  test('sin conexión', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new FunctionsFetchError(new Error('network')) });
    expect(await createEmployee(form)).toEqual({ ok: false, reason: 'network' });
    mockInvoke.mockRejectedValue(new Error('boom'));
    expect(await createEmployee(form)).toEqual({ ok: false, reason: 'network' });
  });
});

describe('otras operaciones', () => {
  test('resendInvitation llama a resend-invitation con el id', async () => {
    mockInvoke.mockResolvedValue({ data: { invitation: 'sent' }, error: null });
    expect(await resendInvitation('p1')).toEqual({ ok: true, data: null });
    expect(mockInvoke).toHaveBeenCalledWith('resend-invitation', { body: { profile_id: 'p1' } });
    mockInvoke.mockResolvedValue({ data: null, error: httpError(409, { error: 'already_logged_in' }) });
    expect((await resendInvitation('p1')).ok).toBe(false);
  });

  test('setEmployeeActive usa la función del servidor', async () => {
    mockRpc.mockResolvedValue({ error: null });
    expect(await setEmployeeActive('p1', false)).toEqual({ ok: true, data: null });
    expect(mockRpc).toHaveBeenCalledWith('set_employee_active', { p_profile: 'p1', p_active: false });
    mockRpc.mockResolvedValue({ error: { code: '42501' } });
    expect(await setEmployeeActive('p1', false)).toEqual({ ok: false, reason: 'forbidden' });
  });

  test('updateEmployee manda solo los campos editables; el teléfono vacío va como null', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await updateEmployee('p1', { fullName: ' Ana ', phone: ' ', workerType: '1099', language: 'es' });
    expect(mockRpc).toHaveBeenCalledWith('update_employee', {
      p_profile: 'p1', p_full_name: 'Ana', p_phone: null, p_worker_type: '1099', p_language: 'es',
    });
  });

  test('fetchEmployees ordena alfabéticamente y mapea las columnas', async () => {
    const row = (id: string, name: string) => ({
      id, full_name: name, phone: null, email: null, worker_type: 'w2' as const, role: 'employee' as const, is_super_admin: false,
      has_app_access: false, language: 'es', active: true, first_login_at: null,
    });
    mockSelect.mockResolvedValue({ data: [row('2', 'Diego'), row('1', 'Ana')], error: null });
    const result = await fetchEmployees();
    expect(result.ok && result.data.map((e) => e.fullName)).toEqual(['Ana', 'Diego']);
    expect(rowToEmployee(row('1', 'Ana')).language).toBe('es');
    expect(rowToEmployee({ ...row('1', 'Ana'), language: 'fr' }).language).toBe('en');
  });
});
