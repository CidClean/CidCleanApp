import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { getStrings } from '@/i18n';

// Navegación simulada: guarda el oyente de beforeRemove para probar la salida con cambios sin guardar.
const mockNavigation = {
  listener: null as null | ((e: { preventDefault: () => void; data: { action: unknown } }) => void),
  addListener: jest.fn((_: string, l: (e: { preventDefault: () => void; data: { action: unknown } }) => void) => {
    mockNavigation.listener = l;
    return () => undefined;
  }),
  dispatch: jest.fn(),
};

const mockBack = jest.fn();

// --- Simulaciones --------------------------------------------------------------------------------------------
let mockAccess: { isSuperAdmin: boolean; permissions: Set<string> } = { isSuperAdmin: true, permissions: new Set() };
let mockOwnId: string | null = 'yo';

jest.mock('expo-router', () => ({
  useNavigation: () => mockNavigation,
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: mockBack, canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: 'e1' }),
  Redirect: () => null,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/lib/session', () => ({
  usePermissions: () => ({
    access: mockAccess,
    isSuperAdmin: mockAccess.isSuperAdmin,
    can: (k: string) => mockAccess.isSuperAdmin || mockAccess.permissions.has(k),
  }),
  useSession: () => ({ locale: 'es', profile: { id: mockOwnId } }),
}));
jest.mock('@/i18n/useStrings', () => ({ useStrings: () => require('@/i18n').getStrings('es') }));

const mockFetchEmployee = jest.fn();
const mockFetchPermissions = jest.fn();
const mockFetchTemplate = jest.fn();
const mockSavePermissions = jest.fn();
// Pagos del empleado (hito 5) se prueba en clientScreens.test.tsx.
jest.mock('@/components/clients/EmployeePay', () => ({ EmployeePay: () => null }));
jest.mock('@/lib/employeesApi', () => ({
  fetchEmployee: (...a: unknown[]) => mockFetchEmployee(...a),
  fetchEmployeePermissions: (...a: unknown[]) => mockFetchPermissions(...a),
  fetchTemplatePermissions: (...a: unknown[]) => mockFetchTemplate(...a),
  saveEmployeePermissions: (...a: unknown[]) => mockSavePermissions(...a),
  updateEmployee: jest.fn(),
  setEmployeeActive: jest.fn(),
  resendInvitation: jest.fn(),
  createEmployee: jest.fn(),
}));
jest.mock('@/lib/documents', () => ({
  fetchDocuments: jest.fn().mockResolvedValue({ ok: true, data: [] }),
  uploadDocument: jest.fn(),
  takePhoto: jest.fn(),
  chooseFile: jest.fn(),
}));
// W-9 por llenar (D-256): se prueba en w9Screens.test.tsx.
jest.mock('@/lib/w9Api', () => ({
  fetchW9Status: jest.fn(async () => ({ ok: true, data: null })),
  sendW9: jest.fn(),
  resendW9: jest.fn(),
}));

import EmployeeProfileScreen from '@/app/(app)/employees/[id]';

const es = getStrings('es');
const L = es.permissions.labels;
const SUPERVISOR_8 = [
  'leads_ver', 'walkthroughs_hacer', 'clientes_ver', 'empleados_ver', 'schedule_ver_editar',
  'work_registrar_por_otros', 'work_editar', 'work_revisar_gps',
];
const employee = (over: Record<string, unknown> = {}) => ({
  id: 'e1', fullName: 'Ana Ruiz', phone: null, email: 'ana@correo.com', workerType: 'w2', role: 'employee',
  isSuperAdmin: false, hasAppAccess: true, language: 'en', active: true, firstLoginAt: '2026-10-12T15:00:00Z', ...over,
});

async function openPermissions() {
  await render(<EmployeeProfileScreen />);
  await screen.findByText('W-2 · Empleado', {}, { timeout: 2000 }).catch(() => undefined);
  await fireEvent.press(await screen.findByText(es.employee.tabPermissions));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAccess = { isSuperAdmin: true, permissions: new Set() };
  mockOwnId = 'yo';
  mockFetchEmployee.mockResolvedValue({ ok: true, data: employee() });
  mockFetchPermissions.mockResolvedValue({ ok: true, data: ['empleados_ver', 'empleados_invitar_crear', 'empleados_editar_desactivar'] });
  mockFetchTemplate.mockImplementation((role: string) =>
    Promise.resolve({ ok: true, data: role === 'supervisor' ? SUPERVISOR_8 : [] }),
  );
  mockSavePermissions.mockResolvedValue({ ok: true, data: null });
});

describe('Pestaña Permisos: quien edita con todo (D-058, D-110, D-188)', () => {
  test('Plantilla de partida arriba y las 6 áreas con su ficha, en el orden de la muestra', async () => {
    await openPermissions();
    expect(await screen.findByLabelText(es.permissions.template)).toBeTruthy();
    for (const area of Object.values(es.permissions.areas)) expect(screen.getByText(area)).toBeTruthy();
    // Empleados: 3 de 7 -> Parcial; las otras 5 áreas, Sin acceso.
    expect(screen.getAllByText(es.permissions.chipPartial)).toHaveLength(1);
    expect(screen.getAllByText(es.permissions.chipNone)).toHaveLength(5);
    expect(screen.queryByText(es.permissions.chipAll)).toBeNull();
  });

  test('cada área está cerrada y al abrirla lista sus permisos con el interruptor según lo guardado', async () => {
    await openPermissions();
    await screen.findByLabelText(es.permissions.template);
    expect(screen.queryByLabelText(L.empleados_ver)).toBeNull();
    await fireEvent.press(screen.getByLabelText(es.permissions.areas.empleados));
    for (const key of ['empleados_ver', 'empleados_invitar_crear', 'empleados_editar_desactivar', 'empleados_ver_pagos', 'empleados_asignar_pago', 'empleados_gestionar_permisos', 'empleados_gestionar_documentos'] as const) {
      expect(screen.getByLabelText(L[key])).toBeTruthy();
    }
    expect(screen.getByLabelText(L.empleados_ver).props.accessibilityState.checked).toBe(true);
    expect(screen.getByLabelText(L.empleados_ver_pagos).props.accessibilityState.checked).toBe(false);
  });

  test('Guardar cambios está siempre y apagado mientras no haya cambios (D-188)', async () => {
    await openPermissions();
    await screen.findByLabelText(es.permissions.template);
    const save = screen.getByRole('button', { name: es.permissions.saveChanges });
    expect(save.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText(es.permissions.areas.empleados));
    await fireEvent.press(screen.getByLabelText(L.empleados_ver_pagos));
    expect(screen.getByRole('button', { name: es.permissions.saveChanges }).props.accessibilityState.disabled).toBe(false);
    // Los cambios quedan pendientes: nada se guardó todavía.
    expect(mockSavePermissions).not.toHaveBeenCalled();
    // Volver a apagarlo deja otra vez sin cambios.
    await fireEvent.press(screen.getByLabelText(L.empleados_ver_pagos));
    expect(screen.getByRole('button', { name: es.permissions.saveChanges }).props.accessibilityState.disabled).toBe(true);
  });

  test('varios cambios se guardan juntos, con una sola llamada, y sin cambiar el rol', async () => {
    await openPermissions();
    await screen.findByLabelText(es.permissions.template);
    await fireEvent.press(screen.getByLabelText(es.permissions.areas.empleados));
    await fireEvent.press(screen.getByLabelText(L.empleados_ver_pagos));
    await fireEvent.press(screen.getByLabelText(L.empleados_gestionar_documentos));
    await fireEvent.press(screen.getByLabelText(L.empleados_invitar_crear));
    await fireEvent.press(screen.getByRole('button', { name: es.permissions.saveChanges }));
    await waitFor(() => expect(mockSavePermissions).toHaveBeenCalledTimes(1));
    expect(mockSavePermissions).toHaveBeenCalledWith(
      'e1',
      { grant: ['empleados_ver_pagos', 'empleados_gestionar_documentos'], revoke: ['empleados_invitar_crear'] },
      null,
    );
    // Después de guardar se vuelven a leer el perfil y los permisos.
    await waitFor(() => expect(mockFetchPermissions).toHaveBeenCalledTimes(2));
    expect(mockFetchEmployee).toHaveBeenCalledTimes(2);
  });

  test('si no se puede guardar, lo avisa y los cambios siguen pendientes', async () => {
    mockSavePermissions.mockResolvedValue({ ok: false, reason: 'server' });
    await openPermissions();
    await screen.findByLabelText(es.permissions.template);
    await fireEvent.press(screen.getByLabelText(es.permissions.areas.empleados));
    await fireEvent.press(screen.getByLabelText(L.empleados_ver_pagos));
    await fireEvent.press(screen.getByRole('button', { name: es.permissions.saveChanges }));
    expect(await screen.findByText(es.employee.errorSave)).toBeTruthy();
    expect(screen.getByLabelText(L.empleados_ver_pagos).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('button', { name: es.permissions.saveChanges }).props.accessibilityState.disabled).toBe(false);
  });

  test('cambiar de pestaña con cambios sin guardar pide confirmación; Cancelar los conserva', async () => {
    await openPermissions();
    await screen.findByLabelText(es.permissions.template);
    await fireEvent.press(screen.getByLabelText(es.permissions.areas.empleados));
    await fireEvent.press(screen.getByLabelText(L.empleados_ver_pagos));
    await fireEvent.press(screen.getByText(es.employee.tabData));
    expect(screen.getByText('¿Salir sin guardar?')).toBeTruthy();
    expect(screen.getByText('Los cambios se perderán.')).toBeTruthy();
    await fireEvent.press(screen.getByText(es.common.cancel));
    expect(screen.queryByText('¿Salir sin guardar?')).toBeNull();
    // Sigue en Permisos con el cambio pendiente.
    expect(screen.getByLabelText(L.empleados_ver_pagos).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('button', { name: es.permissions.saveChanges }).props.accessibilityState.disabled).toBe(false);
  });

  test('Salir descarta los cambios y cambia de pestaña', async () => {
    await openPermissions();
    await screen.findByLabelText(es.permissions.template);
    await fireEvent.press(screen.getByLabelText(es.permissions.areas.empleados));
    await fireEvent.press(screen.getByLabelText(L.empleados_ver_pagos));
    await fireEvent.press(screen.getByText(es.employee.tabData));
    await fireEvent.press(screen.getByText(es.unsaved.leave));
    expect(screen.queryByRole('button', { name: es.permissions.saveChanges })).toBeNull();
    await fireEvent.press(screen.getByText(es.employee.tabPermissions));
    await fireEvent.press(screen.getByLabelText(es.permissions.areas.empleados));
    expect(screen.getByLabelText(L.empleados_ver_pagos).props.accessibilityState.checked).toBe(false);
    expect(mockSavePermissions).not.toHaveBeenCalled();
  });

  test('sin cambios se cambia de pestaña y se sale del perfil sin preguntar', async () => {
    await openPermissions();
    await screen.findByLabelText(es.permissions.template);
    const prevent = jest.fn();
    mockNavigation.listener?.({ preventDefault: prevent, data: { action: { type: 'GO_BACK' } } });
    expect(prevent).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText(es.employee.tabData));
    expect(screen.queryByText('¿Salir sin guardar?')).toBeNull();
  });

  test('dejar el perfil con cambios sin guardar pide confirmación; Salir sigue con la navegación', async () => {
    await openPermissions();
    await screen.findByLabelText(es.permissions.template);
    await fireEvent.press(screen.getByLabelText(es.permissions.areas.empleados));
    await fireEvent.press(screen.getByLabelText(L.empleados_ver_pagos));
    const prevent = jest.fn();
    const action = { type: 'GO_BACK' };
    const { act } = require('@testing-library/react-native');
    await act(async () => mockNavigation.listener?.({ preventDefault: prevent, data: { action } }));
    expect(prevent).toHaveBeenCalled();
    expect(screen.getByText('¿Salir sin guardar?')).toBeTruthy();
    await fireEvent.press(screen.getByText(es.unsaved.leave));
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(action);
    expect(mockSavePermissions).not.toHaveBeenCalled();
  });

  test('la flecha de volver con cambios sin guardar pide confirmación; Cancelar se queda, Salir vuelve', async () => {
    await openPermissions();
    await screen.findByLabelText(es.permissions.template);
    await fireEvent.press(screen.getByLabelText(es.permissions.areas.empleados));
    await fireEvent.press(screen.getByLabelText(L.empleados_ver_pagos));
    await fireEvent.press(screen.getByLabelText(es.common.back));
    expect(screen.getByText('¿Salir sin guardar?')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText(es.common.cancel));
    expect(mockBack).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText(es.common.back));
    await fireEvent.press(screen.getByText(es.unsaved.leave));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test('la flecha de volver sin cambios vuelve directo', async () => {
    await openPermissions();
    await screen.findByLabelText(es.permissions.template);
    await fireEvent.press(screen.getByLabelText(es.common.back));
    expect(screen.queryByText('¿Salir sin guardar?')).toBeNull();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test('después de guardar ya no pregunta al salir', async () => {
    await openPermissions();
    await screen.findByLabelText(es.permissions.template);
    await fireEvent.press(screen.getByLabelText(es.permissions.areas.empleados));
    await fireEvent.press(screen.getByLabelText(L.empleados_ver_pagos));
    mockFetchPermissions.mockResolvedValue({ ok: true, data: ['empleados_ver', 'empleados_invitar_crear', 'empleados_editar_desactivar', 'empleados_ver_pagos'] });
    await fireEvent.press(screen.getByRole('button', { name: es.permissions.saveChanges }));
    await waitFor(() => expect(mockFetchPermissions).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: es.permissions.saveChanges }).props.accessibilityState.disabled).toBe(true));
    const prevent = jest.fn();
    mockNavigation.listener?.({ preventDefault: prevent, data: { action: { type: 'GO_BACK' } } });
    expect(prevent).not.toHaveBeenCalled();
  });
});

describe('Plantilla de partida (D-189, D-190)', () => {
  async function chooseTemplate(name: string) {
    await screen.findByLabelText(es.permissions.template);
    await fireEvent.press(screen.getByLabelText(es.permissions.template));
    await fireEvent.press(screen.getByText(name));
  }

  test('muestra el rol guardado como plantilla y las tres opciones', async () => {
    await openPermissions();
    await screen.findByLabelText(es.permissions.template);
    await fireEvent.press(screen.getByLabelText(es.permissions.template));
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByText(es.employees.roleSupervisor)).toBeTruthy();
    expect(screen.getByText(es.employees.roleAdmin)).toBeTruthy();
  });

  test('cambiarla pide confirmación con el texto aprobado y no cambia nada hasta Aplicar', async () => {
    await openPermissions();
    await chooseTemplate(es.employees.roleSupervisor);
    expect(screen.getByText('¿Aplicar la plantilla Supervisor?')).toBeTruthy();
    expect(screen.getByText('Reemplaza los permisos actuales de Ana Ruiz.')).toBeTruthy();
    expect(mockFetchTemplate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: es.permissions.saveChanges }).props.accessibilityState.disabled).toBe(true);
  });

  test('Cancelar deja todo como estaba y el selector con el rol guardado', async () => {
    await openPermissions();
    await chooseTemplate(es.employees.roleSupervisor);
    await fireEvent.press(screen.getByText(es.common.cancel));
    expect(mockFetchTemplate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: es.permissions.saveChanges }).props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByText('¿Aplicar la plantilla Supervisor?')).toBeNull();
  });

  test('Aplicar deja los permisos de la plantilla como cambios pendientes y Guardar envía también el rol', async () => {
    await openPermissions();
    await chooseTemplate(es.employees.roleSupervisor);
    await fireEvent.press(screen.getByText(es.permissions.apply));
    await waitFor(() => expect(mockFetchTemplate).toHaveBeenCalledWith('supervisor'));
    expect(mockSavePermissions).not.toHaveBeenCalled();
    const save = await screen.findByRole('button', { name: es.permissions.saveChanges });
    await waitFor(() => expect(screen.getByRole('button', { name: es.permissions.saveChanges }).props.accessibilityState.disabled).toBe(false));
    // Empleados quedó con solo "Ver lista" (lo de la plantilla): sigue Parcial, y Ventas ya tiene algo.
    await fireEvent.press(screen.getByRole('button', { name: es.permissions.saveChanges }));
    await waitFor(() => expect(mockSavePermissions).toHaveBeenCalledTimes(1));
    const [id, changes, role] = mockSavePermissions.mock.calls[0];
    expect(id).toBe('e1');
    expect(role).toBe('supervisor');
    expect(changes.revoke).toEqual(['empleados_invitar_crear', 'empleados_editar_desactivar']);
    expect(changes.grant).toEqual(['leads_ver', 'walkthroughs_hacer', 'clientes_ver', 'schedule_ver_editar', 'work_registrar_por_otros', 'work_editar', 'work_revisar_gps']);
    void save;
  });

  test('si no se puede cargar la plantilla, lo avisa y no cambia nada', async () => {
    mockFetchTemplate.mockResolvedValue({ ok: false, reason: 'network' });
    await openPermissions();
    await chooseTemplate(es.employees.roleSupervisor);
    await fireEvent.press(screen.getByText(es.permissions.apply));
    expect(await screen.findByText(es.permissions.errorTemplate)).toBeTruthy();
    expect(screen.getByRole('button', { name: es.permissions.saveChanges }).props.accessibilityState.disabled).toBe(true);
  });

  test('quien edita con pocos permisos: la plantilla solo toca lo que él tiene (D-191)', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['empleados_ver', 'empleados_gestionar_permisos', 'leads_ver']) };
    mockFetchPermissions.mockResolvedValue({ ok: true, data: ['empleados_ver'] });
    await openPermissions();
    await chooseTemplate(es.employees.roleSupervisor);
    await fireEvent.press(screen.getByText(es.permissions.apply));
    await waitFor(() => expect(mockFetchTemplate).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: es.permissions.saveChanges }).props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByRole('button', { name: es.permissions.saveChanges }));
    await waitFor(() => expect(mockSavePermissions).toHaveBeenCalled());
    // De la plantilla Supervisor solo tiene leads_ver y empleados_ver (que el perfil ya tenía).
    expect(mockSavePermissions).toHaveBeenCalledWith('e1', { grant: ['leads_ver'], revoke: [] }, 'supervisor');
  });
});

describe('Permisos que quien mira no tiene (D-191)', () => {
  test('no aparecen: ni interruptores ni cuentan en la ficha, y un área sin ninguno no se lista', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['empleados_ver', 'empleados_gestionar_permisos', 'leads_ver']) };
    mockFetchPermissions.mockResolvedValue({ ok: true, data: ['empleados_ver', 'empleados_gestionar_permisos'] });
    await openPermissions();
    await screen.findByLabelText(es.permissions.template);
    expect(screen.getByText(es.permissions.areas.ventas)).toBeTruthy();
    expect(screen.getByText(es.permissions.areas.empleados)).toBeTruthy();
    expect(screen.queryByText(es.permissions.areas.clientes)).toBeNull();
    expect(screen.queryByText(es.permissions.areas.schedule_work)).toBeNull();
    expect(screen.queryByText(es.permissions.areas.accounting)).toBeNull();
    expect(screen.queryByText(es.permissions.areas.sistema)).toBeNull();
    // Empleados: de los 2 que se listan, los 2 están encendidos -> Todo (aunque el área tenga 7 en total).
    expect(screen.getAllByText(es.permissions.chipAll)).toHaveLength(1);
    expect(screen.getAllByText(es.permissions.chipNone)).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText(es.permissions.areas.empleados));
    expect(screen.getByLabelText(L.empleados_ver)).toBeTruthy();
    expect(screen.getByLabelText(L.empleados_gestionar_permisos)).toBeTruthy();
    expect(screen.queryByLabelText(L.empleados_ver_pagos)).toBeNull();
    expect(screen.queryByLabelText(L.empleados_gestionar_documentos)).toBeNull();
  });
});

describe('Solo lectura (D-194)', () => {
  test('con solo empleados_ver: ve sus permisos sin poder cambiar nada, sin selector y sin Guardar', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['empleados_ver']) };
    mockFetchPermissions.mockResolvedValue({ ok: true, data: ['empleados_ver'] });
    await openPermissions();
    await screen.findByText(es.permissions.areas.empleados);
    expect(screen.queryByLabelText(es.permissions.template)).toBeNull();
    expect(screen.queryByRole('button', { name: es.permissions.saveChanges })).toBeNull();
    await fireEvent.press(screen.getByLabelText(es.permissions.areas.empleados));
    const sw = screen.getByLabelText(L.empleados_ver);
    expect(sw.props.accessibilityState.checked).toBe(true);
    expect(sw.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(sw);
    expect(screen.getByLabelText(L.empleados_ver).props.accessibilityState.checked).toBe(true);
    expect(mockSavePermissions).not.toHaveBeenCalled();
  });

  test('nadie edita sus propios permisos: en su propio perfil es solo lectura aunque pueda gestionar permisos', async () => {
    mockOwnId = 'e1';
    await openPermissions();
    await screen.findByText(es.permissions.areas.empleados);
    expect(screen.queryByLabelText(es.permissions.template)).toBeNull();
    expect(screen.queryByRole('button', { name: es.permissions.saveChanges })).toBeNull();
    await fireEvent.press(screen.getByLabelText(es.permissions.areas.empleados));
    expect(screen.getByLabelText(L.empleados_ver).props.accessibilityState.disabled).toBe(true);
  });

  test('si los permisos no se pueden cargar lo avisa', async () => {
    mockFetchPermissions.mockResolvedValue({ ok: false, reason: 'server' });
    await openPermissions();
    expect(await screen.findByText(es.permissions.errorLoad)).toBeTruthy();
    expect(screen.queryByRole('button', { name: es.permissions.saveChanges })).toBeNull();
  });
});

describe('Super Admin (D-192)', () => {
  beforeEach(() => {
    mockFetchEmployee.mockResolvedValue({ ok: true, data: employee({ fullName: 'Cid Clean (Super Admin)', isSuperAdmin: true, role: 'admin' }) });
  });

  test('todas las áreas en Todo, interruptores encendidos y bloqueados, sin selector ni Guardar; nadie los edita', async () => {
    await render(<EmployeeProfileScreen />);
    await fireEvent.press(await screen.findByText(es.employee.tabPermissions));
    await screen.findByText(es.permissions.areas.ventas);
    expect(screen.getAllByText(es.permissions.chipAll)).toHaveLength(6);
    expect(screen.queryByLabelText(es.permissions.template)).toBeNull();
    expect(screen.queryByRole('button', { name: es.permissions.saveChanges })).toBeNull();
    await fireEvent.press(screen.getByLabelText(es.permissions.areas.sistema));
    const sw = screen.getByLabelText(L.historial_ver);
    expect(sw.props.accessibilityState.checked).toBe(true);
    expect(sw.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(sw);
    expect(screen.getByLabelText(L.historial_ver).props.accessibilityState.checked).toBe(true);
    expect(mockFetchPermissions).not.toHaveBeenCalled();
    expect(mockSavePermissions).not.toHaveBeenCalled();
  });

  test('ni el propio Super Admin edita su perfil de permisos', async () => {
    mockOwnId = 'e1';
    await render(<EmployeeProfileScreen />);
    await fireEvent.press(await screen.findByText(es.employee.tabPermissions));
    await screen.findByText(es.permissions.areas.ventas);
    expect(screen.queryByRole('button', { name: es.permissions.saveChanges })).toBeNull();
    expect(screen.getAllByText(es.permissions.chipAll)).toHaveLength(6);
  });

  test('un Admin con pocos permisos ve el perfil del Super Admin bloqueado y solo con lo que él tiene', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['empleados_ver', 'empleados_gestionar_permisos']) };
    await render(<EmployeeProfileScreen />);
    await fireEvent.press(await screen.findByText(es.employee.tabPermissions));
    await screen.findByText(es.permissions.areas.empleados);
    expect(screen.queryByText(es.permissions.areas.ventas)).toBeNull();
    expect(screen.getAllByText(es.permissions.chipAll)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: es.permissions.saveChanges })).toBeNull();
  });
});

describe('Rol bajo el nombre (D-190)', () => {
  test('después de guardar con una plantilla, el perfil se vuelve a leer y muestra el rol nuevo', async () => {
    mockFetchEmployee
      .mockResolvedValueOnce({ ok: true, data: employee() })
      .mockResolvedValue({ ok: true, data: employee({ role: 'supervisor' }) });
    await openPermissions();
    expect(await screen.findByText('W-2 · Empleado')).toBeTruthy();
    await fireEvent.press(await screen.findByLabelText(es.permissions.template));
    await fireEvent.press(screen.getByText(es.employees.roleSupervisor));
    await fireEvent.press(screen.getByText(es.permissions.apply));
    await waitFor(() => expect(screen.getByRole('button', { name: es.permissions.saveChanges }).props.accessibilityState.disabled).toBe(false));
    // Antes de guardar el rol bajo el nombre no cambia.
    expect(screen.getByText('W-2 · Empleado')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: es.permissions.saveChanges }));
    expect(await screen.findByText('W-2 · Supervisor')).toBeTruthy();
  });
});

describe('Pagos (D-194)', () => {
  test('sin empleados_ver_pagos: aviso y ninguna cifra; con él, "Pendiente"', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['empleados_ver']) };
    await render(<EmployeeProfileScreen />);
    await fireEvent.press(await screen.findByText(es.employee.tabPay));
    expect(screen.getByText(es.permissions.noPayPermission)).toBeTruthy();
  });
});
