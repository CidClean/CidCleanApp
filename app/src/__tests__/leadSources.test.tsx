import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// Mi cuenta → Lead sources (orden 163, D-350 (5)).
const mockSetString = jest.fn().mockResolvedValue(true);
jest.mock('expo-clipboard', () => ({ setStringAsync: (...a: unknown[]) => mockSetString(...a) }));
let mockSuper = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
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
  usePermissions: () => ({ isSuperAdmin: mockSuper, access: { isSuperAdmin: mockSuper, permissions: new Set() }, can: () => mockSuper }),
  useSession: () => ({ locale: 'en', profile: { id: 'yo' } }),
}));
jest.mock('@/lib/navigation', () => ({ useGoBack: () => jest.fn() }));
jest.mock('@/i18n/useStrings', () => ({ useStrings: () => require('@/i18n').getStrings('en') }));

const mockFetch = jest.fn();
const mockUpdate = jest.fn();
const mockCreate = jest.fn();
const mockRotate = jest.fn();
jest.mock('@/lib/leadSourcesApi', () => ({
  fetchLeadSources: (...a: unknown[]) => mockFetch(...a),
  updateLeadSource: (...a: unknown[]) => mockUpdate(...a),
  createLeadSource: (...a: unknown[]) => mockCreate(...a),
  rotateLeadSourceKey: (...a: unknown[]) => mockRotate(...a),
}));

import LeadSourcesScreen from '@/app/(app)/settings/lead-sources';
import { leadSourcesEn } from '@/i18n/leadSources';
import { intakeUrl, sourceLine } from '@/lib/leadSources';

const KEY = 'ccl_' + 'ab12'.repeat(12); // clave falsa de prueba
const rows = [
  { id: 'm', name: 'Meta (Facebook + Instagram)', kind: 'ads', entersAs: 'potential', active: true, keyLast4: null, leadCount: 0 },
  { id: 'u', name: 'Muse', kind: 'agent', entersAs: 'cold', active: true, keyLast4: 'f00d', leadCount: 34 },
  { id: 'g', name: 'Grok', kind: 'agent', entersAs: 'cold', active: false, keyLast4: null, leadCount: 0 },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockSuper = true;
  mockFetch.mockResolvedValue({ ok: true, data: rows });
  mockUpdate.mockResolvedValue({ ok: true, data: null });
});

describe('Reglas', () => {
  it('dirección del webhook y línea de cada fuente', () => {
    expect(intakeUrl('https://abc.supabase.co/')).toBe('https://abc.supabase.co/functions/v1/lead-intake');
    expect(sourceLine(rows[0] as never, leadSourcesEn)).toBe('Enters as Potential · via Make · not used yet');
    expect(sourceLine(rows[1] as never, leadSourcesEn)).toBe('Enters as Cold · 34 leads');
  });
});

describe('Lead sources', () => {
  it('solo el Super Admin', async () => {
    mockSuper = false;
    await render(<LeadSourcesScreen />);
    expect(screen.getByText('REDIRECT /')).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('lista con interruptor, Enters as y conteo; la clave guardada solo con los últimos 4', async () => {
    await render(<LeadSourcesScreen />);
    expect(await screen.findByText('Muse')).toBeTruthy();
    expect(screen.getByText('Enters as Cold · 34 leads')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Grok active'));
    expect(mockUpdate).toHaveBeenCalledWith('g', { active: true });
    await fireEvent.press(screen.getByText('Muse'));
    expect(screen.getByText('Muse · connection')).toBeTruthy();
    expect(screen.getByText('••••f00d')).toBeTruthy();
    expect(screen.queryByText(KEY)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Copy Web address'));
    expect(mockSetString).toHaveBeenCalledWith(expect.stringMatching(/\/functions\/v1\/lead-intake$/));
  });

  it('rehacer clave pide confirmación y muestra la clave nueva una vez con Copy', async () => {
    mockRotate.mockResolvedValue({ ok: true, data: KEY });
    await render(<LeadSourcesScreen />);
    await fireEvent.press(await screen.findByText('Muse'));
    await fireEvent.press(screen.getByText('Remake key'));
    expect(screen.getByText('Remake the key for Muse?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Remake'));
    await waitFor(() => expect(mockRotate).toHaveBeenCalledWith('u'));
    expect(await screen.findByText(KEY)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Copy Key'));
    expect(mockSetString).toHaveBeenCalledWith(KEY);
  });

  it('+ Add source crea con Enters as por tipo y muestra la clave', async () => {
    mockCreate.mockResolvedValue({ ok: true, data: { id: 'n', key: KEY } });
    await render(<LeadSourcesScreen />);
    await fireEvent.press(await screen.findByText('+ Add source'));
    await fireEvent.press(screen.getByText('Create source'));
    expect(screen.getByText('Enter the name (up to 60 characters).')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Otro agente');
    await fireEvent.press(screen.getByText('Create source'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith('Otro agente', 'agent', 'cold'));
  });
});
