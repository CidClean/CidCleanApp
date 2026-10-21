import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { getStrings } from '@/i18n';

// --- Simulaciones --------------------------------------------------------------------------------------------
const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockAccess: { isSuperAdmin: boolean; permissions: Set<string> } = { isSuperAdmin: true, permissions: new Set() };
let mockOwnId: string | null = 'yo';
let mockParams: Record<string, string> = { id: 'e1' };

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(effect, []);
  },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>REDIRECT {href}</Text>;
  },
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

const mockCreateEmployee = jest.fn();
const mockFetchEmployee = jest.fn();
const mockUpdateEmployee = jest.fn();
const mockSetActive = jest.fn();
const mockResend = jest.fn();
jest.mock('@/lib/employeesApi', () => ({
  createEmployee: (...a: unknown[]) => mockCreateEmployee(...a),
  fetchEmployee: (...a: unknown[]) => mockFetchEmployee(...a),
  updateEmployee: (...a: unknown[]) => mockUpdateEmployee(...a),
  setEmployeeActive: (...a: unknown[]) => mockSetActive(...a),
  resendInvitation: (...a: unknown[]) => mockResend(...a),
}));
const mockFetchDocuments = jest.fn();
jest.mock('@/lib/documents', () => ({
  fetchDocuments: (...a: unknown[]) => mockFetchDocuments(...a),
  openDocument: jest.fn(),
  uploadDocument: jest.fn(),
  takePhoto: jest.fn(),
  chooseFile: jest.fn(),
}));

import NewEmployeeScreen from '@/app/(app)/employees/new';
import EmployeeProfileScreen from '@/app/(app)/employees/[id]';

const es = getStrings('es');
const employee = (over: Record<string, unknown> = {}) => ({
  id: 'e1', fullName: 'Ana Ruiz', phone: '(239) 555-0142', email: 'ana@correo.com', workerType: '1099', role: 'employee',
  isSuperAdmin: false, hasAppAccess: true, language: 'en', active: true, firstLoginAt: null, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAccess = { isSuperAdmin: true, permissions: new Set() };
  mockOwnId = 'yo';
  mockParams = { id: 'e1' };
  mockFetchEmployee.mockResolvedValue({ ok: true, data: employee() });
  mockFetchDocuments.mockResolvedValue({ ok: true, data: [{ id: 'd1', kind: 'w9', uploadedAt: new Date(2026, 9, 12, 12).toISOString() }] });
});

describe('Nuevo empleado (D-171)', () => {
  test('muestra los campos de la muestra; el correo solo con la casilla marcada', async () => {
    await render(<NewEmployeeScreen />);
    for (const label of [es.newEmployee.name, es.newEmployee.phone, es.newEmployee.role, es.newEmployee.email, es.newEmployee.language]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByText(es.newEmployee.type)).toBeTruthy();
    expect(screen.getByText(es.employees.w2)).toBeTruthy();
    expect(screen.getByText(es.employees.contractor)).toBeTruthy();
    expect(screen.getByText(es.newEmployee.create)).toBeTruthy();

    await fireEvent.press(screen.getByText(es.newEmployee.hasAccess));
    expect(screen.queryByLabelText(es.newEmployee.email)).toBeNull();
    await fireEvent.press(screen.getByText(es.newEmployee.hasAccess));
    expect(screen.getByLabelText(es.newEmployee.email)).toBeTruthy();
  });

  test('sin nombre ni correo válido muestra los errores y no llama al servidor', async () => {
    await render(<NewEmployeeScreen />);
    await fireEvent.press(screen.getByText(es.newEmployee.create));
    expect(screen.getByText(es.newEmployee.errorName)).toBeTruthy();
    expect(screen.getByText(es.email.invalid)).toBeTruthy();
    expect(mockCreateEmployee).not.toHaveBeenCalled();
  });

  test('crea y abre el perfil, pestaña Datos (D-181), con el estado de la invitación', async () => {
    mockCreateEmployee.mockResolvedValue({ ok: true, data: { id: 'nuevo1', invitation: 'sent' } });
    await render(<NewEmployeeScreen />);
    await fireEvent.changeText(screen.getByLabelText(es.newEmployee.name), 'Ana Ruiz');
    await fireEvent.changeText(screen.getByLabelText(es.newEmployee.email), 'ana@correo.com');
    await fireEvent.press(screen.getByText(es.newEmployee.create));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockCreateEmployee).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'Ana Ruiz', email: 'ana@correo.com', workerType: 'w2', role: 'employee', hasAppAccess: true, language: 'en' }),
    );
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/employees/[id]', params: { id: 'nuevo1', invitation: 'sent' } });
  });

  test('correo ya registrado: lo dice bajo el campo y no abre ningún perfil', async () => {
    mockCreateEmployee.mockResolvedValue({ ok: false, reason: 'email_taken' });
    await render(<NewEmployeeScreen />);
    await fireEvent.changeText(screen.getByLabelText(es.newEmployee.name), 'Ana Ruiz');
    await fireEvent.changeText(screen.getByLabelText(es.newEmployee.email), 'ana@correo.com');
    await fireEvent.press(screen.getByText(es.newEmployee.create));
    expect(await screen.findByText(es.newEmployee.errorEmailTaken)).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('sin el permiso de crear no se muestra (vuelve a Inicio)', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['empleados_ver']) };
    await render(<NewEmployeeScreen />);
    expect(screen.getByText('REDIRECT /')).toBeTruthy();
  });
});

describe('Perfil del empleado (D-057, D-172 a D-175, D-182 a D-184)', () => {
  test('quien lo puede todo ve Editar, el interruptor, la invitación pendiente y los documentos 1099', async () => {
    await render(<EmployeeProfileScreen />);
    expect(await screen.findByText(es.employee.invitationSent)).toBeTruthy();
    expect(screen.getByText(es.employee.pendingChip)).toBeTruthy();
    expect(screen.getByText(es.employee.resendInvitation)).toBeTruthy();
    expect(screen.getByText(es.common.edit)).toBeTruthy();
    expect(screen.getByRole('switch')).toBeTruthy();
    expect(screen.getByText('1099 · Empleado')).toBeTruthy();
    expect(screen.getByText(es.employee.documents)).toBeTruthy();
    expect(screen.getByText(es.employee.uploadedOn('12 oct 2026'))).toBeTruthy();
    expect(screen.getByText(es.employee.noFile)).toBeTruthy();
    expect(screen.getByText(es.employee.uploadedChip)).toBeTruthy();
    expect(screen.getByText(es.employee.missingChip)).toBeTruthy();
    expect(screen.getByText(es.employee.upload)).toBeTruthy();
  });

  test('con empleados_ver solamente: sin Editar, sin interruptor, sin reenviar y sin documentos', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['empleados_ver']) };
    await render(<EmployeeProfileScreen />);
    expect(await screen.findByText(es.employee.invitationSent)).toBeTruthy();
    expect(screen.queryByText(es.common.edit)).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText(es.employees.active)).toBeTruthy();
    expect(screen.queryByText(es.employee.resendInvitation)).toBeNull();
    expect(screen.queryByText(es.employee.documents)).toBeNull();
    expect(mockFetchDocuments).not.toHaveBeenCalled();
  });

  test('empleado W-2: no hay sección de documentos aunque se vean pagos', async () => {
    mockFetchEmployee.mockResolvedValue({ ok: true, data: employee({ workerType: 'w2' }) });
    await render(<EmployeeProfileScreen />);
    expect(await screen.findByText(es.employee.invitationSent)).toBeTruthy();
    expect(screen.queryByText(es.employee.documents)).toBeNull();
  });

  test('ya entró: "Sí · desde {fecha}", sin ficha Pendiente ni botón de reenviar (D-184)', async () => {
    mockFetchEmployee.mockResolvedValue({ ok: true, data: employee({ firstLoginAt: new Date(2026, 9, 12, 12).toISOString() }) });
    await render(<EmployeeProfileScreen />);
    expect(await screen.findByText(es.employee.accessSince('12 oct 2026'))).toBeTruthy();
    expect(screen.queryByText(es.employee.pendingChip)).toBeNull();
    expect(screen.queryByText(es.employee.resendInvitation)).toBeNull();
  });

  test('sin acceso a la app: "No"', async () => {
    mockFetchEmployee.mockResolvedValue({ ok: true, data: employee({ hasAppAccess: false, email: null }) });
    await render(<EmployeeProfileScreen />);
    expect(await screen.findByText(es.common.no)).toBeTruthy();
  });

  test('apagar el interruptor pide confirmación y solo desactiva al confirmar', async () => {
    mockSetActive.mockResolvedValue({ ok: true, data: null });
    await render(<EmployeeProfileScreen />);
    await screen.findByText(es.employee.invitationSent);
    await fireEvent.press(screen.getByRole('switch'));
    expect(screen.getByText(es.employee.deactivateTitle('Ana Ruiz'))).toBeTruthy();
    expect(screen.getByText(es.employee.deactivateBody)).toBeTruthy();
    expect(mockSetActive).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText(es.employee.deactivate));
    await waitFor(() => expect(mockSetActive).toHaveBeenCalledWith('e1', false));
  });

  test('cancelar la confirmación no cambia nada', async () => {
    await render(<EmployeeProfileScreen />);
    await screen.findByText(es.employee.invitationSent);
    await fireEvent.press(screen.getByRole('switch'));
    await fireEvent.press(screen.getByText(es.common.cancel));
    expect(mockSetActive).not.toHaveBeenCalled();
  });

  test('un desactivado se reactiva con su hoja, sin texto de cuerpo (D-182)', async () => {
    mockFetchEmployee.mockResolvedValue({ ok: true, data: employee({ active: false }) });
    mockSetActive.mockResolvedValue({ ok: true, data: null });
    await render(<EmployeeProfileScreen />);
    await screen.findByText(es.employee.invitationSent);
    await fireEvent.press(screen.getByRole('switch'));
    expect(screen.getByText(es.employee.reactivateTitle('Ana Ruiz'))).toBeTruthy();
    expect(screen.queryByText(es.employee.deactivateBody)).toBeNull();
    await fireEvent.press(screen.getByText(es.employee.reactivate));
    await waitFor(() => expect(mockSetActive).toHaveBeenCalledWith('e1', true));
  });

  test('no se puede desactivar a uno mismo ni al Super Admin: no hay interruptor', async () => {
    mockOwnId = 'e1';
    await render(<EmployeeProfileScreen />);
    await screen.findByText(es.employee.invitationSent);
    expect(screen.queryByRole('switch')).toBeNull();
  });

  test('Editar convierte la pantalla en formulario: solo Nombre, Teléfono, Tipo e Idioma se editan', async () => {
    mockUpdateEmployee.mockResolvedValue({ ok: true, data: null });
    await render(<EmployeeProfileScreen />);
    await screen.findByText(es.employee.invitationSent);
    await fireEvent.press(screen.getByText(es.common.edit));
    expect(screen.getByLabelText(es.newEmployee.name)).toBeTruthy();
    expect(screen.getByLabelText(es.employee.phone)).toBeTruthy();
    expect(screen.getByLabelText(es.newEmployee.language)).toBeTruthy();
    // Correo, Rol de partida y Acceso a la app siguen como filas de solo lectura.
    expect(screen.queryByLabelText(es.employee.email)).toBeNull();
    expect(screen.getByText('ana@correo.com')).toBeTruthy();
    expect(screen.getByText(es.employee.invitationSent)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(es.newEmployee.name), 'Ana María Ruiz');
    await fireEvent.press(screen.getByText(es.common.save));
    await waitFor(() => expect(mockUpdateEmployee).toHaveBeenCalled());
    expect(mockUpdateEmployee).toHaveBeenCalledWith('e1', { fullName: 'Ana María Ruiz', phone: '(239) 555-0142', workerType: '1099', language: 'en' });
  });

  test('mientras se edita el interruptor Activo no se muestra: queda solo la etiqueta con el estado real', async () => {
    await render(<EmployeeProfileScreen />);
    await screen.findByText(es.employee.invitationSent);
    expect(screen.getByRole('switch')).toBeTruthy();
    await fireEvent.press(screen.getByText(es.common.edit));
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText(es.employees.active)).toBeTruthy();
    expect(screen.queryByText(es.employees.inactive)).toBeNull();
    // Al cancelar vuelve el interruptor.
    await fireEvent.press(screen.getByText(es.common.cancel));
    expect(screen.getByRole('switch')).toBeTruthy();
  });

  test('en la edición de un empleado inactivo la etiqueta dice Inactivo', async () => {
    mockFetchEmployee.mockResolvedValue({ ok: true, data: employee({ active: false }) });
    await render(<EmployeeProfileScreen />);
    await screen.findByText(es.employee.invitationSent);
    await fireEvent.press(screen.getByText(es.common.edit));
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText(es.employees.inactive)).toBeTruthy();
  });

  test('en el formulario el nombre no puede quedar vacío', async () => {
    await render(<EmployeeProfileScreen />);
    await screen.findByText(es.employee.invitationSent);
    await fireEvent.press(screen.getByText(es.common.edit));
    await fireEvent.changeText(screen.getByLabelText(es.newEmployee.name), '  ');
    await fireEvent.press(screen.getByText(es.common.save));
    expect(screen.getByText(es.newEmployee.errorName)).toBeTruthy();
    expect(mockUpdateEmployee).not.toHaveBeenCalled();
  });

  test('Reenviar invitación llama a la función y lo confirma', async () => {
    mockResend.mockResolvedValue({ ok: true, data: null });
    await render(<EmployeeProfileScreen />);
    await screen.findByText(es.employee.invitationSent);
    await fireEvent.press(screen.getByText(es.employee.resendInvitation));
    expect(await screen.findByText(es.employee.invitationResent)).toBeTruthy();
    expect(mockResend).toHaveBeenCalledWith('e1');
  });

  test('Permisos y Pagos muestran "Pendiente" por ahora', async () => {
    await render(<EmployeeProfileScreen />);
    await screen.findByText(es.employee.invitationSent);
    await fireEvent.press(screen.getByText(es.employee.tabPay));
    expect(screen.getByText(es.pending)).toBeTruthy();
    await fireEvent.press(screen.getByText(es.employee.tabPermissions));
    expect(screen.getByText(es.pending)).toBeTruthy();
  });
});
