import { fireEvent, render, screen } from '@testing-library/react-native';

// Accounts con archivados (D-337 (3), orden 142).
let mockAccess: { isSuperAdmin: boolean; permissions: Set<string> } = { isSuperAdmin: true, permissions: new Set() };
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: mockPush, back: jest.fn(), canGoBack: () => true }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(effect, []);
  },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>REDIRECT {href}</Text>;
  },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/lib/session', () => ({
  usePermissions: () => ({ access: mockAccess, isSuperAdmin: mockAccess.isSuperAdmin, can: (k: string) => mockAccess.isSuperAdmin || mockAccess.permissions.has(k) }),
  useSession: () => ({ locale: 'es', profile: { id: 'yo', fullName: 'Humberto Vega' } }),
}));
jest.mock('@/i18n/useStrings', () => ({ useStrings: () => require('@/i18n').getStrings('es') }));
jest.mock('@/i18n/useClientsStrings', () => ({ useClientsStrings: () => require('@/i18n/clients').clientsEs }));

const js = (o: Record<string, unknown>) => ({
  id: 'j', clientId: 'c', clientName: 'C', clientLegacy: true, name: 'J', address: '1 Main St', plusCode: null, contactName: null,
  contactPhone: null, contactEmail: null, emergencyName: null, emergencyPhone: null, emergencyRelation: null, emergencyEmail: null,
  frequency: { kind: 'weekly', days: [0, 2, 4] }, estHoursPerVisit: null, visitsPerMonth: null, startDate: null, status: 'active', walkthroughVersion: null, ...o,
});
const mockRates = jest.fn();
jest.mock('@/lib/clientsApi', () => ({
  fetchClients: async () => ({
    ok: true,
    data: [
      { id: 'w', name: 'Wilson Franquicia', legacy: true, accountProvider: true, phone: null, email: null, address: null, notes: null },
      { id: 'q', name: 'Clinica Quirúrgica', legacy: true, phone: null, email: null, address: null, notes: null },
    ],
  }),
  fetchJobsites: async () => ({
    ok: true,
    data: [
      js({ id: 'nyc', clientId: 'w', clientName: 'Wilson Franquicia', name: 'Naples Yacht Club', startDate: '2026-09-17' }),
      js({ id: 'old', clientId: 'w', clientName: 'Wilson Franquicia', name: 'Sede Vieja', status: 'terminated', startDate: '2026-07-01' }),
      js({ id: 'cq', clientId: 'q', clientName: 'Clinica Quirúrgica', name: 'Clinica Quirúrgica', status: 'terminated', startDate: '2026-08-01' }),
    ],
  }),
  fetchAccountsOverview: async () => ({
    ok: true,
    data: new Map([
      ['nyc', { staff: 2, endedOn: null }],
      ['old', { staff: 0, endedOn: '2026-07-31' }],
      ['cq', { staff: 0, endedOn: '2026-08-31' }],
    ]),
  }),
  fetchRates: (...a: unknown[]) => mockRates(...a),
  fetchAtRisk: async () => ({ ok: true, data: new Set() }),
}));

import AccountsScreen from '@/app/(app)/(tabs)/accounts';

beforeEach(() => {
  jest.clearAllMocks();
  mockAccess = { isSuperAdmin: true, permissions: new Set() };
  mockRates.mockResolvedValue({ ok: true, data: new Map([['nyc', 8615], ['old', 1000], ['cq', 2038]]) });
});

describe('Accounts (D-337 (3))', () => {
  it('Activas: tarjeta por cliente con proveedor, total mensual y jobsite con frecuencia, personal y desde; total al pie', async () => {
    await render(<AccountsScreen />);
    expect(await screen.findByText('Activas · 1')).toBeTruthy();
    expect(screen.getByText('Archivadas · 2')).toBeTruthy();
    expect(screen.getByText('Proveedor de cuentas')).toBeTruthy();
    expect(screen.getByText('$8,615.00 /mes')).toBeTruthy();
    expect(screen.getByText('Lun, Mié y Vie · 2 personas · desde sep 17')).toBeTruthy();
    expect(screen.getByText('Total mensual')).toBeTruthy();
    expect(screen.queryByText('Sede Vieja')).toBeNull();
  });

  it('Archivadas: el terminado de un cliente activo y el cliente inactivo, con rango y "era $X/mes"; se abren igual', async () => {
    await render(<AccountsScreen />);
    await fireEvent.press(await screen.findByText('Archivadas · 2'));
    expect(screen.getByText('Sede Vieja')).toBeTruthy();
    expect(screen.getByText('Terminado')).toBeTruthy();
    expect(screen.getByText('Cliente inactivo')).toBeTruthy();
    expect(screen.getByText('ago 1 – ago 31, 2026 · era $2,038.00/mes')).toBeTruthy();
    expect(screen.queryByText('Naples Yacht Club')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Sede Vieja'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/jobsites/[id]', params: { id: 'old' } });
  });

  it('buscador por cliente o jobsite', async () => {
    await render(<AccountsScreen />);
    await fireEvent.press(await screen.findByText('Archivadas · 2'));
    await fireEvent.changeText(screen.getByLabelText('Buscar cliente o jobsite'), 'quirurgica');
    expect(screen.queryByText('Sede Vieja')).toBeNull();
    expect(screen.getByText('Cliente inactivo')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Buscar cliente o jobsite'), 'zzz');
    expect(screen.getByText('Ninguna cuenta con esa búsqueda.')).toBeTruthy();
  });

  it('sin clientes_ver_tarifa no hay montos ni total', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['clientes_ver']) };
    await render(<AccountsScreen />);
    expect(await screen.findByText('Naples Yacht Club')).toBeTruthy();
    expect(screen.queryByText(/\/mes/)).toBeNull();
    expect(screen.queryByText('Total mensual')).toBeNull();
    expect(mockRates).not.toHaveBeenCalled();
  });
});
