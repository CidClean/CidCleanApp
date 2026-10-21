import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { getStrings } from '@/i18n';

let mockAccess: { isSuperAdmin: boolean; permissions: Set<string> } = { isSuperAdmin: true, permissions: new Set() };
const mockReplace = jest.fn();
const mockRefresh = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>REDIRECT {href}</Text>;
  },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/lib/session', () => ({
  usePermissions: () => ({
    access: mockAccess,
    isSuperAdmin: mockAccess.isSuperAdmin,
    can: (k: string) => mockAccess.isSuperAdmin || mockAccess.permissions.has(k),
  }),
  useSession: () => ({ locale: 'es', profile: { id: 'yo' }, refresh: mockRefresh }),
}));
jest.mock('@/i18n/useStrings', () => ({ useStrings: () => require('@/i18n').getStrings('es') }));
const mockFetchPage = jest.fn();
jest.mock('@/lib/historyApi', () => ({ fetchHistoryPage: (...a: unknown[]) => mockFetchPage(...a) }));
const mockCandidates = jest.fn();
const mockTransfer = jest.fn();
jest.mock('@/lib/transferApi', () => ({
  fetchSuperAdminCandidates: (...a: unknown[]) => mockCandidates(...a),
  transferSuperAdmin: (...a: unknown[]) => mockTransfer(...a),
}));

import HistoryScreen from '@/app/(app)/history';
import TransferScreen from '@/app/(app)/settings/transfer';

const es = getStrings('es');
const row = (id: number, over: Record<string, unknown> = {}) => ({
  id, at: new Date().toISOString(), action: 'perfil_creado', subject: `Persona ${id}`, actor: 'Cid Clean', info: {}, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAccess = { isSuperAdmin: true, permissions: new Set() };
  mockCandidates.mockResolvedValue({ ok: true, data: [{ id: 'c1', fullName: 'Carla M.' }, { id: 'c2', fullName: 'Laura Gil' }] });
  mockTransfer.mockResolvedValue({ ok: true, data: null });
  mockRefresh.mockResolvedValue(undefined);
});

describe('Historial (D-088, D-198)', () => {
  test('muestra título, detalle y hora; la primera página se pide sin cursor', async () => {
    mockFetchPage.mockResolvedValue({ ok: true, data: [row(5, { action: 'permiso_dado', subject: 'Laura Gil', info: { permiso: 'empleados_ver' } })] });
    await render(<HistoryScreen />);
    expect(await screen.findByText('Permiso dado: Ver lista')).toBeTruthy();
    expect(screen.getByText('Laura Gil · por Cid Clean')).toBeTruthy();
    expect(screen.getByText(/^Hoy \d{1,2}:\d{2} (a|p)\. m\.$/)).toBeTruthy();
    expect(mockFetchPage).toHaveBeenCalledWith(null);
  });

  test('al bajar pide la página siguiente desde la última fila mostrada', async () => {
    mockFetchPage.mockResolvedValueOnce({ ok: true, data: Array.from({ length: 30 }, (_, i) => row(100 - i)) });
    mockFetchPage.mockResolvedValueOnce({ ok: true, data: [row(70), row(69)] });
    await render(<HistoryScreen />);
    await screen.findByText('Persona 100 · por Cid Clean');
    const list = screen.getByTestId('history-list');
    await fireEvent(list, 'onEndReached');
    await waitFor(() => expect(mockFetchPage).toHaveBeenLastCalledWith(71));
    // Página corta: ya no hay más.
    await fireEvent(list, 'onEndReached');
    expect(mockFetchPage).toHaveBeenCalledTimes(2);
  });

  test('vacío y error', async () => {
    mockFetchPage.mockResolvedValue({ ok: true, data: [] });
    await render(<HistoryScreen />);
    expect(await screen.findByText(es.history.empty)).toBeTruthy();
    mockFetchPage.mockResolvedValue({ ok: false, reason: 'network' });
    await render(<HistoryScreen />);
    expect(await screen.findByText(es.history.errorLoad)).toBeTruthy();
  });

  test('sin historial_ver no se muestra; con el permiso sí', async () => {
    mockFetchPage.mockResolvedValue({ ok: true, data: [] });
    mockAccess = { isSuperAdmin: false, permissions: new Set(['empleados_ver']) };
    await render(<HistoryScreen />);
    expect(screen.getByText('REDIRECT /')).toBeTruthy();
    expect(mockFetchPage).not.toHaveBeenCalled();
    mockAccess = { isSuperAdmin: false, permissions: new Set(['historial_ver']) };
    await render(<HistoryScreen />);
    expect(await screen.findByText(es.history.empty)).toBeTruthy();
  });
});

describe('Transferir Super Admin (D-090, D-116, D-199)', () => {
  test('selector, casilla y botón; el botón se habilita con persona y casilla, sin confirmación extra', async () => {
    await render(<TransferScreen />);
    expect(screen.getByLabelText(es.transfer.newSuperAdmin)).toBeTruthy();
    const button = () => screen.getByRole('button', { name: es.transfer.submit });
    expect(button().props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText(es.transfer.newSuperAdmin));
    await fireEvent.press(await screen.findByText('Carla M.'));
    expect(button().props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByText(es.transfer.understand));
    expect(button().props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(button());
    await waitFor(() => expect(mockTransfer).toHaveBeenCalledWith('c1'));
    expect(mockRefresh).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  test('sin candidatos lo explica y no deja transferir', async () => {
    mockCandidates.mockResolvedValue({ ok: true, data: [] });
    await render(<TransferScreen />);
    expect(await screen.findByText(es.transfer.noCandidates)).toBeTruthy();
    await fireEvent.press(screen.getByText(es.transfer.understand));
    expect(screen.getByRole('button', { name: es.transfer.submit }).props.accessibilityState.disabled).toBe(true);
  });

  test('si falla lo avisa y no recarga; sin tipo de trabajador, su aviso', async () => {
    mockTransfer.mockResolvedValue({ ok: false, reason: 'server' });
    await render(<TransferScreen />);
    await fireEvent.press(screen.getByLabelText(es.transfer.newSuperAdmin));
    await fireEvent.press(await screen.findByText('Laura Gil'));
    await fireEvent.press(screen.getByText(es.transfer.understand));
    await fireEvent.press(screen.getByRole('button', { name: es.transfer.submit }));
    expect(await screen.findByText(es.transfer.errorTransfer)).toBeTruthy();
    expect(mockRefresh).not.toHaveBeenCalled();
    mockTransfer.mockResolvedValue({ ok: false, reason: 'no_worker_type' });
    await fireEvent.press(screen.getByRole('button', { name: es.transfer.submit }));
    expect(await screen.findByText(es.transfer.errorNoType)).toBeTruthy();
  });

  test('solo el Super Admin', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['historial_ver']) };
    await render(<TransferScreen />);
    expect(screen.getByText('REDIRECT /')).toBeTruthy();
  });
});
