import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// --- Simulaciones --------------------------------------------------------------------------------------------
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockIsSuperAdmin = true;
let mockLocale: 'es' | 'en' = 'es';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack, canGoBack: () => true }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(effect, [effect]);
  },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>REDIRECT {href}</Text>;
  },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/lib/session', () => ({
  usePermissions: () => ({ access: { isSuperAdmin: mockIsSuperAdmin, permissions: new Set() }, isSuperAdmin: mockIsSuperAdmin, can: () => mockIsSuperAdmin }),
  useSession: () => ({ locale: mockLocale, profile: { id: 'yo' } }),
}));
jest.mock('@/i18n/useStrings', () => ({ useStrings: () => require('@/i18n').getStrings(mockLocale) }));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

const mockFetch = jest.fn();
const mockSave = jest.fn();
jest.mock('@/lib/estimatorApi', () => ({
  fetchEstimatorSettings: (...a: unknown[]) => mockFetch(...a),
  saveEstimatorSettings: (...a: unknown[]) => mockSave(...a),
}));

import { EstimatorSettingsRow } from '@/components/sales/EstimatorSettingsRow';
import EstimatorSettingsScreen from '@/app/(app)/settings/estimator';

const settings = {
  placeTypes: [
    { key: 'office', name: 'Office', rate: 0.04 },
    { key: 'medical', name: 'Medical / dental office', rate: 0.065 },
  ],
  frequencies: [
    { key: 'weekly_1', name: '1x per week', visitsPerMonth: 4.33, adjustment: 1 },
    { key: 'weekly_3', name: '3x per week', visitsPerMonth: 13, adjustment: 0.85 },
  ],
  minPerVisit: 85,
  rangePct: 0.15,
  roundTo: 10,
  walkthroughSqft: 25000,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockIsSuperAdmin = true;
  mockLocale = 'es';
  mockFetch.mockResolvedValue({ ok: true, data: settings });
  mockSave.mockResolvedValue({ ok: true, data: null });
});

describe('Ajustes → Estimador del sitio', () => {
  it('la fila muestra el mínimo y abre la pantalla', async () => {
    await render(<EstimatorSettingsRow />);
    await screen.findByText('Mínimo $85 por visita');
    await fireEvent.press(screen.getByText('Estimador del sitio'));
    expect(mockPush).toHaveBeenCalledWith('/settings/estimator');
  });

  it('muestra la vista previa de la oficina de 3,000 sq ft 3x por semana', async () => {
    await render(<EstimatorSettingsScreen />);
    expect(await screen.findByTestId('estimator-preview')).toHaveTextContent('$1,130 – $1,520');
    expect(screen.getByText('por mes · unos $102 por visita')).toBeTruthy();
  });

  it('la vista previa cambia al editar la tarifa', async () => {
    await render(<EstimatorSettingsScreen />);
    await screen.findByTestId('estimator-preview');
    await fireEvent.changeText(screen.getByLabelText('Office · $ por sq ft por visita'), '0.05');
    // 3000 × 0.05 × 0.85 = 127.5 por visita × 13 = 1657.5 → 1410–1910
    expect(screen.getByTestId('estimator-preview')).toHaveTextContent('$1,410 – $1,910');
  });

  it('guarda los valores convertidos', async () => {
    await render(<EstimatorSettingsScreen />);
    await screen.findByTestId('estimator-preview');
    await fireEvent.changeText(screen.getByLabelText('Mínimo por visita ($)'), '95');
    await fireEvent.changeText(screen.getByLabelText('Rango (± %)'), '20');
    await fireEvent.changeText(screen.getByLabelText('3x per week · Ajuste'), '0.8');
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    const saved = mockSave.mock.calls[0][0];
    expect(saved.minPerVisit).toBe(95);
    expect(saved.rangePct).toBe(0.2);
    expect(saved.frequencies[1]).toEqual({ key: 'weekly_3', name: '3x per week', visitsPerMonth: 13, adjustment: 0.8 });
    expect(mockBack).toHaveBeenCalled();
  });

  it('no guarda con valores inválidos y los marca', async () => {
    await render(<EstimatorSettingsScreen />);
    await screen.findByTestId('estimator-preview');
    await fireEvent.changeText(screen.getByLabelText('Medical / dental office · $ por sq ft por visita'), '-1');
    await fireEvent.changeText(screen.getByLabelText('Redondeo ($)'), '0');
    await fireEvent.press(screen.getByText('Guardar'));
    expect(screen.getAllByText('Valor no válido.')).toHaveLength(2);
    expect(screen.getByText('Corrige los valores marcados para ver el ejemplo.')).toBeTruthy();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('error al guardar', async () => {
    mockSave.mockResolvedValue({ ok: false, reason: 'server' });
    await render(<EstimatorSettingsScreen />);
    await screen.findByTestId('estimator-preview');
    await fireEvent.press(screen.getByText('Guardar'));
    await screen.findByText('No se pudieron guardar las tarifas. Inténtalo otra vez.');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('error al cargar', async () => {
    mockFetch.mockResolvedValue({ ok: false, reason: 'forbidden' });
    await render(<EstimatorSettingsScreen />);
    await screen.findByText('No se pudieron cargar las tarifas. Inténtalo otra vez.');
  });

  it('en inglés', async () => {
    mockLocale = 'en';
    await render(<EstimatorSettingsScreen />);
    await screen.findByText('Website estimator');
    expect(screen.getByText('per month · about $102 per visit')).toBeTruthy();
    expect(screen.getByLabelText('Office · $ per sq ft per visit')).toBeTruthy();
  });

  it('quien no es Super Admin vuelve al inicio', async () => {
    mockIsSuperAdmin = false;
    await render(<EstimatorSettingsScreen />);
    expect(screen.getByText('REDIRECT /')).toBeTruthy();
  });
});
