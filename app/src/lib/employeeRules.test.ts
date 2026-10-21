import {
  accessState,
  canCreateEmployees,
  canEditEmployee,
  canResendInvitation,
  canToggleActive,
  createEmployeeBody,
  documentRows,
  editChanged,
  editFormFrom,
  emptyNewEmployee,
  extensionFor,
  formatDate,
  hasErrors,
  initials,
  showsDocuments,
  sortEmployees,
  validateEdit,
  validateNewEmployee,
  type Employee,
} from './employeeRules';
import type { Access } from './visibility';

const access = (isSuperAdmin: boolean, perms: string[] = []): Access => ({ isSuperAdmin, permissions: new Set(perms) });
const employee = (over: Partial<Employee> = {}): Employee => ({
  id: 'e1',
  fullName: 'Ana Ruiz',
  phone: '(239) 555-0142',
  email: 'ana@correo.com',
  workerType: 'w2',
  role: 'employee',
  isSuperAdmin: false,
  hasAppAccess: true,
  language: 'en',
  active: true,
  firstLoginAt: null,
  ...over,
});

describe('iniciales y orden de la lista (D-083)', () => {
  test('iniciales de las dos primeras palabras, en mayúscula', () => {
    expect(initials('Ana Ruiz')).toBe('AR');
    expect(initials('  carlos   torres  ')).toBe('CT');
    expect(initials('Diego')).toBe('D');
    expect(initials('María José Pérez')).toBe('MJ');
    expect(initials('   ')).toBe('');
  });

  test('orden alfabético sin distinguir mayúsculas ni acentos', () => {
    const names = sortEmployees([{ fullName: 'diego López' }, { fullName: 'Ana Rivera' }, { fullName: 'Álvaro Gil' }, { fullName: 'Carlos Torres' }]).map(
      (e) => e.fullName,
    );
    expect(names).toEqual(['Álvaro Gil', 'Ana Rivera', 'Carlos Torres', 'diego López']);
  });
});

describe('Nuevo empleado (D-171)', () => {
  test('valores de partida: W-2, Empleado, con acceso, English', () => {
    expect(emptyNewEmployee()).toEqual({
      fullName: '', phone: '', workerType: 'w2', role: 'employee', hasAppAccess: true, email: '', language: 'en',
    });
  });

  test('el nombre es obligatorio', () => {
    expect(validateNewEmployee({ ...emptyNewEmployee(), fullName: '  ', email: 'a@b.co' })).toEqual({ fullName: 'required' });
  });

  test('con acceso a la app el correo es obligatorio y debe tener formato de correo', () => {
    const base = { ...emptyNewEmployee(), fullName: 'Ana' };
    expect(validateNewEmployee({ ...base, email: '' })).toEqual({ email: 'invalid' });
    expect(validateNewEmployee({ ...base, email: 'ana@' })).toEqual({ email: 'invalid' });
    expect(validateNewEmployee({ ...base, email: ' ana@correo.com ' })).toEqual({});
  });

  test('sin acceso a la app el correo no se pide ni se valida', () => {
    const form = { ...emptyNewEmployee(), fullName: 'Ana', hasAppAccess: false, email: 'basura' };
    expect(validateNewEmployee(form)).toEqual({});
    expect(createEmployeeBody(form).email).toBe('');
  });

  test('hasErrors', () => {
    expect(hasErrors({})).toBe(false);
    expect(hasErrors({ fullName: 'required' })).toBe(true);
  });

  test('el cuerpo para la Edge Function va limpio', () => {
    expect(
      createEmployeeBody({ fullName: ' Ana Ruiz ', phone: ' (239) 555-0142 ', workerType: '1099', role: 'supervisor', hasAppAccess: true, email: ' Ana@Correo.COM ', language: 'es' }),
    ).toEqual({
      full_name: 'Ana Ruiz', phone: '(239) 555-0142', worker_type: '1099', role: 'supervisor', language: 'es',
      has_app_access: true, email: 'ana@correo.com',
    });
  });
});

describe('Datos en edición (D-174): solo Nombre, Teléfono, Tipo e Idioma', () => {
  test('el formulario parte de los datos actuales y solo trae los campos editables', () => {
    expect(editFormFrom(employee({ phone: null }))).toEqual({ fullName: 'Ana Ruiz', phone: '', workerType: 'w2', language: 'en' });
  });

  test('el nombre no puede quedar vacío', () => {
    expect(validateEdit({ fullName: ' ', phone: '', workerType: 'w2', language: 'en' })).toEqual({ fullName: 'required' });
    expect(validateEdit({ fullName: 'Ana', phone: '', workerType: 'w2', language: 'en' })).toEqual({});
  });

  test('detecta si hubo cambios', () => {
    const e = employee();
    const form = editFormFrom(e);
    expect(editChanged(e, form)).toBe(false);
    expect(editChanged(e, { ...form, fullName: ' Ana Ruiz ' })).toBe(false);
    expect(editChanged(e, { ...form, phone: '1' })).toBe(true);
    expect(editChanged(e, { ...form, workerType: '1099' })).toBe(true);
    expect(editChanged(e, { ...form, language: 'es' })).toBe(true);
  });
});

describe('Acceso a la app (D-172, D-184)', () => {
  test('sin acceso, con invitación pendiente y ya ingresó', () => {
    expect(accessState({ hasAppAccess: false, firstLoginAt: null })).toEqual({ kind: 'none' });
    expect(accessState({ hasAppAccess: true, firstLoginAt: null })).toEqual({ kind: 'pending' });
    expect(accessState({ hasAppAccess: true, firstLoginAt: '2026-10-12T15:00:00Z' })).toEqual({ kind: 'active', since: '2026-10-12T15:00:00Z' });
  });
});

describe('Quién ve y usa qué según sus permisos (D-169, D-125)', () => {
  test('el icono + solo con empleados_invitar_crear (D-185)', () => {
    expect(canCreateEmployees(access(false, ['empleados_ver']))).toBe(false);
    expect(canCreateEmployees(access(false, ['empleados_invitar_crear']))).toBe(true);
    expect(canCreateEmployees(access(true))).toBe(true);
  });

  test('Editar solo con empleados_editar_desactivar; al Super Admin solo lo edita el Super Admin', () => {
    expect(canEditEmployee(access(false, ['empleados_ver']), employee())).toBe(false);
    expect(canEditEmployee(access(false, ['empleados_editar_desactivar']), employee())).toBe(true);
    expect(canEditEmployee(access(false, ['empleados_editar_desactivar']), employee({ isSuperAdmin: true }))).toBe(false);
    expect(canEditEmployee(access(true), employee({ isSuperAdmin: true }))).toBe(true);
  });

  test('el interruptor Activo: con permiso, y nunca sobre el Super Admin ni sobre uno mismo', () => {
    const editor = access(false, ['empleados_editar_desactivar']);
    expect(canToggleActive(access(false, ['empleados_ver']), employee(), 'otro')).toBe(false);
    expect(canToggleActive(editor, employee(), 'otro')).toBe(true);
    expect(canToggleActive(editor, employee({ id: 'yo' }), 'yo')).toBe(false);
    expect(canToggleActive(editor, employee({ isSuperAdmin: true }), 'otro')).toBe(false);
    expect(canToggleActive(access(true), employee({ isSuperAdmin: true }), 'otro')).toBe(false);
  });

  test('Reenviar invitación: con empleados_invitar_crear, activo y mientras no haya primer ingreso', () => {
    const creator = access(false, ['empleados_invitar_crear']);
    expect(canResendInvitation(creator, employee())).toBe(true);
    expect(canResendInvitation(access(false, ['empleados_ver']), employee())).toBe(false);
    expect(canResendInvitation(creator, employee({ firstLoginAt: '2026-10-12T15:00:00Z' }))).toBe(false);
    expect(canResendInvitation(creator, employee({ hasAppAccess: false }))).toBe(false);
    expect(canResendInvitation(creator, employee({ active: false }))).toBe(false);
  });

  test('Documentos solo de los 1099 y solo con empleados_ver_pagos', () => {
    const payer = access(false, ['empleados_ver_pagos']);
    expect(showsDocuments(payer, employee({ workerType: '1099' }))).toBe(true);
    expect(showsDocuments(payer, employee({ workerType: 'w2' }))).toBe(false);
    expect(showsDocuments(access(false, ['empleados_ver', 'empleados_editar_desactivar']), employee({ workerType: '1099' }))).toBe(false);
    expect(showsDocuments(access(true), employee({ workerType: '1099' }))).toBe(true);
  });
});

describe('Documentos 1099 (D-175)', () => {
  test('una fila por tipo: Subido con su fecha o Falta', () => {
    expect(documentRows([])).toEqual([
      { kind: 'w9', state: 'missing', uploadedAt: null, documentId: null },
      { kind: 'insurance_certificate', state: 'missing', uploadedAt: null, documentId: null },
    ]);
    expect(documentRows([{ id: 'd1', kind: 'w9', uploadedAt: '2026-10-12T15:00:00Z' }])).toEqual([
      { kind: 'w9', state: 'uploaded', uploadedAt: '2026-10-12T15:00:00Z', documentId: 'd1' },
      { kind: 'insurance_certificate', state: 'missing', uploadedAt: null, documentId: null },
    ]);
  });

  test('extensión según el tipo de archivo', () => {
    expect(extensionFor('application/pdf')).toBe('pdf');
    expect(extensionFor('image/png')).toBe('png');
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('image/heic')).toBe('heic');
    expect(extensionFor(null, 'contrato.PDF')).toBe('pdf');
    expect(extensionFor(undefined, undefined)).toBe('jpg');
  });
});

describe('Fechas', () => {
  const d = new Date(2026, 9, 12, 12, 0).toISOString(); // 12 oct 2026, mediodía local
  test('"12 oct 2026" en español y "Oct 12, 2026" en inglés', () => {
    expect(formatDate(d, 'es')).toBe('12 oct 2026');
    expect(formatDate(d, 'en')).toBe('Oct 12, 2026');
    expect(formatDate('no es fecha', 'es')).toBe('');
  });
});
